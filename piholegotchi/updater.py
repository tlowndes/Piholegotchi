"""Updates from GitHub, triggered from the settings page.

The SD card image installs the app read-only in /opt/piholegotchi. Updates go
into $PIHOLEGOTCHI_HOME/app, which comes first on PYTHONPATH, so the newest
copy wins and the original stays as a fallback. After installing, the process
exits and systemd starts the new version.
"""
from __future__ import annotations

import io
import logging
import shutil
import tarfile
from pathlib import Path

import requests

from .config import CONFIG_DIR

log = logging.getLogger(__name__)

REPO = "tlowndes/piholegotchi"
BRANCH = "main"
APP_DIR = CONFIG_DIR / "app"
HERE = Path(__file__).resolve().parent
VERSION_FILE = HERE / "VERSION"          # written by the image build and by updates


def installed() -> str:
    try:
        return VERSION_FILE.read_text().strip()
    except FileNotFoundError:
        return ""


def latest() -> dict:
    r = requests.get(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}",
                     headers={"Accept": "application/vnd.github+json"}, timeout=10)
    r.raise_for_status()
    c = r.json()
    return {"sha": c["sha"], "date": c["commit"]["committer"]["date"][:10],
            "message": c["commit"]["message"].splitlines()[0]}


def install(sha: str):
    """Download that commit and put its app package in APP_DIR."""
    r = requests.get(f"https://codeload.github.com/{REPO}/tar.gz/{sha}", timeout=60)
    r.raise_for_status()
    staging = APP_DIR.with_name("app.new")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(r.content), mode="r:gz") as tar:
        members = []
        for m in tar.getmembers():
            parts = Path(m.name).parts
            # keep only <root>/piholegotchi/..., and nothing that escapes the folder
            if len(parts) >= 2 and parts[1] == "piholegotchi" and ".." not in parts and (m.isfile() or m.isdir()):
                m.name = str(Path(*parts[1:]))
                members.append(m)
        if not any(m.name == "piholegotchi/__main__.py" for m in members):
            raise RuntimeError("That download doesn't look like Piholegotchi.")
        try:
            tar.extractall(staging, members=members, filter="data")
        except TypeError:                      # Python without extraction filters
            tar.extractall(staging, members=members)
    (staging / "piholegotchi" / "VERSION").write_text(sha + "\n")
    old = APP_DIR.with_name("app.old")
    shutil.rmtree(old, ignore_errors=True)
    if APP_DIR.exists():
        APP_DIR.rename(old)
    staging.rename(APP_DIR)
    shutil.rmtree(old, ignore_errors=True)
    log.info("installed %s", sha[:7])
