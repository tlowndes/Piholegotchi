// Piholegotchi v2: Muncher on your touchscreen.
// One small always-on-top window holds Muncher; it grows to show a speech bubble or the panel.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, dialog, clipboard, powerMonitor, safeStorage, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { Hub } = require('./hub');
const { WinHelper } = require('./win/helper');
const { startServer } = require('./server');
const updates = require('./updates');
const { spawn } = require('child_process');
const { AdGuard } = require('./sources/adguard');
const { Glances } = require('./sources/glances');
const { HomeAssistant } = require('./sources/homeassistant');

const DEMO = process.argv.includes('--demo');
const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'renderer', 'icon.png');
const PANEL_W = 720, PANEL_H = 340, GAP = 12, BUBBLE_H = 120, BUBBLE_W = 300;

if (!app.requestSingleInstanceLock()) app.quit();

let store, hub, helper, win, settingsWin, tray, server;
let mode = 'pet';
let pet = null;          // {x, y} top-left of Muncher, in screen pixels

// ---------------------------------------------------------------- where Muncher lives
function display() {
  const all = screen.getAllDisplays();
  const id = store.get('display_id');
  return all.find((d) => d.id === id)
    || all.find((d) => d.touchSupport === 'available')
    || all.find((d) => d.id !== screen.getPrimaryDisplay().id)
    || screen.getPrimaryDisplay();
}

function petSize() {
  const s = +store.get('pet_scale') || 2;
  return { w: 140 * s, h: 100 * s };
}

function panelSize() {
  const z = +store.get('zoom') || 1;
  return { w: Math.round(PANEL_W * z), h: Math.round(PANEL_H * z) };
}

function placePet() {
  const d = display().workArea;
  const { w, h } = petSize();
  const p = store.get('pos');
  pet = p && typeof p.x === 'number'
    ? { x: d.x + p.x, y: d.y + p.y }
    : { x: d.x + d.width - w - 16, y: d.y + d.height - h - 8 };
  clampPet();
}

function clampPet() {
  const { w, h } = petSize();
  const d = screen.getDisplayNearestPoint({ x: Math.round(pet.x + w / 2), y: Math.round(pet.y + h / 2) }).workArea;
  pet.x = Math.min(Math.max(pet.x, d.x - w * 0.3), d.x + d.width - w * 0.7);
  pet.y = Math.min(Math.max(pet.y, d.y), d.y + d.height - h);
}

function bounds() {
  const { w, h } = petSize();
  const d = screen.getDisplayNearestPoint({ x: Math.round(pet.x + w / 2), y: Math.round(pet.y + h / 2) }).workArea;
  const right = pet.x + w / 2 > d.x + d.width / 2;          // Muncher on the right: things open to his left
  if (mode === 'panel') {
    const p = panelSize();
    const W = p.w + GAP + w, H = Math.max(p.h, h);
    let x = right ? pet.x + w - W : pet.x;
    let y = Math.max(d.y, pet.y + h - H);
    x = Math.min(Math.max(x, d.x), d.x + d.width - W);
    return { b: { x: Math.round(x), y: Math.round(y), width: W, height: H }, side: right ? 'left' : 'right' };
  }
  if (mode === 'bubble') {
    const W = Math.max(w, BUBBLE_W), H = h + BUBBLE_H;
    return { b: { x: Math.round(right ? pet.x + w - W : pet.x), y: Math.round(pet.y - BUBBLE_H), width: W, height: H }, side: right ? 'left' : 'right' };
  }
  return { b: { x: Math.round(pet.x), y: Math.round(pet.y), width: w, height: h }, side: right ? 'left' : 'right' };
}

function applyLayout() {
  if (!win) return;
  const { b, side } = bounds();
  win.setBounds(b);
  const { w, h } = petSize();
  const p = panelSize();
  win.webContents.send('layout', { mode, side, petW: w, petH: h, scale: +store.get('pet_scale') || 2,
    panelW: p.w, panelH: p.h, zoom: +store.get('zoom') || 1, winW: b.width, winH: b.height });
}

// ---------------------------------------------------------------- windows
function createWidget() {
  win = new BrowserWindow({
    ...bounds().b, transparent: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, backgroundColor: '#00000000', show: false,
    title: 'Piholegotchi', icon: ICON,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(ROOT, 'renderer', 'widget.html'), { query: DEMO ? { demo: '1' } : {} });
  win.once('ready-to-show', () => { applyLayout(); win.showInactive(); });
  win.webContents.on('did-finish-load', () => { applyLayout(); if (hub) hub.emit(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

function openSettings(tab) {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); if (tab) settingsWin.webContents.send('tab', tab); return; }
  const prim = screen.getPrimaryDisplay().workArea;
  settingsWin = new BrowserWindow({
    width: 940, height: 760, x: prim.x + Math.round((prim.width - 940) / 2), y: prim.y + Math.round((prim.height - 760) / 2),
    title: 'Piholegotchi settings', icon: ICON, backgroundColor: '#dedcd2', autoHideMenuBar: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile(path.join(ROOT, 'renderer', 'settings.html'), { hash: tab || '' });
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function sendState(s) {
  // JSON round trip: anything that can't cross to the window (a stray Promise, a function) is dropped,
  // instead of the whole update failing and Muncher sitting there asleep
  s = JSON.parse(JSON.stringify(s));
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s);
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Piholegotchi');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open the panel', click: () => { win.showInactive(); win.webContents.send('open', 'open'); } },
    { label: 'Settings', click: () => openSettings() },
    { label: win && win.isVisible() ? 'Hide Muncher' : 'Show Muncher', click: () => { if (win.isVisible()) win.hide(); else win.showInactive(); tray.setContextMenu(menu()); } },
    { label: 'Check for updates', click: () => openSettings('welcome') },
    { label: 'Put Muncher back in the corner', click: () => { store.set({ pos: null }); placePet(); applyLayout(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { if (!win.isVisible()) win.showInactive(); win.webContents.send('open', 'toggle'); });
}

function loginItem() {
  if (process.platform === 'win32' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!store.get('start_with_windows') });
}

// ---------------------------------------------------------------- settings window tools
async function tool(name, a = {}) {
  const c = store.cfg;
  switch (name) {
    case 'displays':
      return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `Screen ${i + 1} · ${d.size.width}×${d.size.height}${d.touchSupport === 'available' ? ' · touch' : ''}${d.id === screen.getPrimaryDisplay().id ? ' · main' : ''}`, current: d.id === display().id }));
    case 'adguard': {
      const g = new AdGuard(a.url, a.username, a.password || c.adguard_password);
      const s = await g.stats();
      if (s.note === 'ADGUARD IS DOWN') return { ok: false, message: "Can't reach AdGuard there. Check the address and login." };
      return { ok: true, message: `Connected. ${s.blocked.toLocaleString('en-GB')} ads blocked of ${s.total.toLocaleString('en-GB')} queries.` };
    }
    case 'glances': {
      const s = await new Glances(a.url).fetch();
      return s && s.online ? { ok: true, message: `Connected. CPU ${Math.round(s.cpu)}%, up ${s.uptime.toLowerCase()}.` } : { ok: false, message: "Can't reach Glances there. Try http://<server>:61208" };
    }
    case 'ha': {
      const h = new HomeAssistant(a.url, a.token || c.ha_token);
      const err = await h.check();
      if (err) return { ok: false, message: err };
      return { ok: true, message: 'Connected.', entities: await h.entities() };
    }
    case 'geocode': {
      const g = await hub.geocode(a.place);
      return g ? { ok: true, ...g } : { ok: false, message: `Couldn't find "${a.place}".` };
    }
    case 'spotify': await hub.spotify.signIn((u) => shell.openExternal(u)); return { ok: true, message: 'Spotify connected.' };
    case 'spotify:forget': store.set({ spotify_refresh: '', spotify_scope: '' }); return { ok: true };
    case 'import': {
      const r = await dialog.showOpenDialog(settingsWin, { title: 'Pick your Piholegotchi backup', filters: [{ name: 'Backup', extensions: ['json'] }], properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return { ok: false, message: '' };
      const n = store.importPi(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')));
      hub.rebuild(); hub.start && refreshAll();
      return { ok: true, message: `Imported ${n} settings from the Pi. Connect Spotify again below.` };
    }
    case 'inbox': {
      const r = await dialog.showOpenDialog(settingsWin, { title: 'Pick your Obsidian inbox note', filters: [{ name: 'Markdown', extensions: ['md'] }], properties: ['openFile', 'promptToCreate'] });
      if (r.canceled || !r.filePaths[0]) return { ok: false };
      store.set({ inbox_file: r.filePaths[0] });
      return { ok: true, path: r.filePaths[0] };
    }
    case 'ip': {
      const nets = require('os').networkInterfaces();
      const ips = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
      return { ips, port: c.api_port };
    }
    case 'party': await hub.act('ads:party'); return { ok: true };
    case 'corner': store.set({ pos: null }); placePet(); applyLayout(); return { ok: true };
    case 'open': shell.openExternal(a.url); return { ok: true };
    case 'update:check': return checkUpdates();
    case 'update:install': {
      const r = await updates.check(app.getVersion());
      if (!r.newer) return { ok: false, message: r.message };
      if (!app.isPackaged || process.platform !== 'win32') return { ok: false, message: 'Running from source: pull the repo instead.' };
      const exe = await updates.download(r.latest, app.getPath('temp'));
      // quiet install over the top, then start again; the installer waits for us to close
      spawn(exe, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 400);
      return { ok: true, message: `Installing ${r.latest.version}. Muncher will be back in a moment.` };
    }
    default: throw new Error(`Unknown tool ${name}`);
  }
}

async function checkUpdates() {
  const r = await updates.check(app.getVersion());
  hub.s.update = r.newer ? { version: r.latest.version } : null;
  hub.emit();
  return r;
}

function refreshAll() {
  hub.pollAds(); hub.pollWeather(); hub.pollServer(); hub.pollCalendar(); hub.pollHome(); hub.pollTop();
  setTimeout(() => hub.emit(), 1500);
}

// ---------------------------------------------------------------- start
app.whenReady().then(() => {
  app.setAppUserModelId('uk.co.tomlowndes.piholegotchi');
  store = new Store(path.join(app.getPath('userData'), DEMO ? 'demo' : 'data'), safeStorage);
  helper = DEMO ? { ok: false, call: async () => null, stop() {} } : new WinHelper(app.getPath('temp'));
  hub = new Hub({ store, helper, electron: { clipboard, powerMonitor, shell }, onState: sendState });
  hub.version = app.getVersion();
  placePet();
  createWidget();
  buildTray();
  loginItem();
  if (!DEMO) {
    hub.start(); server = startServer(hub, +store.get('api_port') || 8787);
    const quietCheck = () => checkUpdates().catch((e) => console.warn('update check', e.message));
    setTimeout(quietCheck, 60e3);
    setInterval(quietCheck, 6 * 3600e3);
  }
  if (!DEMO && !store.get('adguard_url') && !store.get('weather_place')) setTimeout(() => openSettings('welcome'), 1500);

  screen.on('display-removed', () => { placePet(); applyLayout(); });
  screen.on('display-metrics-changed', () => { clampPet(); applyLayout(); });
});

app.on('second-instance', () => { if (win) { win.showInactive(); win.webContents.send('open', 'open'); } });
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => { hub && hub.stop(); helper && helper.stop(); server && server.close(); });

// ---------------------------------------------------------------- messages from the pages
ipcMain.on('layout', (_e, m) => { if (['pet', 'bubble', 'panel'].includes(m) && m !== mode) { mode = m; applyLayout(); } });
ipcMain.on('drag', (_e, dx, dy) => { pet.x += dx; pet.y += dy; clampPet(); const { b } = bounds(); win.setBounds(b); });
ipcMain.on('drag:end', () => {
  const d = screen.getDisplayNearestPoint({ x: Math.round(pet.x), y: Math.round(pet.y) });
  store.set({ display_id: d.id, pos: { x: Math.round(pet.x - d.workArea.x), y: Math.round(pet.y - d.workArea.y) } });
  applyLayout();
});
ipcMain.on('settings:open', (_e, tab) => openSettings(tab));
ipcMain.handle('act', async (_e, name, args) => {
  if (DEMO) return { ok: true, demo: true };
  try { return await hub.act(name, args); } catch (e) { return { error: e.message }; }
});
ipcMain.handle('cfg:get', () => store.public());
ipcMain.handle('cfg:set', (_e, changes) => {
  const before = { ...store.cfg };
  const clean = { ...changes };
  for (const k of ['adguard_password', 'ha_token']) if (k in clean && !clean[k]) delete clean[k];   // blank keeps the saved one
  store.set(clean);
  hub.rebuild();
  if (['pet_scale', 'zoom', 'display_id'].some((k) => k in clean && clean[k] !== before[k])) {
    if ('display_id' in clean) store.set({ pos: null });
    placePet(); applyLayout();
  }
  if ('start_with_windows' in clean) loginItem();
  if ('api_port' in clean && clean.api_port !== before.api_port && server) { server.close(); server = startServer(hub, +clean.api_port || 8787); }
  refreshAll();
  return store.public();
});
ipcMain.handle('tool', async (_e, name, args) => {
  try { return await tool(name, args); } catch (e) { return { ok: false, message: e.message }; }
});
