"""Home Assistant: a few entities on a Home screen, and messages pushed to the screen.

Reading uses HA's REST API with a long-lived access token (Profile › Security
in Home Assistant). Messages go the other way: an HA automation POSTs to
/api/message on the settings page, so nothing here needs to be reachable
from outside the house.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import requests

log = logging.getLogger(__name__)
MAX_ENTITIES = 5
# domains worth picking for a 250x122 screen
USEFUL = ("sensor", "binary_sensor", "light", "switch", "lock", "climate", "person", "device_tracker",
          "media_player", "fan", "cover", "input_boolean", "weather", "vacuum", "alarm_control_panel")


@dataclass
class Item:
    label: str                  # "Living room"
    value: str                  # "21.5°", "ON", "LOCKED"
    kind: str                   # icon: light, switch, lock, door, motion, temp, humidity, power, battery,
                                # climate, person, media, plug, other
    on: bool | None = None      # lit/active, for a filled tile


@dataclass
class Home:
    items: list
    online: bool = True
    note: str = ""


def _num(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    return f"{f:.0f}" if abs(f) >= 100 or f == int(f) else f"{f:.1f}"


def describe(s: dict, label: str = "") -> Item:
    """One /api/states entry -> what the screen shows."""
    eid = s.get("entity_id", "")
    domain = eid.split(".")[0]
    a = s.get("attributes") or {}
    st = str(s.get("state", ""))
    label = label or a.get("friendly_name") or eid
    dc = a.get("device_class", "")
    if st in ("unavailable", "unknown"):
        return Item(label, "-", "other")
    if domain in ("light", "switch", "input_boolean", "fan"):
        kind = {"light": "light", "fan": "power"}.get(domain, "plug")
        return Item(label, st.upper(), kind, st == "on")
    if domain == "lock":
        return Item(label, st.upper(), "lock", st == "locked")
    if domain == "cover":
        return Item(label, st.upper(), "door", st == "open")
    if domain == "binary_sensor":
        on = st == "on"
        if dc in ("door", "window", "opening", "garage_door"):
            return Item(label, "OPEN" if on else "SHUT", "door", on)
        if dc in ("motion", "occupancy", "presence"):
            return Item(label, "MOTION" if on else "CLEAR", "motion", on)
        return Item(label, "ON" if on else "OFF", "other", on)
    if domain in ("person", "device_tracker"):
        where = {"home": "HOME", "not_home": "AWAY"}.get(st, st.replace("_", " ").upper())
        return Item(label, where, "person", st == "home")
    if domain == "climate":
        cur, tgt = a.get("current_temperature"), a.get("temperature")
        v = f"{_num(cur)}°" if cur is not None else st.upper()
        if tgt is not None and st != "off":
            v += f" > {_num(tgt)}°"
        return Item(label, v, "climate", st not in ("off", "idle"))
    if domain == "media_player":
        title = a.get("media_title")
        return Item(label, str(title) if st == "playing" and title else st.upper(), "media", st == "playing")
    if domain == "weather":
        t = a.get("temperature")
        return Item(label, f"{_num(t)}°" if t is not None else st, "temp")
    unit = a.get("unit_of_measurement") or ""
    kind = {"temperature": "temp", "humidity": "humidity", "power": "power", "energy": "power",
            "battery": "battery"}.get(dc, "other")
    if unit in ("°C", "°F"):
        kind, unit = "temp", "°"
    value = _num(st) + (unit if unit in ("°", "%") else (" " + unit if unit else ""))
    return Item(label, value if unit or st[:1].isdigit() or st[:1] == "-" else st.upper(), kind)


class HomeAssistant:
    def __init__(self, url: str, token: str):
        self.url = url.strip().rstrip("/")
        self.token = token.strip()

    @property
    def configured(self) -> bool:
        return bool(self.url and self.token)

    def _get(self, path: str):
        r = requests.get(self.url + path, timeout=8,
                         headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"})
        if r.status_code == 401:
            raise PermissionError("Home Assistant didn't accept the token")
        r.raise_for_status()
        return r.json()

    def check(self) -> str:
        """'' if it works, else what's wrong (for the settings page)."""
        try:
            self._get("/api/")
            return ""
        except PermissionError:
            return "Home Assistant didn't accept that token. Make a new long-lived token and paste it again."
        except Exception as e:  # noqa: BLE001
            log.info("HA check failed: %s", e)
            return "Can't reach Home Assistant there. Check the address, e.g. http://192.168.1.20:8123"

    def entities(self) -> list[dict]:
        """Everything worth picking, for the settings page."""
        out = []
        for s in self._get("/api/states"):
            eid = s.get("entity_id", "")
            if eid.split(".")[0] not in USEFUL:
                continue
            it = describe(s)
            out.append({"id": eid, "name": (s.get("attributes") or {}).get("friendly_name") or eid, "value": it.value})
        return sorted(out, key=lambda e: (e["id"].split(".")[0], e["name"].lower()))

    def get(self, picks: list[dict]) -> Home:
        if not picks:
            return Home([], note="PICK SOME THINGS IN SETTINGS")
        items = []
        try:
            for p in picks[:MAX_ENTITIES]:
                try:
                    items.append(describe(self._get(f"/api/states/{p['id']}"), p.get("label", "")))
                except requests.HTTPError:
                    items.append(Item(p.get("label") or p["id"], "GONE", "other"))
        except PermissionError:
            return Home([], online=False, note="TOKEN NOT ACCEPTED")
        except Exception as e:  # noqa: BLE001
            log.warning("home assistant failed: %s", e)
            return Home([], online=False, note="CAN'T REACH HOME ASSISTANT")
        return Home(items)


# ---------------------------------------------------------------- messages from HA (or anything)

@dataclass
class Message:
    text: str
    title: str
    until: float


class Inbox:
    """The one message on screen now. A new one replaces it."""

    def __init__(self):
        self.msg: Message | None = None

    def post(self, text: str, title: str = "", minutes: float = 5):
        text = " ".join(str(text or "").split())[:140]
        if not text:
            self.msg = None
            return
        minutes = max(0.5, min(240.0, float(minutes or 5)))
        self.msg = Message(text, " ".join(str(title or "").split())[:30], time.time() + minutes * 60)

    def now(self, t: float) -> Message | None:
        if self.msg and t >= self.msg.until:
            self.msg = None
        return self.msg
