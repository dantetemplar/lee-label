const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('benchApi', {
  getConfig: () => ipcRenderer.invoke('bench:get-config'),
  readModel: (modelId) => ipcRenderer.invoke('bench:read-model', modelId),
  vramStart: () => ipcRenderer.invoke('bench:vram-start'),
  vramStop: () => ipcRenderer.invoke('bench:vram-stop'),
  log: (msg) => ipcRenderer.invoke('bench:log', msg),
  ready: () => ipcRenderer.invoke('bench:ready')
})
