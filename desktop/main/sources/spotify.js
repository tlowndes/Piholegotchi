// Spotify: now playing, controls and most played. PKCE sign-in, so only a client ID is needed.
// The redirect is the same as the Pi's (http://127.0.0.1:8888/callback), so the same Spotify app works;
// here a tiny local server catches it, so there's nothing to copy and paste.
const http = require('http');
const crypto = require('crypto');
const { req, dataUrl } = require('./http');

const REDIRECT = 'http://127.0.0.1:8888/callback';
const SCOPE = 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-top-read';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

class Spotify {
  constructor(store) {
    this.store = store;
    this.access = null;
    this.expires = 0;
    this.backoff = 0;
    this.art = { url: '', data: '' };
  }

  get configured() { return !!(this.store.get('spotify_client_id') && this.store.get('spotify_refresh')); }

  // ---------------------------------------------------------------- sign-in
  signIn(openExternal) {
    const clientId = this.store.get('spotify_client_id');
    if (!clientId) return Promise.reject(new Error('Add your Spotify client ID first.'));
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(12).toString('base64url');
    const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: REDIRECT,
      code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPE, state,
    });
    return new Promise((resolve, reject) => {
      const srv = http.createServer(async (rq, rs) => {
        const q = new URL(rq.url, REDIRECT).searchParams;
        if (!rq.url.startsWith('/callback')) { rs.writeHead(404); return rs.end(); }
        const done = (ok, msg) => {
          rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          rs.end(`<body style="font:20px system-ui;padding:40px;background:#dedcd2;color:#232326">${msg}</body>`);
          srv.close();
          clearTimeout(timer);
        };
        if (q.get('error') || q.get('state') !== state) {
          done(false, 'Spotify sign-in was cancelled. Try again from Settings.');
          return reject(new Error('Spotify sign-in was cancelled.'));
        }
        try {
          const tok = await req(TOKEN_URL, {
            method: 'POST', body: new URLSearchParams({
              grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT,
              client_id: clientId, code_verifier: verifier,
            }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
          this.store.set({ spotify_refresh: tok.refresh_token, spotify_scope: tok.scope || SCOPE });
          this.access = tok.access_token;
          this.expires = Date.now() + (tok.expires_in - 60) * 1000;
          done(true, 'Sorted. Muncher can hear Spotify now. You can close this tab.');
          resolve();
        } catch (e) {
          done(false, 'Spotify refused the sign-in. Try again from Settings.');
          reject(e);
        }
      });
      const timer = setTimeout(() => { srv.close(); reject(new Error('Sign-in timed out.')); }, 5 * 60000);
      srv.on('error', (e) => reject(new Error(e.code === 'EADDRINUSE'
        ? 'Something else is using port 8888. Close it and try again.' : e.message)));
      srv.listen(8888, '127.0.0.1', () => openExternal(url));
    });
  }

  async token() {
    if (this.access && Date.now() < this.expires) return this.access;
    const tok = await req(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.store.get('spotify_refresh'),
        client_id: this.store.get('spotify_client_id') }),
    });
    this.access = tok.access_token;
    this.expires = Date.now() + ((tok.expires_in || 3600) - 60) * 1000;
    if (tok.refresh_token) this.store.set({ spotify_refresh: tok.refresh_token });   // PKCE rotates them
    return this.access;
  }

  async call(p, opts = {}) {
    const h = { Authorization: `Bearer ${await this.token()}` };
    return req(API + p, { ...opts, headers: h, json: false });
  }

  // ---------------------------------------------------------------- now playing
  async nowPlaying() {
    if (!this.configured || Date.now() < this.backoff) return null;
    let r;
    try { r = await this.call('/me/player/currently-playing'); } catch { return null; }
    if (r.status === 204) return null;
    if (r.status === 401) { this.access = null; return null; }
    if (r.status === 429) { this.backoff = Date.now() + (+r.headers.get('retry-after') || 30) * 1000; return null; }
    if (!r.ok) return null;
    const d = await r.json();
    const it = d.item;
    if (!it || d.currently_playing_type !== 'track') return null;
    const album = it.album || {};
    const imgs = [...(album.images || [])].sort((a, b) => (a.width || 0) - (b.width || 0));
    const pick = imgs.find((i) => (i.width || 0) >= 300) || imgs[imgs.length - 1];
    if (pick && pick.url !== this.art.url) {
      this.art = { url: pick.url, data: '' };
      try { this.art.data = await dataUrl(pick.url); } catch { /* no cover is fine */ }
    }
    return {
      id: it.id || it.name, title: it.name, artist: (it.artists || []).map((a) => a.name).join(', '),
      album: album.name || '', year: (album.release_date || '').slice(0, 4),
      progress: Math.floor((d.progress_ms || 0) / 1000), duration: Math.floor((it.duration_ms || 0) / 1000),
      playing: !!d.is_playing, art: this.art.data, at: Date.now(),
    };
  }

  async control(action) {
    const m = { play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'],
      next: ['POST', '/me/player/next'], prev: ['POST', '/me/player/previous'] }[action];
    if (!m) return;
    const r = await this.call(m[1], { method: m[0] });
    if (r.status === 403) throw new Error('Spotify needs Premium, or a reconnect in Settings, for controls.');
  }

  get canControl() { return (this.store.get('spotify_scope') || '').includes('user-modify-playback-state'); }

  async top() {
    if (!this.configured) return { tracks: [], artists: [], note: 'CONNECT SPOTIFY' };
    if (!(this.store.get('spotify_scope') || '').includes('user-top-read')) return { tracks: [], artists: [], note: 'RECONNECT SPOTIFY' };
    try {
      const [t, a] = await Promise.all([
        this.call('/me/top/tracks?time_range=short_term&limit=5').then((r) => r.json()),
        this.call('/me/top/artists?time_range=short_term&limit=3').then((r) => r.json()),
      ]);
      return {
        tracks: (t.items || []).map((x) => ({ title: x.name, artist: (x.artists || []).map((y) => y.name).join(', ') })),
        artists: (a.items || []).map((x) => x.name), note: '',
      };
    } catch { return { tracks: [], artists: [], note: "CAN'T REACH SPOTIFY" }; }
  }
}

module.exports = { Spotify };
