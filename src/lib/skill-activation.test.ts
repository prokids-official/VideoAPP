import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadActiveSkillIds, saveActiveSkillIds, toggleActiveSkillId } from './skill-activation';

describe('skill-activation', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
        db: {
          sessionGet: vi.fn(async (key: string) => store.get(key) ?? null),
          sessionSet: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
          }),
        },
      },
    });
  });

  it('loads an empty active skill list by default', async () => {
    await expect(loadActiveSkillIds()).resolves.toEqual([]);
  });

  it('deduplicates and persists active skill ids', async () => {
    await saveActiveSkillIds(['auto-script', 'auto-script', 'scene-camera']);

    await expect(loadActiveSkillIds()).resolves.toEqual(['auto-script', 'scene-camera']);
  });

  it('toggles a skill id in the active set', async () => {
    await expect(toggleActiveSkillId('auto-script')).resolves.toEqual(['auto-script']);
    await expect(toggleActiveSkillId('scene-camera')).resolves.toEqual(['auto-script', 'scene-camera']);
    await expect(toggleActiveSkillId('auto-script')).resolves.toEqual(['scene-camera']);
  });
});
