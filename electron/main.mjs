import { app, BrowserView, BrowserWindow, Menu, clipboard, ipcMain, nativeImage, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  draftCreate,
  draftDelete,
  draftsList,
  sandboxDraftCreate,
  sandboxDraftDelete,
  sandboxDraftsClear,
  sandboxDraftsList,
  sandboxDraftUpdate,
  sessionClear,
  sessionDelete,
  sessionGet,
  sessionSet,
  studioAssetDelete,
  studioAssetReadFile,
  studioAssetsList,
  studioAssetSave,
  studioAssetWriteFile,
  studioProjectCreate,
  studioProjectDelete,
  studioProjectGet,
  studioProjectsList,
  studioProjectUpdate,
  studioStageGet,
  studioStageSave,
  viewCacheGet,
  viewCacheSet,
} from './local-db.mjs';
import {
  deleteDraftFile,
  openFileDialog,
  readDraftFile,
  saveAssetFile,
  saveDraftFile,
  saveViewCacheFile,
} from './file-system.mjs';
import { apiRequest, assetContentRequest, assetPushRequest, hasSession, dropSession } from './api-client.mjs';
import { configureWritableAppPaths } from './startup-paths.mjs';
import { createLiblibCanvasController } from './liblib-canvas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPaths = configureWritableAppPaths(app);
const liblibCanvas = createLiblibCanvasController({ BrowserView, shell });

ipcMain.handle('db:session:get', (_event, key) => sessionGet(key));
ipcMain.handle('db:session:set', (_event, key, value) => {
  sessionSet(key, value);
});
ipcMain.handle('db:session:delete', (_event, key) => {
  sessionDelete(key);
});
ipcMain.handle('db:session:clear', () => {
  sessionClear();
});
ipcMain.handle('db:drafts:create', (_event, draft) => draftCreate(draft));
ipcMain.handle('db:drafts:list', (_event, episodeId) => draftsList(episodeId));
ipcMain.handle('db:drafts:delete', (_event, id) => {
  draftDelete(id);
});
ipcMain.handle('db:sandbox-drafts:create', (_event, input) => sandboxDraftCreate(input));
ipcMain.handle('db:sandbox-drafts:list', () => sandboxDraftsList());
ipcMain.handle('db:sandbox-drafts:update', (_event, id, input) => sandboxDraftUpdate(id, input));
ipcMain.handle('db:sandbox-drafts:delete', (_event, id) => {
  sandboxDraftDelete(id);
});
ipcMain.handle('db:sandbox-drafts:clear', () => {
  sandboxDraftsClear();
});
ipcMain.handle('db:view-cache:get', (_event, assetId) => viewCacheGet(assetId));
ipcMain.handle('db:view-cache:set', (_event, entry) => {
  viewCacheSet(entry);
});
ipcMain.handle('studio:project:create', (_event, input) => studioProjectCreate(input));
ipcMain.handle('studio:project:list', () => studioProjectsList());
ipcMain.handle('studio:project:get', (_event, id) => studioProjectGet(id));
ipcMain.handle('studio:project:update', (_event, id, patch) => studioProjectUpdate(id, patch));
ipcMain.handle('studio:project:delete', (_event, id) => {
  studioProjectDelete(id);
});
ipcMain.handle('studio:asset:save', (_event, input) => studioAssetSave(input));
ipcMain.handle('studio:asset:list', (_event, projectId, typeCode) => studioAssetsList(projectId, typeCode));
ipcMain.handle('studio:asset:delete', (_event, id) => {
  studioAssetDelete(id);
});
ipcMain.handle('studio:asset:writeFile', (_event, id, content) => studioAssetWriteFile(id, content));
ipcMain.handle('studio:asset:readFile', (_event, id) => studioAssetReadFile(id));
ipcMain.handle('studio:stage:save', (_event, projectId, stage, stateJson) => {
  studioStageSave(projectId, stage, stateJson);
});
ipcMain.handle('studio:stage:get', (_event, projectId, stage) => studioStageGet(projectId, stage));

ipcMain.handle('fs:draft:save', (_event, payload) => saveDraftFile(payload));
ipcMain.handle('fs:draft:read', (_event, filePath) => readDraftFile(filePath));
ipcMain.handle('fs:draft:delete', (_event, localDraftId) => deleteDraftFile(localDraftId));
ipcMain.handle('fs:file:open', (_event, filters) => openFileDialog(filters));
ipcMain.handle('fs:asset:save', (_event, payload) => saveAssetFile(payload));
ipcMain.handle('fs:view-cache:save', (_event, payload) => saveViewCacheFile(payload));
ipcMain.handle('clipboard:image:copy-from-url', (_event, payload) => copyImageFromUrl(payload));

ipcMain.handle('canvas:liblib:show', (event, input) => {
  const win = getSenderWindow(event);
  return liblibCanvas.show(win, input);
});
ipcMain.handle('canvas:liblib:setBounds', (_event, bounds) => liblibCanvas.setBounds(bounds));
ipcMain.handle('canvas:liblib:hide', () => liblibCanvas.hide());
ipcMain.handle('canvas:liblib:openExternal', (_event, url) => liblibCanvas.openExternal(url));

ipcMain.handle('net:request', (_event, payload) => apiRequest(payload));
ipcMain.handle('net:asset-content', (_event, payload) => assetContentRequest(payload));
ipcMain.handle('net:asset-push', (_event, payload) => assetPushRequest(payload));
ipcMain.handle('session:has', () => hasSession());
ipcMain.handle('session:clear', () => {
  dropSession();
});

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.handle('window:minimize', (event) => {
  getSenderWindow(event)?.minimize();
});

ipcMain.handle('window:maximize-toggle', (event) => {
  const win = getSenderWindow(event);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle('window:close', (event) => {
  getSenderWindow(event)?.close();
});

ipcMain.handle('window:is-maximized', (event) => Boolean(getSenderWindow(event)?.isMaximized()));

async function copyImageFromUrl(payload) {
  const url = typeof payload?.url === 'string' ? payload.url : '';
  if (!url) {
    throw new Error('图片地址为空');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片读取失败：HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) {
    throw new Error('图片格式无法复制');
  }

  clipboard.writeImage(image);
  return { ok: true };
}

// Resolve icon path; fall back gracefully if file missing (dev convenience)
function resolveIconPath() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  return iconPath;
}

function registerWindowDiagnostics(win) {
  win.on('unresponsive', () => {
    console.warn(`[fableglitch] renderer unresponsive at ${new Date().toISOString()}`);
  });
  win.on('responsive', () => {
    console.warn(`[fableglitch] renderer responsive again at ${new Date().toISOString()}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[fableglitch] renderer process gone', details);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[fableglitch] renderer failed load', { errorCode, errorDescription, validatedURL });
  });
}

async function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    title: 'FableGlitch Studio',
    icon: resolveIconPath(),
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  registerWindowDiagnostics(win);
  win.on('closed', () => {
    liblibCanvas.destroy();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    // DevTools no longer auto-opens. Use F12 / Ctrl+Shift+I to toggle.
    // Set FG_OPEN_DEVTOOLS=1 in env to opt back in for a session.
    if (process.env.FG_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  if (process.env.FG_CHECK_BRIDGE === '1') {
    const hasBridge = await win.webContents.executeJavaScript('Boolean(window.fableglitch?.net?.request)');
    console.log(`[fableglitch] preload bridge ${hasBridge ? 'ready' : 'missing'}`);
    if (process.env.FG_CHECK_BRIDGE_EXIT === '1') {
      app.quit();
    }
  }
}

app.whenReady().then(async () => {
  // Remove the default native menu (File / Edit / View / Window).
  // Internal tool — users don't need a Chrome-shaped menu bar.
  Menu.setApplicationMenu(null);
  console.log('[fableglitch] writable app paths', appPaths);
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
