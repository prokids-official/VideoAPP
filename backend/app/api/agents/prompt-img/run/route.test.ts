import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadSkillCatalog: vi.fn(),
  callOpenAICompatibleChat: vi.fn(),
  logUsage: vi.fn(),
  env: {
    AI_CHAT_PROVIDER: 'deepseek',
    AI_CHAT_BASE_URL: 'https://api.deepseek.com/v1',
    AI_CHAT_API_KEY: 'sk-test',
    AI_CHAT_MODEL: 'deepseek-v4-flash',
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/skill-loader', () => ({
  loadSkillCatalog: mocks.loadSkillCatalog,
}));

vi.mock('@/lib/ai-chat', () => ({
  callOpenAICompatibleChat: mocks.callOpenAICompatibleChat,
  missingProviderConfig: vi.fn(() => null),
}));

vi.mock('@/lib/usage', () => ({
  logUsage: mocks.logUsage,
}));

vi.mock('@/lib/env', () => ({
  env: mocks.env,
}));

import { POST } from './route';

describe('POST /api/agents/prompt-img/run', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await POST(new Request('http://localhost/api/agents/prompt-img/run', { method: 'POST' }));

    expect(res.status).toBe(401);
  });

  it('calls the configured chat provider and returns image prompts for storyboard units', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([
      {
        id: 'prompt-image-director',
        name_cn: 'Image Prompt Director',
        category: 'prompt-img',
        default_model: 'deepseek-v4-pro',
        enabled: true,
        version: 1,
        description: 'Turn storyboard units into image prompts.',
        body: '# Role\nYou write image generation prompts.',
      },
    ]);
    mocks.callOpenAICompatibleChat.mockResolvedValueOnce({
      id: 'chatcmpl-prompt-img',
      content: JSON.stringify({
        prompts: [
          {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'wide cinematic frame, rainy ruined city, neon reflections',
          },
          {
            storyboard_asset_id: 'storyboard-2',
            storyboard_number: 2,
            prompt_text: 'close-up mechanical girl opening eyes, soft blue rim light',
          },
        ],
      }),
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    });

    const res = await POST(new Request('http://localhost/api/agents/prompt-img/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'prompt-image-director',
        provider_config: {
          mode: 'official-deepseek',
          model: 'deepseek-v4-pro',
        },
        input: {
          project_name: 'Mecha Project',
          style_hint: 'Cold fairytale',
          storyboard_units: [
            {
              asset_id: 'storyboard-1',
              number: 1,
              summary: 'Rain reveals the broken neon gate.',
              duration_s: 8,
            },
            {
              asset_id: 'storyboard-2',
              number: 2,
              summary: 'The mechanical girl opens her eyes.',
              duration_s: 10,
            },
          ],
        },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith(undefined, { category: 'prompt-img' });
    expect(mocks.callOpenAICompatibleChat).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: '# Role\nYou write image generation prompts.' },
        { role: 'user', content: expect.stringContaining('Mecha Project') },
      ],
    }));
    expect(mocks.logUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      action: 'chat',
      tokensInput: 100,
      tokensOutput: 50,
      requestId: 'chatcmpl-prompt-img',
    }));
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        run: expect.objectContaining({
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          prompts: [
            {
              storyboard_asset_id: 'storyboard-1',
              storyboard_number: 1,
              prompt_text: 'wide cinematic frame, rainy ruined city, neon reflections',
            },
            {
              storyboard_asset_id: 'storyboard-2',
              storyboard_number: 2,
              prompt_text: 'close-up mechanical girl opening eyes, soft blue rim light',
            },
          ],
        }),
      },
    });
  });

  it('400s when the selected prompt-img skill does not exist', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([]);

    const res = await POST(new Request('http://localhost/api/agents/prompt-img/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'missing-skill',
        input: {
          project_name: 'Mecha Project',
          style_hint: '',
          storyboard_units: [
            {
              asset_id: 'storyboard-1',
              number: 1,
              summary: 'Rain reveals the broken neon gate.',
              duration_s: 8,
            },
          ],
        },
      }),
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
  });
});
