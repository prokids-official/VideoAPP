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

import { POST } from './route';

describe('POST /api/agents/script-writer/run', () => {
  it('requires an authenticated user', async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    const res = await POST(new Request('http://localhost/api/agents/script-writer/run', { method: 'POST' }));

    expect(res.status).toBe(401);
  });

  it('builds a dry-run script writer prompt from skill body and project context', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([
      {
        id: 'grim-fairy-3d',
        name_cn: '好莱坞级 3D 动画导演',
        category: 'script-writer',
        default_model: 'deepseek-v4-pro',
        enabled: true,
        version: 1,
        description: '写黑色童话短片剧本',
        body: '# Role\n你是顶级 AI 编剧。',
      },
    ]);

    const res = await POST(new Request('http://localhost/api/agents/script-writer/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'grim-fairy-3d',
        dry_run: true,
        input: {
          project_name: '末日机械人',
          mode: 'from-scratch',
          duration_sec: 90,
          style_hint: '黑色童话，克制冷感',
          inspiration_text: '雨夜废城里的机械少女',
          existing_script: '',
        },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.loadSkillCatalog).toHaveBeenCalledWith(undefined, { category: 'script-writer' });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        run: {
          status: 'dry-run',
          provider: 'dry-run',
          model: 'deepseek-v4-pro',
          skill: {
            id: 'grim-fairy-3d',
            name_cn: '好莱坞级 3D 动画导演',
            category: 'script-writer',
            version: 1,
          },
          messages: [
            {
              role: 'system',
              content: '# Role\n你是顶级 AI 编剧。',
            },
            {
              role: 'user',
              content: expect.stringContaining('项目名称：末日机械人'),
            },
          ],
        },
      },
    });
  });

  it('400s when the selected skill does not exist', async () => {
    mocks.requireUser.mockResolvedValueOnce({ user_id: 'u-1', email: 'a@beva.com' });
    mocks.loadSkillCatalog.mockResolvedValueOnce([]);

    const res = await POST(new Request('http://localhost/api/agents/script-writer/run', {
      method: 'POST',
      body: JSON.stringify({
        skill_id: 'missing-skill',
        dry_run: true,
        input: {
          project_name: '末日机械人',
          mode: 'from-scratch',
          duration_sec: 90,
          style_hint: '',
          inspiration_text: '雨夜废城',
        },
      }),
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAYLOAD_MALFORMED');
  });
});
