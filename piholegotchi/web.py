"""The settings page: Spotify sign-in, AdGuard address, and a live view of the screen.

Plain standard-library HTTP server on a background thread. It's meant for a
home network, so there's no login; the AdGuard password is never sent back
to the browser.
"""
from __future__ import annotations

import io
import json
import logging
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image

from . import schedule, spotify_auth, updater, weather
from .calendar_feed import CalendarSource, clean_url
from .adguard import AdGuard
from .config import DEFAULT_SCREENS, Config
from .screens import STYLES, draw, samples
from .server import Glances
from .spotify import TOKEN_FILE

if TYPE_CHECKING:
    from .__main__ import State

log = logging.getLogger(__name__)
PAGE = (Path(__file__).parent / "web" / "index.html").read_bytes()
PAPER, INK = (220, 220, 210), (37, 39, 42)


def _png(img1: Image.Image, scale: int = 4) -> bytes:
    rgb = Image.new("RGB", img1.size, PAPER)
    rgb.paste(Image.new("RGB", img1.size, INK), mask=img1.point(lambda v: 255 - v).convert("L"))
    buf = io.BytesIO()
    rgb.resize((img1.width * scale, img1.height * scale), Image.NEAREST).save(buf, "PNG")
    return buf.getvalue()


KINDS = ("plant", "pet", "other")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _clean_bins(raw) -> list[dict]:
    out = []
    for b in (raw or [])[:6]:
        name = str(b.get("name") or "").strip()[:14]
        if not name:
            continue
        try:
            first = date.fromisoformat(str(b.get("next") or ""))
        except ValueError:
            raise ValueError(f"Pick the next collection date for the {name} bin.")
        every = int(b.get("every") or 1)
        if every not in (1, 2, 3, 4):
            every = 1
        out.append({"name": name, "label": str(b.get("label") or "").strip()[:10],
                    "next": first.isoformat(), "every": every})
    return out


def _clean_reminders(raw, old: list[dict]) -> list[dict]:
    known = {r.get("id"): r for r in old}
    out = []
    for r in (raw or [])[:12]:
        title = str(r.get("title") or "").strip()[:40]
        if not title:
            continue
        at = str(r.get("at") or "").strip()
        if at and not TIME_RE.match(at):
            raise ValueError(f"Use a 24-hour time like 18:00 for “{title}”.")
        rid = str(r.get("id") or "") if r.get("id") in known else secrets.token_hex(4)
        prev = known.get(rid, {})
        out.append({"id": rid, "title": title, "kind": r.get("kind") if r.get("kind") in KINDS else "other",
                    "every": max(1, min(365, int(r.get("every") or 1))), "at": at,
                    "last": prev.get("last", "")})
    return out


def make_handler(state: "State"):
    pending: dict[str, spotify_auth.Pending] = {}
    update_status = {"busy": False, "message": ""}

    class Handler(BaseHTTPRequestHandler):
        server_version = "Piholegotchi"

        def log_message(self, fmt, *args):
            log.debug("web: " + fmt, *args)

        # ---------------------------------------------------- helpers

        def _send(self, code: int, body: bytes, ctype: str, cache: bool = False):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code: int = 200):
            self._send(code, json.dumps(obj).encode(), "application/json")

        def _body(self) -> dict:
            # JSON only: a cross-site form can't send this without a CORS preflight we never answer
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                raise ValueError("expected JSON")
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(min(n, 65536)) or b"{}")

        # ---------------------------------------------------- GET

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/":
                return self._send(200, PAGE, "text/html; charset=utf-8")
            if path == "/screen.png":
                with state.lock:
                    img = state.image
                if img is None:
                    return self._send(503, b"starting", "text/plain")
                return self._send(200, _png(img), "image/png")
            if path == "/preview.png":
                q = parse_qs(self.path.partition("?")[2])
                name, style = q.get("screen", [""])[0], q.get("style", ["A"])[0]
                if name not in ("server", "weather", "bins", "reminders", "night", "calendar", "snack", "repeat") or style not in STYLES:
                    return self._send(404, b"not found", "text/plain")
                now = datetime.now()
                live, fake = dict(state.data), samples(now)
                use = {k: live.get(k) if live.get(k) is not None else fake[k] for k in fake}
                if name == "reminders" and not Config.load().reminders:
                    use["reminders"] = fake["reminders"]
                if name == "snack":
                    with state.lock:
                        s = state.stats
                    if s and s.top:
                        use["snack"], use["snack_total"] = s.top, s.blocked
                if name == "night":
                    with state.lock:
                        s = state.stats
                    use["night"] = {"blocked": s.blocked if s and s.online else fake["night"]["blocked"],
                                    "until": Config.load().night_to}
                return self._send(200, _png(draw(name, style, use, now), 2), "image/png")
            if path == "/api/state":
                cfg = Config.load()
                with state.lock:
                    s = state.stats
                    out = {
                        "frame": state.frame,
                        "screen": state.screen,
                        "detail": state.detail,
                        "updated": state.updated,
                        "error": state.error,
                        "now": time.time(),
                        "stats": None if s is None else {
                            "total": s.total, "blocked": s.blocked, "percent": round(s.percent, 1),
                            "online": s.online, "note": s.note, "paused_until": s.paused_until},
                    }
                out["config"] = cfg.public()
                now = datetime.now()
                out["reminders"] = {r.id: {"due": r.due, "when": r.when}
                                    for r in schedule.reminders(cfg.reminders, now)}
                out["bins_next"] = schedule.next_text(cfg.bins, now.date() - timedelta(days=1)) if cfg.bins else ""
                out["spotify_connected"] = TOKEN_FILE.exists()
                try:
                    out["spotify_top"] = "user-top-read" in json.loads(TOKEN_FILE.read_text()).get("scope", "")
                except (FileNotFoundError, json.JSONDecodeError):
                    out["spotify_top"] = False
                out["version"] = updater.installed()[:7]
                out["update"] = dict(update_status)
                return self._json(out)
            self._send(404, b"not found", "text/plain")

        # ---------------------------------------------------- POST

        def do_POST(self):
            try:
                body = self._body()
            except ValueError:
                return self._json({"error": "Send JSON."}, 400)
            path = self.path.split("?")[0]
            cfg = Config.load()

            if path == "/api/adguard":
                cfg.adguard_url = (body.get("url") or "").strip().rstrip("/")
                cfg.adguard_username = (body.get("username") or "").strip()
                if body.get("password"):              # blank keeps the saved one
                    cfg.adguard_password = body["password"]
                if cfg.adguard_url and not cfg.adguard_url.startswith(("http://", "https://")):
                    cfg.adguard_url = "http://" + cfg.adguard_url
                s = AdGuard(cfg.adguard_url, cfg.adguard_username, cfg.adguard_password).stats() \
                    if cfg.adguard_url else None
                if body.get("save"):
                    cfg.save()
                    state.refresh_soon(stats_too=True)
                if s is None:
                    return self._json({"ok": False, "message": "Add the address first."})
                if s.note == "ADGUARD IS DOWN":
                    return self._json({"ok": False, "message":
                        "Couldn't reach AdGuard Home there. Check the address and port, and the login."})
                return self._json({"ok": True, "message":
                    f"Connected. {s.blocked:,} of {s.total:,} queries blocked."})

            if path == "/api/spotify/start":
                cid = (body.get("client_id") or "").strip()
                if not cid:
                    return self._json({"error": "Add your Spotify client ID first."}, 400)
                if cid != cfg.spotify_client_id:
                    cfg.spotify_client_id = cid
                    cfg.save()
                p = spotify_auth.start(cid)
                pending.clear()
                pending["p"] = p
                return self._json({"url": p.url})

            if path == "/api/spotify/finish":
                p = pending.get("p")
                if not p:
                    return self._json({"error": "Start again with Connect Spotify."}, 400)
                try:
                    spotify_auth.finish(p, body.get("pasted") or "")
                except spotify_auth.AuthError as e:
                    return self._json({"error": str(e)}, 400)
                except Exception as e:  # noqa: BLE001
                    return self._json({"error": f"Couldn't reach Spotify: {e}"}, 502)
                pending.clear()
                state.refresh_soon()
                return self._json({"ok": True})

            if path == "/api/spotify/disconnect":
                TOKEN_FILE.unlink(missing_ok=True)
                state.refresh_soon()
                return self._json({"ok": True})

            if path == "/api/screen":
                cfg.flip = bool(body.get("flip"))
                cfg.save()
                state.refresh_soon()
                return self._json({"ok": True})

            if path == "/api/rotation":
                if isinstance(body.get("screens"), dict):
                    cfg.screens = {k: bool(body["screens"].get(k, cfg.screens.get(k, True))) for k in DEFAULT_SCREENS}
                if isinstance(body.get("styles"), dict):
                    for k, v in body["styles"].items():
                        if k in cfg.styles and v in STYLES:
                            cfg.styles[k] = v
                if body.get("music_mode") in ("sleeve", "nudges", "rotate"):
                    cfg.music_mode = body["music_mode"]
                if body.get("rotate_minutes") in (1, 2, 5, 10, 30):
                    cfg.rotate_minutes = body["rotate_minutes"]
                cfg.save()
                state.refresh_soon()
                return self._json({"ok": True})

            if path in ("/api/pause", "/api/resume"):
                if not cfg.adguard_url:
                    return self._json({"error": "Set up AdGuard Home first."}, 400)
                pausing = path == "/api/pause"
                if pausing:
                    mins = body.get("minutes")
                    if mins not in (1, 5, 10, 30, 60):
                        return self._json({"error": "Pick how long to pause for."}, 400)
                    if mins != cfg.pause_minutes:
                        cfg.pause_minutes = mins
                        cfg.save()
                try:
                    AdGuard(cfg.adguard_url, cfg.adguard_username, cfg.adguard_password).protect(
                        not pausing, cfg.pause_minutes if pausing else 0)
                except Exception as e:  # noqa: BLE001
                    return self._json({"error": f"AdGuard didn't take it: {e}"}, 502)
                state.refresh_soon(stats_too=True)
                return self._json({"ok": True})

            if path == "/api/calendar":
                url = clean_url(body.get("url") or "")[:2000]
                if url and not url.startswith("https://"):
                    return self._json({"error": "Paste the whole link, starting https://"}, 400)
                if body.get("heads_up") in (0, 5, 10, 15, 30, 60):
                    cfg.calendar_heads_up = body["heads_up"]
                a = CalendarSource(url).get() if url else None
                if body.get("save"):
                    cfg.calendar_url = url
                    cfg.save()
                    state.refresh_soon(stats_too=True)
                if a is None:
                    return self._json({"ok": bool(body.get("save")), "message": "Calendar turned off." if body.get("save") else "Paste your link first."})
                if not a.online:
                    why = {"NOT A CALENDAR LINK": "That link didn't return a calendar. Use the link from Share with anyone."}
                    return self._json({"ok": False, "message": why.get(a.note, "Couldn't fetch that link. Check it's copied in full.")})
                if not a.events:
                    return self._json({"ok": True, "message": "Connected. Nothing on for the next two weeks."})
                e = a.events[0]
                when = e.start.strftime("%a %-d %b") + ("" if e.all_day else e.start.strftime(", %H:%M"))
                busy = " (titles hidden: pick Full view when you make the link)" if all(x.title == "Busy" for x in a.events) else ""
                return self._json({"ok": True, "message": f"Connected. {len(a.events)} events in the next two weeks. Next: {e.title}, {when}.{busy}"})

            if path == "/api/muncher":
                if "party" in body:
                    cfg.muncher_party = bool(body["party"])
                if body.get("starve") in (0, 10, 30, 60, 120):
                    cfg.starve_minutes = body["starve"]
                cfg.save()
                state.refresh_soon()
                return self._json({"ok": True})

            if path == "/api/muncher/party":
                state.moods.party_now(cfg)
                state.refresh_soon()
                return self._json({"ok": True})

            if path == "/api/night":
                for k in ("from", "to"):
                    if k in body and not TIME_RE.match(str(body[k])):
                        return self._json({"error": "Use a 24-hour time like 23:00."}, 400)
                if "on" in body:
                    cfg.night = bool(body["on"])
                if "music" in body:
                    cfg.night_music = bool(body["music"])
                cfg.night_from = body.get("from", cfg.night_from)
                cfg.night_to = body.get("to", cfg.night_to)
                if cfg.night_from == cfg.night_to:
                    return self._json({"error": "Pick different start and end times."}, 400)
                cfg.save()
                state.refresh_soon()
                return self._json({"ok": True})

            if path == "/api/weather":
                place = (body.get("place") or "").strip()[:60]
                if not place:
                    cfg.weather_place = cfg.weather_name = ""
                    cfg.weather_lat = cfg.weather_lon = 0.0
                    cfg.save()
                    state.refresh_soon()
                    return self._json({"ok": True, "message": "Weather turned off."})
                try:
                    hit = weather.geocode(place)
                except Exception as e:  # noqa: BLE001
                    return self._json({"error": f"Couldn't reach the weather service: {e}"}, 502)
                if not hit:
                    return self._json({"error": f"Couldn't find “{place}”. Try a nearby town or city."}, 400)
                cfg.weather_place, cfg.weather_name = place, hit["name"]
                cfg.weather_lat, cfg.weather_lon = hit["lat"], hit["lon"]
                cfg.save()
                state.refresh_soon(stats_too=True)
                return self._json({"ok": True, "message": f"Saved. Showing weather for {hit['name']}."})

            if path == "/api/server":
                url = (body.get("url") or "").strip().rstrip("/")
                if url and not url.startswith(("http://", "https://")):
                    url = "http://" + url
                if url and not re.search(r":\d+$", url.split("//", 1)[1].split("/")[0]):
                    url += ":61208"                  # Glances' usual port
                s = Glances(url).get() if url else None
                if body.get("save"):
                    cfg.server_url = url
                    cfg.save()
                    state.refresh_soon(stats_too=True)
                if s is None:
                    return self._json({"ok": bool(body.get("save")), "message": "Server screen turned off." if body.get("save") else "Add the address first."})
                if not s.online:
                    return self._json({"ok": False, "message": "Couldn't reach Glances there. Check it's running and the port (usually 61208)."})
                return self._json({"ok": True, "message": f"Connected. Disk {s.disk:.0f}% full, CPU {s.cpu:.0f}%, up {s.uptime.lower()}."})

            if path == "/api/bins":
                try:
                    cfg.bins = _clean_bins(body.get("bins"))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
                cfg.save()
                state.refresh_soon()
                n = schedule.next_collection(cfg.bins, datetime.now().date() - timedelta(days=1))
                when = f" Next collection: {' and '.join(n[1])}, {n[0].strftime('%A %-d %B')}." if n else ""
                return self._json({"ok": True, "message": "Saved." + when})

            if path == "/api/reminders":
                try:
                    cfg.reminders = _clean_reminders(body.get("reminders"), cfg.reminders)
                except (ValueError, TypeError) as e:
                    return self._json({"error": str(e)}, 400)
                cfg.save()
                state.refresh_soon()
                return self._json({"ok": True, "reminders": cfg.reminders})

            if path == "/api/reminders/done":
                rid = body.get("id")
                for r in cfg.reminders:
                    if r["id"] == rid:
                        r["last"] = datetime.now().isoformat(timespec="minutes")
                        cfg.save()
                        state.refresh_soon()
                        return self._json({"ok": True})
                return self._json({"error": "That reminder has gone. Refresh the page."}, 404)

            if path == "/api/update/check":
                try:
                    new = updater.latest()
                except Exception as e:  # noqa: BLE001
                    return self._json({"error": f"Couldn't reach GitHub: {e}"}, 502)
                mine = updater.installed()
                new["current"] = bool(mine) and mine == new["sha"]
                new["short"] = new["sha"][:7]
                return self._json(new)

            if path == "/api/update/install":
                sha = (body.get("sha") or "").strip()
                if len(sha) != 40 or any(ch not in "0123456789abcdef" for ch in sha):
                    return self._json({"error": "Check for updates first."}, 400)
                if update_status["busy"]:
                    return self._json({"error": "An update is already running."}, 409)

                def run():
                    update_status.update(busy=True, message="Downloading…")
                    try:
                        updater.install(sha)
                        update_status.update(message="Installed. Restarting…")
                        state.restart = True
                        state.wake.set()
                    except Exception as e:  # noqa: BLE001
                        log.exception("update failed")
                        update_status.update(busy=False, message=f"Update failed: {e}")

                threading.Thread(target=run, daemon=True).start()
                return self._json({"ok": True})

            if path == "/api/refresh":
                state.refresh_soon(stats_too=True)
                return self._json({"ok": True})

            self._json({"error": "not found"}, 404)

    return Handler


def serve(state: "State", port: int):
    try:
        httpd = ThreadingHTTPServer(("0.0.0.0", port), make_handler(state))
    except OSError as e:
        log.error("settings page couldn't start on port %s: %s", port, e)
        return None
    threading.Thread(target=httpd.serve_forever, daemon=True, name="web").start()
    log.info("settings page on port %s", port)
    return httpd
