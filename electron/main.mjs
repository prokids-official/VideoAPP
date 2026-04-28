import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionGet, sessionSet, sessionDelete, sessionClear } from './local-db.mjs';

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

async function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    title: 'FableGlitch Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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
