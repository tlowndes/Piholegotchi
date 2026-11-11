"""Draws the two screens at the panel's native 250x122, 1-bit.

Everything is drawn in greyscale first and thresholded at 50%, the same way
the mock-ups were made. Album art is Atkinson-dithered separately and pasted
in afterwards so its texture survives.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 250, 122
INK, PAPER = 0, 255
FONT_DIR = Path(__file__).parent / "fonts"


# ---------------------------------------------------------------- fonts

@lru_cache(maxsize=None)
def _font(name: str, size: int, weight: str | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONT_DIR / name), size)
    if weight:
        f.set_variation_by_name(weight)
    return f


def pix() -> ImageFont.FreeTypeFont:      # tiny caps labels
    return _font("Silkscreen-Regular.ttf", 8)


def vt(size: int) -> ImageFont.FreeTypeFont:  # terminal-style secondary text
    return _font("VT323-Regular.ttf", size)


def grot(size: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:  # display
    return _font("SpaceGrotesk-VF.ttf", size, weight)


def text_w(font, s: str) -> float:
    return font.getlength(s)


def fit(s: str, width: int, font) -> str:
    """Truncate with an ellipsis so the string fits in `width` pixels."""
    if text_w(font, s) <= width:
        return s
    while s and text_w(font, s + "…") > width:
        s = s[:-1]
    return s.rstrip() + "…"


def fit_size(s: str, width: int, sizes, make):
    """Pick the largest font size from `sizes` that fits, else truncate the smallest."""
    for z in sizes:
        f = make(z)
        if text_w(f, s) <= width:
            return s, f
    f = make(sizes[-1])
    return fit(s, width, f), f


# ---------------------------------------------------------------- canvas

class Canvas:
    def __init__(self, bg: int = PAPER):
        self.img = Image.new("L", (W, H), bg)
        self.d = ImageDraw.Draw(self.img)
        self._pastes: list[tuple[Image.Image, tuple[int, int], Image.Image | None]] = []

    def text(self, xy, s, font, anchor="ls", fill=INK):
        self.d.text(xy, s, font=font, anchor=anchor, fill=fill)
        return text_w(font, s)

    def rect(self, x, y, w, h, fill=INK):
        if w > 0 and h > 0:
            self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=fill)

    def box(self, x, y, w, h, fill=INK):
        self.d.rectangle([x, y, x + w - 1, y + h - 1], outline=fill)

    def paste_bits(self, img1: Image.Image, xy, mask: Image.Image | None = None):
        self._pastes.append((img1, xy, mask))

    def finish(self) -> Image.Image:
        out = self.img.point(lambda v: 255 if v >= 128 else 0).convert("1")
        for im, xy, mask in self._pastes:
            out.paste(im, xy, mask)
        return out


# ---------------------------------------------------------------- dithering

def atkinson(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize, lift the contrast a touch, and Atkinson-dither to 1-bit."""
    g = img.convert("L").resize(size, Image.LANCZOS)
    from PIL import ImageOps
    g = ImageOps.autocontrast(g, cutoff=2)
    w, h = size
    px = [float(v) for v in g.getdata()]
    out = bytearray(w * h)
    offsets = ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2))
    for y in range(h):
        row = y * w
        for x in range(w):
            old = px[row + x]
            new = 255 if old >= 128 else 0
            out[row + x] = new
            err = (old - new) / 8
            for dx, dy in offsets:
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and yy < h:
                    px[yy * w + xx] += err
    return Image.frombytes("L", size, bytes(out)).convert("1")


# ---------------------------------------------------------------- data

@dataclass
class Track:
    id: str
    title: str
    artist: str
    album: str
    year: str
    progress_s: int
    duration_s: int
    is_playing: bool
    art: Image.Image | None = None   # already dithered, 106x106


@dataclass
class Stats:
    total: int
    blocked: int
    percent: float
    online: bool = True
    note: str = ""          # why it's offline, shown on the asleep screen
    today: int | None = None    # blocked since midnight, from AdGuard's hourly counts
    mood: str = ""          # set by moods.py: "party" or "starving" (overrides the block rate)
    beat: int = 0           # party: the old record
    off_mins: int = 0       # starving: how long blocking has been off
    frame: int = 0          # party: which dance pose


def mmss(s: int) -> str:
    s = max(0, int(s))
    return f"{s // 60}:{s % 60:02d}"


def gb(n: int) -> str:
    return f"{n:,}"


# ---------------------------------------------------------------- 3A Sleeve

ART = 106


def placeholder_art() -> Image.Image:
    """Shown when a track has no cover: a quiet diagonal hatch."""
    im = Image.new("1", (ART, ART), 1)
    d = ImageDraw.Draw(im)
    for i in range(-ART, ART, 6):
        d.line([(i, ART), (i + ART, 0)], fill=0)
    d.rectangle([0, 0, ART - 1, ART - 1], outline=0)
    return im


def sleeve(t: Track) -> Image.Image:
    c = Canvas()
    c.paste_bits(t.art or placeholder_art(), (8, 8))

    col_x, col_w = 124, 118
    c.text((col_x, 15), "NOW PLAYING" if t.is_playing else "PAUSED", pix())
    if t.is_playing:
        for i, h in enumerate((5, 8, 3, 7)):
            c.rect(230 + i * 3, 15 - h, 2, h)
    else:
        c.rect(233, 8, 2, 7)
        c.rect(237, 8, 2, 7)

    title, tf = fit_size(t.title, col_w, (19, 17, 15), grot)
    c.text((col_x - 1, 42), title, tf)
    c.text((col_x, 59), fit(t.artist, col_w, vt(19)), vt(19))
    meta = f"{t.album} - {t.year}".upper() if t.year else t.album.upper()
    c.text((col_x, 72), fit(meta, col_w, pix()), pix())

    frac = 0 if t.duration_s <= 0 else min(1, t.progress_s / t.duration_s)
    c.box(col_x, 92, col_w, 7)
    c.rect(col_x + 2, 94, round((col_w - 4) * frac), 3)
    c.text((col_x, 112), mmss(t.progress_s), pix())
    c.text((242, 112), "-" + mmss(t.duration_s - t.progress_s), pix(), anchor="rs")
    return c.finish()


# ---------------------------------------------------------------- 4D Muncher

def mood(s: Stats | None) -> str:
    if s is not None and s.mood:
        return s.mood
    if s is None or not s.online:
        return "asleep"
    if s.percent < 12:
        return "hungry"
    if s.percent < 22:
        return "content"
    return "stuffed"


MOOD_COPY = {
    "hungry": ("TODAY I ATE", "ads. More?", "MOOD: HUNGRY"),
    "content": ("TODAY I ATE", "ads. Nom.", "MOOD: CONTENT"),
    "stuffed": ("TODAY I ATE", "ads. Burp.", "MOOD: STUFFED"),
}


def _creature(c: Canvas, m: str):
    d = c.d
    cx, cy = 48, 62
    # antenna
    pts = [(cx + 4 + 10 * t ** 1.6, 36 - 14 * math.sin(t * math.pi / 2)) for t in (i / 8 for i in range(9))]
    d.line(pts, fill=INK, width=2)
    d.ellipse([cx + 11, 17, cx + 19, 25], fill=INK if m != "asleep" else PAPER, outline=INK, width=2)
    # feet + body
    c.rect(cx - 18, 84, 10, 7)
    c.rect(cx + 6, 84, 10, 7)
    d.ellipse([cx - 32, cy - 28, cx + 32, cy + 28], fill=INK)

    if m == "asleep":
        for ex in (cx - 12, cx + 11):
            d.line([(ex - 5, 54), (ex + 5, 54)], fill=PAPER, width=2)
        d.ellipse([cx - 4, 68, cx + 6, 76], fill=PAPER)
        return
    if m == "hungry":
        for ex in (cx - 12, cx + 11):
            d.ellipse([ex - 5, 47, ex + 5, 57], fill=PAPER)
            d.ellipse([ex - 1, 50, ex + 3, 55], fill=INK)
    else:
        for ex in (cx - 12, cx + 11):
            d.arc([ex - 5, 49, ex + 5, 59], 198, 342, fill=PAPER, width=2)
    # mouth with teeth
    d.ellipse([cx - 14, 63, cx + 16, 81], fill=PAPER)
    for i in range(5):
        tx = cx - 11 + i * 5.5
        d.polygon([(tx, 63), (tx + 5.5, 63), (tx + 2.75, 67.5)], fill=INK)
    if m != "hungry":
        c.rect(cx - 2, 72, 9, 7)   # a chewed ad


def _party(c: Canvas, frame: int):
    """Dancing: the whole creature hops and leans, eyes shut with joy."""
    from PIL import ImageChops
    sub = Canvas()
    _creature(sub, "content")
    d = sub.d
    cx = 48
    d.ellipse([cx - 22, 45, cx + 22, 60], fill=INK)          # wipe the eyes
    for ex in (cx - 12, cx + 11):                              # ^ ^
        d.line([(ex - 5, 56), (ex, 50), (ex + 5, 56)], fill=PAPER, width=2)
    d.rectangle([cx - 2, 72, cx + 7, 79], fill=PAPER)          # no ad: singing
    for side in (-1, 1):                                       # little arms, one up one out
        up = (side == -1) == (frame % 2 == 0)
        sx = cx + side * 30
        tip = (sx + side * 10, 34) if up else (sx + side * 12, 58)
        d.line([(sx, 60), tip], fill=INK, width=4)
        d.ellipse([tip[0] - 3, tip[1] - 3, tip[0] + 3, tip[1] + 3], fill=INK)
    body = sub.img.crop((0, 8, 100, 92))
    lean = -12 if frame % 2 == 0 else 12
    body = body.rotate(lean, resample=Image.NEAREST, center=(48, 76), fillcolor=PAPER)
    dx, dy = (-3, -5) if frame % 2 == 0 else (3, -1)
    c.img.paste(ImageChops.darker(c.img.crop((dx, 8 + dy, dx + 100, 92 + dy)), body), (dx, 8 + dy))
    d = c.d
    # music notes and confetti swap sides each pose
    nx = 96 if frame % 2 == 0 else 6
    for i, (x, y) in enumerate(((nx, 30), (nx + 10, 18))):
        d.ellipse([x, y + 8, x + 6, y + 13], fill=INK)
        d.line([(x + 5, y + 10), (x + 5, y)], fill=INK, width=2)
        if i:
            d.line([(x + 5, y), (x - 5, y + 3)], fill=INK, width=2)
    for x, y in ((14, 14) if frame % 2 else (104, 74), (100, 8) if frame % 2 else (6, 70), (110, 96), (2, 100)):
        d.rectangle([x, y, x + 2, y + 2], fill=INK)
    c.rect(18, 96, 60, 1)                                      # the dance floor


def _starving(c: Canvas):
    """Blocking's been off a while: thin, sad brows, tongue out, a drip of drool."""
    d = c.d
    cx, cy = 48, 62
    d.line([(cx + 4, 36), (cx + 9, 26), (cx + 12, 22), (cx + 17, 22)], fill=INK, width=2)   # droopy antenna
    d.ellipse([cx + 15, 22, cx + 23, 30], fill=PAPER, outline=INK, width=2)
    c.rect(cx - 16, 84, 8, 7)
    c.rect(cx + 6, 84, 8, 7)
    d.ellipse([cx - 28, cy - 26, cx + 28, cy + 26], fill=INK)
    for ex, k in ((cx - 11, 1), (cx + 10, -1)):
        d.ellipse([ex - 6, 46, ex + 6, 58], fill=PAPER)        # big pleading eyes
        d.ellipse([ex - 2, 50, ex + 3, 56], fill=INK)
        d.line([(ex - 6, 43 + 2 * k), (ex + 6, 43 - 2 * k)], fill=PAPER, width=2)   # worried brows
    d.ellipse([cx - 10, 62, cx + 10, 76], fill=PAPER)          # empty open mouth
    d.ellipse([cx - 5, 70, cx + 5, 80], fill=PAPER, outline=INK, width=1)   # tongue
    d.line([(cx, 71), (cx, 76)], fill=INK)
    d.ellipse([cx + 8, 76, cx + 12, 82], fill=PAPER)          # drool
    d.ellipse([cx + 8, 84, cx + 12, 89], fill=INK)
    d.rectangle([cx + 9, 82, cx + 11, 85], fill=INK)


def _hm(mins: int) -> str:
    return f"{mins // 60}H {mins % 60:02d}M" if mins >= 60 else f"{mins} MIN"


def _ad_chunks(c: Canvas, count: int):
    for l, t in [(82, 36), (90, 60), (80, 84)][:count]:
        c.box(l, t, 15, 11)
        c.text((l + 8, t + 9), "AD", pix(), anchor="ms")
        for k in range(2):
            c.rect(l + 18 + k * 4, t + 3 + (k % 2) * 4, 2, 1)


def muncher(s: Stats | None) -> Image.Image:
    c = Canvas()
    m = mood(s)
    if m not in ("party", "starving"):
        _creature(c, m)
    x = 130
    if m == "asleep":
        c.text((96, 40), "z", vt(16))
        c.text((104, 30), "Z", vt(22))
        c.text((x, 24), (s.note if s and s.note else "ADGUARD IS DOWN"), pix())
        c.text((x - 1, 53), "Zzz.", grot(30))
        c.text((x, 70), "Wake me up.", vt(20))
        c.rect(x, 82, 112, 1)
        c.text((x, 96), "MOOD: ASLEEP", pix())
        c.text((x, 109), "CHECK THE PI", pix())
        return c.finish()

    if m == "party":
        _party(c, s.frame)
        c.text((x, 24), "NEW RECORD TODAY", pix())
        n = s.today if s.today is not None else s.blocked
        num, nf = fit_size(gb(n), 112, (30, 26, 22), grot)
        c.text((x - 1, 53), num, nf)
        c.text((x, 70), "ads. Party!", vt(20))
        c.rect(x, 82, 112, 1)
        c.text((x, 96), "MOOD: PARTY", pix())
        c.text((x, 109), fit(f"OLD BEST {gb(s.beat)}", 112, pix()), pix())
        return c.finish()
    if m == "starving":
        _starving(c)
        c.text((x, 24), "BLOCKING IS OFF", pix())
        c.text((x - 1, 53), "Starving.", grot(26))
        c.text((x, 70), "Feed me ads.", vt(20))
        c.rect(x, 82, 112, 1)
        c.text((x, 96), "MOOD: STARVING", pix())
        c.text((x, 109), f"OFF FOR {_hm(s.off_mins)}", pix())
        return c.finish()

    _ad_chunks(c, {"hungry": 0, "content": 2, "stuffed": 3}[m])
    head, tail, mood_line = MOOD_COPY[m]
    c.text((x, 24), head, pix())
    num, nf = fit_size(gb(s.blocked), 112, (30, 26, 22), grot)
    c.text((x - 1, 53), num, nf)
    c.text((x, 70), tail, vt(20))
    c.rect(x, 82, 112, 1)
    c.text((x, 96), mood_line, pix())
    c.text((x, 109), fit(f"{s.percent:.1f}% OF {gb(s.total)}", 112, pix()), pix())
    return c.finish()


# ---------------------------------------------------------------- first boot

def setup_screen(host: str, ip: str) -> Image.Image:
    """Shown until anything is set up: tells you where the settings page is."""
    c = Canvas()
    _creature(c, "hungry")
    x = 130
    c.text((x, 24), "HELLO, I'M NEW", pix())
    c.text((x - 1, 47), "Set me up", grot(20))
    c.text((x, 63), "on your phone at", vt(18))
    c.rect(x, 72, 112, 1)
    c.text((x, 87), fit(f"{host}.local", 112, pix()), pix())
    if ip:
        c.text((x, 100), "OR " + ip, pix())
    return c.finish()
