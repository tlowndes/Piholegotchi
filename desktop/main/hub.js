// The hub: polls every source on its own clock, keeps one state object, works out
// Muncher's mood and nudges, and runs the actions the widget asks for.
const fs = require('fs');
const os = require('os');
const { AdGuard, domainOf } = require('./sources/adguard');
const { Spotify } = require('./sources/spotify');
const { fetchWeather, geocode } = require('./sources/weather');
const { Glances } = require('./sources/glances');
const { fetchCalendar } = require('./sources/calendar');
const { HomeAssistant } = require('./sources/homeassistant');
const { binDay, reminders, isNight } = require('./schedule');
const { Life, dayKey } = require('./life');

const MIN = 60e3;

class Hub {
  constructor({ store, helper, electron, onState }) {
    this.store = store;
    this.helper = helper;           // Windows helper (may be inert)
    this.el = electron;             // { clipboard, powerMonitor, shell }
    this.onState = onState;
    this.life = new Life(store);
    this.spotify = new Spotify(store);
    this.s = {
      ads: null, track: null, top: null, weather: null, server: null, calendar: null, home: null,
      deck: null, focus: null, focusDone: null, message: null, door: null, network: { devices: [], fresh: null },
      pc: null, sound: null, clip: [], captures: [], meeting: false, drift: false,
    };
    this.dismissed = new Set();
    this.timers = [];
    this.panelOpen = false;
    this.activeSince = Date.now();
    this.breakSnooze = 0;
    this.lastBlocked = null;
    this.rebuild();
    const saved = store.load('deck', {});
    if (saved.deck) this.s.deck = saved.deck;
    if (saved.focus) this.s.focus = saved.focus;
  }

  cfg() { return this.store.cfg; }

  rebuild() {
    const c = this.cfg();
    this.adguard = new AdGuard(c.adguard_url, c.adguard_username, c.adguard_password);
    this.glances = new Glances(c.server_url);
    this.ha = new HomeAssistant(c.ha_url, c.ha_token);
  }

  // ---------------------------------------------------------------- polling
  every(ms, fn, first = 0) {
    const run = async () => { try { await fn(); } catch (e) { console.warn(fn.name || 'poll', e.message); } this.emit(); };
    setTimeout(run, first);
    this.timers.push(setInterval(run, ms));
  }

  start() {
    this.every(MIN, () => this.pollAds(), 200);
    this.every(5000, () => this.pollSpotify(), 400);
    this.every(60 * MIN, () => this.pollTop(), 3000);
    this.every(20 * MIN, () => this.pollWeather(), 600);
    this.every(MIN, () => this.pollServer(), 800);
    this.every(10 * MIN, () => this.pollCalendar(), 1000);
    this.every(30000, () => this.pollHome(), 1200);
    this.every(5000, () => this.pollDoorbell(), 1500);
    this.every(5 * MIN, () => this.pollNetwork(), 5000);
    this.every(10000, () => this.pollPc(), 2000);
    this.every(4000, () => this.pollSound(), 2500);
    this.every(1000, () => this.pollClipboard(), 100);
    this.every(10000, () => this.pollMeeting(), 3000);
    this.every(5000, () => this.pollFocus(), 0);
    this.every(30000, () => this.pollWellbeing(), 1000);
    this.timers.push(setInterval(() => this.life.save(), 60000));
  }

  stop() { this.timers.forEach(clearInterval); this.life.save(); }

  async pollAds() {
    if (!this.adguard.configured) { this.s.ads = null; return; }
    const a = await this.adguard.stats();
    a.ate = this.lastBlocked != null && a.blocked > this.lastBlocked ? a.blocked - this.lastBlocked : 0;
    if (a.online) this.lastBlocked = a.blocked;
    this.s.ads = this.life.applyMoods(a, this.cfg());
    this.s.ads.fed = this.life.d.fed.slice(0, 3);
  }

  async pollSpotify() {
    // every 5s while playing, every 15s otherwise
    if (!this.s.track?.playing && (this.spotifyTick = (this.spotifyTick || 0) + 1) % 3) return;
    const t = await this.spotify.nowPlaying();
    if (t && t.playing && t.id !== this.s.track?.id) this.life.song(`${t.title} · ${t.artist}`);
    this.s.track = t;
    if (t) this.s.track.canControl = this.spotify.canControl;
  }

  async pollTop() { this.s.top = this.spotify.configured ? await this.spotify.top() : null; }

  async pollWeather() {
    const c = this.cfg();
    if (!c.weather_place) { this.s.weather = null; return; }
    try { this.s.weather = await fetchWeather(c.weather_lat, c.weather_lon, c.weather_name || c.weather_place); } catch { /* keep the last one */ }
  }

  async pollServer() { this.s.server = await this.glances.fetch(); }

  async pollCalendar() { this.s.calendar = await fetchCalendar(this.cfg().calendar_url); }

  async pollHome() { this.s.home = this.ha.configured ? await this.ha.home(this.cfg().ha_entities) : null; }

  async pollDoorbell() {
    const c = this.cfg();
    if (!this.ha.configured || !c.ha_doorbell) return;
    const st = await this.ha.state(c.ha_doorbell);
    if (st === 'on' && this.doorWas !== 'on') await this.ring();
    this.doorWas = st;
  }

  async ring(img) {
    let snap = img || '';
    if (!snap && this.ha.configured && this.cfg().ha_camera) { try { snap = await this.ha.snapshot(this.cfg().ha_camera); } catch { /* no picture */ } }
    this.s.door = { img: snap, at: Date.now() };
    this.emit();
  }

  async pollNetwork() {
    const c = this.cfg();
    if (!c.watch_network || !this.adguard.configured) return;
    const seen = this.store.load('devices', null);
    const list = await this.adguard.clients();
    const now = Date.now();
    if (!seen) {              // first look: everything already here counts as known
      const base = {};
      for (const d of list) base[d.ip] = { name: d.name, first: now, known: true };
      this.store.save('devices', base);
      this.s.network = { devices: list, fresh: null };
      return;
    }
    let fresh = this.s.network.fresh;
    for (const d of list) {
      if (!seen[d.ip]) { seen[d.ip] = { name: d.name, first: now, known: false }; fresh = { ...d, at: now }; }
    }
    this.store.save('devices', seen);
    this.s.network = { devices: list.map((d) => ({ ...d, known: seen[d.ip]?.known })), fresh };
  }

  async pollPc() {
    let si;
    try { si = require('systeminformation'); } catch { return; }
    const [load, mem, temp] = await Promise.all([si.currentLoad(), si.mem(), si.cpuTemperature().catch(() => ({}))]);
    const pc = { cpu: load.currentLoad || 0, ram: mem.total ? (mem.active / mem.total) * 100 : 0, cpu_temp: temp.main || null,
      name: os.hostname(), gpu: this.s.pc?.gpu ?? null, gpu_temp: this.s.pc?.gpu_temp ?? null, hungry: this.s.pc?.hungry || '' };
    if ((this.pcTick = (this.pcTick || 0) + 1) % 6 === 1) {
      try {
        const g = (await si.graphics()).controllers.find((x) => x.utilizationGpu != null) || {};
        pc.gpu = g.utilizationGpu ?? null;
        pc.gpu_temp = g.temperatureGpu ?? null;
        const p = await si.processes();
        const top = p.list.filter((x) => !/^(System|Idle|svchost|Memory Compression)/i.test(x.name)).sort((a, b) => b.cpu - a.cpu)[0];
        pc.hungry = top && top.cpu > 15 ? top.name.replace(/\.exe$/i, '') : '';
      } catch { /* no GPU info */ }
    }
    this.s.pc = pc;
  }

  async pollSound() {
    if (!this.panelOpen || !this.helper.ok) return;
    const v = await this.helper.call('volume');
    if (v) this.s.sound = { master: v.master, muted: v.muted, sessions: (v.sessions || []).filter((x) => x.name !== 'Piholegotchi') };
  }

  pollClipboard() {
    if (this.cfg().clipboard === false) return;
    const t = this.el.clipboard.readText();
    if (!t || t === this.lastClip) return;
    this.lastClip = t;
    if (t.length > 2000) return;
    this.s.clip = [t, ...this.s.clip.filter((x) => x !== t)].slice(0, 5);
  }

  async pollMeeting() {
    if (!this.cfg().meeting_mode || !this.helper.ok) { this.s.meeting = false; return; }
    const r = await this.helper.call('inuse');
    if (!r) return;
    const apps = [...(r.mic || []), ...(r.cam || [])].filter((a) => !/piholegotchi/i.test(a));
    this.s.meeting = apps.length > 0;
    this.s.meetingApp = apps[0] || '';
  }

  async pollFocus() {
    const f = this.s.focus;
    const now = Date.now();
    if (f && f.running && f.ends && now >= f.ends) {
      this.s.focusDone = { task: f.task, at: now };
      this.life.bump('sessions');
      this.setFocus(null);
    }
    if (f && f.running) {
      this.focusTick = (this.focusTick || 0) + 1;
      if (this.focusTick % 12 === 0) this.life.bump('focus_min', 1);       // every minute
      // drifting: a distraction in front for over a minute
      if (this.helper.ok) {
        const w = await this.helper.call('fg');
        const words = String(this.cfg().distractions || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
        const hay = w ? `${w.app} ${w.title}`.toLowerCase() : '';
        if (w && words.some((x) => hay.includes(x))) this.driftSince = this.driftSince || now;
        else this.driftSince = 0;
        this.s.drift = !!this.driftSince && now - this.driftSince > MIN;
      }
    } else { this.s.drift = false; this.driftSince = 0; }
  }

  pollWellbeing() {
    const idle = this.el.powerMonitor.getSystemIdleTime();      // seconds
    const now = Date.now();
    if (idle >= 300) this.activeSince = now;
    const after = +this.cfg().break_after || 0;
    this.s.activeMins = Math.round((now - this.activeSince - idle * 1000) / MIN);
    this.s.breakDue = !!after && this.s.activeMins >= after && now > this.breakSnooze;
    this.s.water = { ml: this.life.day().water_ml, goal: this.cfg().water_goal };
  }

  // ---------------------------------------------------------------- Flight Deck and focus
  receiveDeck(body) {
    if (body.deck && typeof body.deck === 'object') this.s.deck = { ...body.deck, received: Date.now() };
    if ('focus' in body) {
      const f = body.focus;
      this.setFocus(f ? { task: String(f.task || 'Focus').slice(0, 120), running: !!f.running,
        ends: f.ends ? (f.ends < 1e12 ? f.ends * 1000 : f.ends) : null, remaining: +f.remaining_s || 0,
        total: +f.total_s || 0, source: 'phone' } : null);
    }
    this.saveDeck();
    this.emit();
  }

  setFocus(f) {
    if (!f && this.s.focus) this.s.focusDone = this.s.focusDone || { task: this.s.focus.task, at: Date.now() };
    if (f) this.s.focusDone = null;
    this.s.focus = f;
    this.saveDeck();
  }

  saveDeck() { this.store.save('deck', { deck: this.s.deck, focus: this.s.focus }); }

  // ---------------------------------------------------------------- mood and nudges
  mood(now) {
    const c = this.cfg(), s = this.s;
    if (s.meeting) return 'shh';
    if (c.night && isNight(now, c.night_from, c.night_to) && !s.track?.playing) return 'night';
    if (s.drift) return 'drift';
    if (s.breakDue) return 'stretch';
    if (s.network.fresh && now - s.network.fresh.at < 30 * MIN) return 'sus';
    if (s.focus?.running) return 'focus';
    const a = s.ads;
    if (!a) return 'content';
    if (a.mood) return a.mood;
    if (a.note === 'BLOCKING PAUSED') return 'snooze';
    if (!a.online) return 'asleep';
    return a.percent < 12 ? 'hungry' : a.percent < 22 ? 'content' : 'stuffed';
  }

  nudges(now) {
    const s = this.s, c = this.cfg(), out = [];
    const t = now.getTime();
    const add = (id, title, text, screen, prio = 1, mood) => { if (!this.dismissed.has(id) && !this.life.d.done[id]) out.push({ id, title, text, screen, prio, mood }); };
    if (s.door && t - s.door.at < 3 * MIN) add(`door:${s.door.at}`, 'FRONT DOOR', 'Someone’s here.', 'door', 9);
    if (s.message && t < s.message.until) add(`msg:${s.message.at}`, (s.message.title || 'Home Assistant').toUpperCase(), s.message.text, 'msg', 8);
    for (const e of (s.calendar?.events || [])) {
      const mins = (e.start - t) / MIN;
      if (!e.allDay && c.calendar_heads_up && mins > 0 && mins <= c.calendar_heads_up) add(`cal:${e.start}:${e.title}`, `IN ${Math.ceil(mins)} MIN`, e.title, 'cal', 7);
    }
    if (s.drift) add(`drift:${s.focus?.task}`, 'STILL FOCUSING?', `${s.focus?.task || 'Focus'} misses you.`, 'focus', 6, 'drift');
    if (s.focusDone && t - s.focusDone.at < 5 * MIN) add(`fdone:${s.focusDone.at}`, 'TIME’S UP', `Nice work on ${s.focusDone.task}.`, 'focus', 6);
    if (s.breakDue) add(`brk:${this.activeSince}`, `${s.activeMins >= 60 ? Math.floor(s.activeMins / 60) + 'H ' : ''}${s.activeMins % 60}M STRAIGHT`, 'Stretch? Water?', 'brk', 5, 'stretch');
    const b = binDay(c.bins, now);
    if (b) add(`bins:${b.key}`, b.tonight ? 'BIN DAY TOMORROW' : 'BIN DAY TODAY', `${b.bins.map((x) => x.name).join(' + ')}${b.bins.length > 1 ? ' bins' : /bin/i.test(b.bins[0].name) ? '' : ' bin'} out${b.tonight ? ' tonight' : ''}.`, 'bins', 4);
    for (const r of reminders(c.reminders, now).filter((x) => x.due)) add(`rem:${r.id}:${r.at}`, r.kind === 'plant' ? 'PLANTS' : r.kind === 'pet' ? 'PETS' : 'REMINDER', `${r.title}.`, 'rem', 3);
    if (s.network.fresh && t - s.network.fresh.at < 60 * MIN) add(`net:${s.network.fresh.ip}`, 'NEW ON YOUR WIFI', 'Who’s this, then?', 'net', 3, 'sus');
    if (s.ads?.mood === 'party') add(`party:${dayKey(now)}`, 'NEW RECORD', `${(s.ads.today || 0).toLocaleString('en-GB')} ads today. Party!`, 'ads', 2);
    if (now.getDay() === 1 && now.getHours() >= 8 && now.getHours() < 13) add(`rpt:${this.life.report(now).key}`, `WEEK ${this.life.report(now).week}`, `You got ${this.life.report(now).grade}.`, 'rpt', 1);
    if (s.meeting) return [];
    if (c.night && isNight(now, c.night_from, c.night_to)) return out.filter((n) => n.prio >= 9);
    return out.sort((a, z) => z.prio - a.prio);
  }

  snapshot() {
    const now = new Date();
    const c = this.cfg();
    const st = this.life.streak(now);
    const b = binDay(c.bins, now);
    return {
      now: now.getTime(),
      demo: false,
      night: c.night && isNight(now, c.night_from, c.night_to),
      mood: this.mood(now),
      crown: st.crown, shades: st.shades, phones: !!this.s.track?.playing,
      nudges: this.nudges(now),
      screens: c.screens,
      ...this.s,
      top: this.s.top,
      bins: b ? { ...b, done: !!this.life.d.done[`bins:${b.key}`] } : null,
      reminders: reminders(c.reminders, now),
      streak: st,
      report: this.life.report(now),
      water: { ml: this.life.day().water_ml, goal: c.water_goal },
      captures: this.s.captures,
      configured: {
        ads: this.adguard.configured, spotify: this.spotify.configured, weather: !!c.weather_place, server: this.glances.configured,
        calendar: !!c.calendar_url, home: this.ha.configured, door: this.ha.configured && !!(c.ha_doorbell || c.ha_camera),
        capture: !!c.inbox_file, helper: this.helper.ok, network: this.adguard.configured && c.watch_network,
      },
      focusMinutes: c.focus_minutes,
    };
  }

  emit() {
    clearTimeout(this.emitT);
    this.emitT = setTimeout(() => this.onState(this.snapshot()), 50);
  }

  // ---------------------------------------------------------------- actions from the widget
  async act(name, a = {}) {
    const c = this.cfg();
    switch (name) {
      case 'panel': this.panelOpen = !!a.open; if (this.panelOpen) this.pollSound(); return;
      case 'dismiss': this.dismissed.add(a.id); break;
      case 'ads:pause': await this.adguard.protect(false, +a.minutes || c.pause_minutes); await this.pollAds(); break;
      case 'ads:resume': await this.adguard.protect(true); await this.pollAds(); break;
      case 'ads:party': this.life.partyNow(); await this.pollAds(); break;
      case 'feed': {
        const d = domainOf(a.text);
        if (!d) throw new Error('That isn’t a link Muncher can eat.');
        if (!this.adguard.configured) throw new Error('Connect AdGuard in Settings first.');
        await this.adguard.block(d);
        this.life.d.fed = [d, ...this.life.d.fed.filter((x) => x !== d)].slice(0, 10);
        this.life.dirty = true;
        await this.pollAds();
        return { domain: d };
      }
      case 'unfeed': await this.adguard.unblock(a.domain); this.life.d.fed = this.life.d.fed.filter((x) => x !== a.domain); this.life.dirty = true; await this.pollAds(); break;
      case 'spotify': await this.spotify.control(a.action); setTimeout(() => this.pollSpotify().then(() => this.emit()), 600); break;
      case 'key': await this.helper.call('key', { key: a.key }); break;
      case 'volume': await this.helper.call('setvol', { name: a.name || '', volume: a.volume }); break;
      case 'mute': await this.helper.call('setmute', { muted: !!a.muted }); await this.pollSound(); break;
      case 'ha:toggle': await this.ha.toggle(a.id); setTimeout(() => this.pollHome().then(() => this.emit()), 700); break;
      case 'door:refresh': await this.ring(); break;
      case 'door:clear': this.s.door = null; break;
      case 'msg:clear': this.s.message = null; break;
      case 'bins:done': this.life.d.done[`bins:${a.key}`] = 1; this.life.bump('bins'); break;
      case 'rem:done': {
        const list = c.reminders.map((r) => (r.id === a.id ? { ...r, last: new Date().toISOString() } : r));
        this.store.set({ reminders: list });
        const r = c.reminders.find((x) => x.id === a.id);
        if (r && r.kind === 'plant') this.life.bump('plants');
        break;
      }
      case 'focus:start': {
        const ms = (+a.minutes || c.focus_minutes) * MIN;
        this.setFocus({ task: a.task || 'Focus', running: true, ends: Date.now() + ms, remaining: ms / 1000, total: ms / 1000, source: 'pc' });
        if (a.minutes) this.store.set({ focus_minutes: +a.minutes });
        break;
      }
      case 'focus:pause': {
        const f = this.s.focus;
        if (!f) break;
        if (f.running) this.setFocus({ ...f, running: false, remaining: Math.max(0, Math.round((f.ends - Date.now()) / 1000)), ends: null });
        else this.setFocus({ ...f, running: true, ends: Date.now() + f.remaining * 1000 });
        break;
      }
      case 'focus:stop': this.setFocus(null); break;
      case 'break:done': this.activeSince = Date.now(); this.s.breakDue = false; break;
      case 'break:snooze': this.breakSnooze = Date.now() + 15 * MIN; this.s.breakDue = false; break;
      case 'water': this.life.bump('water_ml', +a.ml || 250); this.life.save(); break;
      case 'net:mine': case 'net:block': {
        const seen = this.store.load('devices', {});
        if (seen[a.ip]) seen[a.ip].known = true;
        this.store.save('devices', seen);
        if (name === 'net:block') await this.adguard.disallow(a.ip);
        this.s.network.fresh = null;
        break;
      }
      case 'clip:copy': this.lastClip = a.text; this.el.clipboard.writeText(a.text); break;
      case 'capture': return this.capture(String(a.text || '').trim(), !!a.task);
      case 'dictate': await this.helper.call('dictate'); break;
      default: throw new Error(`Unknown action ${name}`);
    }
    this.emit();
    return { ok: true };
  }

  capture(text, task) {
    if (!text) throw new Error('Type something first.');
    const file = this.cfg().inbox_file;
    if (!file) throw new Error('Pick your Obsidian inbox note in Settings first.');
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const line = task ? `- [ ] ${text}` : `- ${text} (${dayKey(now)} ${hm})`;
    let pre = '';
    try { const cur = fs.readFileSync(file, 'utf8'); if (cur && !cur.endsWith('\n')) pre = '\n'; } catch { /* new note */ }
    fs.appendFileSync(file, `${pre}${line}\n`);
    this.s.captures = [{ at: hm, text, task }, ...this.s.captures].slice(0, 5);
    this.emit();
    return { ok: true };
  }

  postMessage(body) {
    const text = String(body.message || body.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!text) { this.s.message = null; this.emit(); return; }
    const mins = Math.max(0.5, Math.min(240, +body.minutes || this.cfg().message_minutes || 5));
    this.s.message = { text, title: String(body.title || '').trim().slice(0, 30), at: Date.now(), until: Date.now() + mins * MIN };
    this.emit();
  }

  // settings window helpers
  async geocode(place) { return geocode(place); }
}

module.exports = { Hub };
