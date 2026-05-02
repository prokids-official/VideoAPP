import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  draftCreate,
  draftDelete,
  draftsList,
  sessionClear,
  sessionDelete,
  sessionGet,
  sessionSet,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPaths = configureWritableAppPaths(app);

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
ipcMain.handle('db:view-cache:get', (_event, assetId) => viewCacheGet(assetId));
ipcMain.handle('db:view-cache:set', (_event, entry) => {
  viewCacheSet(entry);
});

ipcMain.handle('fs:draft:save', (_event, payload) => saveDraftFile(payload));
ipcMain.handle('fs:draft:read', (_event, filePath) => readDraftFile(filePath));
ipcMain.handle('fs:draft:delete', (_event, localDraftId) => deleteDraftFile(localDraftId));
ipcMain.handle('fs:file:open', (_event, filters) => openFileDialog(filters));
ipcMain.handle('fs:asset:save', (_event, payload) => saveAssetFile(payload));
ipcMain.handle('fs:view-cache:save', (_event, payload) => saveViewCacheFile(payload));

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
