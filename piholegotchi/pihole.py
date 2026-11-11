"""Stats from the local Pi-hole (v6 REST API)."""
from __future__ import annotations

import logging

import requests

from .render import Stats

log = logging.getLogger(__name__)


class PiHole:
    def __init__(self, url: str = "http://127.0.0.1", password: str = ""):
        self.base = url.rstrip("/") + "/api"
        self.password = password
        self.sid: str | None = None

    def _login(self):
        r = requests.post(f"{self.base}/auth", json={"password": self.password}, timeout=5)
        r.raise_for_status()
        self.sid = (r.json().get("session") or {}).get("sid")

    def _get(self, path: str) -> dict:
        for attempt in (1, 2):
            if self.password and not self.sid:
                self._login()
            headers = {"X-FTL-SID": self.sid} if self.sid else {}
            r = requests.get(f"{self.base}{path}", headers=headers, timeout=5)
            if r.status_code == 401 and attempt == 1:
                self.sid = None          # session expired, log in again once
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError("unreachable")

    def stats(self) -> Stats:
        try:
            q = self._get("/stats/summary")["queries"]
            blocking = self._get("/dns/blocking").get("blocking", "enabled")
        except Exception as e:  # noqa: BLE001 - any failure means "down"
            log.warning("pi-hole unreachable: %s", e)
            return Stats(0, 0, 0.0, online=False, note="PI-HOLE IS DOWN")
        if blocking != "enabled":
            return Stats(q["total"], q["blocked"], q["percent_blocked"], online=False, note="BLOCKING IS OFF")
        return Stats(q["total"], q["blocked"], float(q["percent_blocked"]))
