// The widget: draws Muncher, handles taps, holds, strokes and drops, shows nudges, and runs the panel.
(function () {
  const params = new URLSearchParams(location.search);
  const DEMO = !window.pg || params.has('demo');
  const $ = (id) => document.getElementById(id);
  const pet = $('pet'), petc = $('petc'), panel = $('panel'), track = $('track'), dots = $('dots'), pname = $('pname');
  const bubble = $('bubble'), bt = $('bt'), bm = $('bm');

  let S = DEMO ? window.DEMO_STATE() : null;
  let L = { mode: 'pet', side: 'left', petW: 280, petH: 200, panelW: 720, panelH: 340, zoom: 1 };
  let local = { mood: null, until: 0, eatUntil: 0 };
  let say = null;                       // a bubble from the widget itself: {title, text, until, screen}
  const shown = {};                     // nudge id -> when it was last shown
  let showing = null;                   // the nudge in the bubble now
  const dismissed = new Set();

  // ---------------------------------------------------------------- talking to the app
  const api = DEMO ? {
    act: async (name, a) => { demoAct(name, a); return { ok: true }; },
    layout: (mode) => setTimeout(() => onLayout({ ...L, mode }), 0),
    drag() {}, dragEnd() {}, openSettings() { sayLocal('SETTINGS', 'They open in their own window.', 3000); },
  } : window.pg;

  async function act(name, a) {
    const r = await api.act(name, a);
    if (r && r.error) toast(r.error);
    return r || {};
  }

  // ---------------------------------------------------------------- layout from the app
  function onLayout(l) {
    L = l;
    document.body.classList.toggle('side-left', l.side === 'left');
    document.body.classList.toggle('side-right', l.side !== 'left');
    pet.style.width = `${l.petW}px`;
    pet.style.height = `${l.petH}px`;
    panel.style.zoom = l.zoom;
    if (l.mode !== want) { api.layout(want); return; }      // an old answer: ask again for what we want now
    panel.hidden = l.mode !== 'panel';
    bubble.style.bottom = `${l.petH - 8}px`;
    if (l.mode === 'panel') { render(true); if (pendingScreen) { go(pendingScreen, false); pendingScreen = null; } }
    syncBubble();
  }

  // `want` is the mode asked for; the app answers with a layout, which can arrive a moment later.
  let pendingScreen = null, want = 'pet';
  function setMode(m) { if (m !== want) { want = m; api.layout(m); } }
  function openPanel(screen) {
    pendingScreen = screen || null;
    bubble.hidden = true;
    if (want === 'panel' && L.mode === 'panel') { if (screen) go(screen); pendingScreen = null; return; }
    setMode('panel');
    act('panel', { open: true });
  }
  function closePanel() {
    if (want !== 'panel') return;
    setMode('pet');
    act('panel', { open: false });
    syncBubble();
  }
  const toggle = () => (want === 'panel' ? closePanel() : openPanel());

  // ---------------------------------------------------------------- panel
  let ids = [], cur = 0, cache = {};
  function render(force) {
    if (!S || (want !== 'panel' && !force)) return;
    const list = window.Screens.build(S);
    const nids = list.map((x) => x.id);
    if (nids.join() !== ids.join()) {
      const keep = ids[cur];
      ids = nids;
      cache = {};
      track.innerHTML = list.map((x) => `<section class="scr" data-id="${x.id}" aria-label="${x.name}"></section>`).join('');
      dots.innerHTML = list.map((x, i) => `<button aria-label="${x.name}" data-i="${i}"></button>`).join('');
      const i = Math.max(0, ids.indexOf(keep));
      track.scrollLeft = i * track.clientWidth;
      setDot(i);
    }
    const busy = document.activeElement && document.activeElement.matches('textarea, input') ? document.activeElement.closest('.scr') : null;
    for (const x of list) {
      if (cache[x.id] === x.html) continue;
      const el = track.querySelector(`[data-id="${x.id}"]`);
      if (!el || el === busy) continue;
      el.innerHTML = x.html;
      cache[x.id] = x.html;
    }
    const alert = new Set((S.nudges || []).map((n) => n.screen));
    [...dots.children].forEach((b, k) => b.classList.toggle('alert', alert.has(ids[k]) && k !== cur));
  }

  function setDot(i) {
    cur = i;
    [...dots.children].forEach((b, k) => b.classList.toggle('on', k === i));
    pname.textContent = (window.Screens.NAMES[ids[i]] || '').toUpperCase();
  }
  function go(target, smooth = true) {
    const i = typeof target === 'number' ? (target + ids.length) % ids.length : ids.indexOf(target);
    if (i < 0) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    setDot(i);
  }
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / track.clientWidth); if (i !== cur) setDot(i); }, { passive: true });
  dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(+b.dataset.i); });
  $('prev').onclick = () => go(cur - 1);
  $('next').onclick = () => go(cur + 1);
  $('close').onclick = closePanel;
  $('gear').onclick = () => api.openSettings();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
    if (want === 'panel' && !e.target.matches('textarea, input')) { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); }
  });

  track.addEventListener('click', async (e) => {
    const set = e.target.closest('[data-settings]');
    if (set) return api.openSettings(set.dataset.settings);
    const cap = e.target.closest('[data-capture]');
    if (cap) {
      const ta = $('capText');
      const r = await act('capture', { text: ta.value, task: cap.dataset.capture === 'task' });
      if (r.ok) { ta.value = ''; toast('Sent to your inbox'); }
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.a ? JSON.parse(b.dataset.a) : undefined;
    if (b.dataset.act === 'dictate') $('capText')?.focus();
    b.disabled = true;
    try { await act(b.dataset.act, a); } finally { b.disabled = false; }
  });
  track.addEventListener('change', (e) => {
    const r = e.target.closest('[data-vol]');
    if (r) { act('volume', { name: r.dataset.vol, volume: +r.value }); r.blur(); }
  });

  let toastT;
  function toast(msg) {
    if (want !== 'panel') return sayLocal('MUNCHER SAYS', msg, 5000);
    let t = panel.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; panel.appendChild(t); }
    t.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.remove(), 3500);
  }

  // ---------------------------------------------------------------- bubble
  const BUBBLE_FOR = 20000, AGAIN_AFTER = 10 * 60000;
  function sayLocal(title, text, ms = 4000, screen) { say = { title, text, until: Date.now() + ms, screen }; syncBubble(); }

  function pickNudge() {
    if (!S) return null;
    const now = Date.now();
    if (showing && now - shown[showing.id] < BUBBLE_FOR && (S.nudges || []).some((n) => n.id === showing.id)) return showing;
    return (S.nudges || []).find((n) => !dismissed.has(n.id) && (!shown[n.id] || now - shown[n.id] > AGAIN_AFTER)) || null;
  }

  function syncBubble() {
    if (want === 'panel') { bubble.hidden = true; return; }
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
      bt.textContent = b.title;
      bm.textContent = b.text;
      bubble.hidden = false;
      setMode('bubble');
    } else if (!bubble.hidden || want === 'bubble') hideBubble();
  }

  function hideBubble() {
    bubble.hidden = true;
    if (want === 'bubble') setMode('pet');
  }

  bubble.addEventListener('click', (e) => {
    if (e.target.closest('#bx')) return;
    const b = say || showing;
    if (showing && !say) { dismissed.add(showing.id); act('dismiss', { id: showing.id }); }
    say = null;
    openPanel(b && b.screen);
  });
  $('bx').addEventListener('click', (e) => {
    e.stopPropagation();
    if (showing && !say) { dismissed.add(showing.id); act('dismiss', { id: showing.id }); }
    say = null; showing = null;
    hideBubble();
  });

  // ---------------------------------------------------------------- touching Muncher
  // tap: open or close the panel. Hold, then move: carry him somewhere. Swipe across him: he purrs.
  let g = null;
  pet.addEventListener('pointerdown', (e) => {
    pet.setPointerCapture(e.pointerId);
    g = { x: e.screenX, y: e.screenY, moved: 0, drag: false, purred: false };
    g.hold = setTimeout(() => { if (g && g.moved < 12) { g.drag = true; pet.style.cursor = 'grabbing'; } }, 380);
  });
  pet.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.screenX - g.x, dy = e.screenY - g.y;
    g.x = e.screenX; g.y = e.screenY;
    if (g.drag) { api.drag(dx, dy); return; }
    g.moved += Math.abs(dx) + Math.abs(dy);
    if (g.moved > 12) clearTimeout(g.hold);
    if (g.moved > 70 && !g.purred) { g.purred = true; local = { ...local, mood: 'purr', until: Date.now() + 2600 }; sayLocal('HAPPY', 'Prrrr.', 2000); }
  });
  const end = () => {
    if (!g) return;
    clearTimeout(g.hold);
    if (g.drag) api.dragEnd();
    else if (g.moved < 12) toggle();
    pet.style.cursor = '';
    g = null;
  };
  pet.addEventListener('pointerup', end);
  pet.addEventListener('pointercancel', () => { if (g) { clearTimeout(g.hold); if (g.drag) api.dragEnd(); g = null; } });
  pet.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

  // feeding: drop a link onto the widget
  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('drop');
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (!text) return sayLocal('YUCK', 'Muncher only eats links.', 3000);
    const r = await act('feed', { text });
    if (r.domain || DEMO) {
      local = { mood: 'stuffed', until: Date.now() + 3000, eatUntil: Date.now() + 3000 };
      sayLocal('NOM. BLOCKED', `${r.domain || text} is on the blocklist.`, 5000, 'ads');
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
  if (!DEMO) { api.onState(onState); api.onLayout(onLayout); api.onOpen((how) => (how === 'toggle' ? toggle() : openPanel())); }

  // ---------------------------------------------------------------- the clock
  let f = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame() {
    f += reduce ? 8 : 1;
    const now = Date.now();
    const mood = local.mood && now < local.until ? local.mood : S ? S.mood : 'asleep';
    window.Muncher.draw(petc, { mood, phones: S && S.phones, crown: S && S.crown, shades: S && S.shades, eating: now < local.eatUntil }, f);
  }
  setInterval(frame, reduce ? 1000 : 125);
  setInterval(() => { render(); syncBubble(); }, 1000);
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
    render();
  }
  if (DEMO) {
    window.demo = { setMood: (m) => { S.mood = m; }, state: () => S, open: openPanel, close: closePanel, nudge: (n) => { S.nudges = [n]; syncBubble(); } };
    onLayout(L);
    onState(S);
  }
})();
