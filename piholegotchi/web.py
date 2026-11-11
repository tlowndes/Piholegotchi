"""The settings page: Spotify sign-in, AdGuard address, and a live view of the screen.

Plain standard-library HTTP server on a background thread. It's meant for a
home network, so there's no login; the AdGuard password is never sent back
to the browser.
"""
from __future__ import annotations

import io
import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image

from . import spotify_auth, updater
from .adguard import AdGuard
from .config import Config
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
                            "online": s.online, "note": s.note},
                    }
                out["config"] = cfg.public()
                out["spotify_connected"] = TOKEN_FILE.exists()
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
