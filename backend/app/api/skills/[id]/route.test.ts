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

describe('GET /api/skills/[id]', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await GET(new Request('http://localhost/api/skills/all-asset-master'), {
      params: Promise.resolve({ id: 'all-asset-master' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns full SKILL.md body for the selected skill', async () => {
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
        body: '# Role\nBuild asset cards.',
      },
    ]);

    const res = await GET(new Request('http://localhost/api/skills/all-asset-master'), {
      params: Promise.resolve({ id: 'all-asset-master' }),
    });

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith();
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        skill: {
          id: 'all-asset-master',
          name_cn: '全资产大师',
          category: 'asset-library',
          default_model: 'deepseek-v4-pro',
          version: 1,
          description: 'Build reusable assets.',
          body: '# Role\nBuild asset cards.',
          filename: 'SKILL.md',
        },
      },
    });
  });

  it('404s for unknown skills', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([]);

    const res = await GET(new Request('http://localhost/api/skills/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(res.status).toBe(404);
  });
});
