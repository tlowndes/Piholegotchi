// Every screen in the panel, drawn from the app's state. Each returns HTML, or null to stay hidden.
// Buttons say what they do with data-act (and data-a for their arguments, as JSON).
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => Math.round(+v || 0).toLocaleString('en-GB');
  const pad = (v) => String(v).padStart(2, '0');
  const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const deg = (t) => `${Math.round(t)}°`;
  const act = (name, args) => `data-act="${name}"${args ? ` data-a="${esc(JSON.stringify(args))}"` : ''}`;
  const btn = (label, name, args, cls = '') => `<button class="btn ${cls}" ${act(name, args)}>${label}</button>`;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const ICON = {
    prev: '<svg width="18" height="18" viewBox="0 0 6 6" shape-rendering="crispEdges"><path fill="currentColor" d="M0 0h1v6H0zM4 0h1v1H4zM3 1h1v1H3zM2 2h1v2H2zM3 4h1v1H3zM4 5h1v1H4zM5 0h1v6H5z"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 6 6" shape-rendering="crispEdges"><path fill="currentColor" d="M0 0h1v6H0zM1 0h1v1H1zM2 1h1v1H2zM3 2h1v2H3zM2 4h1v1H2zM1 5h1v1H1zM5 0h1v6H5z"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 6 6" shape-rendering="crispEdges"><path fill="currentColor" d="M1 0h1v6H1zM2 1h1v4H2zM3 2h1v2H3z"/></svg>',
    pause: '<svg width="18" height="18" viewBox="0 0 6 6" shape-rendering="crispEdges"><path fill="currentColor" d="M1 0h1v6H1zM4 0h1v6H4z"/></svg>',
    mic: '<svg width="15" height="21" viewBox="0 0 5 7" shape-rendering="crispEdges"><path fill="currentColor" d="M1 0h3v4H1zM0 2h1v2H0zM4 2h1v2H4zM1 4h3v1H1zM2 5h1v1H2zM1 6h3v1H1z"/></svg>',
    sun: '<path fill="#ffc43d" d="M6 5h4v6H6zM5 6h6v4H5z"/><path fill="#232326" d="M7 1h2v2H7zM7 13h2v2H7zM1 7h2v2H1zM13 7h2v2h-2zM3 3h1v1H3zM12 3h1v1h-1zM3 12h1v1H3zM12 12h1v1h-1z"/>',
    moon: '<path fill="#232326" d="M7 2h3v1H7zM5 3h2v1H5zM4 4h1v2H4zM3 6h1v4H3zM4 10h1v2H4zM5 12h2v1H5zM7 13h4v1H7zM11 12h2v1h-2zM8 6h1v4H8zM9 10h2v1H9zM9 5h1v1H9z"/>',
    cloud: '<path fill="#232326" d="M5 4h5v1H5zM4 5h1v1H4zM10 5h2v1h-2zM3 6h1v2H3zM12 6h1v1h-1zM2 8h1v2H2zM13 7h1v3h-1zM3 10h10v1H3z"/>',
    part: '<path fill="#ffc43d" d="M3 2h4v4H3z"/><path fill="#232326" d="M6 6h5v1H6zM5 7h1v1H5zM11 7h2v1h-2zM4 8h1v2H4zM13 8h1v1h-1zM3 10h1v2H3zM14 9h1v3h-1zM4 12h10v1H4z"/>',
    rain: '<path fill="#232326" d="M5 2h5v1H5zM4 3h1v1H4zM10 3h2v1h-2zM3 4h1v2H3zM12 4h1v1h-1zM2 6h1v2H2zM13 5h1v3h-1zM3 8h10v1H3z"/><path fill="#5aa0ff" d="M4 10h1v2H4zM8 10h1v2H8zM12 10h1v2h-1zM6 12h1v2H6zM10 12h1v2h-1z"/>',
    snow: '<path fill="#232326" d="M5 2h5v1H5zM4 3h1v1H4zM10 3h2v1h-2zM3 4h1v2H3zM12 4h1v1h-1zM2 6h1v2H2zM13 5h1v3h-1zM3 8h10v1H3z"/><path fill="#5aa0ff" d="M4 11h2v2H4zM9 10h2v2H9zM7 13h2v2H7zM12 13h2v2h-2z"/>',
    fog: '<path fill="#232326" d="M2 5h12v1H2zM3 8h10v1H3zM2 11h12v1H2z"/>',
    storm: '<path fill="#232326" d="M5 2h5v1H5zM4 3h1v1H4zM10 3h2v1h-2zM3 4h1v2H3zM12 4h1v1h-1zM2 6h1v2H2zM13 5h1v3h-1zM3 8h10v1H3z"/><path fill="#ffc43d" d="M8 9h2v1H8zM7 10h2v1H7zM6 11h3v1H6zM8 12h1v1H8zM7 13h1v2H7z"/>',
  };
  const wx = (k, size) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">${ICON[k] || ICON.cloud}</svg>`;
  const ring = (pct, col, label, val, size = 118) => {
    const r = size * 0.42, c = 2 * Math.PI * r;
    return `<div class="col" style="align-items:center;gap:6px"><div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(35,35,38,.15)" stroke-width="${size * 0.1}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${size * 0.1}" stroke-dasharray="${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><div class="big" style="font-size:${size * 0.25}px">${val}</div></div><div class="px">${label}</div></div>`;
  };
  const level = (p) => (p >= 85 ? '#ff5b2e' : p >= 60 ? '#ffc43d' : '#3fbf7f');
  const empty = (label, big, line, extra = '') => `<div class="empty"><div class="px">${label}</div><div class="big" style="font-size:44px">${big}</div><div class="vt">${line}</div>${extra}</div>`;

  const S = {};

  // ---------------------------------------------------------------- ads eaten
  S.ads = { name: 'Ads eaten', html(s) {
    if (!s.configured.ads) return null;
    const a = s.ads;
    if (!a) return empty('AdGuard', 'Waking up…', 'Checking on AdGuard Home.');
    const fed = (a.fed || []).length ? `<div class="row" style="gap:8px;align-items:center"><span class="px">Fed</span>${a.fed.slice(0, 2).map((d) => `<span class="vt clip1" style="font-size:20px;max-width:150px">${esc(d)}</span><button class="btn sm" ${act('unfeed', { domain: d })}>Undo</button>`).join('')}</div>` : '';
    if (a.note === 'BLOCKING PAUSED') {
      return `<div class="row fill"><div class="col" style="flex:1;justify-content:center"><div class="px">Blocking paused</div><div class="big" style="font-size:58px">On a break.</div><div class="vt">Back at ${hm(a.paused_until)}. Ads get through till then.</div></div><div class="col" style="justify-content:center">${btn('Feed me again', 'ads:resume', null, 'hot')}</div></div>`;
    }
    if (a.note === 'BLOCKING IS OFF') {
      return `<div class="row fill"><div class="col" style="flex:1;justify-content:center"><div class="px">Blocking is off${a.off_mins ? ` · ${a.off_mins} min` : ''}</div><div class="big" style="font-size:58px">Starving.</div><div class="vt">Feed me ads.</div></div><div class="col" style="justify-content:center">${btn('Turn blocking on', 'ads:resume', null, 'hot')}</div></div>`;
    }
    if (!a.online) return empty('AdGuard is down', 'Zzz.', 'Can’t reach AdGuard Home. Check the server.');
    const count = a.today != null ? a.today : a.blocked;
    const tail = { hungry: 'ads. More?', stuffed: 'ads. Burp.', party: 'ads. Party!' }[s.mood] || 'ads. Nom.';
    const mood = a.mood === 'party' ? 'PARTY' : a.percent < 12 ? 'HUNGRY' : a.percent < 22 ? 'CONTENT' : 'STUFFED';
    const hours = Array.from({ length: 24 }, (_, i) => a.hours[i]);
    const max = Math.max(1, ...a.hours);
    const now = new Date().getHours();
    return `<div class="row fill"><div class="col" style="flex:1.1"><div class="px">${a.mood === 'party' ? 'New record today' : 'Today I ate'}</div><div class="big" style="font-size:${count > 99999 ? 60 : 76}px">${n(count)}</div><div class="vt">${tail}</div>
      <div class="rule" style="margin:6px 0 2px"></div><div class="row" style="gap:10px;align-items:center"><span class="chip ${mood === 'HUNGRY' ? 'bad' : mood === 'CONTENT' ? 'warn' : 'ok'}">MOOD: ${mood}</span><span class="px">${a.percent.toFixed(1)}% of ${n(a.total)}</span></div>${fed}</div>
      <div class="col" style="flex:1;justify-content:space-between"><div class="px">By the hour</div><div class="bars">${hours.map((h, i) => (h == null ? '<i class="later"></i>' : `<i class="${i === now ? 'now' : ''}" style="height:${(h / max) * 100}%"></i>`)).join('')}</div>
      <div class="row" style="gap:8px"><span class="px" style="align-self:center">Pause</span>${btn('5 min', 'ads:pause', { minutes: 5 })}${btn('30 min', 'ads:pause', { minutes: 30 })}${btn('1 hr', 'ads:pause', { minutes: 60 })}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- now playing
  S.np = { name: 'Now playing', html(s) {
    if (!s.configured.spotify) return null;
    const t = s.track;
    if (!t) return empty('Spotify', 'Quiet in here.', 'Nothing playing right now.', `<div class="row">${btn(ICON.play + ' Play', 'spotify', { action: 'play' }, 'hot')}</div>`);
    const p = Math.min(t.duration, t.progress + (t.playing ? (Date.now() - t.at) / 1000 : 0));
    const art = t.art ? `<img src="${t.art}" alt="" style="width:252px;height:252px;object-fit:cover;border:2px solid #232326;flex:none">` : '<div style="width:252px;height:252px;border:2px solid #232326;flex:none;background:repeating-linear-gradient(45deg,#232326 0 2px,transparent 2px 8px)"></div>';
    const ctl = t.canControl
      ? `<div class="row" style="gap:12px">${btn(ICON.prev, 'spotify', { action: 'prev' })}${btn(t.playing ? ICON.pause : ICON.play, 'spotify', { action: t.playing ? 'pause' : 'play' }, 'hot')}${btn(ICON.next, 'spotify', { action: 'next' })}</div>`
      : '<div class="vt" style="font-size:20px">Reconnect Spotify in Settings to use the buttons.</div>';
    return `<div class="row fill" style="gap:22px">${art}<div class="col" style="flex:1;justify-content:space-between"><div class="col" style="gap:6px"><div class="px clip1">${t.playing ? 'Now playing' : 'Paused'}${t.album ? ` · ${esc(t.album)}` : ''}${t.year ? ` · ${t.year}` : ''}</div><div class="big clip2" style="font-size:38px;line-height:1">${esc(t.title)}</div><div class="vt clip1" style="font-size:28px">${esc(t.artist)}</div></div>
      <div class="col" style="gap:6px"><div class="prog"><b style="width:${t.duration ? (p / t.duration) * 100 : 0}%"></b></div><div class="row px" style="justify-content:space-between"><span>${mmss(p)}</span><span>-${mmss(Math.max(0, t.duration - p))}</span></div></div>${ctl}</div></div>`;
  } };

  // ---------------------------------------------------------------- weather and clock
  S.wx = { name: 'Weather', html(s) {
    const w = s.weather;
    if (!s.configured.weather) return null;
    const d = new Date();
    const clock = `<div class="col" style="flex:1"><div class="px">${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}</div><div class="big" style="font-size:104px">${hm(d)}</div>${w ? `<div class="row" style="gap:10px"><span class="chip">${esc(w.sun)}</span>${w.outlook ? `<span class="chip bad">${esc(w.outlook)}</span>` : ''}</div>` : ''}</div>`;
    if (!w) return `<div class="row fill">${clock}<div class="col" style="flex:1;justify-content:center"><div class="vt">Fetching the forecast…</div></div></div>`;
    return `<div class="row fill">${clock}<div class="col" style="flex:1"><div class="row" style="align-items:center;gap:14px">${wx(w.kind, 64)}<div><div class="big" style="font-size:56px">${deg(w.temp)}</div><div class="vt clip1">${esc(w.desc)} · ${esc(w.place)}</div></div></div><div class="px">Feels ${deg(w.feels)} · High ${deg(w.hi)} · Low ${deg(w.lo)} · Rain ${w.rain}%</div>
      <div class="row" style="gap:0;border:2px solid #232326">${w.slots.map((x, k) => `<div class="col" style="flex:1;align-items:center;gap:2px;padding:6px 0;${k ? 'border-left:2px solid #232326' : ''}"><span class="px">${esc(x.label)}</span>${wx(x.kind, 26)}<span class="vt" style="font-size:22px">${deg(x.temp)}</span></div>`).join('')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- calendar
  S.cal = { name: 'Calendar', html(s) {
    if (!s.configured.calendar) return null;
    const c = s.calendar, d = new Date();
    const page = `<div class="col" style="width:120px;flex:none"><div style="border:2px solid #232326;text-align:center"><div class="px" style="background:#ff5b2e;padding:4px 0;border-bottom:2px solid #232326">${MONTHS[d.getMonth()].slice(0, 3)}</div><div class="big" style="font-size:58px;padding:6px 0">${d.getDate()}</div><div class="px" style="padding-bottom:6px">${DAYS[d.getDay()]}</div></div></div>`;
    if (!c) return `<div class="row fill">${page}<div class="col" style="justify-content:center"><div class="vt">Reading your calendar…</div></div></div>`;
    if (!c.online) return `<div class="row fill">${page}${empty('Calendar', 'Can’t see it.', esc(c.note.toLowerCase().replace(/^./, (x) => x.toUpperCase())) + '. Check the link in Settings.')}</div>`;
    const ev = c.events.filter((e) => e.end > Date.now());
    if (!ev.length) return `<div class="row fill">${page}${empty('Next two weeks', 'All clear.', 'Nothing in the calendar.')}</div>`;
    const [nx, ...rest] = ev;
    const mins = Math.round((nx.start - Date.now()) / 60000);
    const when = nx.allDay ? 'All day' : `${hm(nx.start)} to ${hm(nx.end)}`;
    const inTxt = mins <= 0 ? 'On now' : mins < 60 ? `In ${mins} min` : mins < 1440 ? `In ${Math.floor(mins / 60)}h ${mins % 60}m` : DAYS[new Date(nx.start).getDay()];
    const dayLbl = (t) => { const x = new Date(t); const dd = Math.round((new Date(x.toDateString()) - new Date(new Date().toDateString())) / 864e5); return dd === 0 ? 'TODAY' : dd === 1 ? 'TMRW' : DAYS[x.getDay()].slice(0, 3).toUpperCase(); };
    return `<div class="row fill">${page}<div class="col" style="flex:1"><div class="px">Up next · ${inTxt}</div><div class="big clip1" style="font-size:34px">${esc(nx.title)}</div><div class="vt clip1">${when}${nx.where ? ` · ${esc(nx.where)}` : ''}</div><div class="rule" style="margin:4px 0"></div>
      <div class="list">${rest.slice(0, 3).map((e) => `<div class="it"><span class="px" style="width:44px">${dayLbl(e.start)}</span><span class="vt" style="font-size:22px;width:80px">${e.allDay ? 'All day' : hm(e.start)}</span><span class="clip1" style="font-weight:700">${esc(e.title)}</span></div>`).join('')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- focus
  S.focus = { name: 'Focus', html(s) {
    const f = s.focus;
    const next = s.deck?.next?.title || '';
    if (!f) {
      const done = s.focusDone && Date.now() - s.focusDone.at < 5 * 60000 ? `<span class="chip ok">TIME’S UP · ${esc(s.focusDone.task)}</span>` : '';
      return `<div class="col fill" style="justify-content:center">${done}<div class="px">Focus</div><div class="big clip1" style="font-size:44px">${next ? esc(next) : 'Start a session.'}</div><div class="vt">Muncher works alongside you, and gets sleepy if you wander off.</div>
        <div class="row" style="gap:10px;margin-top:8px">${[15, 25, 45, 60].map((m) => btn(`${m} min`, 'focus:start', { minutes: m, task: next || 'Focus' }, m === s.focusMinutes ? 'hot' : '')).join('')}</div></div>`;
    }
    const left = f.running && f.ends ? Math.max(0, (f.ends - Date.now()) / 1000) : f.remaining;
    const frac = f.total ? left / f.total : 0;
    const C = 2 * Math.PI * 86;
    return `<div class="row fill" style="align-items:center;gap:28px"><div class="ring" style="width:200px;height:200px"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="none" stroke="rgba(35,35,38,.15)" stroke-width="18"/><circle cx="100" cy="100" r="86" fill="none" stroke="#ff5b2e" stroke-width="18" stroke-dasharray="${frac * C} ${C}" transform="rotate(-90 100 100)"/></svg><div class="big" style="font-size:48px">${mmss(left)}</div></div>
      <div class="col" style="flex:1"><div class="px">${f.running ? 'Focusing on' : 'Paused'}</div><div class="big clip2" style="font-size:34px;line-height:1">${esc(f.task)}</div><div class="vt">${Math.round(f.total / 60)} minutes, started ${f.source === 'phone' ? 'from Flight Deck' : 'here'}.${s.drift ? ' Muncher saw that tab.' : ''}</div>
      <div class="row" style="gap:10px;margin-top:8px">${btn(f.running ? 'Pause' : 'Resume', 'focus:pause', null, 'hot')}${btn('Stop', 'focus:stop')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- Flight Deck
  S.deck = { name: 'Flight Deck', html(s) {
    const d = s.deck;
    if (!d) return null;
    const nx = d.next || {}, hab = d.habits || {}, w = d.water || {}, jobs = d.jobs || {}, fu = jobs.follow_up || {};
    const stale = d.sent && new Date(d.sent).toDateString() !== new Date().toDateString();
    const tile = (l, v) => `<div class="col box" style="flex:1;gap:2px"><span class="px">${l}</span><span class="big" style="font-size:30px">${v}</span></div>`;
    return `<div class="col fill" style="justify-content:space-between"><div class="col" style="gap:4px"><div class="px">${stale ? 'From an earlier day · ' : ''}Next step${nx.mins ? ` · ${nx.mins} min` : ''}</div><div class="big clip2" style="font-size:34px;line-height:1">${esc(nx.title || 'Nothing lined up.')}</div></div>
      <div class="row" style="gap:10px">${tile('Due today', n(d.due))}${tile('Focus', `${n(d.focus_min)}m`)}${tile('Habits', `${n(hab.done)}/${n(hab.total)}`)}${tile('Water', w.ml != null ? `${(w.ml / 1000).toFixed(1)} L` : '-')}
      ${fu.company ? `<div class="col box" style="flex:1.6;gap:2px;background:#ffc43d"><span class="px">Follow up${fu.date ? ' ' + DAYS[new Date(fu.date).getDay()].slice(0, 3) : ''}</span><span class="clip1" style="font-weight:700;font-size:17px">${esc(fu.company)}</span><span class="vt clip1" style="font-size:20px">${esc(fu.role)}</span></div>` : ''}</div></div>`;
  } };

  // ---------------------------------------------------------------- quick capture
  S.cap = { name: 'Quick capture', html(s) {
    if (!s.configured.capture) return empty('Quick capture', 'Notes to Obsidian.', 'Pick your inbox note in Settings and anything you type here lands in it.', `<div class="row"><button class="btn hot" data-settings="desk">Open settings</button></div>`);
    return `<div class="row fill"><div class="col" style="flex:1.4"><div class="px">To your Obsidian inbox</div><textarea class="cap" id="capText" placeholder="Type, or tap the mic and talk" aria-label="Note"></textarea>
      <div class="row" style="gap:10px">${s.configured.helper ? `<button class="btn" data-act="dictate" aria-label="Talk instead (Windows dictation)">${ICON.mic}</button>` : ''}<button class="btn hot" style="flex:1" data-capture="note">Send to inbox</button><button class="btn" data-capture="task">As a task</button></div></div>
      <div class="col" style="flex:1"><div class="px">Sent today</div><div class="list">${(s.captures || []).map((c) => `<div class="it"><span class="px">${c.at}</span><span class="vt clip1" style="font-size:21px">${c.task ? '[ ] ' : ''}${esc(c.text)}</span></div>`).join('') || '<div class="vt" style="font-size:20px">Nothing yet.</div>'}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- break time
  S.brk = { name: 'Break time', html(s) {
    const m = s.activeMins || 0, w = s.water || { ml: 0, goal: 2000 };
    const fillH = Math.min(1, w.ml / (w.goal || 2000));
    const time = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
    return `<div class="row fill" style="align-items:center;gap:26px"><div class="col" style="flex:1.2"><div class="px">${s.breakDue ? 'Hyperfocus check' : 'At the desk'}</div><div class="big" style="font-size:50px">${time} straight.</div><div class="vt">${s.breakDue ? 'Stand up, roll your shoulders, top up your water.' : 'Muncher will nudge you when it’s time to move.'}</div>
      <div class="row" style="gap:10px;margin-top:6px">${btn('Stretched', 'break:done', null, s.breakDue ? 'hot' : '')}${btn('+250 ml water', 'water', { ml: 250 })}${s.breakDue ? btn('15 more min', 'break:snooze') : ''}</div></div>
      <div class="col" style="align-items:center"><svg width="70" height="110" viewBox="0 0 70 110"><rect x="3" y="3" width="64" height="104" fill="none" stroke="#232326" stroke-width="6"/><rect x="9" y="${9 + 92 * (1 - fillH)}" width="52" height="${92 * fillH}" fill="#5aa0ff"/></svg><span class="px">${(w.ml / 1000).toFixed(1)} of ${(w.goal / 1000).toFixed(1)} L</span></div></div>`;
  } };

  // ---------------------------------------------------------------- Home Assistant
  S.home = { name: 'Home', html(s) {
    if (!s.configured.home) return null;
    const h = s.home;
    if (!h) return empty('Home Assistant', 'Connecting…', 'Asking Home Assistant.');
    if (!h.items.length) return empty('Home Assistant', h.online ? 'Pick some things.' : 'Can’t reach it.', esc(h.note.toLowerCase().replace(/^./, (x) => x.toUpperCase())) + '.');
    const kind = { light: 'LIGHT', plug: 'SWITCH', lock: 'LOCK', door: 'DOOR', motion: 'MOTION', temp: 'TEMP', humidity: 'HUMIDITY', power: 'POWER', battery: 'BATTERY', climate: 'HEATING', person: 'PERSON', media: 'MEDIA', other: 'SENSOR' };
    return `<div class="col fill" style="justify-content:space-between"><div class="row" style="justify-content:space-between"><div class="px">Home Assistant${h.items.some((i) => i.toggle) ? ' · tap to switch' : ''}</div><span class="chip ok">CONNECTED</span></div>
      <div class="tiles" style="grid-template-columns:repeat(${Math.max(3, h.items.length)},1fr)">${h.items.map((i) => `<button class="tile ${i.on ? 'on' : ''}" ${i.toggle ? act('ha:toggle', { id: i.id }) : 'tabindex="-1"'}><span class="px">${kind[i.kind] || 'SENSOR'}</span><span><span class="big clip1" style="font-size:24px;display:block">${esc(i.value)}</span><span class="vt clip1" style="font-size:20px;display:block">${esc(i.label)}</span></span></button>`).join('')}</div></div>`;
  } };

  // ---------------------------------------------------------------- doorbell
  S.door = { name: 'Doorbell', html(s) {
    if (!s.configured.door) return null;
    const d = s.door;
    const ago = d ? Math.round((Date.now() - d.at) / 60000) : 0;
    const pic = d && d.img ? `<img src="${d.img}" alt="Doorbell camera" style="width:372px;height:248px;object-fit:cover;border:2px solid #232326;flex:none">` : '<div style="width:372px;height:248px;border:2px solid #232326;flex:none;display:grid;place-items:center" class="px">No picture</div>';
    return `<div class="row fill" style="gap:22px">${pic}<div class="col" style="flex:1;justify-content:center"><div class="px">Front door${d ? ` · ${ago ? ago + ' min ago' : 'just now'}` : ''}</div><div class="big" style="font-size:40px">${d && ago < 5 ? 'Someone’s at the door.' : 'All quiet.'}</div>
      <div class="row" style="gap:10px;margin-top:8px">${btn('Look now', 'door:refresh', null, 'hot')}${d ? btn('Dismiss', 'door:clear') : ''}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- bins
  S.bins = { name: 'Bin day', html(s) {
    const b = s.bins;
    if (!b) return null;
    const names = b.bins.map((x) => x.name).join(' + ') + (b.bins.length > 1 ? ' bins' : /bin/i.test(b.bins[0].name) ? '' : ' bin');
    return `<div class="row fill" style="align-items:center;gap:28px"><svg width="150" height="190" viewBox="0 0 15 19" shape-rendering="crispEdges"><path fill="#232326" d="M1 1h13v2H1zM2 3h11v13H2zM2 16h3v3H2zM10 16h3v3h-3z"/><path fill="#3fbf7f" d="M3 4h9v1H3z"/><path fill="#dedcd2" d="M4 7h2v2H4zM9 7h2v2H9zM5 11h5v1H5zM3 17h1v1H3zM11 17h1v1h-1z"/></svg>
      <div class="col" style="flex:1"><div class="px">${b.tonight ? 'Bin day tomorrow' : 'Bin day today'}</div><div class="big" style="font-size:50px">${esc(names)} out${b.tonight ? ' tonight' : ''}.</div><div class="vt">${b.next ? 'Next: ' + esc(b.next) : ''}</div>
      <div class="row" style="margin-top:8px">${b.done ? '<span class="chip ok">DONE, IT’S OUT</span>' : btn('Done, it’s out', 'bins:done', { key: b.key }, 'hot')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- plants and pets
  S.rem = { name: 'Plants & pets', html(s) {
    const r = s.reminders || [];
    if (!r.length) return null;
    return `<div class="col fill"><div class="px">Plants, pets and reminders</div><div class="list">${r.slice(0, 4).map((x) => `<div class="it"><span class="chip ${x.due ? (x.late ? 'bad' : 'warn') : ''}" style="min-width:18px;justify-content:center">${x.due ? '!' : '·'}</span><div class="col" style="gap:0;flex:1"><span class="clip1" style="font-weight:700;font-size:19px">${esc(x.title)}</span><span class="vt" style="font-size:21px">${esc(x.when)}</span></div>${btn('Done', 'rem:done', { id: x.id }, 'sm' + (x.due ? ' hot' : ''))}</div>`).join('')}</div></div>`;
  } };

  // ---------------------------------------------------------------- messages
  S.msg = { name: 'Messages', html(s) {
    const m = s.message;
    if (!m || Date.now() > m.until) return null;
    return `<div class="row fill" style="align-items:center;gap:24px"><svg width="110" height="120" viewBox="0 0 11 12" shape-rendering="crispEdges"><path fill="#ffc43d" d="M4 1h3v1H4zM3 2h5v1H3zM2 3h7v5H2zM1 8h9v1H1z"/><path fill="#232326" d="M5 0h1v1H5zM4 9h3v1H4zM5 10h1v1H5zM1 8h1v1H1zM9 8h1v1H9z"/></svg>
      <div class="col" style="flex:1"><div class="px">From ${esc(m.title || 'Home Assistant')} · ${hm(m.at)}</div><div class="big clip2" style="font-size:40px;line-height:1">${esc(m.text)}</div><div class="row" style="margin-top:8px">${btn('Got it', 'msg:clear', null, 'hot')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- who's online
  S.net = { name: 'Who’s online', html(s) {
    if (!s.configured.network) return null;
    const nw = s.network || { devices: [] }, f = nw.fresh;
    const card = f ? `<div class="col" style="flex:1.1;justify-content:center;border:2px solid #232326;padding:14px;background:#ffc43d"><div class="px">New on your wifi · ${hm(f.at)}</div><div class="big clip1" style="font-size:30px">${esc(f.name || 'Unknown device')}</div><div class="vt">${esc(f.ip)}${f.source ? ' · seen by ' + esc(f.source) : ''}</div>
      <div class="row" style="gap:10px;margin-top:6px">${btn('That’s mine', 'net:mine', { ip: f.ip })}${btn('Block it', 'net:block', { ip: f.ip }, 'hot')}</div></div>`
      : `<div class="col" style="flex:1.1;justify-content:center"><div class="px">Network</div><div class="big" style="font-size:44px">All familiar.</div><div class="vt">Muncher squints at anything new that joins.</div></div>`;
    return `<div class="row fill" style="gap:22px">${card}<div class="col" style="flex:1"><div class="px">${nw.devices.length} devices seen</div><div class="list">${nw.devices.slice(0, 5).map((d) => `<div class="it" style="padding:5px 0"><i style="width:10px;height:10px;background:${d.known === false ? '#ffc43d' : '#3fbf7f'};border:2px solid #232326;flex:none"></i><span class="clip1" style="font-weight:700">${esc(d.name || d.ip)}</span><span class="px" style="margin-left:auto">${esc(d.ip)}</span></div>`).join('')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- server
  S.srv = { name: 'Server', html(s) {
    if (!s.configured.server) return null;
    const v = s.server;
    if (!v) return empty('ZimaOS', 'Checking…', 'Asking Glances.');
    if (!v.online) return empty('ZimaOS', 'Server is down.', 'Can’t reach Glances. Is the server on?');
    const worst = Math.max(v.cpu, v.ram, v.disk);
    const [head, chip] = worst >= 90 ? ['Struggling.', '<span class="chip bad">STRESSED</span>'] : worst >= 75 ? ['Busy.', '<span class="chip warn">BUSY</span>'] : ['All calm.', '<span class="chip ok">HEALTHY</span>'];
    const tb = (gb) => (gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${Math.round(gb)} GB`);
    return `<div class="row fill" style="align-items:center"><div class="col" style="flex:.8"><div class="px">ZimaOS</div><div class="big" style="font-size:42px">${head}</div><div class="vt">Up ${esc(v.uptime.toLowerCase())}. ${tb(v.free_gb)} free of ${tb(v.total_gb)}.</div>${chip}</div>
      <div class="row" style="gap:16px">${ring(v.cpu, level(v.cpu), 'CPU', `${Math.round(v.cpu)}%`)}${ring(v.ram, level(v.ram), 'RAM', `${Math.round(v.ram)}%`)}${ring(v.disk, level(v.disk), 'DISK', `${Math.round(v.disk)}%`)}</div></div>`;
  } };

  // ---------------------------------------------------------------- this PC
  S.pc = { name: 'This PC', html(s) {
    const p = s.pc;
    if (!p) return null;
    const worst = Math.max(p.cpu, p.ram, p.gpu || 0);
    const temps = [p.cpu_temp ? `CPU ${Math.round(p.cpu_temp)}°C` : '', p.gpu_temp ? `GPU ${Math.round(p.gpu_temp)}°C` : ''].filter(Boolean).join(' · ');
    return `<div class="row fill" style="align-items:center"><div class="col" style="flex:.8"><div class="px clip1">${esc(p.name)}</div><div class="big" style="font-size:42px">${worst >= 90 ? 'Working hard.' : worst >= 70 ? 'Warm, not hot.' : 'Cruising.'}</div><div class="vt">${temps || 'Temperatures need admin rights on Windows.'}</div>${p.hungry ? `<span class="chip warn">${esc(p.hungry.toUpperCase())} IS HUNGRY</span>` : ''}</div>
      <div class="row" style="gap:16px">${ring(p.cpu, level(p.cpu), 'CPU', `${Math.round(p.cpu)}%`)}${p.gpu != null ? ring(p.gpu, level(p.gpu), 'GPU', `${Math.round(p.gpu)}%`) : ''}${ring(p.ram, level(p.ram), 'RAM', `${Math.round(p.ram)}%`)}</div></div>`;
  } };

  // ---------------------------------------------------------------- sound
  S.snd = { name: 'Sound', html(s) {
    if (!s.configured.helper) return null;
    const v = s.sound;
    const slider = (label, vol, name) => `<div class="col" style="gap:2px"><div class="row px" style="justify-content:space-between"><span class="clip1">${esc(label)}</span><span>${vol}</span></div><input type="range" min="0" max="100" value="${vol}" data-vol="${esc(name)}" aria-label="${esc(label)} volume"></div>`;
    return `<div class="row fill" style="gap:26px"><div class="col" style="flex:1;justify-content:space-between"><div class="px">Media keys · any app</div><div class="big" style="font-size:30px">${s.track?.playing ? esc(s.track.title) : 'Whatever’s playing'}</div><div class="vt">Works with YouTube, Teams, VLC and the rest.</div>
      <div class="row" style="gap:12px">${btn(ICON.prev, 'key', { key: 'prev' })}${btn(ICON.play + ICON.pause, 'key', { key: 'play' }, 'hot')}${btn(ICON.next, 'key', { key: 'next' })}${btn(v?.muted ? 'Unmute' : 'Mute', 'mute', { muted: !v?.muted })}</div></div>
      <div class="col" style="flex:1;justify-content:center;gap:10px">${v ? slider('Everything', v.master, '') + v.sessions.slice(0, 4).map((x) => slider(x.name, x.volume, x.name)).join('') : '<div class="vt">Reading volume…</div>'}</div></div>`;
  } };

  // ---------------------------------------------------------------- clipboard
  S.clip = { name: 'Clipboard', html(s) {
    const c = s.clip || [];
    if (!c.length) return empty('Clipboard', 'Nothing yet.', 'Copy something and it shows up here, ready to copy again.');
    return `<div class="col fill"><div class="row" style="justify-content:space-between"><div class="px">Last things you copied</div><span class="px">Kept in memory only</span></div><div class="list">${c.map((t) => {
      const colour = /^#[0-9a-f]{6}$/i.test(t.trim());
      const kind = /^https?:\/\//i.test(t.trim()) ? 'URL' : 'TXT';
      return `<div class="it" style="padding:5px 0">${colour ? `<i style="width:22px;height:22px;background:${t.trim()};border:2px solid #232326;flex:none"></i>` : `<span class="px" style="width:26px">${kind}</span>`}<span class="vt clip1" style="font-size:21px;flex:1">${esc(t.replace(/\s+/g, ' '))}</span>${btn('Copy', 'clip:copy', { text: t }, 'sm')}</div>`;
    }).join('')}</div></div>`;
  } };

  // ---------------------------------------------------------------- on repeat
  S.rep = { name: 'On repeat', html(s) {
    const t = s.top;
    if (!s.configured.spotify || !t) return null;
    if (!t.tracks.length) return empty('On repeat', 'Nothing yet.', t.note === 'RECONNECT SPOTIFY' ? 'Reconnect Spotify in Settings to see your top tracks.' : 'Spotify hasn’t got your top tracks yet.');
    return `<div class="row fill"><div class="col" style="flex:1.3"><div class="px">Most played · last 4 weeks</div><div class="list">${t.tracks.map((x, i) => `<div class="it"><span class="big" style="font-size:22px;width:24px">${i + 1}</span><span class="clip1" style="font-weight:700;font-size:17px;flex:1">${esc(x.title)}</span><span class="vt clip1" style="font-size:22px;max-width:40%">${esc(x.artist)}</span></div>`).join('')}</div></div>
      <div class="col" style="flex:.7;justify-content:center"><div class="px">Top artist</div><div class="big clip2" style="font-size:34px">${esc(t.artists[0] || '')}</div></div></div>`;
  } };

  // ---------------------------------------------------------------- biggest snack
  S.snack = { name: 'Biggest snack', html(s) {
    const top = s.ads?.top || [];
    if (!top.length) return null;
    const [first, ...rest] = top;
    return `<div class="row fill"><div class="col" style="flex:1;justify-content:center"><div class="px">Biggest snack</div><div class="big" style="font-size:${first.name.length > 22 ? 30 : 40}px;word-break:break-all">${esc(first.name)}</div><div class="vt">${n(first.n)} bites. Crunchy.</div></div>
      <div class="col" style="flex:1;justify-content:center">${rest.map((d) => `<div class="col" style="gap:3px"><div class="row" style="justify-content:space-between;gap:8px"><span class="vt clip1" style="font-size:22px">${esc(d.name)}</span><span class="px">${n(d.n)}</span></div><div style="height:8px;background:#232326;width:${(d.n / first.n) * 100}%"></div></div>`).join('')}</div></div>`;
  } };

  // ---------------------------------------------------------------- streaks
  S.strk = { name: 'Streaks', html(s) {
    const k = s.streak;
    if (!k) return null;
    const col = ['transparent', '#f4c9b8', '#ff9a7a', '#ff5b2e'];
    return `<div class="row fill" style="gap:26px"><div class="col" style="flex:1"><div class="px">Focus streak · 25 min a day</div><div class="big" style="font-size:64px">${k.days} day${k.days === 1 ? '' : 's'}</div><div class="vt">Best: ${k.best}. Muncher is level ${k.level}.</div>
      <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap"><span class="chip ${k.level >= 1 ? 'ok' : ''}">HEADBAND</span><span class="chip ${k.crown ? 'warn' : ''}" style="${k.crown ? '' : 'opacity:.5'}">CROWN · 5-DAY STREAK</span><span class="chip ${k.shades ? 'ok' : ''}" style="${k.shades ? '' : 'opacity:.5'}">SHADES · LVL 6</span></div></div>
      <div class="col"><div class="px">Last 4 weeks</div><div style="display:grid;grid-template-columns:repeat(7,26px);gap:5px">${k.cal.map((c) => `<i style="width:26px;height:26px;border:2px solid #232326;box-sizing:border-box;background:${col[c.level]};${c.future ? 'opacity:.3;' : ''}${c.today ? 'outline:2px solid #232326;outline-offset:2px' : ''}"></i>`).join('')}</div><div class="row px" style="justify-content:space-between"><span>Mon</span><span>Sun</span></div></div></div>`;
  } };

  // ---------------------------------------------------------------- report card
  S.rpt = { name: 'Report card', html(s) {
    const r = s.report;
    if (!r) return null;
    if (!r.seen) return empty(`Week ${r.week}`, 'No report yet.', 'Muncher needs a full week with you first. Check back on Monday.');
    const rows = [['Ads eaten', n(r.ads)], ['Focus time', `${Math.floor(r.focus_min / 60)}h ${r.focus_min % 60}m`], ['Song of the week', r.song ? esc(r.song.split(' · ')[0]) : '-'], ['Bins out', `${r.bins} of ${r.bins_due || r.bins}`], ['Plants watered', n(r.plants)], ['Water', `${(r.water_ml / 1000).toFixed(1)} L`]];
    return `<div class="row fill" style="gap:22px"><div class="col" style="flex:1"><div class="px">Week ${r.week} · every Monday</div><div class="list">${rows.map(([l, v]) => `<div class="it" style="padding:4px 0"><span class="vt" style="font-size:22px">${l}</span><span class="clip1" style="font-weight:700;margin-left:auto;max-width:60%">${v}</span></div>`).join('')}</div></div>
      <div class="col" style="align-items:center;justify-content:center;width:180px"><div style="width:140px;height:140px;border:4px solid #ff5b2e;border-radius:50%;display:grid;place-items:center;transform:rotate(-10deg);color:#ff5b2e"><span class="big" style="font-size:72px">${esc(r.grade)}</span></div><span class="px" style="margin-top:10px;text-align:center">${esc(r.note)}</span></div></div>`;
  } };

  const ORDER = ['ads', 'np', 'wx', 'cal', 'focus', 'deck', 'cap', 'brk', 'home', 'door', 'bins', 'rem', 'msg', 'net', 'srv', 'pc', 'snd', 'clip', 'rep', 'snack', 'strk', 'rpt'];
  const NAMES = Object.fromEntries(ORDER.map((id) => [id, S[id].name]));

  function build(s) {
    const out = [];
    for (const id of ORDER) {
      if (s.screens && s.screens[id] === false) continue;
      let html = null;
      try { html = S[id].html(s); } catch (e) { console.warn(id, e); }
      if (html) out.push({ id, name: S[id].name, html });
    }
    return out;
  }

  window.Screens = { build, NAMES, ORDER };
})();
