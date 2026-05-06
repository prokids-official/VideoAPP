import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadSkillCatalog: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/skill-loader', () => ({
  loadSkillCatalog: mocks.loadSkillCatalog,
}));

import { GET } from './route';

describe('GET /api/skills', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await GET(new Request('http://localhost/api/skills'));

    expect(res.status).toBe(401);
  });

  it('returns enabled skill metadata without prompt bodies', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([
      {
        id: 'grim-fairy-3d',
        name_cn: '好莱坞级 3D 动画导演',
        category: 'script-writer',
        default_model: 'deepseek-v4-pro',
        enabled: true,
        version: 3,
        description: '写黑色童话短片剧本',
        body: '# Secret system prompt',
      },
    ]);

    const res = await GET(new Request('http://localhost/api/skills?category=script-writer'));

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith(undefined, { category: 'script-writer' });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        skills: [
          {
            id: 'grim-fairy-3d',
            name_cn: '好莱坞级 3D 动画导演',
            category: 'script-writer',
            default_model: 'deepseek-v4-pro',
            version: 3,
            description: '写黑色童话短片剧本',
          },
        ],
      },
    });
  });
});
