"""Settings, stored as JSON so the web page can change them."""
from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, fields
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("PIHOLEGOTCHI_HOME", Path.home() / ".config" / "piholegotchi"))
CONFIG_FILE = CONFIG_DIR / "config.json"
_lock = threading.Lock()


@dataclass
class Config:
    adguard_url: str = ""
    adguard_username: str = ""
    adguard_password: str = ""
    spotify_client_id: str = ""

    @classmethod
    def load(cls) -> "Config":
        with _lock:
            try:
                data = json.loads(CONFIG_FILE.read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                data = {}
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in names})

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
