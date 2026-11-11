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

from .config import CONFIG_DIR
from .render import ART, Track, atkinson
from .screens import Top

log = logging.getLogger(__name__)

TOKEN_URL = "https://accounts.spotify.com/api/token"
NOW_URL = "https://api.spotify.com/v1/me/player/currently-playing"
TOP_URL = "https://api.spotify.com/v1/me/top/"
TOKEN_FILE = CONFIG_DIR / "spotify.json"


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

    # ------------------------------------------------------------ on repeat

    @property
    def can_top(self) -> bool:
        """Signed in with the top-items permission (added after the first version)."""
        try:
            return "user-top-read" in json.loads(self.token_file.read_text()).get("scope", "")
        except (FileNotFoundError, json.JSONDecodeError):
            return False

    def _dither(self, images: list[dict], size: int) -> Image.Image | None:
        if not images:
            return None
        img = sorted(images, key=lambda i: i.get("width") or 0)
        pick = next((i for i in img if (i.get("width") or 0) >= size * 2), img[-1])
        try:
            r = requests.get(pick["url"], timeout=10)
            r.raise_for_status()
            return atkinson(Image.open(io.BytesIO(r.content)), (size, size))
        except Exception as e:  # noqa: BLE001
            log.warning("image failed: %s", e)
            return None

    def top(self) -> Top:
        """Most played over the last four weeks (Spotify's shortest window)."""
        if not self.configured:
            return Top([], [], note="CONNECT SPOTIFY")
        if not self.can_top:
            return Top([], [], note="RECONNECT SPOTIFY")
        try:
            h = {"Authorization": f"Bearer {self._token()}"}
            tr = requests.get(TOP_URL + "tracks", params={"time_range": "short_term", "limit": 5}, headers=h, timeout=10)
            ar = requests.get(TOP_URL + "artists", params={"time_range": "short_term", "limit": 3}, headers=h, timeout=10)
            tr.raise_for_status()
            ar.raise_for_status()
        except Exception as e:  # noqa: BLE001
            log.warning("spotify top failed: %s", e)
            return Top([], [], note="CAN'T REACH SPOTIFY")
        tracks = tr.json().get("items") or []
        artists = ar.json().get("items") or []
        return Top(
            tracks=[(t["name"], ", ".join(a["name"] for a in t.get("artists", []))) for t in tracks],
            artists=[a["name"] for a in artists],
            track_art=self._dither(tracks[0].get("album", {}).get("images", []), ART) if tracks else None,
            artist_art=self._dither(artists[0].get("images", []), ART) if artists else None,
        )
