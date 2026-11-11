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


def _ad_chunks(c: Canvas, count: int):
    for l, t in [(82, 36), (90, 60), (80, 84)][:count]:
        c.box(l, t, 15, 11)
        c.text((l + 8, t + 9), "AD", pix(), anchor="ms")
        for k in range(2):
            c.rect(l + 18 + k * 4, t + 3 + (k % 2) * 4, 2, 1)


def muncher(s: Stats | None) -> Image.Image:
    c = Canvas()
    m = mood(s)
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
