import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAiProviderSettings, loadAiProviderSettings, saveAiProviderSettings } from './ai-provider-settings';

describe('ai-provider-settings', () => {
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

  it('loads official DeepSeek defaults when no local settings exist', async () => {
    await expect(loadAiProviderSettings()).resolves.toEqual(defaultAiProviderSettings);
  });

  it('saves and loads custom OpenAI-compatible settings locally', async () => {
    await saveAiProviderSettings({
      mode: 'custom-openai-compatible',
      base_url: 'https://coding.dashscope.aliyuncs.com/v1',
      api_key: 'sk-custom',
      model: 'qwen3.6-plus',
    });

    await expect(loadAiProviderSettings()).resolves.toEqual({
      mode: 'custom-openai-compatible',
      base_url: 'https://coding.dashscope.aliyuncs.com/v1',
      api_key: 'sk-custom',
      model: 'qwen3.6-plus',
    });
  });

  it('falls back to defaults for corrupt local JSON', async () => {
    store.set('ai_provider_settings', '{');

    await expect(loadAiProviderSettings()).resolves.toEqual(defaultAiProviderSettings);
  });
});
