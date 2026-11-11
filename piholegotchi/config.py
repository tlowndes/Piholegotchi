"""Settings, stored as JSON so the web page can change them."""
from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("PIHOLEGOTCHI_HOME", Path.home() / ".config" / "piholegotchi"))
CONFIG_FILE = CONFIG_DIR / "config.json"
_lock = threading.Lock()

DEFAULT_SCREENS = {"muncher": True, "weather": True, "server": True, "bins": True, "reminders": True}
DEFAULT_STYLES = {"server": "A", "weather": "A", "bins": "A", "reminders": "A"}


@dataclass
class Config:
    adguard_url: str = ""
    adguard_username: str = ""
    adguard_password: str = ""
    spotify_client_id: str = ""
    flip: bool = False          # rotate the screen 180° (for upside-down mounting)

    # which screens are in the rotation, and the style picked for each (A, B or C)
    screens: dict = field(default_factory=lambda: dict(DEFAULT_SCREENS))
    styles: dict = field(default_factory=lambda: dict(DEFAULT_STYLES))
    music_mode: str = "nudges"  # while Spotify plays: "sleeve", "nudges" or "rotate"
    rotate_minutes: int = 2     # how long each screen stays up before the next

    weather_place: str = ""     # what was typed, e.g. "Bristol"
    weather_name: str = ""      # what it matched, e.g. "Bristol, England"
    weather_lat: float = 0.0
    weather_lon: float = 0.0

    server_url: str = ""        # Glances on the server, e.g. http://192.168.1.20:61208

    # [{"name": "Black", "label": "Waste", "weekday": 3, "every": 1, "from": "2026-11-12"}]
    bins: list = field(default_factory=list)
    # [{"id": "a1b2", "title": "Water the monstera", "kind": "plant", "every": 7,
    #   "at": "18:00", "last": "2026-11-04T09:00:00"}]
    reminders: list = field(default_factory=list)

    @classmethod
    def load(cls) -> "Config":
        with _lock:
            try:
                data = json.loads(CONFIG_FILE.read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                data = {}
        names = {f.name for f in fields(cls)}
        cfg = cls(**{k: v for k, v in data.items() if k in names})
        cfg.screens = {**DEFAULT_SCREENS, **(cfg.screens or {})}
        cfg.styles = {**DEFAULT_STYLES, **(cfg.styles or {})}
        return cfg

    def save(self):
        with _lock:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            tmp = CONFIG_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(asdict(self), indent=2))
            tmp.chmod(0o600)
            tmp.replace(CONFIG_FILE)

    def public(self) -> dict:
        """Safe to send to the browser: never includes the password."""
        d = asdict(self)
        d["adguard_password_set"] = bool(d.pop("adguard_password"))
        return d
