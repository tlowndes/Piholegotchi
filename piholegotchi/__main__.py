"""Main loop: Sleeve while Spotify plays, Muncher the rest of the time.
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
import threading
import time

from PIL import Image

from .adguard import AdGuard
from .config import Config
from .render import Stats, mood, muncher, setup_screen, sleeve
from .spotify import Spotify

log = logging.getLogger("piholegotchi")

SPOTIFY_EVERY = 10        # seconds between Spotify checks (and progress bar updates)
STATS_EVERY = 300         # seconds between AdGuard stat updates
PAUSE_GRACE = 120         # keep showing a paused track this long before switching back
FULL_EVERY = 30           # force a full refresh after this many partials (clears ghosting)


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

    cfg, spotify, adguard = None, None, None
    stats, next_stats = None, 0.0
    track, paused_since = None, None
    last_key, last_bytes, partials = None, None, 0

    while not stopping:
        now = time.time()
        fresh = Config.load()
        if fresh != cfg:                          # settings changed on the web page
            cfg = fresh
            spotify = Spotify(cfg.spotify_client_id)
            adguard = AdGuard(cfg.adguard_url, cfg.adguard_username, cfg.adguard_password)
            next_stats = 0

        if state.stats_stale:
            state.stats_stale, next_stats = False, 0
        if now >= next_stats:
            stats = adguard.stats() if cfg.adguard_url else Stats(0, 0, 0.0, online=False, note="SET UP ADGUARD")
            next_stats = now + STATS_EVERY

        t = spotify.now_playing()
        if t and t.is_playing:
            track, paused_since = t, None
        elif t:                                   # paused
            paused_since = paused_since or now
            track = t if now - paused_since < PAUSE_GRACE else None
        else:
            track, paused_since = None, None

        if not cfg.adguard_url and not spotify.configured:
            ip = local_ip()
            img, key = setup_screen(socket.gethostname(), ip), ("setup", ip)
            detail = "Waiting to be set up"
        elif track:
            img, key = sleeve(track), ("sleeve", track.id)
            detail = f"{track.title} by {track.artist}"
        else:
            img, key = muncher(stats), ("muncher", mood(stats))
            detail = f"Mood: {mood(stats)}"

        data = img.tobytes()
        if data != last_bytes:
            full = key != last_key or partials >= FULL_EVERY
            try:
                panel.show(img, full=full)
                partials = 0 if full else partials + 1
                last_key, last_bytes = key, data
            except Exception as e:  # noqa: BLE001 - keep the settings page alive
                log.exception("screen update failed")
                state.error = f"Screen update failed: {e}"
                last_key = None
        state.publish(img, key[0], detail, stats)

        state.wake.wait(SPOTIFY_EVERY)
        state.wake.clear()

    # e-ink keeps its image with no power, so leave a sleeping face behind
    try:
        panel.show(muncher(Stats(0, 0, 0.0, online=False, note="SWITCHED OFF")), full=True)
        panel.sleep()
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    main()
