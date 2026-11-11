"""Upcoming events from a calendar's shared ICS link (Proton Calendar's "Share with anyone").

A small reader with no extra packages, since updates only replace the app's
code. It handles what calendar apps usually write: all-day and timed events,
time zones, repeating events (daily, weekly, monthly, yearly with INTERVAL,
COUNT, UNTIL and BYDAY), skipped dates, moved occurrences and cancellations.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests

log = logging.getLogger(__name__)
AHEAD = timedelta(days=14)
DAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
WIN_ZONES = {"GMT Standard Time": "Europe/London", "W. Europe Standard Time": "Europe/Berlin",
             "Eastern Standard Time": "America/New_York", "Pacific Standard Time": "America/Los_Angeles"}


@dataclass
class Event:
    title: str
    start: datetime             # local, naive
    end: datetime
    all_day: bool
    where: str = ""


@dataclass
class Agenda:
    events: list                # upcoming Events, soonest first (ongoing ones included)
    online: bool = True
    note: str = ""

    def next(self, now: datetime) -> Event | None:
        return next((e for e in self.events if e.end > now), None)


# ---------------------------------------------------------------- parsing

def _lines(text: str) -> list[str]:
    out: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and out:
            out[-1] += raw[1:]
        elif raw:
            out.append(raw)
    return out


def _split(line: str) -> tuple[str, dict, str]:
    head, _, value = line.partition(":")
    name, *params = head.split(";")
    p = {}
    for kv in params:
        k, _, v = kv.partition("=")
        p[k.upper()] = v.strip('"')
    return name.upper(), p, value


def _unescape(s: str) -> str:
    return s.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _zone(tzid: str | None):
    if not tzid:
        return None
    tzid = WIN_ZONES.get(tzid, tzid)
    try:
        return ZoneInfo(tzid)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def _when(value: str, params: dict) -> tuple[datetime, bool]:
    """-> (local naive datetime, is_all_day)"""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        return datetime.combine(datetime.strptime(value[:8], "%Y%m%d").date(), time()), True
    dt = datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
    if value.endswith("Z"):
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        z = _zone(params.get("TZID"))
        if z is None:
            return dt, False                 # floating time: already local
        dt = dt.replace(tzinfo=z)
    return dt.astimezone().replace(tzinfo=None), False


def _rrule(s: str) -> dict:
    return {k.upper(): v for k, _, v in (p.partition("=") for p in s.split(";")) if k}


def _add_months(d: datetime, n: int) -> datetime | None:
    y, m = divmod(d.month - 1 + n, 12)
    try:
        return d.replace(year=d.year + y, month=m + 1)
    except ValueError:                       # e.g. the 31st in a short month: skipped, like calendar apps
        return None


def _occurrences(start: datetime, rule: dict, until: datetime):
    """Start times of a repeating event, from `start` up to `until`."""
    freq = rule.get("FREQ", "")
    step = max(1, int(rule.get("INTERVAL", 1) or 1))
    count = int(rule["COUNT"]) if rule.get("COUNT", "").isdigit() else None
    end = None
    if rule.get("UNTIL"):
        try:
            end, _ = _when(rule["UNTIL"], {})
            if len(rule["UNTIL"]) == 8:
                end += timedelta(days=1)
        except ValueError:
            end = None
    byday = [DAYS[d[-2:]] for d in rule.get("BYDAY", "").split(",") if d[-2:] in DAYS]
    n = 0

    def ok(t):
        return (end is None or t <= end) and t <= until

    if freq == "WEEKLY":
        days = sorted(set(byday or [start.weekday()]))
        week = start - timedelta(days=start.weekday())
        while week <= until:
            for wd in days:
                t = week + timedelta(days=wd)
                if t < start:
                    continue
                if not ok(t) or (count is not None and n >= count):
                    return
                n += 1
                yield t
            week += timedelta(weeks=step)
        return

    i = 0
    while True:
        if freq == "DAILY":
            t = start + timedelta(days=i * step)
        elif freq == "MONTHLY":
            t = _add_months(start, i * step)
        elif freq == "YEARLY":
            t = _add_months(start, i * step * 12)
        else:
            return
        i += 1
        if i > 5000:
            return
        if t is None:
            continue
        if not ok(t) or (count is not None and n >= count):
            return
        n += 1
        yield t


def parse(text: str, now: datetime) -> list[Event]:
    horizon = now + AHEAD
    raw: list[dict] = []
    cur: dict | None = None
    for line in _lines(text):
        name, p, v = _split(line)
        if name == "BEGIN" and v.upper() == "VEVENT":
            cur = {"exdates": set()}
        elif name == "END" and v.upper() == "VEVENT":
            if cur is not None and "start" in cur:
                raw.append(cur)
            cur = None
        elif cur is not None:
            try:
                if name == "DTSTART":
                    cur["start"], cur["all_day"] = _when(v, p)
                elif name == "DTEND":
                    cur["end"], _ = _when(v, p)
                elif name == "DURATION":
                    cur["duration"] = _duration(v)
                elif name == "SUMMARY":
                    cur["title"] = _unescape(v).strip()
                elif name == "LOCATION":
                    cur["where"] = _unescape(v).strip()
                elif name == "RRULE":
                    cur["rrule"] = _rrule(v)
                elif name == "EXDATE":
                    for part in v.split(","):
                        cur["exdates"].add(_when(part, p)[0])
                elif name == "RECURRENCE-ID":
                    cur["recurrence_id"] = _when(v, p)[0]
                elif name == "UID":
                    cur["uid"] = v
                elif name == "STATUS":
                    cur["status"] = v.upper()
            except ValueError:
                continue

    moved: dict[tuple, dict] = {}
    for e in raw:
        if e.get("recurrence_id") is not None:
            moved[(e.get("uid"), e["recurrence_id"])] = e

    out: list[Event] = []

    def add(e: dict, start: datetime):
        length = (e["end"] - e["start"]) if "end" in e else e.get("duration") or \
            (timedelta(days=1) if e.get("all_day") else timedelta(0))
        end = start + length
        if e.get("status") == "CANCELLED" or end <= now - timedelta(hours=1) or start > horizon:
            return
        out.append(Event(e.get("title") or "Busy", start, end, bool(e.get("all_day")), e.get("where", "")))

    for e in raw:
        if e.get("recurrence_id") is not None:
            add(e, e["start"])
            continue
        if "rrule" not in e:
            add(e, e["start"])
            continue
        for t in _occurrences(e["start"], e["rrule"], horizon):
            if t in e["exdates"] or (e.get("uid"), t) in moved:
                continue
            add(e, t)

    out.sort(key=lambda ev: (ev.start, not ev.all_day))
    return [ev for ev in out if ev.end > now]


def _duration(v: str) -> timedelta:
    m = re.fullmatch(r"([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", v.strip())
    if not m:
        raise ValueError(v)
    w, d, h, mi, s = (int(x or 0) for x in m.groups()[1:])
    return timedelta(weeks=w, days=d, hours=h, minutes=mi, seconds=s)


# ---------------------------------------------------------------- fetching

def clean_url(url: str) -> str:
    url = url.strip()
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    return url


class CalendarSource:
    def __init__(self, url: str):
        self.url = clean_url(url)

    @property
    def configured(self) -> bool:
        return bool(self.url)

    def get(self, now: datetime | None = None) -> Agenda:
        now = now or datetime.now()
        try:
            r = requests.get(self.url, timeout=15, headers={"User-Agent": "Piholegotchi"})
            r.raise_for_status()
            text = r.text
        except Exception as e:  # noqa: BLE001
            log.warning("calendar failed: %s", e)
            return Agenda([], online=False, note="CAN'T REACH CALENDAR")
        if "BEGIN:VCALENDAR" not in text[:2000]:
            return Agenda([], online=False, note="NOT A CALENDAR LINK")
        try:
            return Agenda(parse(text, now))
        except Exception as e:  # noqa: BLE001
            log.exception("calendar didn't parse")
            return Agenda([], online=False, note="CALENDAR DIDN'T READ")
