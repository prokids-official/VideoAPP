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

describe('POST /api/agents/storyboard/run', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await POST(new Request('http://localhost/api/agents/storyboard/run', { method: 'POST' }));

    expect(res.status).toBe(401);
  });

  it('calls the configured chat provider and returns structured storyboard units', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([
      {
        id: 'storyboard-breakdown',
        name_cn: 'Storyboard Breakdown Agent',
        category: 'storyboard',
        default_model: 'deepseek-v4-pro',
        enabled: true,
        version: 1,
        description: 'Split scripts into storyboard units.',
        body: '# Role\nYou split scripts into compact storyboard units.',
      },
    ]);
    mocks.callOpenAICompatibleChat.mockResolvedValueOnce({
      id: 'chatcmpl-storyboard',
      content: JSON.stringify({
        units: [
          { number: 1, summary: 'Rain reveals the broken neon gate.', duration_s: 8 },
          { number: 2, summary: 'The mechanical girl opens her eyes.', duration_s: 10 },
        ],
      }),
      usage: {
        promptTokens: 90,
        completionTokens: 40,
        totalTokens: 130,
      },
    });

    const res = await POST(new Request('http://localhost/api/agents/storyboard/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'storyboard-breakdown',
        provider_config: {
          mode: 'official-deepseek',
          model: 'deepseek-v4-pro',
        },
        input: {
          project_name: 'Mecha Project',
          duration_sec: 90,
          style_hint: 'Cold fairytale',
          script_markdown: '# Script\n\nRain opens on a broken neon gate.',
        },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith(undefined, { category: 'storyboard' });
    expect(mocks.callOpenAICompatibleChat).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: '# Role\nYou split scripts into compact storyboard units.' },
        { role: 'user', content: expect.stringContaining('Mecha Project') },
      ],
    }));
    expect(mocks.logUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      action: 'chat',
      tokensInput: 90,
      tokensOutput: 40,
      requestId: 'chatcmpl-storyboard',
    }));
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        run: expect.objectContaining({
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          units: [
            { number: 1, summary: 'Rain reveals the broken neon gate.', duration_s: 8 },
            { number: 2, summary: 'The mechanical girl opens her eyes.', duration_s: 10 },
          ],
        }),
      },
    });
  });

  it('400s when the selected storyboard skill does not exist', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([]);

    const res = await POST(new Request('http://localhost/api/agents/storyboard/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'missing-skill',
        input: {
          project_name: 'Mecha Project',
          duration_sec: 90,
          style_hint: '',
          script_markdown: '# Script',
        },
      }),
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
  });
});
