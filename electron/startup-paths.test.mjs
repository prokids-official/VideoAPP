import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configureWritableAppPaths, resolveWritableAppPaths } from './startup-paths.mjs';

describe('startup path configuration', () => {
  it('resolves Electron runtime paths under a normal user writable app data root', () => {
    const root = path.join('C:', 'Users', 'FELIX', 'AppData', 'Roaming');
    const paths = resolveWritableAppPaths({ appDataRoot: root });

    expect(paths.userData).toBe(path.join(root, 'FableGlitch Studio', 'userData'));
    expect(paths.cache).toBe(path.join(root, 'FableGlitch Studio', 'cache'));
    expect(paths.logs).toBe(path.join(root, 'FableGlitch Studio', 'logs'));
  });

  it('creates directories and applies them through app.setPath', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fg-startup-'));
    const calls = [];
    const fakeApp = {
      setPath(name, value) {
        calls.push([name, value]);
      },
    };

    try {
      const paths = configureWritableAppPaths(fakeApp, { appDataRoot: root });

      expect(calls).toEqual([
        ['userData', paths.userData],
        ['cache', paths.cache],
        ['logs', paths.logs],
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
