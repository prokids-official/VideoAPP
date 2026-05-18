import { describe, expect, it } from 'vitest';
import type { AIProviderConfigInput, SkillCatalogItem } from '../../shared/types';
import { providerConfigForSkill } from './ai-model-routing';

const officialSettings: AIProviderConfigInput = {
  mode: 'official-deepseek',
  model: 'deepseek-v4-flash',
};

const customSettings: AIProviderConfigInput = {
  mode: 'custom-openai-compatible',
  base_url: 'https://coding.dashscope.aliyuncs.com/v1',
  api_key: 'sk-custom',
  model: 'qwen3.6-plus',
};

function skill(defaultModel: string): Pick<SkillCatalogItem, 'default_model'> {
  return { default_model: defaultModel };
}

describe('providerConfigForSkill', () => {
  it('uses the selected skill default model for official DeepSeek routing', () => {
    expect(providerConfigForSkill(officialSettings, skill('deepseek-v4-pro'))).toEqual({
      mode: 'official-deepseek',
      model: 'deepseek-v4-pro',
    });
    expect(providerConfigForSkill(officialSettings, skill('deepseek-v4-flash'))).toEqual({
      mode: 'official-deepseek',
      model: 'deepseek-v4-flash',
    });
  });

  it('preserves custom OpenAI-compatible settings', () => {
    expect(providerConfigForSkill(customSettings, skill('deepseek-v4-pro'))).toEqual(customSettings);
  });

  it('falls back to current official model when a skill has a non-official default', () => {
    expect(providerConfigForSkill(officialSettings, skill('qwen3.6-plus'))).toEqual(officialSettings);
  });
});
