const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fableglitch', {
  db: {
    sessionGet: (key) => ipcRenderer.invoke('db:session:get', key),
    sessionSet: (key, value) => ipcRenderer.invoke('db:session:set', key, value),
    sessionDelete: (key) => ipcRenderer.invoke('db:session:delete', key),
    sessionClear: () => ipcRenderer.invoke('db:session:clear'),
  },
  net: {
    request: (payload) => ipcRenderer.invoke('net:request', payload),
  },
  session: {
    has: () => ipcRenderer.invoke('session:has'),
    clear: () => ipcRenderer.invoke('session:clear'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
});
