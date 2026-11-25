// The drawer's five tabs, built from the app's state. Each tab is a grid of tiles.
// Tiles keep the old screen ids (ads, np, wx...) so "hide this" settings still apply.
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
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cap = (t) => String(t || '').toLowerCase().replace(/^./, (x) => x.toUpperCase());

  const svg = (d, size = 18, w = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    ads: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    prev: '<path d="M19 20L9 12l10-8zM5 19V5"/>',
    next: '<path d="M5 4l10 8-10 8zM19 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    door: '<path d="M5 21V3h11v18M19 21H3M12 12h.01"/>',
    thermo: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
    drop: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/>',
    motion: '<circle cx="13" cy="4" r="2"/><path d="M8 21l3-7 3 3v5M7 12l3-4 4 1 3 4"/>',
    sensor: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
    bin: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-10 16-10 0 10-4 16-10 16zM4 21c3-6 7-9 12-11"/>',
  };
  const ic = (k, size) => svg(I[k] || I.sensor, size);

  // weather, drawn soft
  const WX = {
    sun: '<circle cx="12" cy="12" r="5" fill="#f6b84a"/>',
    moon: '<path d="M16 3a8 8 0 1 0 5 13A7 7 0 0 1 16 3z" fill="#9aa8e8"/>',
    cloud: '<path d="M7 19h10a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.6A3.8 3.8 0 0 0 7 19z" fill="currentColor" opacity=".28"/>',
    part: '<circle cx="9" cy="9" r="4.5" fill="#f6b84a"/><path d="M8 20h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.4A3.4 3.4 0 0 0 8 20z" fill="currentColor" opacity=".3"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.4A3.4 3.4 0 0 0 7 15z" fill="currentColor" opacity=".3"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#4a8ff0" stroke-width="2" stroke-linecap="round"/>',
    snow: '<path d="M7 15h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.4A3.4 3.4 0 0 0 7 15z" fill="currentColor" opacity=".3"/><circle cx="8" cy="19" r="1.3" fill="#7fb4ff"/><circle cx="12" cy="21" r="1.3" fill="#7fb4ff"/><circle cx="16" cy="19" r="1.3" fill="#7fb4ff"/>',
    fog: '<path d="M4 9h16M6 13h12M4 17h16" stroke="currentColor" opacity=".4" stroke-width="2" stroke-linecap="round"/>',
    storm: '<path d="M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.4A3.4 3.4 0 0 0 7 14z" fill="currentColor" opacity=".3"/><path d="M13 14l-3 4h3l-2 4" stroke="#f6b84a" stroke-width="2" fill="none" stroke-linecap="round"/>',
  };
  const wx = (k, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${WX[k] || WX.cloud}</svg>`;

  const ring = (frac, size, stroke, inner) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--chip)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${Math.max(0, Math.min(1, frac)) * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><div class="ring-in">${inner}</div></div>`;
  };
  const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  const level = (p) => (p >= 85 ? 'bad' : p >= 60 ? 'warn' : '');
  const pill = (t, cls = '') => `<span class="pill ${cls}">${t}</span>`;
  const lbl = (t) => `<div class="lbl">${t}</div>`;
  const head = (l, right = '') => `<div class="head">${lbl(l)}${right}</div>`;

  // A tile: id (for hiding), size classes (w2..w6, h2), html
  const T = (id, cls, html) => ({ id, cls, html });

  // ================================================================ TODAY
  function today(s) {
    const out = [], d = new Date();
    const w = s.weather;
    const wxTile = `<div class="col" style="justify-content:space-between;height:100%">
      <div>${lbl(`${esc(w?.place || 'Today')} · ${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MON[d.getMonth()]}`)}<div class="clock">${hm(d)}</div></div>
      ${w ? `<div class="row" style="gap:12px">${wx(w.kind, 52)}<div><div class="num" style="font-size:38px">${deg(w.temp)}</div><div class="sub">${esc(w.desc)} · feels ${deg(w.feels)} · rain ${w.rain}%</div></div></div>
      <div class="row" style="justify-content:space-between">${w.slots.slice(0, 4).map((x) => `<div class="slot"><span class="sub">${esc(x.label)}</span>${wx(x.kind, 22)}<b>${deg(x.temp)}</b></div>`).join('')}</div>`
      : s.configured.weather ? '<div class="sub">Fetching the forecast…</div>' : '<button class="btn" data-settings="day">Add your town for weather</button>'}</div>`;
    out.push(T('wx', 'w2 h2', wxTile));

    if (s.message && Date.now() < s.message.until) {
      const m = s.message;
      out.push(T('msg', 'w4 hot', `${head(`From ${esc(m.title || 'Home Assistant')} · ${hm(m.at)}`)}<div class="title">${esc(m.text)}</div><div class="row">${btn('Got it', 'msg:clear', null, 'hot')}</div>`));
    }

    if (s.configured.calendar) {
      const c = s.calendar;
      let html;
      if (!c) html = `${lbl('Calendar')}<div class="sub">Reading your calendar…</div>`;
      else if (!c.online) html = `${lbl('Calendar')}<div class="title">Can’t see it.</div><div class="sub">${esc(cap(c.note))}. Check the link in Settings.</div>`;
      else {
        const ev = c.events.filter((e) => e.end > Date.now());
        if (!ev.length) html = `${lbl('Next two weeks')}<div class="title">All clear.</div>`;
        else {
          const [nx, ...rest] = ev;
          const mins = Math.round((nx.start - Date.now()) / 60000);
          const inTxt = mins <= 0 ? 'On now' : mins < 60 ? `In ${mins} min` : mins < 1440 ? `In ${Math.floor(mins / 60)}h ${mins % 60}m` : DAYS[new Date(nx.start).getDay()];
          const dayLbl = (t) => { const x = new Date(t); const dd = Math.round((new Date(x.toDateString()) - new Date(new Date().toDateString())) / 864e5); return dd === 0 ? 'Today' : dd === 1 ? 'Tmrw' : DAYS[x.getDay()].slice(0, 3); };
          html = `${head(`Up next · ${inTxt}`, mins > 0 && mins <= 15 ? pill('Soon', 'warn') : '')}<div class="title">${esc(nx.title)}</div><div class="sub">${nx.allDay ? 'All day' : `${hm(nx.start)} to ${hm(nx.end)}`}${nx.where ? ` · ${esc(nx.where)}` : ''}</div>
            ${rest.length ? `<div class="list">${rest.slice(0, 2).map((e) => `<div class="li"><span>${esc(e.title)}</span><span>${dayLbl(e.start)} ${e.allDay ? '' : hm(e.start)}</span></div>`).join('')}</div>` : ''}`;
        }
      }
      out.push(T('cal', 'w2', html));
    }

    const b = s.bins;
    if (b) {
      const names = b.bins.map((x) => x.name).join(' + ') + (b.bins.length > 1 ? ' bins' : /bin/i.test(b.bins[0].name) ? '' : ' bin');
      out.push(T('bins', `w2 ${b.done ? '' : 'hot'}`, `${head(b.tonight ? 'Bins tonight' : 'Bins today', pill(b.tonight ? 'Tomorrow' : 'Today', b.done ? 'good' : 'warn'))}<div class="title">${esc(names)}</div><div class="sub">${b.next ? 'Next: ' + esc(b.next) : ''}</div>
        <div>${b.done ? pill('Done, it’s out', 'good') : btn('They’re out', 'bins:done', { key: b.key }, 'hot')}</div>`));
    }

    const r = s.reminders || [];
    if (r.length) {
      out.push(T('rem', 'w2', `${lbl('Plants and pets')}<div class="list">${r.slice(0, 3).map((x) => `<div class="li act two"><span><b>${x.due ? `<i class="dot ${x.late ? 'bad' : 'warn'}"></i>` : ''}${esc(x.title)}</b><small>${esc(x.when)}</small></span>${x.due ? btn('Done', 'rem:done', { id: x.id }, 'sm') : ''}</div>`).join('')}</div>`));
    }

    const wt = s.water || { ml: 0, goal: 2000 }, m = s.activeMins || 0;
    out.push(T('brk', `w2 ${s.breakDue ? 'hot' : ''}`, `${head(s.breakDue ? 'Break' : 'At the desk', s.breakDue ? pill(`${m >= 60 ? Math.floor(m / 60) + 'h ' : ''}${m % 60}m straight`, 'warn') : `<span class="sub">${m >= 60 ? Math.floor(m / 60) + 'h ' : ''}${m % 60}m</span>`)}
      <div class="row" style="gap:10px;align-items:baseline"><span class="num" style="font-size:28px">${(wt.ml / 1000).toFixed(1)}</span><span class="sub">of ${(wt.goal / 1000).toFixed(1)} L water</span></div>${bar((wt.ml / (wt.goal || 2000)) * 100, 'blue')}
      <div class="row">${btn('+250 ml', 'water', { ml: 250 })}${s.breakDue ? btn('Stretched', 'break:done', null, 'hot') + btn('15 more min', 'break:snooze') : ''}</div>`));
    return out;
  }

  // ================================================================ ADS
  function ads(s) {
    const out = [];
    if (s.configured.ads) {
      const a = s.ads;
      let html;
      if (!a) html = `${lbl('AdGuard')}<div class="title">Waking up…</div>`;
      else if (a.note === 'BLOCKING PAUSED') html = `${head('Blocking paused', pill(`Back at ${hm(a.paused_until)}`, 'warn'))}<div class="num">On a break</div><div class="sub">Ads get through until then.</div><div class="row">${btn('Turn blocking back on', 'ads:resume', null, 'hot')}</div>`;
      else if (a.note === 'BLOCKING IS OFF') html = `${head('Blocking is off', pill(a.off_mins ? `${a.off_mins} min` : 'Off', 'bad'))}<div class="num">Starving</div><div class="sub">Nothing’s being blocked.</div><div class="row">${btn('Turn blocking on', 'ads:resume', null, 'hot')}</div>`;
      else if (!a.online) html = `${head('AdGuard', pill('Can’t reach it', 'bad'))}<div class="num">Zzz</div><div class="sub">Can’t reach AdGuard Home. Is the server on?</div>`;
      else {
        const count = a.today != null ? a.today : a.blocked;
        const hrs = a.hours || [];
        const max = Math.max(1, ...hrs);
        const W = 240, H = 54, step = W / 23;
        const pts = hrs.map((h, i) => [i * step, H - 4 - (h / max) * (H - 10)]);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const spark = pts.length > 1 ? `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Ads blocked by hour"><path d="${line} L${pts[pts.length - 1][0]} ${H} L0 ${H}Z" fill="var(--accent)" opacity=".16"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>` : '';
        html = `${head(a.mood === 'party' ? 'New record today' : 'Ads eaten today', pill('Protection on', 'good'))}<div class="num big">${n(count)}</div>
          <div class="sub">${a.percent.toFixed(1)}% of ${n(a.total)} lookups${a.best ? ` · best day ${n(a.best)}` : ''}</div>${spark}
          <div class="row">${btn('Pause 5 min', 'ads:pause', { minutes: 5 })}${btn('30 min', 'ads:pause', { minutes: 30 })}${btn('1 hour', 'ads:pause', { minutes: 60 })}</div>`;
      }
      out.push(T('ads', 'w4 h2', html));
    }
    const top = s.ads?.top || [];
    if (top.length) out.push(T('snack', 'w2 h2', `${lbl('Most eaten')}<div class="list">${top.slice(0, 5).map((d) => `<div class="li"><span>${esc(d.name)}</span><span>${n(d.n)}</span></div>${bar((d.n / top[0].n) * 100, 'thin')}`).join('')}</div>`));
    const fed = s.ads?.fed || [];
    if (s.configured.ads) out.push(T('snack', 'w3', `${lbl('Fed to Muncher')}${fed.length ? `<div class="list">${fed.slice(0, 3).map((d) => `<div class="li act"><span>${esc(d)}</span>${btn('Undo', 'unfeed', { domain: d }, 'sm')}</div>`).join('')}</div>` : '<div class="sub">Drag a link onto Muncher to block that site.</div>'}`));
    if (s.configured.network) {
      const nw = s.network || { devices: [] }, f = nw.fresh;
      out.push(T('net', `w3 ${f ? 'hot' : ''}`, f
        ? `${head(`New on your wifi · ${hm(f.at)}`, pill('New', 'warn'))}<div class="title">${esc(f.name || 'Unknown device')}</div><div class="sub">${esc(f.ip)}${f.source ? ' · seen by ' + esc(f.source) : ''}</div><div class="row">${btn('That’s mine', 'net:mine', { ip: f.ip })}${btn('Block it', 'net:block', { ip: f.ip }, 'hot')}</div>`
        : `${head('On the wifi', pill('All familiar', 'good'))}<div class="title">${nw.devices.length} devices</div><div class="sub">Muncher squints at anything new.</div>`));
    }
    return out;
  }

  // ================================================================ MUSIC
  function music(s) {
    const out = [];
    if (s.configured.spotify) {
      const t = s.track;
      if (!t) out.push(T('np', 'w6 h2', `${lbl('Spotify')}<div class="title">Quiet in here.</div><div class="sub">Nothing playing right now.</div><div class="row">${btn(ic('play', 16) + ' Play', 'spotify', { action: 'play' }, 'hot')}</div>`));
      else {
        const p = Math.min(t.duration, t.progress + (t.playing ? (Date.now() - t.at) / 1000 : 0));
        const art = t.art ? `<img class="art" src="${t.art}" alt="">` : '<div class="art"></div>';
        const ctl = t.canControl
          ? `<div class="row ctl">${btn(ic('prev'), 'spotify', { action: 'prev' }, 'round')}${btn(ic(t.playing ? 'pause' : 'play', 22), 'spotify', { action: t.playing ? 'pause' : 'play' }, 'hot round big')}${btn(ic('next'), 'spotify', { action: 'next' }, 'round')}</div>`
          : '<div class="sub">Reconnect Spotify in Settings to use the buttons.</div>';
        out.push(T('np', 'w6 h2 np', `${art}<div class="col" style="flex:1;min-width:0;justify-content:space-between;gap:10px"><div>${lbl(`${t.playing ? 'Now playing' : 'Paused'}${t.album ? ` · ${esc(t.album)}` : ''}`)}<div class="title xl">${esc(t.title)}</div><div class="sub" style="font-size:15px">${esc(t.artist)}</div></div>
          <div>${bar(t.duration ? (p / t.duration) * 100 : 0)}<div class="row sub" style="justify-content:space-between;margin-top:4px"><span>${mmss(p)}</span><span>-${mmss(Math.max(0, t.duration - p))}</span></div></div>${ctl}</div>`));
      }
    }
    if (s.configured.helper) {
      const v = s.sound;
      const slider = (label, vol, name) => `<label class="vol"><span class="li"><span>${esc(label)}</span><span>${vol}</span></span><input type="range" min="0" max="100" value="${vol}" data-vol="${esc(name)}" aria-label="${esc(label)} volume"></label>`;
      out.push(T('snd', 'w3 h2', `${head('Sound · any app', btn(v?.muted ? 'Unmute' : 'Mute', 'mute', { muted: !v?.muted }, 'sm'))}
        <div class="row ctl">${btn(ic('prev'), 'key', { key: 'prev' }, 'round')}${btn(ic('play', 16) + ic('pause', 16), 'key', { key: 'play' }, 'round')}${btn(ic('next'), 'key', { key: 'next' }, 'round')}</div>
        ${v ? slider('Everything', v.master, '') + v.sessions.slice(0, 3).map((x) => slider(x.name, x.volume, x.name)).join('') : '<div class="sub">Reading volume…</div>'}`));
    }
    const top = s.top;
    if (s.configured.spotify && top && top.tracks.length) {
      out.push(T('rep', 'w3 h2', `${head('On repeat · 4 weeks', top.artists[0] ? pill(esc(top.artists[0])) : '')}<div class="list">${top.tracks.slice(0, 5).map((x, i) => `<div class="li"><span><b class="rank">${i + 1}</b>${esc(x.title)}</span><span>${esc(x.artist)}</span></div>`).join('')}</div>`));
    }
    return out;
  }

  // ================================================================ FOCUS
  function focus(s) {
    const out = [];
    const f = s.focus, next = s.deck?.next?.title || '';
    if (!f) {
      const done = s.focusDone && Date.now() - s.focusDone.at < 5 * 60000;
      out.push(T('focus', 'w3 h2', `${head('Focus', done ? pill('Time’s up', 'good') : '')}<div class="title xl">${next ? esc(next) : 'Start a session'}</div><div class="sub">Muncher works alongside you, and gets sleepy if you wander off.</div>
        <div class="row">${[15, 25, 45, 60].map((m) => btn(`${m} min`, 'focus:start', { minutes: m, task: next || 'Focus' }, m === s.focusMinutes ? 'hot' : '')).join('')}</div>`));
    } else {
      const left = f.running && f.ends ? Math.max(0, (f.ends - Date.now()) / 1000) : f.remaining;
      out.push(T('focus', 'w3 h2 center', `${ring(f.total ? left / f.total : 0, 168, 12, `<div class="num" style="font-size:36px">${mmss(left)}</div><div class="sub">${f.running ? `of ${Math.round(f.total / 60)} min` : 'Paused'}</div>`)}
        <div class="sub" style="text-align:center">${esc(f.task)}${s.drift ? ' · Muncher saw that tab' : ''}</div><div class="row">${btn(f.running ? 'Pause' : 'Resume', 'focus:pause', null, 'hot')}${btn('Stop', 'focus:stop')}</div>`));
    }
    const d = s.deck;
    if (d) {
      const nx = d.next || {}, hab = d.habits || {}, fu = (d.jobs || {}).follow_up || {};
      out.push(T('deck', 'w3', `${head('Flight Deck', nx.mins ? `<span class="sub">${nx.mins} min</span>` : '')}<div class="title">${esc(nx.title || 'Nothing lined up.')}</div>
        <div class="row stats"><span><b>${n(d.due)}</b> due</span><span><b>${n(d.focus_min)}m</b> focus</span><span><b>${n(hab.done)}/${n(hab.total)}</b> habits</span></div>${fu.company ? `<div class="sub">Follow up: ${esc(fu.company)}${fu.role ? ' · ' + esc(fu.role) : ''}</div>` : ''}`));
    }
    const k = s.streak;
    if (k) {
      out.push(T('strk', 'w3', `${head('Focus streak', pill(`Level ${k.level}`, 'good'))}<div class="row" style="align-items:baseline;gap:8px"><span class="num" style="font-size:30px">${k.days} day${k.days === 1 ? '' : 's'}</span><span class="sub">best ${k.best}</span></div>
        <div class="cal">${k.cal.slice(-14).map((c) => `<i class="l${c.level}${c.today ? ' today' : ''}${c.future ? ' future' : ''}"></i>`).join('')}</div>`));
    }
    out.push(T('cap', 'w3 h2', s.configured.capture
      ? `${head('Quick capture', '<span class="sub">to Obsidian</span>')}<textarea class="cap" id="capText" placeholder="Type, or tap the mic and talk" aria-label="Note"></textarea>
        <div class="row">${s.configured.helper ? `<button class="btn round" data-act="dictate" aria-label="Talk instead (Windows dictation)">${ic('mic')}</button>` : ''}<button class="btn hot" style="flex:1" data-capture="note">Send to inbox</button><button class="btn" data-capture="task">As a task</button></div>`
      : `${lbl('Quick capture')}<div class="title">Notes to Obsidian</div><div class="sub">Pick your inbox note and anything you type here lands in it.</div><div class="row"><button class="btn" data-settings="desk">Pick a note</button></div>`));
    const c = s.clip || [];
    out.push(T('clip', 'w3 h2', `${head('Clipboard', '<span class="sub">memory only</span>')}${c.length ? `<div class="list">${c.map((t) => {
      const colour = /^#[0-9a-f]{6}$/i.test(t.trim());
      return `<div class="li act">${colour ? `<i class="swatch" style="background:${t.trim()}"></i>` : ''}<span>${esc(t.replace(/\s+/g, ' '))}</span>${btn(ic('copy', 15), 'clip:copy', { text: t }, 'sm')}</div>`;
    }).join('')}</div>` : '<div class="sub">Copy something and it shows up here, ready to copy again.</div>'}`));
    const r = s.report;
    if (r && r.seen) {
      out.push(T('rpt', 'w6', `<div class="row" style="gap:18px;align-items:center"><div class="grade">${esc(r.grade)}</div><div class="col" style="flex:1;min-width:0">${head(`Week ${r.week} report`, `<span class="sub">${esc(r.note)}</span>`)}
        <div class="row stats"><span><b>${n(r.ads)}</b> ads</span><span><b>${Math.floor(r.focus_min / 60)}h ${r.focus_min % 60}m</b> focus</span><span><b>${r.bins}/${r.bins_due || r.bins}</b> bins</span><span><b>${(r.water_ml / 1000).toFixed(1)} L</b> water</span>${r.song ? `<span>♫ <b>${esc(r.song.split(' · ')[0])}</b></span>` : ''}</div></div></div>`));
    }
    return out;
  }

  // ================================================================ HOME
  function home(s) {
    const out = [];
    if (s.configured.home) {
      const h = s.home;
      if (!h) out.push(T('home', 'w6', `${lbl('Home Assistant')}<div class="sub">Connecting…</div>`));
      else if (!h.items.length) out.push(T('home', 'w6', `${lbl('Home Assistant')}<div class="title">${h.online ? 'Pick some things.' : 'Can’t reach it.'}</div><div class="sub">${esc(cap(h.note))}.</div><div class="row"><button class="btn" data-settings="home">Open settings</button></div>`));
      else {
        const icon = { light: 'bulb', plug: 'plug', lock: 'lock', door: 'door', motion: 'motion', temp: 'thermo', humidity: 'drop', power: 'bolt', battery: 'bolt', climate: 'thermo', person: 'person', media: 'music' };
        for (const i of h.items) {
          out.push(T('home', `w2 ha ${i.on ? 'on' : ''}`, `<button class="hatile" ${i.toggle ? act('ha:toggle', { id: i.id }) : 'tabindex="-1" disabled'}><span class="hic">${ic(icon[i.kind] || 'sensor')}</span><span>${lbl(esc(i.label))}<b>${esc(cap(i.value))}</b></span></button>`));
        }
      }
    }
    if (s.configured.door) {
      const d = s.door, ago = d ? Math.round((Date.now() - d.at) / 60000) : 0;
      out.push(T('door', `w3 h2 ${d && ago < 5 ? 'hot' : ''}`, `${head(`Front door${d ? ` · ${ago ? ago + ' min ago' : 'just now'}` : ''}`, d && ago < 5 ? pill('Ringing', 'warn') : '')}
        ${d && d.img ? `<img class="snap" src="${d.img}" alt="Doorbell camera">` : '<div class="snap empty sub">No picture yet</div>'}
        <div class="row">${btn('Look now', 'door:refresh', null, 'hot')}${d ? btn('Dismiss', 'door:clear') : ''}</div>`));
    }
    const meters = (rows) => `<div class="meters">${rows.map(([l, v]) => `<div><div class="li"><span>${l}</span><span>${Math.round(v)}%</span></div>${bar(v, level(v))}</div>`).join('')}</div>`;
    if (s.configured.server) {
      const v = s.server;
      const tb = (gb) => (gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${Math.round(gb)} GB`);
      out.push(T('srv', 'w3', !v ? `${lbl('ZimaOS server')}<div class="sub">Checking…</div>`
        : !v.online ? `${head('ZimaOS server', pill('Down', 'bad'))}<div class="sub">Can’t reach Glances. Is the server on?</div>`
          : `${head('ZimaOS server', Math.max(v.cpu, v.ram, v.disk) >= 90 ? pill('Struggling', 'bad') : Math.max(v.cpu, v.ram, v.disk) >= 75 ? pill('Busy', 'warn') : pill('Healthy', 'good'))}
            ${meters([['CPU', v.cpu], ['RAM', v.ram], ['Disk', v.disk]])}<div class="sub">Up ${esc(v.uptime.toLowerCase())} · ${tb(v.free_gb)} free</div>`));
    }
    const p = s.pc;
    if (p) {
      const temps = [p.cpu_temp ? `CPU ${Math.round(p.cpu_temp)}°C` : '', p.gpu_temp ? `GPU ${Math.round(p.gpu_temp)}°C` : ''].filter(Boolean).join(' · ');
      out.push(T('pc', 'w3', `${head(esc(p.name || 'This PC'), p.hungry ? pill(`${esc(p.hungry)} is hungry`, 'warn') : '')}${meters([['CPU', p.cpu], ...(p.gpu != null ? [['GPU', p.gpu]] : []), ['RAM', p.ram]])}${temps ? `<div class="sub">${temps}</div>` : ''}`));
    }
    return out;
  }

  const TABS = [
    { id: 'today', name: 'Today', icon: 'today', build: today },
    { id: 'ads', name: 'Ads', icon: 'ads', build: ads },
    { id: 'music', name: 'Music', icon: 'music', build: music },
    { id: 'focus', name: 'Focus', icon: 'focus', build: focus },
    { id: 'home', name: 'Home', icon: 'home', build: home },
  ];
  // where each tile (and each nudge's old screen id) lives
  const TAB_OF = { wx: 'today', cal: 'today', msg: 'today', bins: 'today', rem: 'today', brk: 'today', ads: 'ads', snack: 'ads', net: 'ads', np: 'music', snd: 'music', rep: 'music', focus: 'focus', deck: 'focus', strk: 'focus', cap: 'focus', clip: 'focus', rpt: 'focus', home: 'home', door: 'home', srv: 'home', pc: 'home' };
  const ORDER = Object.keys(TAB_OF);
  const NAMES = { wx: 'Weather and clock', cal: 'Calendar', msg: 'Home Assistant messages', bins: 'Bins', rem: 'Plants and pets', brk: 'Breaks and water', ads: 'Ads eaten', snack: 'Most eaten', net: 'Who’s on the wifi', np: 'Now playing', snd: 'Sound', rep: 'On repeat', focus: 'Focus timer', deck: 'Flight Deck', strk: 'Streaks', cap: 'Quick capture', clip: 'Clipboard', rpt: 'Report card', home: 'Home Assistant', door: 'Doorbell', srv: 'Server health', pc: 'This PC' };

  function build(s) {
    const out = [];
    for (const t of TABS) {
      let tiles = [];
      try { tiles = t.build(s).filter((x) => !(s.screens && s.screens[x.id] === false)); } catch (e) { console.warn(t.id, e); }
      if (!tiles.length) continue;
      out.push({ id: t.id, name: t.name, icon: svg(I[t.icon], 18), html: `<div class="grid">${tiles.map((x) => `<section class="tile ${x.cls}" data-tile="${x.id}">${x.html}</section>`).join('')}</div>` });
    }
    return out;
  }

  window.Screens = { build, NAMES, ORDER, TAB_OF, icon: (k, sz) => svg(I[k], sz) };
})();
