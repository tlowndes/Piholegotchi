"""Main loop: Sleeve while Spotify plays, Muncher the rest of the time.

    python3 -m piholegotchi           # on the Pi
    python3 -m piholegotchi --png     # anywhere, writes live.png instead
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import time

from .pihole import PiHole
from .render import Stats, mood, muncher, sleeve
from .spotify import Spotify

log = logging.getLogger("piholegotchi")

SPOTIFY_EVERY = 10        # seconds between Spotify checks (and progress bar updates)
PIHOLE_EVERY = 300        # seconds between Pi-hole stat updates
PAUSE_GRACE = 120         # keep showing a paused track this long before switching back
FULL_EVERY = 30           # force a full refresh after this many partials (clears ghosting)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", action="store_true", help="write live.png instead of driving the panel")
    a = ap.parse_args()
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(message)s")

    if a.png:
        from .display import PngDisplay
        panel = PngDisplay()
    else:
        from .display import EPaper
        panel = EPaper()

    spotify = Spotify(os.environ.get("SPOTIFY_CLIENT_ID", ""))
    pihole = PiHole(os.environ.get("PIHOLE_URL", "http://127.0.0.1"), os.environ.get("PIHOLE_PASSWORD", ""))
    if not spotify.configured:
        log.info("Spotify not set up yet, showing Pi-hole only")

    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    stats, next_stats = None, 0.0
    track, paused_since = None, None
    last_key, last_bytes, partials = None, None, 0

    while not stopping:
        now = time.time()
        if now >= next_stats:
            stats, next_stats = pihole.stats(), now + PIHOLE_EVERY

        t = spotify.now_playing()
        if t and t.is_playing:
            track, paused_since = t, None
        elif t:                                   # paused
            paused_since = paused_since or now
            track = t if now - paused_since < PAUSE_GRACE else None
        else:
            track = None

        if track:
            img, key = sleeve(track), ("sleeve", track.id)
        else:
            img, key = muncher(stats), ("muncher", mood(stats))

        data = img.tobytes()
        if data != last_bytes:
            full = key != last_key or partials >= FULL_EVERY
            panel.show(img, full=full)
            partials = 0 if full else partials + 1
            last_key, last_bytes = key, data

        # sleep in small steps so Ctrl-C / systemctl stop is quick
        end = now + SPOTIFY_EVERY
        while not stopping and time.time() < end:
            time.sleep(0.5)

    # e-ink keeps its image with no power, so leave a sleeping face behind
    panel.show(muncher(Stats(0, 0, 0.0, online=False, note="SWITCHED OFF")), full=True)
    panel.sleep()


if __name__ == "__main__":
    main()
