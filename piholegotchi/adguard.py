"""Stats from AdGuard Home, over the network (e.g. on a ZimaOS server)."""
from __future__ import annotations

import logging
from datetime import datetime

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
        today = None
        hours = s.get("blocked_filtering")
        if isinstance(hours, list) and hours:
            # oldest first; the last entry is this hour (or today, on windows longer than a day)
            if s.get("time_units") == "days":
                today = int(hours[-1])
            else:
                today = int(sum(hours[-(datetime.now().hour + 1):]))
        if not status.get("protection_enabled", True):
            return Stats(total, blocked, pct, online=False, note="BLOCKING IS OFF", today=today)
        return Stats(total, blocked, pct, today=today)
