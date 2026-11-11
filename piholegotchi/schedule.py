"""Bin collections and reminders, worked out from what's saved on the settings page."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from .screens import Bin, BinDay, Reminder

BIN_FROM_HOUR = 16      # show bins from 4pm the day before...
BIN_UNTIL_HOUR = 10     # ...until 10am on the day
DEFAULT_AT = "08:00"    # reminders without a time are due from 8am


def _collected(b: dict, day: date) -> bool:
    try:
        first = date.fromisoformat(b["next"])
    except (KeyError, ValueError):
        return False
    every = max(1, int(b.get("every") or 1)) * 7
    return (day - first).days % every == 0


def bin_day(bins: list[dict], now: datetime) -> BinDay | None:
    """The collection to nudge about right now, if any."""
    if not bins:
        return None
    if now.hour >= BIN_FROM_HOUR:
        day, tonight = now.date() + timedelta(days=1), True
    elif now.hour < BIN_UNTIL_HOUR:
        day, tonight = now.date(), False
    else:
        return None
    rows = [Bin(b.get("name", "Bin"), b.get("label", ""), _collected(b, day)) for b in bins]
    if not any(r.on for r in rows):
        return None
    return BinDay(datetime.combine(day, datetime.min.time()), tonight, rows, next_text(bins, day))


def next_collection(bins: list[dict], after: date) -> tuple[date, list[str]] | None:
    """The first collection after `after`: its date and the bins going out."""
    for i in range(1, 120):
        d = after + timedelta(days=i)
        names = [b.get("name", "Bin") for b in bins if _collected(b, d)]
        if names:
            return d, names
    return None


def next_text(bins: list[dict], after: date) -> str:
    n = next_collection(bins, after)
    return f"NEXT: {' + '.join(n[1]).upper()}, {n[0].strftime('%a %-d').upper()}" if n else ""


def _due_at(r: dict, now: datetime) -> datetime:
    at = r.get("at") or DEFAULT_AT
    try:
        hh, mm = (int(x) for x in at.split(":"))
    except ValueError:
        hh, mm = 8, 0
    if not r.get("last"):
        return now - timedelta(seconds=1)
    last = datetime.fromisoformat(r["last"])
    day = last.date() + timedelta(days=max(1, int(r.get("every") or 1)))
    return datetime.combine(day, datetime.min.time()).replace(hour=hh, minute=mm)


def reminders(items: list[dict], now: datetime) -> list[Reminder]:
    """Every reminder, due ones first (most overdue first), then by when they're due."""
    out = []
    for r in items:
        due_at = _due_at(r, now)
        due = now >= due_at
        if due:
            when = "NOW"
        elif due_at.date() == now.date():
            when = due_at.strftime("%H:%M")
        elif (due_at.date() - now.date()).days < 7:
            when = due_at.strftime("%a").upper()
        else:
            when = f"IN {(due_at.date() - now.date()).days}D"
        since = None
        if r.get("last"):
            since = (now.date() - datetime.fromisoformat(r["last"]).date()).days
        out.append((due_at, Reminder(
            title=r.get("title", "Reminder"), kind=r.get("kind", "other"), due=due, when=when,
            late_days=max(0, (now.date() - due_at.date()).days) if due and r.get("last") else 0,
            since_days=since, every=int(r.get("every") or 1), at=r.get("at", ""), id=r.get("id", ""))))
    out.sort(key=lambda p: (not p[1].due, p[0]))
    return [r for _, r in out]


def _mins(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def is_night(now: datetime, start: str, end: str) -> bool:
    """True between `start` and `end` (24-hour "HH:MM"), across midnight if need be."""
    try:
        a, b = _mins(start), _mins(end)
    except (ValueError, AttributeError):
        return False
    t = now.hour * 60 + now.minute
    if a == b:
        return False
    return a <= t < b if a < b else (t >= a or t < b)
