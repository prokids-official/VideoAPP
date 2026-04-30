import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR_NAME = 'FableGlitch Studio';

export function resolveWritableAppPaths({ appDataRoot = defaultAppDataRoot(), appDirName = APP_DIR_NAME } = {}) {
  const base = path.join(appDataRoot, appDirName);
  return {
    userData: path.join(base, 'userData'),
    cache: path.join(base, 'cache'),
    logs: path.join(base, 'logs'),
  };
}

export function configureWritableAppPaths(app, options = {}) {
  const paths = resolveWritableAppPaths(options);
  for (const dir of Object.values(paths)) {
    ensureWritable(dir);
  }

  app.setPath('userData', paths.userData);
  app.setPath('cache', paths.cache);
  app.setPath('logs', paths.logs);

  return paths;
}

function defaultAppDataRoot() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function ensureWritable(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
}
