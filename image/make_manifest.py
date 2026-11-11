"""Write an Imager manifest for our image, so Imager offers its settings step
(Wi-Fi, hostname, user, SSH). Imager only does that for images it has
metadata for, so we copy the metadata of the Raspberry Pi OS image we built on.

    python3 image/make_manifest.py BASE_FILENAME IMG IMG_XZ URL OUT
"""
import datetime
import hashlib
import json
import os
import sys
import urllib.request

OFFICIAL = "https://downloads.raspberrypi.com/os_list_imagingutility_v4.json"
ICON = "https://raw.githubusercontent.com/tlowndes/piholegotchi/main/docs/icon.png"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def walk(items):
    for o in items:
        if "subitems" in o:
            yield from walk(o["subitems"])
        elif "url" in o:
            yield o


def main():
    base_name, img, img_xz, url, out = sys.argv[1:6]
    with urllib.request.urlopen(OFFICIAL, timeout=30) as r:
        online = json.load(r)
    match = next((o for o in walk(online["os_list"]) if os.path.basename(o["url"]) == base_name), None)
    if not match:
        sys.exit(f"{base_name} isn't in Imager's manifest, so we can't copy its settings metadata")

    entry = dict(match)
    entry.update({
        "name": "Piholegotchi",
        "description": "An e-ink face for AdGuard Home and Spotify. Built on " + match["name"] + ".",
        "icon": ICON,
        "url": url,
        "extract_size": os.path.getsize(img),
        "extract_sha256": sha256(img),
        "image_download_size": os.path.getsize(img_xz),
        "image_download_sha256": sha256(img_xz),
        "release_date": datetime.date.today().isoformat(),
    })
    entry.pop("website", None)
    data = {"os_list": [entry]}
    if "imager" in online and "devices" in online["imager"]:
        wanted = set(entry.get("devices", []))
        data["imager"] = {"devices": [d for d in online["imager"]["devices"]
                                      if set(d.get("tags", [])) & wanted or not wanted]}
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
    print("wrote", out, "based on", match["name"], "init_format:", entry.get("init_format"))


if __name__ == "__main__":
    main()
