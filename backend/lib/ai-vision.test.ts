import { afterEach, describe, expect, it, vi } from 'vitest';
import { callOpenAICompatibleVision, missingVisionProviderConfig } from './ai-vision';

describe('callOpenAICompatibleVision', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts text plus image_url parts to an OpenAI-compatible base URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'chatcmpl-vision-1',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'A red square reference image.',
          },
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 6,
        total_tokens: 18,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchMock as typeof fetch;

    const result = await callOpenAICompatibleVision({
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiKey: 'sk-test',
      model: 'qwen3.6-plus',
      system: 'Describe reference images for downstream DeepSeek agents.',
      text: 'Summarize visual facts only.',
      images: [
        {
          url: 'data:image/png;base64,abc',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sk-test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3.6-plus',
        messages: [
          { role: 'system', content: 'Describe reference images for downstream DeepSeek agents.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Summarize visual facts only.' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ],
          },
        ],
      }),
    });
    expect(result).toEqual({
      id: 'chatcmpl-vision-1',
      content: 'A red square reference image.',
      usage: {
        promptTokens: 12,
        completionTokens: 6,
        totalTokens: 18,
      },
    });
  });
});

describe('missingVisionProviderConfig', () => {
  it('reports vision-specific environment names', () => {
    expect(missingVisionProviderConfig({ baseUrl: '', apiKey: 'sk', model: 'qwen3.6-plus' })).toBe('AI_VISION_BASE_URL is not configured');
    expect(missingVisionProviderConfig({ baseUrl: 'https://coding.dashscope.aliyuncs.com/v1', apiKey: '', model: 'qwen3.6-plus' })).toBe('AI_VISION_API_KEY is not configured');
    expect(missingVisionProviderConfig({ baseUrl: 'https://coding.dashscope.aliyuncs.com/v1', apiKey: 'sk', model: '' })).toBe('AI_VISION_MODEL is not configured');
  });
});
