import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionGet, sessionSet, sessionDelete, sessionClear } from './local-db.mjs';
import { apiRequest, hasSession, dropSession } from './api-client.mjs';

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

ipcMain.handle('net:request', (_event, payload) => apiRequest(payload));
ipcMain.handle('session:has', () => hasSession());
ipcMain.handle('session:clear', () => {
  dropSession();
});

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
