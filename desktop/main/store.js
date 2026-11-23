// Settings and small saved state, as JSON files in the app's data folder.
// Passwords and tokens are encrypted with Windows' own per-user encryption (safeStorage).
const fs = require('fs');
const path = require('path');

const SECRET_KEYS = ['adguard_password', 'ha_token', 'spotify_refresh'];

// Same names as the Pi's config.json, so a Pi backup imports straight in.
const DEFAULTS = {
  // widget
  display_id: null,            // which screen Muncher lives on (null = find the touchscreen)
  pos: null,                   // {x, y} of the pet window's bottom-right corner, relative to that screen
  pet_scale: 2,                // 2, 3 or 4 screen pixels per Muncher pixel
  zoom: 1,                     // panel size
  start_with_windows: true,
  screens: {},                 // screen id -> false to hide it

  adguard_url: '', adguard_username: '', adguard_password: '',
  spotify_client_id: '', spotify_refresh: '', spotify_scope: '',
  pause_minutes: 5,
  muncher_party: true,
  starve_minutes: 30,

  night: true, night_from: '23:00', night_to: '07:00',
  weather_place: '', weather_name: '', weather_lat: 0, weather_lon: 0,
  server_url: '',
  calendar_url: '', calendar_heads_up: 15,
  ha_url: '', ha_token: '', ha_entities: [],
  ha_doorbell: '',             // binary_sensor that turns on when someone rings
  ha_camera: '',               // camera to grab a snapshot from
  message_minutes: 5,
  bins: [], reminders: [],
  focus_minutes: 25,

  // new on the desktop
  api_port: 8787,              // Flight Deck and Home Assistant post here
  inbox_file: '',              // Obsidian note that quick capture appends to
  break_after: 90,             // minutes of non-stop use before a stretch nudge (0 = off)
  water_goal: 2000,
  distractions: 'reddit, youtube, twitter, x.com, instagram, tiktok, facebook',
  meeting_mode: true,
  watch_network: true,
};

class Store {
  constructor(dir, safe) {
    this.dir = dir;
    this.safe = safe;          // electron safeStorage (or null in tests)
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'config.json');
    this.cfg = { ...DEFAULTS, ...this._read('config.json', {}) };
    for (const k of SECRET_KEYS) this.cfg[k] = this._unseal(this.cfg[k]);
  }

  _read(name, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')); } catch { return fallback; }
  }

  _write(name, data) {
    const f = path.join(this.dir, name);
    fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 2));
    fs.renameSync(f + '.tmp', f);
  }

  _seal(v) {
    if (!v || !this.safe || !this.safe.isEncryptionAvailable()) return v;
    return 'enc:' + this.safe.encryptString(String(v)).toString('base64');
  }

  _unseal(v) {
    if (typeof v !== 'string' || !v.startsWith('enc:')) return v || '';
    try { return this.safe.decryptString(Buffer.from(v.slice(4), 'base64')); } catch { return ''; }
  }

  get(k) { return this.cfg[k]; }

  set(changes) {
    Object.assign(this.cfg, changes);
    const out = { ...this.cfg };
    for (const k of SECRET_KEYS) out[k] = this._seal(out[k]);
    this._write('config.json', out);
  }

  // Safe to show in the settings window: never the secrets themselves.
  public() {
    const out = { ...this.cfg };
    for (const k of SECRET_KEYS) { out[k + '_set'] = !!out[k]; delete out[k]; }
    return out;
  }

  // Pi backup (Device > Download backup). Spotify isn't carried over: sharing the
  // Pi's sign-in would log the Pi out, so the desktop connects on its own.
  importPi(json) {
    if (!json || json.piholegotchi_backup !== 1 || typeof json.config !== 'object') {
      throw new Error("That isn't a Piholegotchi settings file.");
    }
    const keep = {};
    for (const [k, v] of Object.entries(json.config)) {
      if (k in DEFAULTS && !['screens', 'pos', 'display_id', 'spotify_refresh', 'spotify_scope'].includes(k)) keep[k] = v;
    }
    this.set(keep);
    return Object.keys(keep).length;
  }

  // small saved state (moods, streaks, seen devices...) in its own files
  load(name, fallback) { return this._read(name + '.json', fallback); }
  save(name, data) { try { this._write(name + '.json', data); } catch (e) { console.warn('save', name, e.message); } }
}

module.exports = { Store, DEFAULTS };
