// The widget: Muncher peeking from the screen edge, his speech bubbles, and the drawer that slides out.
(function () {
  const params = new URLSearchParams(location.search);
  const DEMO = !window.pg || params.has('demo');
  const $ = (id) => document.getElementById(id);
  const drawer = $('drawer'), homecol = $('homecol'), petc = $('petc'), peekc = $('peekc'), handle = $('handle'), dot = $('dot');
  const tabsEl = $('tabs'), page = $('page'), says = $('says'), statusEl = $('status');
  const bubble = $('bubble'), bt = $('bt'), bm = $('bm');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const X = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let S = DEMO ? window.DEMO_STATE() : null;
  let L = { mode: 'tucked', edge: 'right', handleW: 66, handleH: 96, k: 2, zoom: 1, winW: 66, winH: 96, handleTop: 0 };
  let local = { mood: null, until: 0, eatUntil: 0 };
  let say = null;                       // a bubble from the widget itself: {title, text, until, tab}
  const shown = {};                     // nudge id -> when it was last shown
  let showing = null;                   // the nudge in the bubble now
  const dismissed = new Set();

  // ---------------------------------------------------------------- talking to the app
  // demo: fake data and actions; the window itself still moves if we're inside the app
  const real = window.pg;
  const api = DEMO ? {
    act: async (name, a) => { demoAct(name, a); return { ok: true }; },
    layout: real ? real.layout : (mode) => setTimeout(() => onLayout(demoLayout(mode)), 0),
    drag: real ? real.drag : () => {}, dragEnd: real ? real.dragEnd : () => {},
    openSettings: real ? real.openSettings : () => toast('Settings open in their own window.'),
  } : real;

  async function act(name, a) {
    const r = await api.act(name, a);
    if (r && r.error) toast(r.error);
    return r || {};
  }

  // ---------------------------------------------------------------- layout from the app
  // `want` is the mode asked for; the app answers with a layout, which can arrive a moment later.
  let want = 'tucked', pendingTab = null;
  function onLayout(l) {
    L = l;
    document.body.classList.toggle('edge-left', l.edge === 'left');
    document.body.classList.toggle('edge-right', l.edge !== 'left');
    if (l.mode !== want) { api.layout(want); return; }      // an old answer: ask again for what we want now
    document.body.classList.remove('mode-tucked', 'mode-nudge', 'mode-open');
    document.body.classList.add('mode-' + l.mode);
    // handle and bubble
    Object.assign(handle.style, { width: `${l.handleW}px`, height: `${l.handleH}px`, top: `${l.handleTop}px` });
    Object.assign(peekc.style, { width: `${63 * l.k}px`, height: `${45 * l.k}px`, top: `${5 * l.k}px` });
    bubble.style.top = `${Math.max(4, l.handleTop + l.handleH / 2 - 44)}px`;
    bubble.style[l.edge === 'left' ? 'left' : 'right'] = `${l.handleW + 8}px`;
    bubble.style[l.edge === 'left' ? 'right' : 'left'] = 'auto';
    // drawer: drawn at its normal size and zoomed to fit the window
    drawer.style.zoom = l.zoom;
    drawer.style.width = `${l.winW / l.zoom}px`;
    if (l.mode === 'open') {
      drawer.hidden = false;
      drawer.classList.add('away');
      render(true);
      if (pendingTab) { pick(pendingTab); pendingTab = null; }
      requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.remove('away')));
    } else drawer.hidden = true;
    syncBubble();
  }
  function setMode(m) { if (m !== want) { want = m; api.layout(m); } }

  function openDrawer(tab) {
    pendingTab = tab || null;
    bubble.hidden = true;
    if (want === 'open' && L.mode === 'open') { if (tab) pick(tab); pendingTab = null; return; }
    setMode('open');
    act('panel', { open: true });
  }
  let closing = null;
  function tuckDrawer() {
    if (want !== 'open' || closing) return;
    drawer.classList.add('away');
    closing = setTimeout(() => { closing = null; setMode('tucked'); act('panel', { open: false }); syncBubble(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
  }
  const toggle = () => (want === 'open' ? tuckDrawer() : openDrawer());

  // ---------------------------------------------------------------- tabs
  let tabs = [], cur = 'today', cache = '';
  function render(force) {
    if (!S || (want !== 'open' && !force)) return;
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
  $('tuck').onclick = tuckDrawer;
  $('gear').onclick = () => api.openSettings();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tuckDrawer(); });

  let toastT;
  function toast(msg) {
    if (want !== 'open') return sayLocal('Muncher says', msg, 5000);
    let t = drawer.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; drawer.appendChild(t); }
    t.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.remove(), 3000);
  }

  // ---------------------------------------------------------------- nudges: his speech bubbles
  const BUBBLE_FOR = 20000, AGAIN_AFTER = 10 * 60000;
  const nice = (t) => (t === t.toUpperCase() ? t.toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/\bha\b/i, 'HA') : t);
  function sayLocal(title, text, ms = 4000, tab) { say = { title, text, until: Date.now() + ms, tab }; syncBubble(); }
  const live = () => (S ? (S.nudges || []).filter((n) => !dismissed.has(n.id)) : []);

  function pickNudge() {
    const now = Date.now(), list = live();
    if (showing && now - shown[showing.id] < BUBBLE_FOR && list.some((n) => n.id === showing.id)) return showing;
    return list.find((n) => !shown[n.id] || now - shown[n.id] > AGAIN_AFTER) || null;
  }

  function syncBubble() {
    dot.hidden = !(want !== 'open' && live().length && !showing);
    if (want === 'open') { bubble.hidden = true; return; }
    const now = Date.now();
    let b = null;
    if (say && now < say.until) b = say;
    else {
      say = null;
      const n = pickNudge();
      if (n && n !== showing) shown[n.id] = now;
      showing = n;
      b = n;
    }
    if (b) {
      bt.textContent = nice(b.title);
      bm.textContent = b.text;
      setMode('nudge');
      if (L.mode === 'nudge') bubble.hidden = false;
    } else if (want === 'nudge') { bubble.hidden = true; setMode('tucked'); }
    dot.hidden = !(live().length && !b);
  }

  function dismiss(id) { dismissed.add(id); act('dismiss', { id }); }
  bubble.addEventListener('click', (e) => {
    if (e.target.closest('#bx')) return;
    const b = say || showing;
    if (showing && !say) dismiss(showing.id);
    say = null;
    if (b && b.settings) { showing = null; syncBubble(); return api.openSettings(b.settings); }
    openDrawer(b && (b.tab || b.screen));
  });
  $('bx').addEventListener('click', (e) => {
    e.stopPropagation();
    if (showing && !say) dismiss(showing.id);
    say = null; showing = null;
    syncBubble();
  });

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

  // ---------------------------------------------------------------- touching Muncher
  // On the edge: tap or swipe inwards to open; hold, then slide up or down to move him.
  let g = null;
  const inward = (dx) => (L.edge === 'left' ? dx : -dx);
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    g = { x0: e.screenX, x: e.screenX, y: e.screenY, moved: 0, drag: false };
    g.hold = setTimeout(() => { if (g && g.moved < 10) { g.drag = true; handle.style.cursor = 'ns-resize'; } }, 380);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.screenX - g.x, dy = e.screenY - g.y;
    g.x = e.screenX; g.y = e.screenY;
    if (g.drag) { api.drag(0, dy); return; }
    g.moved += Math.abs(dx) + Math.abs(dy);
    if (g.moved > 10) clearTimeout(g.hold);
    if (inward(e.screenX - g.x0) > 40) { const gg = g; g = null; clearTimeout(gg.hold); openDrawer(); }
  });
  const end = () => {
    if (!g) return;
    clearTimeout(g.hold);
    if (g.drag) api.dragEnd();
    else if (g.moved < 10) openDrawer();
    handle.style.cursor = '';
    g = null;
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', () => { if (g) { clearTimeout(g.hold); if (g.drag) api.dragEnd(); g = null; } });
  handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(); } });

  // In the drawer: stroke him to make him purr; swipe his column towards the edge to tuck the drawer away.
  let s2 = null;
  homecol.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .say')) return; s2 = { x0: e.screenX, x: e.screenX, y: e.screenY, moved: 0, onPet: e.target === petc }; });
  homecol.addEventListener('pointermove', (e) => {
    if (!s2) return;
    s2.moved += Math.abs(e.screenX - s2.x) + Math.abs(e.screenY - s2.y);
    s2.x = e.screenX; s2.y = e.screenY;
    if (-inward(e.screenX - s2.x0) > 70) { s2 = null; tuckDrawer(); return; }
    if (s2.onPet && s2.moved > 70) { s2 = null; local = { ...local, mood: 'purr', until: Date.now() + 2600 }; render(true); }
  });
  homecol.addEventListener('pointerup', () => { s2 = null; });

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
      sayLocal('Nom. Blocked', `${r.domain || text} is on the blocklist.`, 5000, 'ads');
    }
  });

  // ---------------------------------------------------------------- state
  let lastAte = 0;
  function onState(s) {
    S = s;
    if (s.ads && s.ads.ate && s.ads.blocked !== lastAte) { lastAte = s.ads.blocked; local.eatUntil = Date.now() + 8000; }
    document.body.classList.toggle('night', !!s.night);
    render();
    syncBubble();
  }
  if (!DEMO) { api.onState(onState); api.onLayout(onLayout); api.onOpen((how) => (how === 'toggle' ? toggle() : openDrawer())); }

  // ---------------------------------------------------------------- the clock
  let f = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame() {
    f += reduce ? 8 : 1;
    const now = Date.now();
    const mood = local.mood && now < local.until ? local.mood : S ? S.mood : 'content';
    const st = { mood, phones: S && S.phones, crown: S && S.crown, shades: S && S.shades, eating: now < local.eatUntil };
    if (want === 'open') window.Muncher.draw(petc, st, f);
    else window.Muncher.draw(peekc, st, f);
  }
  setInterval(frame, reduce ? 1000 : 125);
  setInterval(() => { render(); syncBubble(); }, 1000);
  frame();

  // ---------------------------------------------------------------- demo mode
  function demoLayout(mode) {
    const W = innerWidth, H = innerHeight, k = 2;
    return { mode, edge: params.get('edge') === 'left' ? 'left' : 'right', handleW: 33 * k, handleH: 48 * k, k, zoom: 1, winW: mode === 'open' ? Math.min(880, W) : W, winH: H, handleTop: Math.round(H / 2 - 24 * k) };
  }
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
    window.demo = { setMood: (m) => { S.mood = m; }, state: () => S, open: openDrawer, close: tuckDrawer, pick, nudge: (n) => { S.nudges = [n]; syncBubble(); } };
    if (real) { real.onLayout(onLayout); real.onOpen((how) => (how === 'toggle' ? toggle() : openDrawer())); } else onLayout(demoLayout('tucked'));
    onState(S);
  }
})();
