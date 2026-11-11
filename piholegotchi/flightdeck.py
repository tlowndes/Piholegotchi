"""Flight Deck (Tom's Obsidian day planner) sends its Deck summary and Focus sessions here.

The phone POSTs JSON to /api/deck on the settings page. A Focus session can also
be started from the settings page itself. Both are kept in deck.json, so a
restart doesn't lose them.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime

from .config import CONFIG_DIR

log = logging.getLogger(__name__)
FILE = CONFIG_DIR / "deck.json"
DONE_SHOWS = 300          # "Time's up" stays this long after a session ends


@dataclass
class DeckDay:
    sent: datetime | None = None
    energy: str = ""
    next_title: str = ""
    next_due: date | None = None
    next_mins: int | None = None
    due: int = 0
    focus_min: int = 0
    habits_done: int = 0
    habits_total: int = 0
    water_ml: int | None = None
    water_goal: int | None = None
    jobs_open: int = 0
    follow_company: str = ""
    follow_role: str = ""
    follow_date: date | None = None

    def fresh(self, now: datetime) -> bool:
        return self.sent is not None and self.sent.date() == now.date()


@dataclass
class FocusRun:
    task: str
    running: bool
    ends: float | None        # epoch seconds, while running
    remaining_s: int          # while paused
    total_s: int
    source: str = "phone"     # "phone" (Flight Deck) or "pi" (the settings page)

    def left(self, now: float) -> int:
        return max(0, int(self.ends - now)) if self.running and self.ends else self.remaining_s

    def done(self, now: float) -> bool:
        return self.running and self.ends is not None and now >= self.ends


def _date(s) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10]) if s else None
    except ValueError:
        return None


def _int(v) -> int | None:
    try:
        return None if v is None else int(v)
    except (TypeError, ValueError):
        return None


def parse_deck(d: dict) -> DeckDay:
    nxt = d.get("next") or {}
    hab = d.get("habits") or {}
    water = d.get("water") or {}
    jobs = d.get("jobs") or {}
    fu = jobs.get("follow_up") or {}
    try:
        sent = datetime.fromisoformat(str(d.get("sent")))
    except ValueError:
        sent = datetime.now()
    return DeckDay(
        sent=sent, energy=str(d.get("energy") or "")[:8],
        next_title=str(nxt.get("title") or "")[:120], next_due=_date(nxt.get("due")), next_mins=_int(nxt.get("mins")),
        due=_int(d.get("due")) or 0, focus_min=_int(d.get("focus_min")) or 0,
        habits_done=_int(hab.get("done")) or 0, habits_total=_int(hab.get("total")) or 0,
        water_ml=_int(water.get("ml")), water_goal=_int(water.get("goal")),
        jobs_open=_int(jobs.get("open")) or 0, follow_company=str(fu.get("company") or "")[:60],
        follow_role=str(fu.get("role") or "")[:60], follow_date=_date(fu.get("date")),
    )


def parse_focus(f: dict | None, source: str = "phone") -> FocusRun | None:
    if not f:
        return None
    return FocusRun(str(f.get("task") or "Focus")[:120], bool(f.get("running")), _int(f.get("ends")),
                    _int(f.get("remaining_s")) or 0, _int(f.get("total_s")) or 0, source)


class FlightDeck:
    def __init__(self):
        self.lock = threading.Lock()
        self.deck: DeckDay | None = None
        self.focus: FocusRun | None = None
        self.ended_at = 0.0
        self.ended_task = ""
        self._raw: dict = {}
        try:
            self._raw = json.loads(FILE.read_text())
            if self._raw.get("deck"):
                self.deck = parse_deck(self._raw["deck"])
            self.focus = parse_focus(self._raw.get("focus"), self._raw.get("focus_source", "phone"))
        except (FileNotFoundError, json.JSONDecodeError, AttributeError):
            pass

    def _save(self):
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            FILE.write_text(json.dumps(self._raw))
        except OSError as e:
            log.warning("couldn't save deck: %s", e)

    def receive(self, body: dict):
        """A POST from Flight Deck: {"deck": {...}} and/or {"focus": {...} | null}."""
        with self.lock:
            if isinstance(body.get("deck"), dict):
                self.deck = parse_deck(body["deck"])
                self._raw["deck"] = body["deck"]
            if "focus" in body:
                self._set_focus(parse_focus(body["focus"]), body["focus"])
            self._save()

    def _set_focus(self, run: FocusRun | None, raw):
        if run is None and self.focus is not None:
            self.ended_at, self.ended_task = time.time(), self.focus.task
        self.focus = run
        self._raw["focus"] = raw
        self._raw["focus_source"] = run.source if run else ""

    # ---------------------------------------------------- the settings page's own timer

    def start(self, task: str, minutes: int):
        now = time.time()
        s = minutes * 60
        raw = {"task": task or "Focus", "running": True, "ends": int(now + s), "remaining_s": s, "total_s": s}
        with self.lock:
            self._set_focus(parse_focus(raw, "pi"), raw)
            self._save()

    def pause(self):
        with self.lock:
            f = self.focus
            if not f:
                return
            now = time.time()
            raw = {"task": f.task, "total_s": f.total_s}
            if f.running:
                raw.update(running=False, ends=None, remaining_s=f.left(now))
            else:
                raw.update(running=True, ends=int(now + f.remaining_s), remaining_s=f.remaining_s)
            self._set_focus(parse_focus(raw, f.source), raw)
            self._save()

    def stop(self):
        with self.lock:
            self._set_focus(None, None)
            self._save()

    def tick(self, now: float):
        """Ends a session whose time is up (the phone may be away and never say)."""
        with self.lock:
            if self.focus and self.focus.done(now):
                self._set_focus(None, None)
                self._save()

    def snapshot(self, now: float) -> dict:
        with self.lock:
            return {"deck": self.deck, "focus": self.focus,
                    "focus_done": self.ended_task if now - self.ended_at < DONE_SHOWS and not self.focus else ""}
