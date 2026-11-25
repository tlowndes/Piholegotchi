// The widget: Muncher's window. Him and his nudges on the left, five tabs on the right.
(function () {
  const params = new URLSearchParams(location.search);
  const DEMO = !window.pg || params.has('demo');
  const $ = (id) => document.getElementById(id);
  const drawer = $('drawer'), homecol = $('homecol'), petc = $('petc');
  const tabsEl = $('tabs'), page = $('page'), says = $('says'), statusEl = $('status');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const X = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let S = DEMO ? window.DEMO_STATE() : null;
  let local = { mood: null, until: 0, eatUntil: 0 };
  const dismissed = new Set();

  // ---------------------------------------------------------------- talking to the app
  // demo: fake data and actions
  const real = window.pg;
  const api = DEMO ? {
    act: async (name, a) => { demoAct(name, a); return { ok: true }; },
    openSettings: real ? real.openSettings : () => toast('Settings open in their own window.'),
  } : real;

  async function act(name, a) {
    const r = await api.act(name, a);
    if (r && r.error) toast(r.error);
    return r || {};
  }

  // ---------------------------------------------------------------- tabs
  let tabs = [], cur = 'today', cache = '';
  function render(force) {
    if (!S) return;
    tabs = window.Screens.build(S);
    if (!tabs.some((t) => t.id === cur)) cur = tabs[0] ? tabs[0].id : 'today';
    const alerts = new Set((S.nudges || []).filter((n) => !dismissed.has(n.id)).map((n) => window.Screens.TAB_OF[n.screen]));
    const tabHtml = tabs.map((t) => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === cur}">${t.icon}<span>${t.name}</span>${alerts.has(t.id) && t.id !== cur ? '<i class="alert"></i>' : ''}</button>`).join('');
    if (tabsEl.innerHTML !== tabHtml) tabsEl.innerHTML = tabHtml;
    const t = tabs.find((x) => x.id === cur);
    const html = t ? t.html : '';
    const busy = document.activeElement && document.activeElement.matches('textarea, input') && page.contains(document.activeElement);
    if (html !== cache && !busy) { const top = page.scrollTop; page.innerHTML = html; page.scrollTop = top; cache = html; }
    renderSays();
    statusEl.textContent = statusLine();
  }
  function pick(id) {
    const tab = window.Screens.TAB_OF[id] || id;
    if (tab !== cur) { cur = tab; cache = ''; page.scrollTop = 0; }
    render(true);
    const tile = page.querySelector(`[data-tile="${id}"]`);
    if (tile) tile.scrollIntoView({ block: 'nearest' });
  }
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) pick(b.dataset.tab); });

  // what Muncher's up to, under his name
  function statusLine() {
    if (!S) return 'Waking up…';
    const a = S.ads, n = (v) => Math.round(+v || 0).toLocaleString('en-GB');
    const today = a ? (a.today != null ? a.today : a.blocked) : null;
    switch (local.mood && Date.now() < local.until ? local.mood : S.mood) {
      case 'purr': return 'Prrrrr';
      case 'shh': return 'Shh, you’re on a call';
      case 'night': return 'Night night';
      case 'focus': return S.focus ? `Focusing · ${Math.max(0, Math.ceil(((S.focus.ends || Date.now()) - Date.now()) / 60000))} min left` : 'Focusing';
      case 'drift': return 'Still focusing?';
      case 'stretch': return 'Time to stretch';
      case 'sus': return 'Who’s that on the wifi?';
      case 'party': return `New record! ${n(today)} ads`;
      case 'starving': return 'Blocking is off. Hungry!';
      case 'snooze': return 'On a break';
      case 'asleep': return S.configured.ads ? 'Can’t reach AdGuard' : 'Connect AdGuard in Settings';
      case 'hungry': return `Peckish · ${n(today)} ads today`;
      case 'stuffed': return `Stuffed · ${n(today)} ads today`;
      default:
        if (S.track && S.track.playing) return `${S.track.artist} · ${S.track.title}`;
        return today != null ? `Chewing away · ${n(today)} ads today` : 'Hello';
    }
  }

  // ---------------------------------------------------------------- page buttons
  page.addEventListener('click', async (e) => {
    const set = e.target.closest('[data-settings]');
    if (set) return api.openSettings(set.dataset.settings);
    const capb = e.target.closest('[data-capture]');
    if (capb) {
      const ta = $('capText');
      const r = await act('capture', { text: ta.value, task: capb.dataset.capture === 'task' });
      if (r.ok) { ta.value = ''; toast('Sent to your inbox'); }
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.a ? JSON.parse(b.dataset.a) : undefined;
    if (b.dataset.act === 'dictate') $('capText')?.focus();
    if (b.dataset.act === 'clip:copy') toast('Copied');
    b.disabled = true;
    try { await act(b.dataset.act, a); } finally { b.disabled = false; }
  });
  page.addEventListener('change', (e) => {
    const r = e.target.closest('[data-vol]');
    if (r) { act('volume', { name: r.dataset.vol, volume: +r.value }); r.blur(); }
  });
  $('gear').onclick = () => api.openSettings();

  let toastT;
  function toast(msg) {
    let t = drawer.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; drawer.appendChild(t); }
    t.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.remove(), 3000);
  }

  // ---------------------------------------------------------------- nudges: in his column
  const nice = (t) => (t === t.toUpperCase() ? t.toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/\bha\b/i, 'HA') : t);
  const live = () => (S ? (S.nudges || []).filter((n) => !dismissed.has(n.id)) : []);
  function dismiss(id) { dismissed.add(id); act('dismiss', { id }); }

  function renderSays() {
    const list = live().slice(0, 3);
    const html = list.map((n, i) => `<div class="say ${i === 0 ? 'hot' : ''}" role="button" tabindex="0" data-id="${esc(n.id)}"><b>${esc(nice(n.title))}</b><span>${esc(n.text)}</span><button class="x" data-x="${esc(n.id)}" aria-label="Dismiss">${X}</button></div>`).join('');
    if (says.innerHTML !== html) says.innerHTML = html;
  }
  says.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]');
    const id = x ? x.dataset.x : e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const n = live().find((v) => v.id === id);
    dismiss(id);
    if (!x && n) { if (n.settings) api.openSettings(n.settings); else pick(n.screen); }
    render(true);
  });

  // ---------------------------------------------------------------- touching Muncher: stroke him to make him purr
  let s2 = null;
  petc.addEventListener('pointerdown', (e) => { s2 = { x: e.screenX, y: e.screenY, moved: 0 }; });
  petc.addEventListener('pointermove', (e) => {
    if (!s2) return;
    s2.moved += Math.abs(e.screenX - s2.x) + Math.abs(e.screenY - s2.y);
    s2.x = e.screenX; s2.y = e.screenY;
    if (s2.moved > 70) { s2 = null; local = { ...local, mood: 'purr', until: Date.now() + 2600 }; render(true); }
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) petc.addEventListener(ev, () => { s2 = null; });

  // feeding: drop a link anywhere on him
  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('drop');
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (!text) return toast('Muncher only eats links.');
    const r = await act('feed', { text });
    if (r.domain || DEMO) {
      local = { mood: 'stuffed', until: Date.now() + 3000, eatUntil: Date.now() + 3000 };
      toast(`Nom. ${r.domain || text} is on the blocklist.`);
    }
  });

  // ---------------------------------------------------------------- state
  let lastAte = 0;
  function onState(s) {
    S = s;
    if (s.ads && s.ads.ate && s.ads.blocked !== lastAte) { lastAte = s.ads.blocked; local.eatUntil = Date.now() + 8000; }
    document.body.classList.toggle('night', !!s.night);
    render();
  }
  if (!DEMO) api.onState(onState);

  // ---------------------------------------------------------------- the clock
  let f = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame() {
    f += reduce ? 8 : 1;
    const now = Date.now();
    const mood = local.mood && now < local.until ? local.mood : S ? S.mood : 'content';
    const st = { mood, phones: S && S.phones, crown: S && S.crown, shades: S && S.shades, eating: now < local.eatUntil };
    window.Muncher.draw(petc, st, f);
  }
  setInterval(frame, reduce ? 1000 : 125);
  setInterval(render, 1000);
  frame();

  // ---------------------------------------------------------------- demo mode
  function demoAct(name, a = {}) {
    const s = S;
    if (name === 'ads:pause') { s.ads.note = 'BLOCKING PAUSED'; s.ads.online = false; s.ads.paused_until = Date.now() + a.minutes * 60000; s.mood = 'snooze'; }
    if (name === 'ads:resume') { s.ads.note = ''; s.ads.online = true; s.mood = 'content'; }
    if (name === 'spotify') { s.track.playing = a.action !== 'pause'; s.phones = s.track.playing; }
    if (name === 'focus:pause') s.focus.running = !s.focus.running;
    if (name === 'focus:stop') s.focus = null;
    if (name === 'focus:start') s.focus = { task: a.task, running: true, ends: Date.now() + a.minutes * 60000, total: a.minutes * 60, source: 'pc' };
    if (name === 'ha:toggle') { const i = s.home.items.find((x) => x.id === a.id); i.on = !i.on; i.value = i.on ? 'ON' : 'OFF'; }
    if (name === 'rem:done') s.reminders = s.reminders.filter((r) => r.id !== a.id);
    if (name === 'bins:done') s.bins.done = true;
    if (name === 'water') s.water.ml += a.ml;
    if (name === 'break:done') { s.breakDue = false; s.activeMins = 0; }
    if (name === 'msg:clear') s.message = null;
    if (name === 'net:mine' || name === 'net:block') s.network.fresh = null;
    if (name === 'dismiss') s.nudges = s.nudges.filter((n) => n.id !== a.id);
    if (name === 'capture') s.captures.unshift({ at: new Date().toTimeString().slice(0, 5), text: a.text, task: a.task });
    render(true);
  }
  if (DEMO) {
    window.demo = { setMood: (m) => { S.mood = m; }, state: () => S, pick, nudge: (n) => { S.nudges = [n]; render(true); } };
    onState(S);
  }
})();
