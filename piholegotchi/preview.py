"""Render every screen state to PNGs without any hardware.

    python3 -m piholegotchi.preview            # writes to ./preview/
    python3 -m piholegotchi.preview --art cover.jpg
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

from datetime import datetime

from .render import Stats, Track, atkinson, muncher, setup_screen, sleeve, H, W
from .screens import STYLES, draw, samples

PAPER_RGB, INK_RGB = (220, 220, 210), (37, 39, 42)


def sample_art() -> Image.Image:
    """A synthetic sunset, so previews look right without a real cover."""
    im = Image.new("L", (300, 300))
    d = ImageDraw.Draw(im)
    for y in range(300):
        v = int(26 + (y / 300) * 120)
        d.line([(0, y), (300, y)], fill=v)
    d.ellipse([60, 80, 240, 260], fill=225)
    for i in range(5):
        y = 170 + i * 16
        d.rectangle([0, y, 300, y + 2 + i * 2], fill=38)
    d.rectangle([0, 234, 300, 300], fill=22)
    return im


def to_eink(img1: Image.Image, scale: int = 3) -> Image.Image:
    rgb = Image.new("RGB", img1.size, PAPER_RGB)
    rgb.paste(Image.new("RGB", img1.size, INK_RGB), mask=img1.point(lambda v: 255 - v).convert("L"))
    return rgb.resize((W * scale, H * scale), Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="preview")
    ap.add_argument("--art", help="path to a cover image to use for Sleeve")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    cover = Image.open(a.art) if a.art else sample_art()
    art = atkinson(cover, (106, 106))
    shots = {
        "sleeve-playing": sleeve(Track("1", "Avril 14th", "Aphex Twin", "Drukqs", "2001", 72, 125, True, art)),
        "sleeve-paused": sleeve(Track("2", "Everything In Its Right Place", "Radiohead", "Kid A", "2000", 31, 251, False, art)),
        "muncher-stuffed": muncher(Stats(18_402, 4_812, 26.1)),
        "muncher-content": muncher(Stats(15_210, 2_710, 17.8)),
        "muncher-hungry": muncher(Stats(9_880, 640, 6.5)),
        "muncher-asleep": muncher(Stats(0, 0, 0, online=False)),
        "setup": setup_screen("piholegotchi", "192.168.1.42"),
    }
    now = datetime(2026, 11, 11, 17, 5)
    data = samples(now)
    for screen in ("server", "weather", "bins", "reminders"):
        for st in STYLES:
            shots[f"{screen}-{st.lower()}"] = draw(screen, st, data, now)
    for name, img in shots.items():
        img.save(out / f"{name}-1bit.png")
        to_eink(img).save(out / f"{name}.png")
        print("wrote", out / f"{name}.png")


if __name__ == "__main__":
    main()
