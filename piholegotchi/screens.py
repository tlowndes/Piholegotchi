"""The extra screens: server health, weather and clock, bin day, reminders.

Each has three styles (A, B, C) to pick from on the settings page. They share
the fonts and the 1-bit Canvas with the two main screens in render.py.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime

from PIL import Image, ImageDraw

from .render import INK, PAPER, W, H, Canvas, fit, fit_size, grot, pix, vt

STYLES = ("A", "B", "C")


# ================================================================ data

@dataclass
class Server:
    cpu: float = 0.0            # percent
    ram: float = 0.0            # percent
    disk: float = 0.0           # percent used, biggest drive
    free_gb: float = 0.0
    total_gb: float = 0.0
    uptime: str = ""            # e.g. "23 DAYS"
    history: list = field(default_factory=list)   # CPU percent, oldest first
    online: bool = True
    note: str = ""


@dataclass
class Slot:
    label: str                  # "NOW", "15:00"
    kind: str                   # sun, moon, part, cloud, rain, snow, storm, fog
    temp: float


@dataclass
class Weather:
    place: str
    temp: float
    feels: float
    hi: float
    lo: float
    rain: int                   # chance today, percent
    kind: str
    desc: str                   # "Light rain"
    sun_label: str              # "SUNSET 16:14" or "SUNRISE 07:12"
    slots: list                 # four Slots: now, then every 3 hours
    outlook: str = ""           # "Rain from 18:00"


@dataclass
class Bin:
    name: str                   # "Black"
    label: str                  # "Waste"
    on: bool                    # collected on the day shown


@dataclass
class BinDay:
    when: datetime              # collection day
    tonight: bool               # True the evening before, False on the morning
    bins: list                  # every configured Bin, with .on set
    next_text: str = ""         # "NEXT: GREEN, THU 19"


@dataclass
class Reminder:
    title: str
    kind: str                   # plant, pet or other
    due: bool
    when: str                   # "NOW", "18:00", "FRI", "IN 3D"
    late_days: int = 0
    since_days: int | None = None   # days since last done
    every: int = 7
    at: str = ""                # time of day, if set
    id: str = ""


def deg(t: float) -> str:
    return f"{round(t)}°"


def now_str(now: datetime) -> tuple[str, str, str]:
    """('12:18', 'WEDNESDAY 11 NOV', 'WED 11 NOV')"""
    return (now.strftime("%H:%M"), now.strftime("%A %-d %b").upper(), now.strftime("%a %-d %b").upper())


def bar(c: Canvas, x, y, w, h, frac):
    c.box(x, y, w, h)
    c.rect(x + 2, y + 2, round((w - 4) * max(0.0, min(1.0, frac))), h - 4)


# ================================================================ icons

def _sun(d, cx, cy, r, ink=INK):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ink)
    for a in range(0, 360, 45):
        t = math.radians(a)
        d.line([(cx + math.cos(t) * (r + 3), cy + math.sin(t) * (r + 3)),
                (cx + math.cos(t) * (r + 3 + r * .6), cy + math.sin(t) * (r + 3 + r * .6))], fill=ink, width=2)


def _moon(d, cx, cy, r, bg=PAPER):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
    o = r * .55
    d.ellipse([cx - r + o, cy - r - o * .4, cx + r + o, cy + r - o * .4], fill=bg)


def _cloud(d, cx, cy, s, fill=PAPER):
    parts = [(-.9, .1, .55), (-.3, -.35, .65), (.45, -.1, .55), (.95, .2, .4)]
    for dx, dy, r in parts:
        R = r * s
        d.ellipse([cx + dx * s - R - 2, cy + dy * s - R - 2, cx + dx * s + R + 2, cy + dy * s + R + 2], fill=INK)
    d.rectangle([cx - 1.3 * s, cy + .1 * s, cx + 1.3 * s, cy + .55 * s + 2], fill=INK)
    for dx, dy, r in parts:
        R = r * s
        d.ellipse([cx + dx * s - R, cy + dy * s - R, cx + dx * s + R, cy + dy * s + R], fill=fill)
    d.rectangle([cx - 1.3 * s + 2, cy + .1 * s, cx + 1.3 * s - 2, cy + .55 * s], fill=fill)


def icon(d: ImageDraw.ImageDraw, kind: str, cx: float, cy: float, s: float):
    """Weather icon roughly 2.6*s wide, centred on (cx, cy). Drawn in ink on paper."""
    if kind == "sun":
        _sun(d, cx, cy, int(s * .6))
    elif kind == "moon":
        _moon(d, cx, cy, s * .8)
    elif kind == "part":
        _sun(d, cx + s * .5, cy - s * .5, int(s * .45))
        _cloud(d, cx - 2, cy + 2, s * .8)
    elif kind in ("rain", "snow", "storm"):
        _cloud(d, cx, cy - s * .2, s * .8)
        top = cy + .55 * s
        if kind == "rain":
            for i in range(4):
                x = cx - s * .8 + i * s * .52
                d.line([(x, top), (x - 3, top + s * .45)], fill=INK, width=2)
        elif kind == "snow":
            for i in range(4):
                x = cx - s * .8 + i * s * .52
                for j in (0, 1):
                    y = top + 2 + j * s * .3 + (i % 2) * 3
                    d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=INK)
        else:
            d.polygon([(cx + 2, top - 2), (cx - s * .3, top + s * .3), (cx, top + s * .3),
                       (cx - s * .2, top + s * .65), (cx + s * .35, top + s * .15), (cx + s * .05, top + s * .15)], fill=INK)
    elif kind == "fog":
        for i in range(4):
            y = cy - s * .6 + i * s * .4
            off = (i % 2) * s * .3
            d.line([(cx - s + off, y), (cx + s * .9 + off * .5, y)], fill=INK, width=2)
    else:  # cloud
        _cloud(d, cx, cy, s)


# ================================================================ characters

def server_box(c: Canvas, x, y, stress: int):
    """A little server tower with a face. stress: 0 calm, 1 worried, 2 panicking, -1 asleep."""
    d = c.d
    d.rounded_rectangle([x, y, x + 62, y + 88], 6, fill=INK)
    for i in range(3):
        d.rectangle([x + 8, y + 60 + i * 7, x + 54, y + 62 + i * 7], fill=PAPER)
    c.rect(x + 50, y + 8, 4, 4, PAPER if stress >= 0 else INK)
    ex = (x + 20, x + 42)
    if stress < 0:
        for e in ex:
            d.line([(e - 5, y + 28), (e + 5, y + 28)], fill=PAPER, width=2)
        d.ellipse([x + 27, y + 38, x + 35, y + 45], fill=PAPER)
    elif stress == 0:
        for e in ex:
            d.arc([e - 5, y + 22, e + 5, y + 32], 198, 342, fill=PAPER, width=2)
        d.arc([x + 22, y + 30, x + 40, y + 44], 20, 160, fill=PAPER, width=2)
    elif stress == 1:
        for e in ex:
            d.ellipse([e - 4, y + 22, e + 4, y + 30], fill=PAPER)
        d.line([(x + 23, y + 42), (x + 39, y + 40)], fill=PAPER, width=2)
    else:
        for e in ex:
            d.ellipse([e - 6, y + 20, e + 6, y + 32], fill=PAPER)
            d.ellipse([e - 2, y + 24, e + 2, y + 28], fill=INK)
        d.line([(x + 20 + i * 3, y + 42 + (2 if i % 2 else -2)) for i in range(8)], fill=PAPER, width=2)
        d.polygon([(x + 70, y + 8), (x + 66, y + 18), (x + 74, y + 18)], fill=INK)
        d.ellipse([x + 66, y + 14, x + 74, y + 22], fill=INK)


def wheelie(c: Canvas, x, y, s=1.0, lid_open=False):
    d = c.d
    w, h = 50 * s, 70 * s
    d.polygon([(x, y), (x + w, y), (x + w - 5 * s, y + h), (x + 5 * s, y + h)], fill=INK)
    if lid_open:
        d.polygon([(x - 4 * s, y - 4 * s), (x + w + 2 * s, y - 16 * s), (x + w + 3 * s, y - 11 * s), (x - 3 * s, y + 1 * s)], fill=INK)
    else:
        d.rectangle([x - 4 * s, y - 8 * s, x + w + 4 * s, y - 2 * s], fill=INK)
    d.rectangle([x + w - 4 * s, y - 12 * s, x + w + 6 * s, y - 8 * s], fill=INK)
    d.ellipse([x + 2 * s, y + h - 6 * s, x + 16 * s, y + h + 8 * s], fill=INK, outline=PAPER, width=2)
    d.ellipse([x + w - 16 * s, y + h - 6 * s, x + w - 2 * s, y + h + 8 * s], fill=INK, outline=PAPER, width=2)
    for e in (x + 16 * s, x + 34 * s):
        d.ellipse([e - 4 * s, y + 20 * s, e + 4 * s, y + 28 * s], fill=PAPER)
        d.ellipse([e - 1 * s, y + 23 * s, e + 2 * s, y + 27 * s], fill=INK)
    d.arc([x + 16 * s, y + 28 * s, x + 34 * s, y + 42 * s], 20, 160, fill=PAPER, width=2)


def plant(c: Canvas, x, y, droop: bool):
    d = c.d
    d.polygon([(x, y + 50), (x + 50, y + 50), (x + 44, y + 88), (x + 6, y + 88)], fill=INK)
    d.rectangle([x - 3, y + 44, x + 53, y + 52], fill=INK)
    for e in (x + 17, x + 33):
        if droop:
            d.line([(e - 4, y + 64), (e + 4, y + 64)], fill=PAPER, width=2)
        else:
            d.arc([e - 4, y + 60, e + 4, y + 68], 198, 342, fill=PAPER, width=2)
    if droop:
        d.arc([x + 17, y + 70, x + 33, y + 80], 200, 340, fill=PAPER, width=2)
    else:
        d.arc([x + 17, y + 66, x + 33, y + 78], 20, 160, fill=PAPER, width=2)
    sx = x + 25
    d.line([(sx, y + 44), (sx, y + 14)], fill=INK, width=2)
    for side, ly in [(-1, y + 18), (1, y + 26), (-1, y + 34)]:
        dy = (4, 14) if droop else (-6, 4)
        d.ellipse([sx + (2 if side > 0 else -24), ly + dy[0], sx + (24 if side > 0 else -2), ly + dy[1]], fill=INK)
    if droop:
        d.polygon([(x + 58, y + 60), (x + 55, y + 67), (x + 61, y + 67)], fill=INK)
        d.ellipse([x + 55, y + 64, x + 61, y + 70], fill=INK)


def bowl(c: Canvas, x, y, sad: bool):
    """A pet bowl with a face and a heap of kibble, same footprint as the plant pot."""
    d = c.d
    y -= 18
    for kx, ky in ((8, 52), (18, 48), (28, 46), (38, 48), (48, 52), (13, 55), (23, 53), (33, 53), (43, 55)):
        d.ellipse([x + kx - 5, y + ky - 4, x + kx + 5, y + ky + 4], fill=INK, outline=PAPER)
    d.rectangle([x - 8, y + 58, x + 64, y + 64], fill=INK)
    d.chord([x - 6, y + 30, x + 62, y + 98], 0, 180, fill=INK)
    for e in (x + 17, x + 39):
        if sad:
            d.line([(e - 4, y + 72), (e + 4, y + 72)], fill=PAPER, width=2)
        else:
            d.arc([e - 4, y + 68, e + 4, y + 76], 198, 342, fill=PAPER, width=2)
    if sad:
        d.arc([x + 20, y + 78, x + 36, y + 88], 200, 340, fill=PAPER, width=2)
    else:
        d.arc([x + 20, y + 74, x + 36, y + 86], 20, 160, fill=PAPER, width=2)
    d.rectangle([x + 2, y + 100, x + 54, y + 102], fill=INK)


def bell(c: Canvas, x, y):
    d = c.d
    cx = x + 25
    d.chord([cx - 26, y + 22, cx + 26, y + 100], 180, 360, fill=INK)
    d.rectangle([cx - 26, y + 60, cx + 26, y + 76], fill=INK)
    d.rectangle([cx - 32, y + 76, cx + 32, y + 82], fill=INK)
    d.ellipse([cx - 7, y + 82, cx + 7, y + 94], fill=INK)
    d.ellipse([cx - 4, y + 14, cx + 4, y + 22], fill=INK)
    for e in (cx - 9, cx + 9):
        d.ellipse([e - 3, y + 46, e + 3, y + 52], fill=PAPER)
    d.arc([cx - 8, y + 54, cx + 8, y + 66], 20, 160, fill=PAPER, width=2)


def paw(c: Canvas, cx, cy, s):
    d = c.d
    d.ellipse([cx - s, cy - s * .4, cx + s, cy + s * 1.2], fill=INK)
    for dx, dy in ((-1.35, -.9), (-.55, -1.6), (.55, -1.6), (1.35, -.9)):
        d.ellipse([cx + dx * s - s * .32, cy + dy * s - s * .4, cx + dx * s + s * .32, cy + dy * s + s * .4], fill=INK)


def leaf(c: Canvas, cx, cy, s):
    d = c.d
    d.chord([cx - s * 1.4, cy - s * 1.4, cx + s * .6, cy + s * .6], 0, 90, fill=INK)
    d.chord([cx - s * .6, cy - s * .6, cx + s * 1.4, cy + s * 1.4], 180, 270, fill=INK)
    d.line([(cx - s, cy + s), (cx + s * .5, cy - s * .5)], fill=PAPER, width=2)
    d.line([(cx - s, cy + s), (cx - s * 1.4, cy + s * 1.4)], fill=INK, width=2)


# ================================================================ 5 server health

def _stress(s: Server) -> int:
    return 0 if s.disk < 70 else 1 if s.disk < 85 else 2


def _server_down(s: Server) -> Image.Image:
    c = Canvas()
    server_box(c, 14, 17, -1)
    x = 112
    c.text((x, 24), fit(s.note or "SERVER IS DOWN", 130, pix()), pix())
    c.text((x - 1, 53), "Zzz.", grot(30))
    c.text((x, 70), "Can't reach it.", vt(20))
    c.rect(x, 82, 130, 1)
    c.text((x, 96), "CHECK GLANCES IS", pix())
    c.text((x, 109), "RUNNING ON ZIMAOS", pix())
    return c.finish()


def server_a(s: Server) -> Image.Image:
    c = Canvas()
    server_box(c, 14, 17, _stress(s))
    c.rect(10, 106, 70, 2)
    x = 112
    c.text((x, 22), "ZIMAOS - DISK", pix())
    c.text((x - 1, 53), f"{s.disk:.0f}%", grot(30))
    c.text((x, 70), ["full. Roomy.", "full. Snug.", "full. Help!"][_stress(s)], vt(20))
    bar(c, x, 78, 128, 7, s.disk / 100)
    c.text((x, 98), f"CPU {s.cpu:.0f}%", pix())
    c.text((x + 70, 98), f"RAM {s.ram:.0f}%", pix())
    c.text((x, 110), fit(f"UP {s.uptime}", 128, pix()), pix())
    return c.finish()


def _ring(c: Canvas, cx, cy, r, frac, label, val):
    d = c.d
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=1)
    if frac > 0.005:
        d.arc([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], -90, -90 + 360 * min(1, frac), fill=INK, width=6)
    c.text((cx, cy + 6), val, grot(16), anchor="ms")
    c.text((cx, cy + r + 14), label, pix(), anchor="ms")


def server_b(s: Server) -> Image.Image:
    c = Canvas()
    c.text((8, 14), "SERVER", pix())
    c.text((242, 14), fit(f"UP {s.uptime}", 150, pix()), pix(), anchor="rs")
    c.rect(8, 18, 234, 1)
    _ring(c, 44, 60, 30, s.cpu / 100, "CPU", f"{s.cpu:.0f}")
    _ring(c, 125, 60, 30, s.ram / 100, "RAM", f"{s.ram:.0f}")
    _ring(c, 206, 60, 30, s.disk / 100, "DISK", f"{s.disk:.0f}")
    if s.disk >= 85:
        msg = "DISK NEARLY FULL"
    elif s.cpu >= 80:
        msg = "WORKING HARD"
    elif s.disk >= 70:
        msg = "ALL GOOD, A BIT FULL"
    else:
        msg = "ALL GOOD"
    c.text((125, 118), msg, pix(), anchor="ms")
    return c.finish()


def _size(gb: float) -> str:
    if gb >= 1000:
        return f"{gb / 1000:.1f} TB".replace(".0 ", " ")
    return f"{gb:.0f} GB"


def server_c(s: Server) -> Image.Image:
    c = Canvas()
    stress = _stress(s)
    server_box(c, 10, 17, stress)
    x = 100
    c.text((x, 20), ["DISK SPACE", "DISK IS FILLING UP", "DISK IS NEARLY FULL"][stress], pix())
    c.text((x - 1, 50), _size(s.free_gb), grot(28))
    c.text((x, 66), fit(f"left of {_size(s.total_gb)}." + (" Help." if stress == 2 else ""), 142, vt(20)), vt(20))
    c.box(x, 76, 142, 30)
    hist = s.history[-36:]
    if len(hist) < 2:
        c.text((x + 71, 95), "STARTING...", pix(), anchor="ms")
    else:
        top = max(30.0, max(hist))
        step = 138 / (len(hist) - 1)
        c.d.line([(x + 2 + i * step, 103 - v / top * 24) for i, v in enumerate(hist)], fill=INK, width=1)
    c.text((x, 116), "CPU, LAST 24H", pix())
    c.text((242, 116), fit(f"UP {s.uptime.replace(' DAYS', 'D').replace(' DAY', 'D')}", 60, pix()), pix(), anchor="rs")
    return c.finish()


# ================================================================ 6 weather and clock

def _no_weather(now: datetime, why: str) -> Image.Image:
    c = Canvas()
    t, long_date, _ = now_str(now)
    c.text((8, 18), long_date, pix())
    c.text((5, 78), t, grot(52))
    c.rect(8, 92, 140, 1)
    c.text((8, 110), fit(why, 140, pix()), pix())
    c.rect(160, 8, 1, 106)
    c.text((205, 66), "?", grot(40), anchor="ms")
    c.text((205, 98), "NO", pix(), anchor="ms")
    c.text((205, 110), "WEATHER", pix(), anchor="ms")
    return c.finish()


def weather_a(w: Weather | None, now: datetime) -> Image.Image:
    if w is None:
        return _no_weather(now, "SET YOUR TOWN")
    c = Canvas()
    t, long_date, _ = now_str(now)
    c.text((8, 18), long_date, pix())
    c.text((5, 78), t, grot(52))
    c.rect(8, 92, 140, 1)
    c.text((8, 110), w.sun_label, pix())
    c.rect(160, 8, 1, 106)
    icon(c.d, w.kind, 205, 46, 24)
    c.text((205, 98), deg(w.temp), grot(24), anchor="ms")
    c.text((205, 112), f"H {round(w.hi)}  L {round(w.lo)}", pix(), anchor="ms")
    return c.finish()


def weather_b(w: Weather | None, now: datetime) -> Image.Image:
    if w is None:
        return _no_weather(now, "SET YOUR TOWN")
    c = Canvas()
    t, _, short = now_str(now)
    c.text((8, 34), t, grot(30))
    c.text((116, 20), short, pix())
    c.text((116, 33), fit(w.outlook or w.desc, 126, vt(18)), vt(18))
    c.rect(8, 42, 234, 1)
    for i, sl in enumerate(w.slots[:4]):
        cx = 37 + i * 59
        if i:
            c.rect(cx - 30, 50, 1, 66)
        c.text((cx, 56), sl.label, pix(), anchor="ms")
        icon(c.d, sl.kind, cx, 80, 14)
        c.text((cx, 116), deg(sl.temp), grot(16), anchor="ms")
    return c.finish()


def weather_c(w: Weather | None, now: datetime) -> Image.Image:
    if w is None:
        return _no_weather(now, "SET YOUR TOWN")
    c = Canvas()
    # the icon panel: draw in ink on paper, then invert into a black block
    panel = Image.new("L", (110, 122), PAPER)
    pd = ImageDraw.Draw(panel)
    if w.kind == "sun":
        pd.ellipse([30, 26, 80, 76], fill=INK)
        for a in range(0, 360, 30):
            t = math.radians(a)
            pd.line([(55 + math.cos(t) * 32, 51 + math.sin(t) * 32), (55 + math.cos(t) * 42, 51 + math.sin(t) * 42)], fill=INK, width=3)
    else:
        icon(pd, w.kind, 55, 52, 26)
    c.img.paste(panel.point(lambda v: 255 - v), (0, 0))
    c.text((55, 112), fit(w.desc.upper(), 100, pix()), pix(), anchor="ms", fill=PAPER)
    x = 122
    t, _, short = now_str(now)
    c.text((x, 20), fit(w.place.upper(), 120, pix()), pix())
    c.text((x - 2, 62), deg(w.temp), grot(44))
    c.text((x, 78), f"Feels like {round(w.feels)}", vt(18))
    c.rect(x, 86, 120, 1)
    c.text((x, 100), fit(f"H {round(w.hi)}  L {round(w.lo)}  RAIN {w.rain}%", 120, pix()), pix())
    c.text((x, 113), f"{t}  {short}", pix())
    return c.finish()


# ================================================================ 7 bin day

def _bin_names(b: BinDay) -> str:
    on = [x.name for x in b.bins if x.on]
    if not on:
        return "Bins"
    if len(on) == 1:
        return f"{on[0]} bin"
    return " + ".join(n if i == 0 else n.lower() for i, n in enumerate(on))


def bins_a(b: BinDay) -> Image.Image:
    c = Canvas()
    wheelie(c, 28, 30, 1.0, lid_open=True)
    x = 112
    c.text((x, 24), "BIN DAY TOMORROW" if b.tonight else "BIN DAY TODAY", pix())
    name, f = fit_size(_bin_names(b), 130, (24, 20, 17), grot)
    c.text((x - 1, 52), name, f)
    c.text((x, 70), "out tonight." if b.tonight else "out this morning.", vt(20))
    c.rect(x, 82, 130, 1)
    c.text((x, 96), b.when.strftime("COLLECTED %a %-d %b").upper(), pix())
    if b.next_text:
        c.text((x, 109), fit(b.next_text, 130, pix()), pix())
    return c.finish()


def bins_b(b: BinDay) -> Image.Image:
    c = Canvas()
    d = c.d
    c.box(10, 14, 84, 96)
    c.rect(10, 14, 84, 22)
    c.text((52, 30), b.when.strftime("%A").upper(), pix(), anchor="ms", fill=PAPER)
    c.text((52, 88), str(b.when.day), grot(52), anchor="ms")
    c.text((52, 104), b.when.strftime("%B").upper(), pix(), anchor="ms")
    for rx in (26, 52, 78):
        c.rect(rx - 2, 10, 4, 8)
    x = 108
    c.text((x, 22), "TOMORROW'S COLLECTION" if b.tonight else "TODAY'S COLLECTION", pix())
    rows = b.bins[:3]
    gap = 25 if len(rows) >= 3 else 30
    for i, bn in enumerate(rows):
        y = 40 + i * gap
        c.box(x, y, 14, 14)
        if bn.on:
            d.line([(x + 3, y + 7), (x + 6, y + 11), (x + 11, y + 3)], fill=INK, width=2)
        label_w = text_w_pix(bn.label.upper())
        name_w = 242 - label_w - 6 - (x + 22)
        c.text((x + 22, y + 12), fit(bn.name, name_w, grot(15) if bn.on else vt(18)), grot(15) if bn.on else vt(18))
        c.text((242, y + 11), bn.label.upper(), pix(), anchor="rs")
    return c.finish()


def text_w_pix(s: str) -> float:
    return pix().getlength(s)


def bins_c(b: BinDay) -> Image.Image:
    c = Canvas(INK)
    d = c.d
    c.text((125, 22), "TONIGHT" if b.tonight else "THIS MORNING", pix(), anchor="ms", fill=PAPER)
    c.text((125, 66), "BINS OUT", grot(40), anchor="ms", fill=PAPER)
    on = [x.name for x in b.bins if x.on]
    names = " + ".join(n if i == 0 else n.lower() for i, n in enumerate(on)) or "Bins"
    line = f"{names}. {b.when.strftime('%A')} pickup."
    c.text((125, 88), fit(line, 236, vt(19)), vt(19), anchor="ms", fill=PAPER)
    for i in range(7):
        bx = 37 + i * 26
        d.polygon([(bx, 99), (bx + 14, 99), (bx + 12, 115), (bx + 2, 115)], fill=PAPER)
        d.rectangle([bx - 1, 96, bx + 15, 98], fill=PAPER)
    return c.finish()


# ================================================================ 8 reminders

HEADS = {"plant": "THIRSTY PLANT", "pet": "HUNGRY PET", "other": "REMINDER"}


def _status(r: Reminder) -> str:
    if r.late_days >= 1:
        return f"{r.late_days} day{'s' if r.late_days > 1 else ''} late."
    return "Due now." if r.due else f"Due {r.when.lower()}."


def _last(r: Reminder) -> str:
    if r.since_days is None:
        return "NOT DONE YET"
    if r.since_days == 0:
        return "LAST DONE TODAY"
    return f"LAST DONE {r.since_days} DAY{'S' if r.since_days > 1 else ''} AGO"


def _wrap2(text: str, width: int, font) -> list[str]:
    """Split onto at most two lines, truncating the second."""
    words, first = text.split(), ""
    while words and font.getlength((first + " " + words[0]).strip()) <= width:
        first = (first + " " + words.pop(0)).strip()
    if not first:
        return [fit(text, width, font)]
    return [first] + ([fit(" ".join(words), width, font)] if words else [])


def _all_done() -> Image.Image:
    c = Canvas()
    plant(c, 22, 18, droop=False)
    x = 112
    c.text((x, 24), "LOOKING AFTER", pix())
    c.text((x - 1, 52), "All done", grot(24))
    c.text((x, 70), "Nothing due.", vt(20))
    return c.finish()


def reminders_a(items: list[Reminder]) -> Image.Image:
    due = [r for r in items if r.due]
    if not due:
        return _all_done()
    r = due[0]
    c = Canvas()
    if r.kind == "plant":
        plant(c, 22, 18, droop=True)
    elif r.kind == "pet":
        bowl(c, 22, 18, sad=True)
    else:
        bell(c, 22, 12)
    x = 112
    head = HEADS.get(r.kind, "REMINDER") + (f"  +{len(due) - 1}" if len(due) > 1 else "")
    lines = _wrap2(r.title, 130, grot(15))
    if grot(17).getlength(r.title) <= 130 or len(lines) == 1:
        title, f = fit_size(r.title, 130, (20, 17, 15), grot)
        c.text((x - 1, 50), title, f)
        c.text((x, 70), _status(r), vt(20))
    else:                                    # long title: two lines, status moves to the label
        c.text((x - 1, 52), lines[0], grot(15))
        c.text((x - 1, 70), lines[1], grot(15))
        head = ("LATE: " if r.late_days else "DUE: ") + head
    c.text((x, 24), fit(head, 130, pix()), pix())
    c.rect(x, 82, 130, 1)
    c.text((x, 96), _last(r), pix())
    c.text((x, 109), f"EVERY {r.every} DAY{'S' if r.every != 1 else ''}" + (f" AT {r.at}" if r.at else ""), pix())
    return c.finish()


def reminders_b(items: list[Reminder], now: datetime) -> Image.Image:
    c = Canvas()
    d = c.d
    c.text((8, 16), "LOOKING AFTER", pix())
    c.text((242, 16), now_str(now)[2], pix(), anchor="rs")
    c.rect(8, 21, 234, 1)
    if not items:
        c.text((125, 70), "Nothing to look after yet.", vt(20), anchor="ms")
        return c.finish()
    for i, r in enumerate(items[:4]):
        y = 28 + i * 23
        fill = INK
        if r.due:
            c.rect(6, y - 2, 238, 21)
            fill = PAPER
        d.ellipse([12, y + 3, 24, y + 15], outline=fill, width=2)
        when = r.when
        ww = text_w_pix(when)
        font = grot(15) if r.due else vt(19)
        c.text((32, y + 14), fit(r.title, 238 - ww - 10 - 32, font), font, fill=fill)
        c.text((238, y + 13), when, pix(), anchor="rs", fill=fill)
    return c.finish()


def reminders_c(items: list[Reminder]) -> Image.Image:
    due = [r for r in items if r.due]
    if not due:
        return _all_done()
    r = due[0]
    c = Canvas()
    note = Image.new("L", (150, 100), PAPER)
    nd = ImageDraw.Draw(note)
    nd.rectangle([0, 0, 149, 99], outline=INK, width=2)
    nd.polygon([(120, 99), (149, 70), (149, 99)], fill=INK)
    nd.text((12, 22), "DON'T FORGET", font=pix(), fill=INK, anchor="ls")
    title, f = fit_size(r.title, 128, (22, 18, 15), grot)
    nd.text((10, 56), title, font=f, fill=INK, anchor="ls")
    nd.text((12, 78), fit(_status(r), 108, vt(20)), font=vt(20), fill=INK, anchor="ls")
    c.img.paste(note.rotate(4, expand=True, fillcolor=PAPER, resample=Image.BICUBIC), (4, 8))
    if r.kind == "pet":
        paw(c, 205, 52, 14)
    elif r.kind == "plant":
        leaf(c, 205, 46, 16)
    else:
        c.text((205, 66), "!", grot(44), anchor="ms")
    c.text((205, 98), r.at or "TODAY", grot(18), anchor="ms")
    c.text((205, 112), (f"{r.late_days}D LATE" if r.late_days else "DUE NOW") +
           (f" +{len(due) - 1}" if len(due) > 1 else ""), pix(), anchor="ms")
    return c.finish()


# ================================================================ dispatch

def render_server(style: str, s: Server | None) -> Image.Image:
    if s is None or not s.online:
        return _server_down(s or Server(online=False, note="SET UP YOUR SERVER"))
    return {"B": server_b, "C": server_c}.get(style, server_a)(s)


def render_weather(style: str, w: Weather | None, now: datetime) -> Image.Image:
    return {"B": weather_b, "C": weather_c}.get(style, weather_a)(w, now)


def render_bins(style: str, b: BinDay) -> Image.Image:
    return {"B": bins_b, "C": bins_c}.get(style, bins_a)(b)


def render_reminders(style: str, items: list[Reminder], now: datetime) -> Image.Image:
    if style == "B":
        return reminders_b(items, now)
    return reminders_c(items) if style == "C" else reminders_a(items)


# ================================================================ night mode

def _star(d, x, y, s=2, ink=INK):
    d.line([(x - s, y), (x + s, y)], fill=ink)
    d.line([(x, y - s), (x, y + s)], fill=ink)


def _crescent(d, cx, cy, r, ink=INK, bg=PAPER):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ink)
    o = int(r * .55)
    d.ellipse([cx - r + o, cy - r - o // 2, cx + r + o, cy + r - o // 2], fill=bg)


def night_a(blocked: int | None, until: str) -> Image.Image:
    """Tucked in: the Muncher asleep in a nightcap."""
    from .render import _creature
    c = Canvas()
    _creature(c, "asleep")
    c.d.rectangle([52, 10, 72, 36], fill=PAPER)          # the cap goes where the antenna was
    c.d.polygon([(22, 40), (74, 40), (92, 22), (60, 12), (40, 18)], fill=INK)
    c.d.rectangle([20, 36, 76, 42], fill=PAPER, outline=INK, width=2)
    c.d.ellipse([88, 18, 98, 28], fill=PAPER, outline=INK, width=2)
    c.text((100, 52), "z", vt(16))
    c.text((107, 42), "Z", vt(22))
    x = 130
    c.text((x, 24), "LIGHTS OUT", pix())
    c.text((x - 1, 49), "Night night.", grot(19))
    line = f"Ate {blocked:,} today." if blocked else "Sweet dreams."
    c.text((x, 66), fit(line, 116, vt(19)), vt(19))
    c.rect(x, 82, 112, 1)
    c.text((x, 96), "MOOD: ASLEEP", pix())
    c.text((x, 109), f"BACK AT {until}", pix())
    return c.finish()


def night_b(until: str) -> Image.Image:
    """Moon: almost nothing on screen."""
    c = Canvas()
    _crescent(c.d, 125, 50, 26)
    for x, y, s in ((70, 28, 2), (92, 70, 1), (170, 22, 2), (186, 62, 1), (58, 60, 1), (160, 80, 1)):
        _star(c.d, x, y, s)
    c.text((125, 108), f"SLEEPING TILL {until}", pix(), anchor="ms")
    return c.finish()


def night_c(until: str) -> Image.Image:
    """Night sky: inverted, the darkest option for a dark room."""
    c = Canvas(bg=INK)
    _crescent(c.d, 60, 58, 30, ink=PAPER, bg=INK)
    for x, y, s in ((110, 20, 2), (232, 16, 1), (120, 96, 1), (20, 18, 1), (100, 70, 1), (236, 100, 2), (24, 104, 1)):
        _star(c.d, x, y, s, ink=PAPER)
    x = 130
    c.text((x - 1, 52), "Zzz.", grot(30), fill=PAPER)
    c.text((x, 70), "Shh, sleeping.", vt(20), fill=PAPER)
    c.rect(x, 82, 100, 1, PAPER)
    c.text((x, 96), f"BACK AT {until}", pix(), fill=PAPER)
    return c.finish()


def render_night(style: str, blocked: int | None, until: str) -> Image.Image:
    if style == "B":
        return night_b(until)
    return night_c(until) if style == "C" else night_a(blocked, until)


# ================================================================ samples (for the picker before things are set up)

def samples(now: datetime) -> dict:
    from datetime import timedelta
    return {
        "server": Server(cpu=12, ram=41, disk=78, free_gb=220, total_gb=1000, uptime="23 DAYS",
                         history=[12 + 10 * math.sin(i / 4) + (i % 5) for i in range(36)]),
        "weather": Weather("London", 11, 9, 13, 6, 40, "part", "Some cloud", "SUNSET 16:14",
                           [Slot("NOW", "part", 11), Slot("15:00", "cloud", 10), Slot("18:00", "rain", 8),
                            Slot("21:00", "rain", 7)], "Rain from 18:00"),
        "bins": BinDay(datetime.combine(now.date() + timedelta(days=1), datetime.min.time()), True,
                       [Bin("Black", "Waste", True), Bin("Green", "Garden", False), Bin("Blue", "Recycle", True)],
                       "NEXT: GREEN, " + (now.date() + timedelta(days=8)).strftime("%a %-d").upper()),
        "night": {"blocked": 4812, "until": "07:00"},
        "reminders": [Reminder("Water the monstera", "plant", True, "NOW", 1, 8, 7),
                      Reminder("Feed Biscuit", "pet", False, "18:00", every=1, at="18:00", since_days=0),
                      Reminder("Mist the ferns", "plant", False, "FRI", every=3, since_days=1),
                      Reminder("Flea drops", "pet", False, "SUN", every=30, since_days=26)],
    }


def draw(name: str, style: str, data: dict, now: datetime) -> Image.Image:
    """One of the extra screens, from the latest data (None where it isn't set up)."""
    if name == "server":
        return render_server(style, data.get("server"))
    if name == "weather":
        return render_weather(style, data.get("weather"), now)
    if name == "bins":
        b = data.get("bins")
        return render_bins(style, b) if b else render_bins(style, samples(now)["bins"])
    if name == "reminders":
        return render_reminders(style, data.get("reminders") or [], now)
    if name == "night":
        n = data.get("night") or {}
        return render_night(style, n.get("blocked"), n.get("until", "07:00"))
    raise ValueError(name)
