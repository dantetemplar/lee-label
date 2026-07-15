const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sam3Api', {
  log: (msg) => ipcRenderer.invoke('sam3:log', msg),
  vramStart: () => ipcRenderer.invoke('sam3:vram-start'),
  vramStop: () => ipcRenderer.invoke('sam3:vram-stop'),
  ready: () => ipcRenderer.invoke('sam3:ready')
})
