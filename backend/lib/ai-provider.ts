import type { AIProviderConfigInput, OfficialDeepSeekModel } from '../../shared/types';

export const OFFICIAL_DEEPSEEK_MODELS: OfficialDeepSeekModel[] = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
];

export interface ServerProviderDefaults {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ResolvedChatProviderConfig {
  provider: 'deepseek' | 'custom-openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function resolveChatProviderConfig(
  input: AIProviderConfigInput | undefined,
  defaults: ServerProviderDefaults,
): ResolvedChatProviderConfig {
  if (input?.mode === 'custom-openai-compatible') {
    return {
      provider: 'custom-openai-compatible',
      baseUrl: cleanBaseUrl(input.base_url ?? ''),
      apiKey: (input.api_key ?? '').trim(),
      model: input.model.trim(),
    };
  }

  return {
    provider: 'deepseek',
    baseUrl: cleanBaseUrl(defaults.baseUrl),
    apiKey: defaults.apiKey,
    model: officialDeepSeekModel(input?.model),
  };
}

export function officialDeepSeekModel(value: unknown): OfficialDeepSeekModel {
  return OFFICIAL_DEEPSEEK_MODELS.includes(value as OfficialDeepSeekModel)
    ? value as OfficialDeepSeekModel
    : 'deepseek-v4-flash';
}

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}
