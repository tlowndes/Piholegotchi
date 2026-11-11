"""Stats from AdGuard Home, over the network (e.g. on a ZimaOS server)."""
from __future__ import annotations

import logging

import requests

from .render import Stats

log = logging.getLogger(__name__)


class AdGuard:
    def __init__(self, url: str, username: str = "", password: str = ""):
        self.base = url.rstrip("/") + "/control"
        self.auth = (username, password) if username else None

    def _get(self, path: str) -> dict:
        r = requests.get(f"{self.base}{path}", auth=self.auth, timeout=5)
        r.raise_for_status()
        return r.json()

    def stats(self) -> Stats:
        """Totals over AdGuard's stats window (24 hours by default)."""
        try:
            s = self._get("/stats")
            status = self._get("/status")
        except Exception as e:  # noqa: BLE001 - any failure means "down"
            log.warning("adguard unreachable: %s", e)
            return Stats(0, 0, 0.0, online=False, note="ADGUARD IS DOWN")
        total = int(s.get("num_dns_queries", 0))
        blocked = int(s.get("num_blocked_filtering", 0)
                      + s.get("num_replaced_safebrowsing", 0)
                      + s.get("num_replaced_parental", 0))
        pct = blocked / total * 100 if total else 0.0
        if not status.get("protection_enabled", True):
            return Stats(total, blocked, pct, online=False, note="BLOCKING IS OFF")
        return Stats(total, blocked, pct)
