"""Spotify 'currently playing', using a refresh token from `spotify_auth`.

Uses the PKCE flow, so only a client ID is needed (no secret on the Pi).
"""
from __future__ import annotations

import io
import json
import logging
import time
from pathlib import Path

import requests
from PIL import Image

from .render import ART, Track, atkinson

log = logging.getLogger(__name__)

TOKEN_URL = "https://accounts.spotify.com/api/token"
NOW_URL = "https://api.spotify.com/v1/me/player/currently-playing"
TOKEN_FILE = Path.home() / ".config" / "piholegotchi" / "spotify.json"


class Spotify:
    def __init__(self, client_id: str, token_file: Path = TOKEN_FILE):
        self.client_id = client_id
        self.token_file = token_file
        self._access: str | None = None
        self._expires = 0.0
        self._art_cache: tuple[str, Image.Image] | None = None
        self._backoff_until = 0.0

    @property
    def configured(self) -> bool:
        return bool(self.client_id) and self.token_file.exists()

    # ------------------------------------------------------------ auth

    def _refresh(self):
        saved = json.loads(self.token_file.read_text())
        r = requests.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "refresh_token": saved["refresh_token"],
            "client_id": self.client_id,
        }, timeout=10)
        r.raise_for_status()
        tok = r.json()
        self._access = tok["access_token"]
        self._expires = time.time() + tok.get("expires_in", 3600) - 60
        if tok.get("refresh_token"):            # PKCE rotates refresh tokens
            saved["refresh_token"] = tok["refresh_token"]
            self.token_file.write_text(json.dumps(saved))

    def _token(self) -> str:
        if not self._access or time.time() >= self._expires:
            self._refresh()
        return self._access

    # ------------------------------------------------------------ art

    def _art(self, images: list[dict]) -> Image.Image | None:
        if not images:
            return None
        # smallest image that's still at least 2x the screen size
        img = sorted(images, key=lambda i: i.get("width") or 0)
        pick = next((i for i in img if (i.get("width") or 0) >= ART * 2), img[-1])
        url = pick["url"]
        if self._art_cache and self._art_cache[0] == url:
            return self._art_cache[1]
        try:
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            art = atkinson(Image.open(io.BytesIO(r.content)), (ART, ART))
        except Exception as e:  # noqa: BLE001 - a missing cover is fine
            log.warning("album art failed: %s", e)
            return None
        self._art_cache = (url, art)
        return art

    # ------------------------------------------------------------ now playing

    def now_playing(self) -> Track | None:
        """The current track, or None if nothing is playing or we can't tell."""
        if not self.configured or time.time() < self._backoff_until:
            return None
        try:
            r = requests.get(NOW_URL, headers={"Authorization": f"Bearer {self._token()}"}, timeout=10)
        except requests.RequestException as e:
            log.warning("spotify unreachable: %s", e)
            return None
        if r.status_code == 204:
            return None
        if r.status_code == 401:
            self._access = None
            return None
        if r.status_code == 429:
            self._backoff_until = time.time() + int(r.headers.get("Retry-After", 30))
            return None
        if not r.ok:
            log.warning("spotify %s: %s", r.status_code, r.text[:200])
            return None

        data = r.json()
        item = data.get("item")
        if not item or data.get("currently_playing_type") != "track":
            return None
        album = item.get("album", {})
        return Track(
            id=item["id"] or item["name"],
            title=item["name"],
            artist=", ".join(a["name"] for a in item.get("artists", [])),
            album=album.get("name", ""),
            year=(album.get("release_date") or "")[:4],
            progress_s=(data.get("progress_ms") or 0) // 1000,
            duration_s=(item.get("duration_ms") or 0) // 1000,
            is_playing=bool(data.get("is_playing")),
            art=self._art(album.get("images", [])),
        )
