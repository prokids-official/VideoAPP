import type { AIProviderConfigInput } from '../../shared/types';

const STORAGE_KEY = 'ai_provider_settings';

export const defaultAiProviderSettings: AIProviderConfigInput = {
  mode: 'official-deepseek',
  model: 'deepseek-v4-flash',
};

export async function loadAiProviderSettings(): Promise<AIProviderConfigInput> {
  try {
    const raw = await window.fableglitch.db.sessionGet(STORAGE_KEY);
    if (!raw) {
      return defaultAiProviderSettings;
    }
    return normalizeAiProviderSettings(JSON.parse(raw));
  } catch {
    return defaultAiProviderSettings;
  }
}

export async function saveAiProviderSettings(settings: AIProviderConfigInput): Promise<void> {
  await window.fableglitch.db.sessionSet(STORAGE_KEY, JSON.stringify(normalizeAiProviderSettings(settings)));
}

function normalizeAiProviderSettings(value: unknown): AIProviderConfigInput {
  if (!value || typeof value !== 'object') {
    return defaultAiProviderSettings;
  }
  const record = value as Record<string, unknown>;
  if (record.mode === 'custom-openai-compatible') {
    return {
      mode: 'custom-openai-compatible',
      base_url: stringValue(record.base_url),
      api_key: stringValue(record.api_key),
      model: stringValue(record.model) || 'qwen3.6-plus',
    };
  }
  return {
    mode: 'official-deepseek',
    model: record.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash',
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
