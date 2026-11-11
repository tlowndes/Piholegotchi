"""Main loop: Sleeve while Spotify plays; Muncher and the other screens take turns otherwise.
Also serves the settings page (default port 80).

    python3 -m piholegotchi                       # on the Pi
    python3 -m piholegotchi --png --port 8080     # anywhere, writes live.png instead
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import socket
import sys
import threading
import time
from datetime import datetime

from PIL import Image

from . import schedule
from .adguard import AdGuard
from .calendar_feed import CalendarSource
from .config import Config
from .homeassistant import HomeAssistant, Inbox
from .moods import Moods
from .flightdeck import FlightDeck
from .render import Stats, mood, muncher, setup_screen, sleeve
from .screens import draw
from .server import Glances
from .spotify import Spotify
from .weather import WeatherSource

log = logging.getLogger("piholegotchi")

SPOTIFY_EVERY = 10        # seconds between Spotify checks (and progress bar updates)
STATS_EVERY = 300         # seconds between AdGuard stat updates
PAUSE_GRACE = 120         # keep showing a paused track this long before switching back
FULL_EVERY = 30           # force a full refresh after this many partials (clears ghosting)
WEATHER_EVERY = 1200      # seconds between forecast updates
SERVER_EVERY = 60         # seconds between server checks
CALENDAR_EVERY = 900      # seconds between calendar checks
TOP_EVERY = 6 * 3600      # seconds between Spotify top-track checks
HOME_EVERY = 60           # seconds between Home Assistant checks
NUDGE_SHOW = 60           # while music plays, a nudge cuts in for this long...
NUDGE_GAP = 600           # ...at most this often


def local_ip() -> str:
    """The Pi's address on the home network (no traffic is sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))
            return s.getsockname()[0]
    except OSError:
        return ""


class State:
    """What's on screen now, shared with the web page."""

    def __init__(self):
        self.lock = threading.Lock()
        self.wake = threading.Event()     # set by the web page to redraw straight away
        self.image: Image.Image | None = None
        self.frame = 0
        self.screen = ""
        self.detail = ""
        self.stats: Stats | None = None
        self.updated = 0.0
        self.stats_stale = True           # fetch AdGuard stats on the next pass
        self.error = ""                   # shown on the settings page
        self.restart = False              # set after an update is installed
        self.data: dict = {}              # latest weather, server, bins, reminders (for the picker)
        self.moods = Moods()
        self.flightdeck = FlightDeck()
        self.inbox = Inbox()               # a message pushed from Home Assistant

    def publish(self, img, screen, detail, stats):
        with self.lock:
            self.image, self.screen, self.detail, self.stats = img, screen, detail, stats
            self.frame += 1
            self.updated = time.time()

    def refresh_soon(self, stats_too: bool = False):
        if stats_too:
            with self.lock:
                self.stats_stale = True
        self.wake.set()


class Rotator:
    """Steps through a list of screens, `dwell` seconds each."""

    def __init__(self):
        self.cur: str | None = None
        self.since = 0.0

    def pick(self, pool: list[str], now: float, dwell: float) -> str:
        if self.cur not in pool:
            self.cur, self.since = pool[0], now
        elif len(pool) > 1 and now - self.since >= dwell:
            self.cur, self.since = pool[(pool.index(self.cur) + 1) % len(pool)], now
        return self.cur


class Sources:
    """The things screens read from, rebuilt when their settings change."""

    def __init__(self, cfg: Config, old: "Sources | None"):
        def same(*names):
            return old is not None and all(getattr(old.cfg, n) == getattr(cfg, n) for n in names)
        self.cfg = cfg
        self.spotify = old.spotify if same("spotify_client_id") else Spotify(cfg.spotify_client_id)
        self.adguard = old.adguard if same("adguard_url", "adguard_username", "adguard_password") else \
            AdGuard(cfg.adguard_url, cfg.adguard_username, cfg.adguard_password)
        self.weather = old.weather if same("weather_lat", "weather_lon", "weather_place") else \
            WeatherSource(cfg.weather_lat, cfg.weather_lon, cfg.weather_name or cfg.weather_place)
        self.server = old.server if same("server_url") else Glances(cfg.server_url)
        self.calendar = old.calendar if same("calendar_url") else CalendarSource(cfg.calendar_url)
        self.home = old.home if same("ha_url", "ha_token") else HomeAssistant(cfg.ha_url, cfg.ha_token)
        self.changed = {
            "calendar": not same("calendar_url"),
            "home": not same("ha_url", "ha_token", "ha_entities"),
            "spotify": not same("spotify_client_id"),
            "adguard": not same("adguard_url", "adguard_username", "adguard_password"),
            "weather": not same("weather_lat", "weather_lon", "weather_place"),
            "server": not same("server_url"),
        }


def plan(cfg: Config, playing: bool, nudges: list[str], ambient: list[str], now: float, st: dict) -> str:
    """Which screen to show right now. `st` keeps the rotation state between calls."""
    dwell = max(1, int(cfg.rotate_minutes or 2)) * 60
    if playing and not st["was_playing"]:
        st["next_nudge"] = max(st["next_nudge"], now + NUDGE_SHOW * 2)   # let the track show first
    st["was_playing"] = playing
    if playing:
        if cfg.music_mode == "rotate":
            return st["rot"].pick(list(dict.fromkeys(["sleeve"] + ambient + nudges)), now, dwell)
        if cfg.music_mode == "nudges" and nudges:
            if now < st["nudge_until"]:
                return st["nudge"] if st["nudge"] in nudges else nudges[0]
            if now >= st["next_nudge"]:
                st["nudge_i"] += 1
                st["nudge"] = nudges[st["nudge_i"] % len(nudges)]
                st["nudge_until"], st["next_nudge"] = now + NUDGE_SHOW, now + NUDGE_GAP
                return st["nudge"]
        return "sleeve"
    pool = list(dict.fromkeys(ambient + nudges))
    return st["rot"].pick(pool, now, dwell) if pool else "muncher"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", action="store_true", help="write live.png instead of driving the panel")
    ap.add_argument("--port", type=int, default=int(os.environ.get("WEB_PORT", 80)))
    a = ap.parse_args()
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(message)s")

    state = State()
    from .web import serve
    serve(state, a.port)        # start the settings page first, so it works even if the screen doesn't

    if a.png:
        from .display import PngDisplay
        panel = PngDisplay()
    else:
        try:
            from .display import EPaper
            panel = EPaper()
        except Exception as e:  # noqa: BLE001
            log.exception("e-ink screen didn't start")
            state.error = f"The e-ink screen didn't start: {e}"
            from .display import NullDisplay
            panel = NullDisplay()

    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
        state.wake.set()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    cfg, src = None, None
    stats, raw, next_stats = None, None, 0.0
    moods = state.moods
    weather, next_weather = None, 0.0
    server, next_server = None, 0.0
    agenda, next_cal = None, 0.0
    top, next_top = None, 0.0
    home, next_home = None, 0.0
    track, paused_since = None, None
    last_key, last_bytes, partials = None, None, 0
    night = None                              # ((style, until), image) while night mode is on
    st = {"rot": Rotator(), "nudge": None, "nudge_i": -1, "nudge_until": 0.0, "next_nudge": 0.0,
          "was_playing": False}

    while not stopping and not state.restart:
        now = time.time()
        clock = datetime.now()
        fresh = Config.load()
        if fresh != cfg:                          # settings changed on the web page
            cfg, src = fresh, Sources(fresh, src)
            if src.changed["adguard"]:
                next_stats = 0
            if src.changed["weather"]:
                weather, next_weather = None, 0
            if src.changed["server"]:
                server, next_server = None, 0
            if src.changed["spotify"]:
                top, next_top = None, 0
            if src.changed["calendar"]:
                agenda, next_cal = None, 0
            if src.changed["home"]:
                home, next_home = None, 0

        if state.stats_stale:
            state.stats_stale, next_stats, next_weather, next_server, next_cal, next_home = False, 0, 0, 0, 0, 0
        if now >= next_stats:
            raw = src.adguard.stats() if cfg.adguard_url else Stats(0, 0, 0.0, online=False, note="SET UP ADGUARD")
            next_stats = now + STATS_EVERY
            if raw.paused_until:                  # check again just after a pause ends
                next_stats = min(next_stats, raw.paused_until + 5)
        stats = moods.apply(raw, cfg)
        on = cfg.screens
        if on.get("weather") and src.weather.configured and now >= next_weather:
            weather, next_weather = src.weather.get(), now + WEATHER_EVERY
        if on.get("server") and src.server.configured and now >= next_server:
            server, next_server = src.server.get(), now + SERVER_EVERY
        if on.get("calendar") and src.calendar.configured and now >= next_cal:
            agenda, next_cal = src.calendar.get(), now + CALENDAR_EVERY
        if on.get("home") and src.home.configured and now >= next_home:
            home, next_home = src.home.get(cfg.ha_entities), now + HOME_EVERY
        msg = state.inbox.now(now) if on.get("message") else None
        events = [e for e in agenda.events if e.end > clock] if agenda else None
        if on.get("repeat") and src.spotify.configured and now >= next_top:
            top, next_top = src.spotify.top(), now + TOP_EVERY

        t = src.spotify.now_playing()
        if t and t.is_playing:
            track, paused_since = t, None
        elif t:                                   # paused
            paused_since = paused_since or now
            track = t if now - paused_since < PAUSE_GRACE else None
        else:
            track, paused_since = None, None

        bins = schedule.bin_day(cfg.bins, clock) if on.get("bins") else None
        rems = schedule.reminders(cfg.reminders, clock)
        state.flightdeck.tick(now)
        fd = state.flightdeck.snapshot(now)
        data = {"deck": fd["deck"], "focus": fd["focus"], "focus_done": fd["focus_done"], "server": server, "weather": weather, "bins": bins, "reminders": rems, "calendar": events,
                "snack": stats.top if stats else [], "snack_total": stats.blocked if stats else 0, "repeat": top,
                "home": home, "message": msg}
        heads_up = cfg.calendar_heads_up * 60
        soon = bool(events and heads_up and not events[0].all_day
                    and 0 <= (events[0].start - clock).total_seconds() <= heads_up)

        ambient = [n for n, ok in (
            ("muncher", on.get("muncher") and bool(cfg.adguard_url)),
            ("weather", on.get("weather") and src.weather.configured),
            ("server", on.get("server") and src.server.configured),
            ("calendar", on.get("calendar") and src.calendar.configured),
            ("snack", on.get("snack") and bool(stats and stats.top)),
            ("repeat", on.get("repeat") and bool(top and top.tracks)),
            ("deck", on.get("deck") and bool(fd["deck"] and fd["deck"].fresh(clock))),
            ("home", on.get("home") and bool(home and home.items))) if ok]
        nudges = [n for n, ok in (
            ("bins", bins is not None),
            ("reminders", on.get("reminders") and any(r.due for r in rems)),
            ("calendar", on.get("calendar") and soon)) if ok]

        anything = (msg or fd["deck"] or fd["focus"] or src.home.configured or cfg.adguard_url or src.spotify.configured or src.weather.configured
                    or src.server.configured or src.calendar.configured or cfg.bins or cfg.reminders)
        if not anything:
            ip = local_ip()
            img, key = setup_screen(socket.gethostname(), ip), ("setup", ip)
            detail = "Waiting to be set up"
        elif (cfg.night and schedule.is_night(clock, cfg.night_from, cfg.night_to)
              and not (cfg.night_music and track is not None)):
            style = cfg.styles.get("night", "A")
            if night is None or night[0] != (style, cfg.night_to):
                # drawn once as night starts, so the panel isn't touched again until morning
                n = {"blocked": stats.blocked if stats and stats.online else None, "until": cfg.night_to}
                night = ((style, cfg.night_to), draw("night", style, {"night": n}, clock))
            img, key = night[1], ("night", style)
            detail = f"Night mode until {cfg.night_to}"
        else:
            night = None
            name = plan(cfg, track is not None, nudges, ambient, now, st)
            if name != "sleeve" and on.get("muncher") and (mood(stats) in ("party", "starving")
                                                         or stats.note == "BLOCKING PAUSED"):
                name = "muncher"                  # a record or a hungry Muncher takes over the screen
            if name != "sleeve" and "calendar" in nudges:
                name = "calendar"                 # something's about to start
            focusing = on.get("focus") and (fd["focus"] is not None or fd["focus_done"])
            if focusing and (name != "sleeve" or cfg.focus_over_music):
                name = "focus"                    # a Focus session on the phone or the settings page
            if msg and (name != "sleeve" or cfg.message_over_music):
                name = "message"                  # pushed from Home Assistant
            style = cfg.styles.get(name, "A")
            if name == "sleeve" and track:
                img, key = sleeve(track), ("sleeve", track.id)
                detail = f"{track.title} by {track.artist}"
            elif name == "muncher" or name == "sleeve":
                img, key = muncher(stats), ("muncher", mood(stats))
                detail = f"Mood: {mood(stats)}"
            else:
                img, key = draw(name, style, data, clock), (name, style)
                if name == "message":
                    key += (msg.until,)           # a new message gets a full refresh
                detail = DETAILS[name](data)
        state.data = data

        if cfg.flip:
            shown, key = img.rotate(180), key + ("flipped",)
        else:
            shown = img
        pixels = shown.tobytes()
        if pixels != last_bytes:
            full = key != last_key or partials >= FULL_EVERY
            try:
                panel.show(shown, full=full)
                partials = 0 if full else partials + 1
                last_key, last_bytes = key, pixels
                if key[0] == "night":
                    panel.sleep()             # e-ink holds the picture with the power off
            except Exception as e:  # noqa: BLE001 - keep the settings page alive
                log.exception("screen update failed")
                state.error = f"Screen update failed: {e}"
                last_key = None
        state.publish(img, key[0], detail, stats)

        state.wake.wait(SPOTIFY_EVERY)
        state.wake.clear()

    if state.restart:
        log.info("restarting into the new version")
        sys.exit(3)                       # systemd starts us again

    # e-ink keeps its image with no power, so leave a sleeping face behind
    try:
        off = muncher(Stats(0, 0, 0.0, online=False, note="SWITCHED OFF"))
        panel.show(off.rotate(180) if cfg and cfg.flip else off, full=True)
        panel.sleep()
    except Exception:  # noqa: BLE001
        pass


DETAILS = {
    "weather": lambda d: (f"{d['weather'].desc}, {round(d['weather'].temp)}°" if d.get("weather") else "No weather yet"),
    "server": lambda d: (f"Disk {d['server'].disk:.0f}% full" if d.get("server") and d["server"].online
                         else "Can't reach the server"),
    "deck": lambda d: (f"Next step: {d['deck'].next_title}" if d.get("deck") else "Waiting for Flight Deck"),
    "focus": lambda d: (f"Focus: {d['focus'].task}" if d.get("focus") else "Focus done"),
    "home": lambda d: (", ".join(f"{i.label} {i.value}" for i in d["home"].items[:2]) if d.get("home") else "Home"),
    "message": lambda d: (f"Message: {d['message'].text}" if d.get("message") else "No message"),
    "snack": lambda d: (f"Biggest snack: {d['snack'][0][0]}" if d.get("snack") else "Nothing eaten yet"),
    "repeat": lambda d: (f"On repeat: {d['repeat'].tracks[0][0]}" if d.get("repeat") and d["repeat"].tracks else "No plays yet"),
    "calendar": lambda d: (f"Next: {d['calendar'][0].title}" if d.get("calendar") else "Nothing on the calendar"),
    "bins": lambda d: "Bin day: " + ", ".join(b.name for b in d["bins"].bins if b.on),
    "reminders": lambda d: next((r.title for r in d["reminders"] if r.due), "Nothing due"),
}


if __name__ == "__main__":
    main()
