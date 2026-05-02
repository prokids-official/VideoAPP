import { beforeEach, describe, expect, it, vi } from 'vitest';

const IDEA_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectActor: vi.fn(),
  selectIdea: vi.fn(),
  selectReferences: vi.fn(),
  updateIdea: vi.fn(),
  updatePayload: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: async () => mocks.selectActor() }),
          }),
        };
      }

      if (table === 'idea_references') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => mocks.selectReferences(),
            }),
          }),
        };
      }

      if (table === 'ideas') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => mocks.selectIdea() }),
          }),
          update: (payload: unknown) => {
            mocks.updatePayload(payload);
            return {
              eq: () => ({
                select: () => ({ single: async () => mocks.updateIdea(), maybeSingle: async () => mocks.updateIdea() }),
              }),
            };
          },
        };
      }

      return {};
    },
  }),
}));

import { DELETE, GET, PATCH } from './route';

function makeReq(method = 'GET', body?: unknown) {
  return new Request(`http://localhost/api/ideas/${IDEA_ID}`, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id = IDEA_ID) {
  return { params: Promise.resolve({ id }) };
}

function ideaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDEA_ID,
    author_id: 'user-1',
    author_user: { display_name: 'Author One' },
    title: 'Original idea',
    description: 'Original description',
    status: 'pending',
    tags: [],
    created_at: '2026-05-02T10:00:00Z',
    updated_at: '2026-05-02T10:00:00Z',
    deleted_at: null,
    status_changed_at: null,
    status_changed_by: null,
    status_changed_by_user: null,
    ...overrides,
  };
}

describe('/api/ideas/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'author@beva.com' } },
      error: null,
    });
    mocks.selectActor.mockResolvedValue({
      data: { role: 'member', display_name: 'Author One' },
      error: null,
    });
    mocks.selectIdea.mockResolvedValue({ data: ideaRow(), error: null });
    mocks.updateIdea.mockResolvedValue({
      data: ideaRow({ title: 'Updated idea', updated_at: '2026-05-02T11:00:00Z' }),
      error: null,
    });
    mocks.selectReferences.mockResolvedValue({
      data: [
        {
          id: 'ref-1',
          source: 'youtube',
          url: 'https://example.com/video',
          title: 'Reference',
          thumbnail_url: null,
          added_by: 'user',
          added_at: '2026-05-02T10:30:00Z',
        },
      ],
      error: null,
    });
  });

  it('GET returns idea detail with references', async () => {
    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        idea: expect.objectContaining({
          id: IDEA_ID,
          author_id: 'user-1',
          author_name: 'Author One',
          title: 'Original idea',
          is_editable_by_me: true,
          status_changed_by_name: null,
        }),
        references: [
          {
            id: 'ref-1',
            source: 'youtube',
            url: 'https://example.com/video',
            title: 'Reference',
            thumbnail_url: null,
            added_by: 'user',
            added_at: '2026-05-02T10:30:00Z',
          },
        ],
      },
    });
  });

  it('GET returns 404 for a missing idea', async () => {
    mocks.selectIdea.mockResolvedValueOnce({ data: null, error: null });

    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(404);
    expect(mocks.selectReferences).not.toHaveBeenCalled();
  });

  it('GET returns 410 for a deleted idea', async () => {
    mocks.selectIdea.mockResolvedValueOnce({
      data: ideaRow({ deleted_at: '2026-05-02T12:00:00Z' }),
      error: null,
    });

    const res = await GET(makeReq(), ctx());

    expect(res.status).toBe(410);
  });

  it('PATCH lets the author edit title and description', async () => {
    const res = await PATCH(makeReq('PATCH', { title: 'Updated idea', description: 'Updated body' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated idea',
        description: 'Updated body',
      }),
    );
    expect((await res.json()).data.idea.title).toBe('Updated idea');
  });

  it('PATCH blocks a non-author from editing title', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-2', email: 'other@beva.com' } },
      error: null,
    });

    const res = await PATCH(makeReq('PATCH', { title: 'Stolen edit' }), ctx());

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('IDEA_NOT_PERMITTED');
    expect(mocks.updateIdea).not.toHaveBeenCalled();
  });

  it('PATCH lets admin update status and tags with status audit fields', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'admin-1', email: 'admin@beva.com' } },
      error: null,
    });
    mocks.selectActor.mockResolvedValueOnce({
      data: { role: 'admin', display_name: 'Admin One' },
      error: null,
    });

    const res = await PATCH(makeReq('PATCH', { status: 'accepted', tags: [' script ', 'script'] }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'accepted',
        tags: ['script'],
        status_changed_by: 'admin-1',
      }),
    );
    expect(mocks.updatePayload.mock.calls[0][0].status_changed_at).toEqual(expect.any(String));
  });

  it('PATCH blocks non-admin status changes', async () => {
    const res = await PATCH(makeReq('PATCH', { status: 'accepted' }), ctx());

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('IDEA_NOT_PERMITTED');
  });

  it('DELETE soft deletes the author idea', async () => {
    mocks.updateIdea.mockResolvedValueOnce({
      data: { id: IDEA_ID, deleted_at: '2026-05-02T12:00:00Z' },
      error: null,
    });

    const res = await DELETE(makeReq('DELETE'), ctx());

    expect(res.status).toBe(200);
    expect(mocks.updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_by: 'user-1',
      }),
    );
    expect(await res.json()).toEqual({
      ok: true,
      data: { id: IDEA_ID, deleted_at: '2026-05-02T12:00:00Z' },
    });
  });

  it('DELETE blocks other users', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-2', email: 'other@beva.com' } },
      error: null,
    });

    const res = await DELETE(makeReq('DELETE'), ctx());

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('IDEA_NOT_PERMITTED');
    expect(mocks.updateIdea).not.toHaveBeenCalled();
  });

  it('DELETE returns 410 when already deleted', async () => {
    mocks.selectIdea.mockResolvedValueOnce({
      data: ideaRow({ deleted_at: '2026-05-02T12:00:00Z' }),
      error: null,
    });

    const res = await DELETE(makeReq('DELETE'), ctx());

    expect(res.status).toBe(410);
  });
});
