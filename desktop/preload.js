// The bridge between the widget's pages and the app. Pages only get these calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pg', {
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  act: (name, args) => ipcRenderer.invoke('act', name, args),
  openSettings: (tab) => ipcRenderer.send('settings:open', tab),
  // settings window
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (changes) => ipcRenderer.invoke('cfg:set', changes),
  tool: (name, args) => ipcRenderer.invoke('tool', name, args),
  onTab: (fn) => ipcRenderer.on('tab', (_e, t) => fn(t)),
});
