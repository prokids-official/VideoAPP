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
    AI_CHAT_MODEL: '',
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

describe('POST /api/agents/asset-library/run', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await POST(new Request('http://localhost/api/agents/asset-library/run', { method: 'POST' }));

    expect(res.status).toBe(401);
  });

  it('calls DeepSeek and returns structured character, scene, and prop assets', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([
      {
        id: 'all-asset-master',
        name_cn: '全资产大师',
        category: 'asset-library',
        default_model: 'deepseek-v4-pro',
        enabled: true,
        version: 1,
        description: 'Build reusable assets.',
        body: '# Role\nBuild an asset library.',
      },
    ]);
    mocks.callOpenAICompatibleChat.mockResolvedValueOnce({
      id: 'chatcmpl-assets',
      content: JSON.stringify({
        characters: [
          {
            name: 'Li Huowang',
            variant: 'main',
            appearance: 'thin young man with sharp eyes',
            clothing: 'dark robe',
            personality: 'restrained',
            palette: 'cold blue and red',
            visual_anchor: 'rain and glowing eyes',
            ai_prompt: 'cinematic character sheet',
          },
        ],
        scenes: [
          {
            name: 'Ruined temple',
            variant: 'night rain',
            atmosphere: 'oppressive',
            materials: 'wet wood and stone',
            landmarks: 'broken statue',
            color_temperature: 'cold blue',
            visual_anchor: 'rain on incense ash',
            ai_prompt: 'ruined temple at night',
          },
        ],
        props: [
          {
            name: 'Bronze bell',
            variant: 'clue prop',
            description: 'rusted bronze bell with carved letters',
            visual_anchor: 'rain dripping from rim',
            ai_prompt: 'ancient bronze bell prop',
          },
        ],
      }),
      usage: {
        promptTokens: 180,
        completionTokens: 90,
        totalTokens: 270,
      },
    });

    const res = await POST(new Request('http://localhost/api/agents/asset-library/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'all-asset-master',
        provider_config: {
          mode: 'official-deepseek',
          model: 'deepseek-v4-pro',
        },
        input: {
          project_name: 'Mecha Project',
          style_hint: 'Cold fairytale',
          inspiration_text: '',
          script_markdown: 'A mechanical girl wakes in rain.',
          storyboard_units: [
            { number: 1, summary: 'Rain reveals a broken temple.', duration_s: 8 },
          ],
        },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith(undefined, { category: 'asset-library' });
    expect(mocks.callOpenAICompatibleChat).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: '# Role\nBuild an asset library.' },
        { role: 'user', content: expect.stringContaining('Mecha Project') },
      ],
    }));
    expect(mocks.logUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      action: 'chat',
      tokensInput: 180,
      tokensOutput: 90,
      requestId: 'chatcmpl-assets',
    }));
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        run: expect.objectContaining({
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          assets: expect.objectContaining({
            characters: [expect.objectContaining({ name: 'Li Huowang', ai_prompt: 'cinematic character sheet' })],
            scenes: [expect.objectContaining({ name: 'Ruined temple', ai_prompt: 'ruined temple at night' })],
            props: [expect.objectContaining({ name: 'Bronze bell', ai_prompt: 'ancient bronze bell prop' })],
          }),
        }),
      },
    });
  });

  it('400s when the selected asset-library skill does not exist', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([]);

    const res = await POST(new Request('http://localhost/api/agents/asset-library/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'missing-skill',
        input: {
          project_name: 'Mecha Project',
          style_hint: '',
          inspiration_text: '',
          script_markdown: 'A mechanical girl wakes in rain.',
          storyboard_units: [],
        },
      }),
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
  });
});
