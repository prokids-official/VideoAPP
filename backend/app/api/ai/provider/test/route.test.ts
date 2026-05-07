import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  callOpenAICompatibleChat: vi.fn(),
  env: {
    AI_CHAT_PROVIDER: 'deepseek',
    AI_CHAT_BASE_URL: 'https://api.deepseek.com/v1',
    AI_CHAT_API_KEY: 'sk-official',
    AI_CHAT_MODEL: 'deepseek-v4-flash',
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/ai-chat', () => ({
  callOpenAICompatibleChat: mocks.callOpenAICompatibleChat,
  missingProviderConfig: vi.fn(() => null),
}));

vi.mock('@/lib/env', () => ({
  env: mocks.env,
}));

import { POST } from './route';

describe('POST /api/ai/provider/test', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await POST(new Request('http://localhost/api/ai/provider/test', { method: 'POST' }));

    expect(res.status).toBe(401);
  });

  it('tests custom OpenAI-compatible provider settings without exposing the key in the response', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.callOpenAICompatibleChat.mockResolvedValueOnce({
      id: 'chatcmpl-test',
      content: 'OK',
      usage: {
        promptTokens: 8,
        completionTokens: 1,
        totalTokens: 9,
      },
    });

    const res = await POST(new Request('http://localhost/api/ai/provider/test', {
      method: 'POST',
      body: JSON.stringify({
        provider_config: {
          mode: 'custom-openai-compatible',
          base_url: 'https://coding.dashscope.aliyuncs.com/v1',
          api_key: 'sk-custom',
          model: 'qwen3.6-plus',
        },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.callOpenAICompatibleChat).toHaveBeenCalledWith({
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiKey: 'sk-custom',
      model: 'qwen3.6-plus',
      messages: [
        { role: 'system', content: 'You are a connection test endpoint. Reply with exactly OK.' },
        { role: 'user', content: 'Connection test' },
      ],
    });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        provider: 'custom-openai-compatible',
        model: 'qwen3.6-plus',
        ok: true,
        content: 'OK',
        usage: {
          promptTokens: 8,
          completionTokens: 1,
          totalTokens: 9,
        },
      },
    });
  });
});
