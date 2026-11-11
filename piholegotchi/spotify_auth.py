"""Spotify sign-in (PKCE). Used by the web page, or from the terminal:

    python3 -m piholegotchi.spotify_auth

Spotify only redirects to HTTPS or to 127.0.0.1, so after approving you land
on a page that won't load. Its address carries the sign-in code: copy it and
paste it back (into the web page or this terminal).
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import sys
import urllib.parse
from dataclasses import dataclass

import requests

from .config import Config
from .spotify import TOKEN_FILE, TOKEN_URL

REDIRECT = "http://127.0.0.1:8888/callback"
SCOPE = "user-read-currently-playing user-read-playback-state user-top-read"


@dataclass
class Pending:
    client_id: str
    verifier: str
    state: str
    url: str


def start(client_id: str) -> Pending:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT,
        "code_challenge_method": "S256", "code_challenge": challenge, "scope": SCOPE, "state": state,
    })
    return Pending(client_id, verifier, state, url)


class AuthError(Exception):
    pass


def finish(p: Pending, pasted: str):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(pasted.strip()).query)
    if "error" in q:
        raise AuthError("Spotify sign-in was cancelled. Try again.")
    if q.get("state", [None])[0] != p.state or "code" not in q:
        raise AuthError("That address doesn't match this sign-in. Copy the whole address from the page "
                        "Spotify sent you to, and paste it again.")
    r = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": REDIRECT,
        "client_id": p.client_id, "code_verifier": p.verifier,
    }, timeout=10)
    if not r.ok:
        raise AuthError(f"Spotify refused the sign-in ({r.status_code}). Start again from Connect.")
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    tok = r.json()
    TOKEN_FILE.write_text(json.dumps({"refresh_token": tok["refresh_token"], "scope": tok.get("scope", SCOPE)}))
    TOKEN_FILE.chmod(0o600)


def main():
    cfg = Config.load()
    client_id = cfg.spotify_client_id or input("Spotify client ID: ").strip()
    p = start(client_id)
    print("\n1. Open this link and approve:\n\n   " + p.url)
    print("\n2. Your browser will end up on a page that won't load. Copy its full address.\n")
    try:
        finish(p, input("3. Paste it here: "))
    except AuthError as e:
        sys.exit(str(e))
    if not cfg.spotify_client_id:
        cfg.spotify_client_id = client_id
        cfg.save()
    print(f"\nSorted. Saved to {TOKEN_FILE}")


if __name__ == "__main__":
    main()
