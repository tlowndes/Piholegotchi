"""One-off Spotify sign-in for a headless Pi.

    python3 -m piholegotchi.spotify_auth

Prints a link. Open it on any computer or phone, approve, and you'll land on
a page that fails to load (that's expected: it points at the Pi's own
127.0.0.1). Copy that page's full address and paste it back here.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
import urllib.parse

import requests

from .spotify import TOKEN_FILE, TOKEN_URL

REDIRECT = "http://127.0.0.1:8888/callback"
SCOPE = "user-read-currently-playing user-read-playback-state"


def main():
    client_id = os.environ.get("SPOTIFY_CLIENT_ID") or input("Spotify client ID: ").strip()
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT,
        "code_challenge_method": "S256", "code_challenge": challenge, "scope": SCOPE, "state": state,
    })
    print("\n1. Open this link and approve:\n\n   " + url)
    print("\n2. Your browser will end up on a page that won't load. Copy its full address.\n")
    pasted = input("3. Paste it here: ").strip()
    q = urllib.parse.parse_qs(urllib.parse.urlparse(pasted).query)
    if q.get("state", [None])[0] != state or "code" not in q:
        sys.exit("That address doesn't look right. Run this again and paste the whole thing.")

    r = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": REDIRECT,
        "client_id": client_id, "code_verifier": verifier,
    }, timeout=10)
    if not r.ok:
        sys.exit(f"Spotify said no: {r.text}")
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps({"refresh_token": r.json()["refresh_token"]}))
    TOKEN_FILE.chmod(0o600)
    print(f"\nSorted. Saved to {TOKEN_FILE}")


if __name__ == "__main__":
    main()
