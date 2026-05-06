import { afterEach, describe, expect, it, vi } from 'vitest';
import { callOpenAICompatibleChat, missingProviderConfig } from './ai-chat';

describe('callOpenAICompatibleChat', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts chat-completions payloads to an OpenAI-compatible base URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'chatcmpl-1',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '# Script\n\nRain opens on a broken neon gate.',
          },
        },
      ],
      usage: {
        prompt_tokens: 123,
        completion_tokens: 45,
        total_tokens: 168,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchMock as typeof fetch;

    const result = await callOpenAICompatibleChat({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Write scripts.' },
        { role: 'user', content: 'Project: Mecha' },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sk-test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Write scripts.' },
          { role: 'user', content: 'Project: Mecha' },
        ],
      }),
    });
    expect(result).toEqual({
      id: 'chatcmpl-1',
      content: '# Script\n\nRain opens on a broken neon gate.',
      usage: {
        promptTokens: 123,
        completionTokens: 45,
        totalTokens: 168,
      },
    });
  });

  it('normalizes provider errors', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'model overloaded' },
    }), { status: 503 })) as typeof fetch;

    await expect(callOpenAICompatibleChat({
      baseUrl: 'https://api.deepseek.com/v1/',
      apiKey: 'sk-test',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('AI provider error 503: model overloaded');
  });
});

describe('missingProviderConfig', () => {
  it('requires both base URL and API key', () => {
    expect(missingProviderConfig({ baseUrl: '', apiKey: 'sk', model: 'm' })).toBe('AI_CHAT_BASE_URL is not configured');
    expect(missingProviderConfig({ baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'm' })).toBe('AI_CHAT_API_KEY is not configured');
    expect(missingProviderConfig({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk', model: '' })).toBe('AI_CHAT_MODEL is not configured');
    expect(missingProviderConfig({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk', model: 'm' })).toBeNull();
  });
});
