// Settings window: tabs, simple key/value fields, and the editors for bins, reminders and Home Assistant.
(() => {
  const pg = window.pg;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cfg = {};

  const say = (el, text, bad) => { if (!el) return; el.textContent = text || ''; el.classList.toggle('bad', !!bad); };
  const msgOf = (btn) => btn.closest('.row')?.querySelector('.msg');

  // ---------------------------------------------------------------- tabs
  function show(tab) {
    if (!$(`[data-pane="${tab}"]`)) tab = 'welcome';
    for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const p of $$('[data-pane]')) p.hidden = p.dataset.pane !== tab;
    $('main').scrollTop = 0;
  }
  for (const b of $$('#tabs button')) b.addEventListener('click', () => show(b.dataset.tab));
  pg.onTab(show);

  // ---------------------------------------------------------------- plain fields
  function fill() {
    for (const el of $$('[data-k]')) {
      const k = el.dataset.k;
      let v = cfg[k];
      if (el.type === 'password') { el.value = ''; el.placeholder = cfg[k + '_set'] ? 'Saved. Leave blank to keep it' : ''; continue; }
      if (v === undefined && el.dataset.default) v = el.dataset.default === 'true';
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = Array.isArray(v) ? v.join(', ') : (v ?? '');
    }
  }
  function read(scope) {
    const out = {};
    for (const el of $$('[data-k]', scope)) {
      if (el.readOnly) continue;
      const k = el.dataset.k;
      if (el.type === 'checkbox') out[k] = el.checked;
      else if (el.dataset.type === 'num') out[k] = +el.value;
      else out[k] = el.value.trim();
    }
    return out;
  }
  async function save(changes, msg) {
    cfg = await pg.setConfig(changes);
    fill();
    say(msg, 'Saved.');
    setTimeout(() => say(msg, ''), 3000);
  }
  for (const b of $$('[data-save]')) b.addEventListener('click', () => save(read(b.closest('.card')), msgOf(b)));
  for (const b of $$('[data-test]')) b.addEventListener('click', async () => {
    const m = msgOf(b);
    const f = read(b.closest('.card'));
    say(m, 'Checking…');
    const r = b.dataset.test === 'adguard'
      ? await pg.tool('adguard', { url: f.adguard_url, username: f.adguard_username, password: f.adguard_password })
      : await pg.tool('glances', { url: f.server_url });
    say(m, r.message, !r.ok);
  });

  // ---------------------------------------------------------------- welcome
  const LABELS = { ads: 'AdGuard', spotify: 'Spotify', weather: 'Weather', calendar: 'Calendar', home: 'Home Assistant', door: 'Doorbell', server: 'Server health', capture: 'Quick capture', network: 'New device alerts', helper: 'Windows media and sound' };
  function status(s) {
    const c = (s && s.configured) || {};
    $('#status').innerHTML = Object.entries(LABELS).map(([k, n]) => `<div><i class="${c[k] ? 'on' : ''}"></i>${esc(n)}</div>`).join('');
  }
  pg.onState(status);
  $('#import').addEventListener('click', async () => {
    const r = await pg.tool('import');
    say($('#importMsg'), r.message, !r.ok);
    if (r.ok) { cfg = await pg.getConfig(); fillAll(); }
  });

  // ---------------------------------------------------------------- muncher
  async function displays() {
    const list = await pg.tool('displays');
    $('#displays').innerHTML = (list || []).map((d) => `<option value="${d.id}" ${d.current ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
  }
  $('#corner').addEventListener('click', () => pg.tool('corner'));
  $('#party').addEventListener('click', () => pg.tool('party'));
  function screens() {
    const on = cfg.screens || {};
    $('#screens').innerHTML = Screens.ORDER.map((id) => `<label class="check"><input type="checkbox" data-scr="${id}" ${on[id] === false ? '' : 'checked'}> ${esc(Screens.NAMES[id])}</label>`).join('');
  }
  $('#saveScreens').addEventListener('click', (e) => {
    const out = {};
    for (const el of $$('[data-scr]')) if (!el.checked) out[el.dataset.scr] = false;
    save({ screens: out }, msgOf(e.currentTarget));
  });

  // ---------------------------------------------------------------- spotify
  function spotifyState() { say($('#spotifyMsg'), cfg.spotify_refresh_set ? 'Connected.' : 'Not connected.'); }
  $('#spotify').addEventListener('click', async () => {
    const id = $('[data-k="spotify_client_id"]').value.trim();
    if (!id) return say($('#spotifyMsg'), 'Paste the Client ID first.', true);
    cfg = await pg.setConfig({ spotify_client_id: id });
    say($('#spotifyMsg'), 'Finish signing in in your browser…');
    const r = await pg.tool('spotify');
    cfg = await pg.getConfig();
    say($('#spotifyMsg'), r.message, !r.ok);
  });
  $('#spotifyForget').addEventListener('click', async () => { await pg.tool('spotify:forget'); cfg = await pg.getConfig(); spotifyState(); });

  // ---------------------------------------------------------------- home assistant
  let ents = [];
  const picked = new Map();   // id -> label
  function haList() {
    const q = $('#haFilter').value.trim().toLowerCase();
    const rows = ents.filter((e) => !q || e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)).slice(0, 200);
    $('#haList').innerHTML = rows.map((e) => `<div class="e"><input type="checkbox" data-id="${esc(e.id)}" ${picked.has(e.id) ? 'checked' : ''}>
      <div>${esc(e.name)}<small>${esc(e.id)} · ${esc(e.value)}</small></div>
      <input type="text" data-label="${esc(e.id)}" placeholder="Short label" value="${esc(picked.get(e.id) ?? '')}" ${picked.has(e.id) ? '' : 'disabled'}></div>`).join('') || '<div class="e"><span></span><div>Nothing matches.</div></div>';
  }
  $('#haList').addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.checked) {
      if (picked.size >= 5) { e.target.checked = false; return say(msgOf($('#haSave')), 'Five is the most the Home screen fits.', true); }
      picked.set(id, '');
    } else picked.delete(id);
    haList();
  });
  $('#haList').addEventListener('input', (e) => { const id = e.target.dataset.label; if (id && picked.has(id)) picked.set(id, e.target.value); });
  $('#haFilter').addEventListener('input', haList);
  function haSelects() {
    const opt = (list, cur) => '<option value="">None</option>' + list.map((e) => `<option value="${esc(e.id)}" ${e.id === cur ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
    $('#haDoorbell').innerHTML = opt(ents.filter((e) => /^binary_sensor\./.test(e.id)), cfg.ha_doorbell);
    $('#haCamera').innerHTML = opt(ents.filter((e) => /^camera\./.test(e.id)), cfg.ha_camera);
  }
  $('#haConnect').addEventListener('click', async () => {
    const url = $('[data-k="ha_url"]').value.trim();
    const token = $('[data-k="ha_token"]').value.trim();
    say($('#haMsg'), 'Connecting…');
    const r = await pg.tool('ha', { url, token });
    say($('#haMsg'), r.message, !r.ok);
    if (!r.ok) return;
    cfg = await pg.setConfig({ ha_url: url, ...(token ? { ha_token: token } : {}) });
    ents = r.entities || [];
    picked.clear();
    for (const p of cfg.ha_entities || []) picked.set(p.id, p.label || '');
    $('#haPick').hidden = false;
    haList(); haSelects();
  });
  $('#haSave').addEventListener('click', (e) => save({
    ha_entities: [...picked].map(([id, label]) => ({ id, label: label.trim() })),
    ha_doorbell: $('#haDoorbell').value, ha_camera: $('#haCamera').value,
  }, msgOf(e.currentTarget)));

  // ---------------------------------------------------------------- weather
  $('#findPlace').addEventListener('click', async () => {
    const place = $('#place').value.trim();
    if (!place) return;
    say($('#placeMsg'), 'Looking…');
    const r = await pg.tool('geocode', { place });
    if (!r.ok) return say($('#placeMsg'), r.message, true);
    cfg = await pg.setConfig({ weather_place: place, weather_name: r.name, weather_lat: r.lat, weather_lon: r.lon });
    $('#place').value = r.name;
    say($('#placeMsg'), `Saved: ${r.name}.`);
  });

  // ---------------------------------------------------------------- bins and reminders
  const today = () => new Date().toISOString().slice(0, 10);
  const field = (lab, html) => `<label>${lab}${html}</label>`;
  const x = '<button class="x" data-del aria-label="Remove">X</button>';
  function binRow(b = {}) {
    return `<div class="r" style="grid-template-columns:1fr 1fr 148px 96px 38px">
      ${field('Bin', `<input data-f="name" value="${esc(b.name)}" placeholder="Black">`)}
      ${field('What goes in', `<input data-f="label" value="${esc(b.label)}" placeholder="General waste">`)}
      ${field('Next collection', `<input type="date" data-f="next" value="${esc(b.next || today())}">`)}
      ${field('Every', `<select data-f="every">${[1, 2, 3, 4].map((w) => `<option value="${w}" ${+(b.every || 1) === w ? 'selected' : ''}>${w} week${w > 1 ? 's' : ''}</option>`).join('')}</select>`)}${x}</div>`;
  }
  function remRow(r = {}) {
    return `<div class="r" data-id="${esc(r.id || Math.random().toString(36).slice(2, 8))}" data-last="${esc(r.last || '')}" style="grid-template-columns:1fr 96px 100px 96px 38px">
      ${field('What', `<input data-f="title" value="${esc(r.title)}" placeholder="Water the monstera">`)}
      ${field('Kind', `<select data-f="kind">${['plant', 'pet', 'other'].map((k) => `<option value="${k}" ${(r.kind || 'plant') === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>`)}
      ${field('Every', `<select data-f="every">${[1, 2, 3, 4, 5, 7, 10, 14, 21, 28, 30].map((d) => `<option value="${d}" ${+(r.every || 7) === d ? 'selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`).join('')}</select>`)}
      ${field('At', `<input type="time" data-f="at" value="${esc(r.at || '08:00')}">`)}${x}</div>`;
  }
  const rowsOf = (box) => $$('.r', box).map((row) => Object.fromEntries($$('[data-f]', row).map((el) => [el.dataset.f, el.tagName === 'SELECT' ? +el.value || el.value : el.value.trim()])));
  for (const box of [$('#bins'), $('#rems')]) box.addEventListener('click', (e) => { if (e.target.closest('[data-del]')) e.target.closest('.r').remove(); });
  $('#addBin').addEventListener('click', () => $('#bins').insertAdjacentHTML('beforeend', binRow()));
  $('#addRem').addEventListener('click', () => $('#rems').insertAdjacentHTML('beforeend', remRow()));
  $('#saveBins').addEventListener('click', (e) => save({ bins: rowsOf($('#bins')).filter((b) => b.name) }, msgOf(e.currentTarget)));
  $('#saveRems').addEventListener('click', (e) => {
    const rows = $$('.r', $('#rems'));
    const items = rowsOf($('#rems')).map((r, i) => ({ id: rows[i].dataset.id, ...r, ...(rows[i].dataset.last ? { last: rows[i].dataset.last } : {}) })).filter((r) => r.title);
    save({ reminders: items }, msgOf(e.currentTarget));
  });

  // ---------------------------------------------------------------- desk
  $('#pickInbox').addEventListener('click', async () => { const r = await pg.tool('inbox'); if (r.ok) { cfg = await pg.getConfig(); fill(); } });
  async function addrs() {
    const r = await pg.tool('ip');
    const ips = r.ips && r.ips.length ? r.ips : ['localhost'];
    $('#addrs').innerHTML = ips.map((ip) => `<li>http://${esc(ip)}:${r.port}/api/deck</li>`).join('')
      + `<li>http://${esc(ips[0])}:${r.port}/api/message</li><li>http://${esc(ips[0])}:${r.port}/api/doorbell</li>`;
  }

  // ---------------------------------------------------------------- logo
  const logo = $('#logo');
  let f = 0;
  setInterval(() => { Muncher.draw(logo, { mood: f % 40 < 3 ? 'stuffed' : 'content', eating: f % 40 > 30 }, f++); }, 250);

  // ---------------------------------------------------------------- start
  function fillAll() {
    fill(); screens(); spotifyState();
    $('#place').value = cfg.weather_name || cfg.weather_place || '';
    $('#bins').innerHTML = (cfg.bins || []).map(binRow).join('');
    $('#rems').innerHTML = (cfg.reminders || []).map(remRow).join('');
  }
  (async () => {
    cfg = await pg.getConfig();
    fillAll();
    show(location.hash.slice(1) || 'welcome');
    displays(); addrs();
    if (cfg.ha_url && cfg.ha_token_set) $('#haConnect').click();
  })();
})();
