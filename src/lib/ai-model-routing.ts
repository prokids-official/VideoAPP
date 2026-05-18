import type { AIProviderConfigInput, SkillCatalogItem } from '../../shared/types';

const officialModels = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

export function providerConfigForSkill(
  settings: AIProviderConfigInput,
  skill: Pick<SkillCatalogItem, 'default_model'> | null | undefined,
): AIProviderConfigInput {
  if (settings.mode === 'custom-openai-compatible') {
    return settings;
  }

  return {
    ...settings,
    model: officialModels.has(skill?.default_model ?? '') ? skill?.default_model ?? settings.model : settings.model,
  };
}
