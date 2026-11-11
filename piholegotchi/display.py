"""Talks to the Waveshare 2.13in V4 panel, or writes PNGs when there isn't one."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from PIL import Image

log = logging.getLogger(__name__)
VENDOR = Path(__file__).resolve().parent.parent / "vendor"


class EPaper:
    """Full refresh clears ghosting (~2s flash). Partial is quick (~0.3s), no flash."""

    def __init__(self):
        sys.path.insert(0, str(VENDOR))
        from waveshare_epd import epd2in13_V4  # type: ignore  # fetched by install.sh

        self.epd = epd2in13_V4.EPD()
        self.awake = False

    def show(self, img: Image.Image, full: bool):
        buf = self.epd.getbuffer(img)
        if full or not self.awake:
            self.epd.init()
            self.epd.displayPartBaseImage(buf)   # full refresh + sets the base for partials
            self.awake = True
        else:
            self.epd.displayPartial(buf)

    def sleep(self):
        self.epd.sleep()
        self.awake = False


class PngDisplay:
    """For running on a laptop: writes what the panel would show."""

    def __init__(self, path: str = "live.png"):
        self.path = path

    def show(self, img: Image.Image, full: bool):
        img.resize((img.width * 3, img.height * 3), Image.NEAREST).save(self.path)
        log.info("%s refresh -> %s", "full" if full else "partial", self.path)

    def sleep(self):
        pass
