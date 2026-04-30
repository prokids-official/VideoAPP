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
import { openFileDialog, readDraftFile, saveDraftFile, saveViewCacheFile } from './file-system.mjs';
import { apiRequest, assetContentRequest, hasSession, dropSession } from './api-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
ipcMain.handle('fs:file:open', (_event, filters) => openFileDialog(filters));
ipcMain.handle('fs:view-cache:save', (_event, payload) => saveViewCacheFile(payload));

ipcMain.handle('net:request', (_event, payload) => apiRequest(payload));
ipcMain.handle('net:asset-content', (_event, payload) => assetContentRequest(payload));
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
