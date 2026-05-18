import { describe, expect, it } from 'vitest';
import { resolveChatProviderConfig, resolveVisionProviderConfig } from './ai-provider';

describe('resolveChatProviderConfig', () => {
  it('uses server official defaults and restricts official model choices', () => {
    expect(resolveChatProviderConfig(undefined, {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-official',
      model: 'deepseek-v4-pro',
    })).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-official',
      model: 'deepseek-v4-pro',
    });

    expect(resolveChatProviderConfig({
      mode: 'official-deepseek',
      model: 'deepseek-chat',
    }, {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-official',
      model: 'deepseek-v4-pro',
    }).model).toBe('deepseek-v4-flash');
  });

  it('allows deepseek-v4-pro for official DeepSeek', () => {
    expect(resolveChatProviderConfig({
      mode: 'official-deepseek',
      model: 'deepseek-v4-pro',
    }, {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-official',
      model: 'deepseek-v4-flash',
    }).model).toBe('deepseek-v4-pro');
  });

  it('uses caller-supplied OpenAI-compatible custom settings', () => {
    expect(resolveChatProviderConfig({
      mode: 'custom-openai-compatible',
      base_url: 'https://coding.dashscope.aliyuncs.com/v1/',
      api_key: 'sk-custom',
      model: 'qwen3.6-plus',
    }, {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-official',
      model: 'deepseek-v4-flash',
    })).toEqual({
      provider: 'custom-openai-compatible',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiKey: 'sk-custom',
      model: 'qwen3.6-plus',
    });
  });
});

describe('resolveVisionProviderConfig', () => {
  it('uses the official CodingPlan vision defaults and restricts model choices', () => {
    expect(resolveVisionProviderConfig({
      provider: 'codingplan',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiKey: 'sk-vision',
      model: 'qwen3.6-plus',
    })).toEqual({
      provider: 'codingplan',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiKey: 'sk-vision',
      model: 'qwen3.6-plus',
    });

    expect(resolveVisionProviderConfig({
      provider: 'codingplan',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1/',
      apiKey: 'sk-vision',
      model: 'deepseek-v4-pro',
    }).model).toBe('qwen3.6-plus');
  });
});
