"""The Muncher's extra moods: a dance on record days, and starving when blocking's been off a while.

Remembers the best day so far and when blocking went off, in moods.json next
to the settings, so a restart doesn't forget them.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import replace
from datetime import datetime

from .config import CONFIG_DIR
from .render import Stats

log = logging.getLogger(__name__)
FILE = CONFIG_DIR / "moods.json"
PARTY_FOR = 3600          # dance for an hour after a record falls
DANCE_FOR = 120           # the first two minutes swap poses; after that it holds one


class Moods:
    def __init__(self):
        try:
            self.d = json.loads(FILE.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            self.d = {}
        # day: the day being counted; today: best count seen for it; full: watched since midnight
        # best: best full day so far; party_until / beat: the current party; off_since: blocking off
        self.d.setdefault("best", 0)

    def _save(self):
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            FILE.write_text(json.dumps(self.d))
        except OSError as e:
            log.warning("couldn't save moods: %s", e)

    def apply(self, s: Stats | None, cfg, now: datetime | None = None) -> Stats | None:
        """Stats with `mood` set when the Muncher should party or starve."""
        if s is None:
            return s
        now = now or datetime.now()
        t = time.time()
        d, before = self.d, dict(self.d)

        # blocking off: start the clock (AdGuard being unreachable doesn't count)
        if s.note == "BLOCKING IS OFF":
            d["off_since"] = d.get("off_since") or t
        elif s.online:
            d.pop("off_since", None)

        # record days, counted in calendar days
        day = now.date().isoformat()
        if d.get("day") != day:
            if d.get("full") and d.get("today", 0) > d["best"]:
                d["best"] = d["today"]
            d.update(day=day, today=0, full=now.hour == 0)
        if s.today is not None:
            d["today"] = max(d.get("today", 0), s.today)
            if (cfg.muncher_party and s.online and d["best"] > 0 and s.today > d["best"]
                    and d.get("party_day") != day):
                d.update(party_day=day, party_until=t + PARTY_FOR, party_from=t, beat=d["best"])
        if d != before:
            self._save()

        if s.note == "BLOCKING IS OFF" and cfg.starve_minutes:
            mins = int((t - d["off_since"]) // 300) * 5      # 5-minute steps, to spare the panel
            if mins >= cfg.starve_minutes:
                return replace(s, mood="starving", off_mins=mins)
        if cfg.muncher_party and s.online and t < d.get("party_until", 0):
            frame = int(t // 10) if t - d.get("party_from", t) < DANCE_FOR else 0
            return replace(s, mood="party", beat=d.get("beat", 0), frame=frame)
        return s

    def party_now(self, cfg):
        """For the settings page's "Show me" button."""
        t = time.time()
        self.d.update(party_until=t + 60, party_from=t, beat=self.d.get("best") or self.d.get("today", 0))
        self._save()
