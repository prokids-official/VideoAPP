const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fableglitch', {
  db: {
    sessionGet: (key) => ipcRenderer.invoke('db:session:get', key),
    sessionSet: (key, value) => ipcRenderer.invoke('db:session:set', key, value),
    sessionDelete: (key) => ipcRenderer.invoke('db:session:delete', key),
    sessionClear: () => ipcRenderer.invoke('db:session:clear'),
    draftCreate: (draft) => ipcRenderer.invoke('db:drafts:create', draft),
    draftsList: (episodeId) => ipcRenderer.invoke('db:drafts:list', episodeId),
    draftDelete: (id) => ipcRenderer.invoke('db:drafts:delete', id),
    sandboxDraftCreate: (input) => ipcRenderer.invoke('db:sandbox-drafts:create', input),
    sandboxDraftsList: () => ipcRenderer.invoke('db:sandbox-drafts:list'),
    sandboxDraftUpdate: (id, input) => ipcRenderer.invoke('db:sandbox-drafts:update', id, input),
    sandboxDraftDelete: (id) => ipcRenderer.invoke('db:sandbox-drafts:delete', id),
    sandboxDraftsClear: () => ipcRenderer.invoke('db:sandbox-drafts:clear'),
    viewCacheGet: (assetId) => ipcRenderer.invoke('db:view-cache:get', assetId),
    viewCacheSet: (entry) => ipcRenderer.invoke('db:view-cache:set', entry),
  },
  fs: {
    saveDraftFile: (payload) => ipcRenderer.invoke('fs:draft:save', payload),
    readDraftFile: (path) => ipcRenderer.invoke('fs:draft:read', path),
    deleteDraftFile: (localDraftId) => ipcRenderer.invoke('fs:draft:delete', localDraftId),
    openFileDialog: (filters) => ipcRenderer.invoke('fs:file:open', filters),
    saveAssetFile: (payload) => ipcRenderer.invoke('fs:asset:save', payload),
    saveViewCacheFile: (payload) => ipcRenderer.invoke('fs:view-cache:save', payload),
  },
  net: {
    request: (payload) => ipcRenderer.invoke('net:request', payload),
    assetContent: (payload) => ipcRenderer.invoke('net:asset-content', payload),
    assetPush: (payload) => ipcRenderer.invoke('net:asset-push', payload),
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
