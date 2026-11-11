"""Server health from Glances (install it from the ZimaOS app store)."""
from __future__ import annotations

import logging
import re
from collections import deque

import requests

from .screens import Server

log = logging.getLogger(__name__)
SKIP_FS = {"tmpfs", "devtmpfs", "overlay", "squashfs", "proc", "sysfs", "nsfs", "autofs"}


def uptime_text(raw) -> str:
    """Glances gives '23 days, 1:02:03' or '5:02:03'."""
    s = str(raw)
    m = re.match(r"\s*(\d+)\s+day", s)
    if m:
        n = int(m.group(1))
        return f"{n} DAY{'S' if n != 1 else ''}"
    m = re.match(r"\s*(\d+):(\d+)", s)
    if m:
        h = int(m.group(1))
        return f"{h} HOUR{'S' if h != 1 else ''}" if h else f"{int(m.group(2))} MIN"
    return s.upper()[:12]


class Glances:
    def __init__(self, url: str):
        self.base = url.rstrip("/")
        self.configured = bool(url)
        self.version = None
        self.history: deque[float] = deque(maxlen=24 * 60)   # one sample a minute, a day's worth

    def _get(self, what: str):
        versions = [self.version] if self.version else ["4", "3"]
        err = None
        for v in versions:
            try:
                r = requests.get(f"{self.base}/api/{v}/{what}", timeout=5)
                r.raise_for_status()
                self.version = v
                return r.json()
            except Exception as e:  # noqa: BLE001
                err = e
        raise err

    def get(self) -> Server | None:
        if not self.configured:
            return None
        try:
            cpu = self._get("cpu")
            mem = self._get("mem")
            fs = self._get("fs")
            try:
                up = uptime_text(self._get("uptime"))
            except Exception:  # noqa: BLE001
                up = "?"
        except Exception as e:  # noqa: BLE001
            log.warning("glances unreachable: %s", e)
            self.version = None
            return Server(online=False, note="SERVER IS DOWN")
        disks = [d for d in fs if d.get("fs_type") not in SKIP_FS and d.get("size")]
        big = max(disks, key=lambda d: d["size"]) if disks else {"size": 0, "free": 0, "percent": 0}
        total = float(cpu.get("total", 0))
        self.history.append(total)
        return Server(cpu=total, ram=float(mem.get("percent", 0)), disk=float(big.get("percent", 0)),
                      free_gb=big.get("free", 0) / 1e9, total_gb=big["size"] / 1e9, uptime=up,
                      history=_squash(list(self.history), 36))


def _squash(xs: list[float], n: int) -> list[float]:
    """Average down to at most n points, so the line spans the whole day."""
    if len(xs) <= n:
        return xs
    step = len(xs) / n
    return [sum(xs[int(i * step):int((i + 1) * step)]) / max(1, int((i + 1) * step) - int(i * step)) for i in range(n)]
