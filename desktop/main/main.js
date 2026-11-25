// Piholegotchi v2: Muncher on your desk.
// A normal window you can put on any screen; it remembers where you left it and hides to the tray when closed.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, dialog, clipboard, powerMonitor, safeStorage, nativeImage, nativeTheme, Notification } = require('electron');
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
const HIDDEN = process.argv.includes('--hidden');     // started with Windows: wait in the tray
const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'renderer', 'icon.png');
const BASE_W = 900, BASE_H = 540, MIN_W = 620, MIN_H = 400, BAR_H = 44;

if (!app.requestSingleInstanceLock()) app.quit();

let store, hub, helper, win, settingsWin, tray, server;
let quitting = false;

// ---------------------------------------------------------------- where the window goes
function display() {
  const all = screen.getAllDisplays();
  const id = store.get('display_id');
  return all.find((d) => d.id === id)
    || all.find((d) => d.touchSupport === 'available')
    || all.find((d) => d.id !== screen.getPrimaryDisplay().id)
    || screen.getPrimaryDisplay();
}

const zoom = () => +store.get('zoom') || 1;

// centred on the chosen screen, at a comfortable size
function freshBounds() {
  const d = display().workArea, z = zoom();
  const width = Math.min(Math.round(BASE_W * z), d.width), height = Math.min(Math.round(BASE_H * z), d.height);
  return { x: d.x + Math.round((d.width - width) / 2), y: d.y + Math.round((d.height - height) / 2), width, height };
}

// the saved spot, as long as enough of it is still on a screen to grab
function onScreen(b) {
  return screen.getAllDisplays().some(({ workArea: w }) => {
    const ix = Math.min(b.x + b.width, w.x + w.width) - Math.max(b.x, w.x);
    const iy = Math.min(b.y + b.height, w.y + w.height) - Math.max(b.y, w.y);
    return ix >= 120 && iy >= 60;
  });
}

function startBounds() {
  const b = store.get('win');
  return b && [b.x, b.y, b.width, b.height].every(Number.isFinite) && onScreen(b) ? b : freshBounds();
}

function moveToScreen() {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  win.setBounds(freshBounds());
  showWin();
}

function rememberBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const b = win.getNormalBounds();
  store.set({ win: { x: b.x, y: b.y, width: b.width, height: b.height, max: win.isMaximized() } });
}

// window chrome colours follow the light or dark look
const chrome = () => (nativeTheme.shouldUseDarkColors
  ? { bg: '#1e2029', color: '#1e2029', symbolColor: '#eef0f5' }
  : { bg: '#f6f7fa', color: '#f6f7fa', symbolColor: '#1d1e24' });

function paintChrome() {
  const c = chrome();
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.setBackgroundColor(c.bg);
  if (win && !win.isDestroyed() && win.setTitleBarOverlay) {
    try { win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: Math.round(BAR_H * zoom()) }); } catch { /* not supported here */ }
  }
}

function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

// ---------------------------------------------------------------- windows
function createWidget() {
  const c = chrome();
  const b = startBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, minWidth: MIN_W, minHeight: MIN_H,
    show: false, title: 'Muncher', icon: ICON, backgroundColor: c.bg, autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: { color: c.color, symbolColor: c.symbolColor, height: Math.round(BAR_H * zoom()) },
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, zoomFactor: zoom() },
  });
  win.setAlwaysOnTop(!!store.get('on_top'));
  win.loadFile(path.join(ROOT, 'renderer', 'widget.html'), { query: DEMO ? { demo: '1' } : {} });
  win.once('ready-to-show', () => {
    if (b.max) win.maximize();
    if (!HIDDEN) win.show();
  });
  win.webContents.on('did-finish-load', () => { win.webContents.setZoomFactor(zoom()); if (hub) hub.emit(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  let t;
  const later = () => { clearTimeout(t); t = setTimeout(rememberBounds, 400); };
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize']) win.on(ev, later);
  for (const ev of ['show', 'hide', 'minimize', 'restore']) win.on(ev, () => { const open = win.isVisible() && !win.isMinimized(); hub && hub.act('panel', { open }); tray && tray.setContextMenu(trayMenu()); });
  win.on('close', (e) => {
    rememberBounds();
    if (!quitting && store.get('close_to_tray') !== false) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; if (!quitting) app.quit(); });
}

function openSettings(tab) {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); if (tab) settingsWin.webContents.send('tab', tab); return; }
  const prim = screen.getPrimaryDisplay().workArea;
  settingsWin = new BrowserWindow({
    width: 940, height: 760, x: prim.x + Math.round((prim.width - 940) / 2), y: prim.y + Math.round((prim.height - 760) / 2),
    title: 'Piholegotchi settings', icon: ICON, backgroundColor: chrome().bg, autoHideMenuBar: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile(path.join(ROOT, 'renderer', 'settings.html'), { hash: tab || '' });
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// while his window is hidden, new nudges (bins, doorbell, a break) come as Windows notifications
const seenNudges = new Set();
let firstState = true;
function notifyNudges(s) {
  const away = !win || !win.isVisible() || win.isMinimized();
  for (const n of s.nudges || []) {
    if (seenNudges.has(n.id)) continue;
    seenNudges.add(n.id);
    if (firstState || !away || DEMO || !Notification.isSupported()) continue;
    const title = n.title === n.title.toUpperCase() ? n.title.charAt(0) + n.title.slice(1).toLowerCase() : n.title;
    const note = new Notification({ title, body: n.text || '', icon: ICON });
    note.on('click', showWin);
    note.show();
  }
  firstState = false;
}

function sendState(s) {
  // JSON round trip: anything that can't cross to the window (a stray Promise, a function) is dropped,
  // instead of the whole update failing and Muncher sitting there asleep
  s = JSON.parse(JSON.stringify(s));
  notifyNudges(s);
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s);
}

function trayMenu() {
  const shown = win && win.isVisible() && !win.isMinimized();
  return Menu.buildFromTemplate([
    { label: shown ? 'Hide Muncher' : 'Show Muncher', click: () => (shown ? win.hide() : showWin()) },
    { label: 'Settings', click: () => openSettings() },
    { label: 'Check for updates', click: () => openSettings('welcome') },
    { label: 'Move him to his screen', click: moveToScreen },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Piholegotchi');
  tray.setContextMenu(trayMenu());
  tray.on('click', () => (win && win.isVisible() && !win.isMinimized() && win.isFocused() ? win.hide() : showWin()));
}

function loginItem() {
  if (process.platform === 'win32' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!store.get('start_with_windows'), args: ['--hidden'] });
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
    case 'corner': moveToScreen(); return { ok: true };
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
  nativeTheme.themeSource = ['light', 'dark'].includes(store.get('theme')) ? store.get('theme') : 'system';
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

  // a screen unplugged: bring him back to one that's there
  screen.on('display-removed', () => { if (win && !onScreen(win.getBounds())) moveToScreen(); });
  nativeTheme.on('updated', paintChrome);
});

app.on('second-instance', showWin);
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => { quitting = true; hub && hub.stop(); helper && helper.stop(); server && server.close(); });

// ---------------------------------------------------------------- messages from the pages
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
  if (win && 'zoom' in clean && clean.zoom !== before.zoom) { win.webContents.setZoomFactor(zoom()); paintChrome(); }
  if (win && 'on_top' in clean) win.setAlwaysOnTop(!!clean.on_top);
  if ('display_id' in clean && clean.display_id !== before.display_id) moveToScreen();
  if ('start_with_windows' in clean) loginItem();
  if ('theme' in clean) { nativeTheme.themeSource = ['light', 'dark'].includes(clean.theme) ? clean.theme : 'system'; paintChrome(); }
  if ('api_port' in clean && clean.api_port !== before.api_port && server) { server.close(); server = startServer(hub, +clean.api_port || 8787); }
  refreshAll();
  return store.public();
});
ipcMain.handle('tool', async (_e, name, args) => {
  try { return await tool(name, args); } catch (e) { return { ok: false, message: e.message }; }
});
