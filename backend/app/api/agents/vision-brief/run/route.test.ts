import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadSkillCatalog: vi.fn(),
  callOpenAICompatibleVision: vi.fn(),
  logUsage: vi.fn(),
  env: {
    AI_VISION_PROVIDER: 'codingplan',
    AI_VISION_BASE_URL: 'https://coding.dashscope.aliyuncs.com/v1',
    AI_VISION_API_KEY: 'sk-test',
    AI_VISION_MODEL: 'qwen3.6-plus',
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/skill-loader', () => ({
  loadSkillCatalog: mocks.loadSkillCatalog,
}));

vi.mock('@/lib/ai-vision', () => ({
  callOpenAICompatibleVision: mocks.callOpenAICompatibleVision,
  missingVisionProviderConfig: vi.fn(() => null),
}));

vi.mock('@/lib/usage', () => ({
  logUsage: mocks.logUsage,
}));

vi.mock('@/lib/env', () => ({
  env: mocks.env,
}));

import { POST } from './route';

describe('POST /api/agents/vision-brief/run', () => {
  it('calls the official CodingPlan vision provider and returns a text brief', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([
      {
        id: 'reference-image-briefing',
        name_cn: 'Reference Image Briefing',
        category: 'vision-context',
        default_model: 'qwen3.6-plus',
        enabled: true,
        version: 1,
        description: 'Turn image references into text context for DeepSeek agents.',
        body: '# Role\nDescribe image references as factual text for downstream DeepSeek agents.',
      },
    ]);
    mocks.callOpenAICompatibleVision.mockResolvedValueOnce({
      id: 'chatcmpl-vision',
      content: 'A red square with flat lighting and no subject detail.',
      usage: {
        promptTokens: 20,
        completionTokens: 12,
        totalTokens: 32,
      },
    });

    const res = await POST(new Request('http://localhost/api/agents/vision-brief/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'reference-image-briefing',
        input: {
          prompt: 'Only describe visible facts.',
          images: [
            {
              url: 'data:image/png;base64,abc',
              label: 'color reference',
            },
          ],
        },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith(undefined, { category: 'vision-context' });
    expect(mocks.callOpenAICompatibleVision).toHaveBeenCalledWith({
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      apiKey: 'sk-test',
      model: 'qwen3.6-plus',
      system: '# Role\nDescribe image references as factual text for downstream DeepSeek agents.',
      text: expect.stringContaining('Only describe visible facts.'),
      images: [
        {
          url: 'data:image/png;base64,abc',
        },
      ],
    });
    expect(mocks.logUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      provider: 'openai-compatible',
      model: 'qwen3.6-plus',
      action: 'chat',
      tokensInput: 20,
      tokensOutput: 12,
      requestId: 'chatcmpl-vision',
    }));
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        run: expect.objectContaining({
          status: 'completed',
          provider: 'codingplan',
          model: 'qwen3.6-plus',
          brief: 'A red square with flat lighting and no subject detail.',
        }),
      },
    });
  });
});
