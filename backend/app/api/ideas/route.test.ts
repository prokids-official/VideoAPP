import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectActor: vi.fn(),
  insertIdea: vi.fn(),
  insertPayload: vi.fn(),
  selectIdeas: vi.fn(),
  selectIdeasArgs: vi.fn(),
  eqArgs: vi.fn(),
  containsArgs: vi.fn(),
  ltArgs: vi.fn(),
  orderArgs: vi.fn(),
  limitArg: vi.fn(),
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

      if (table === 'ideas') {
        const listQuery = {
          is: () => listQuery,
          eq: (column: string, value: unknown) => {
            mocks.eqArgs(column, value);
            return listQuery;
          },
          contains: (column: string, value: unknown) => {
            mocks.containsArgs(column, value);
            return listQuery;
          },
          lt: (column: string, value: unknown) => {
            mocks.ltArgs(column, value);
            return listQuery;
          },
          order: (column: string, options: unknown) => {
            mocks.orderArgs(column, options);
            return listQuery;
          },
          limit: async (count: number) => {
            mocks.limitArg(count);
            return mocks.selectIdeas();
          },
        };

        return {
          select: (columns: string, options?: unknown) => {
            mocks.selectIdeasArgs(columns, options);
            return listQuery;
          },
          insert: (payload: unknown) => {
            mocks.insertPayload(payload);
            return {
              select: () => ({ single: async () => mocks.insertIdea() }),
            };
          },
        };
      }

      return {};
    },
  }),
}));

import { GET, POST } from './route';

function makeReq(body: unknown, token = 'token') {
  return new Request('http://localhost/api/ideas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ideas', () => {
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
    mocks.insertIdea.mockResolvedValue({
      data: {
        id: 'idea-1',
        author_id: 'user-1',
        title: 'A talking moon short',
        description: 'A quiet bedtime video idea.',
        status: 'pending',
        tags: [],
        created_at: '2026-05-02T10:00:00Z',
        updated_at: '2026-05-02T10:00:00Z',
      },
      error: null,
    });
    mocks.selectIdeas.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('401 without token', async () => {
    const res = await POST(new Request('http://localhost/api/ideas', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.insertIdea).not.toHaveBeenCalled();
  });

  it('201 creates an idea for the authenticated user', async () => {
    const res = await POST(
      makeReq({
        title: ' A talking moon short ',
        description: ' A quiet bedtime video idea. ',
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertPayload).toHaveBeenCalledWith({
      author_id: 'user-1',
      title: 'A talking moon short',
      description: 'A quiet bedtime video idea.',
      tags: [],
    });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        idea: {
          id: 'idea-1',
          author_id: 'user-1',
          author_name: 'Author One',
          title: 'A talking moon short',
          description: 'A quiet bedtime video idea.',
          status: 'pending',
          tags: [],
          created_at: '2026-05-02T10:00:00Z',
          updated_at: '2026-05-02T10:00:00Z',
        },
      },
    });
  });

  it('400 when title is too long', async () => {
    const res = await POST(
      makeReq({
        title: 'x'.repeat(121),
        description: 'Valid description',
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('IDEA_INVALID_TITLE');
    expect(mocks.insertIdea).not.toHaveBeenCalled();
  });

  it('silently ignores tags from non-admin users', async () => {
    const res = await POST(
      makeReq({
        title: 'Idea with attempted tags',
        description: 'Tags should not be accepted from a member.',
        tags: ['secret-admin-tag'],
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertPayload).toHaveBeenCalledWith({
      author_id: 'user-1',
      title: 'Idea with attempted tags',
      description: 'Tags should not be accepted from a member.',
      tags: [],
    });
  });

  it('allows admin users to create with tags', async () => {
    mocks.selectActor.mockResolvedValueOnce({
      data: { role: 'admin', display_name: 'Admin One' },
      error: null,
    });

    const res = await POST(
      makeReq({
        title: 'Admin tagged idea',
        description: 'Admin can seed tags while creating.',
        tags: ['script', 'interactive'],
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertPayload).toHaveBeenCalledWith({
      author_id: 'user-1',
      title: 'Admin tagged idea',
      description: 'Admin can seed tags while creating.',
      tags: ['script', 'interactive'],
    });
  });
});

describe('GET /api/ideas', () => {
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
    mocks.selectIdeas.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('401 without token', async () => {
    const res = await GET(new Request('http://localhost/api/ideas'));

    expect(res.status).toBe(401);
    expect(mocks.selectIdeas).not.toHaveBeenCalled();
  });

  it('lists ideas newest first with default limit and editability', async () => {
    mocks.selectIdeas.mockResolvedValueOnce({
      data: [
        {
          id: 'idea-new',
          author_id: 'user-1',
          author_user: { display_name: 'Author One' },
          title: 'Newest',
          description: 'Latest idea',
          status: 'pending',
          tags: ['script'],
          created_at: '2026-05-02T11:00:00Z',
          updated_at: '2026-05-02T11:00:00Z',
        },
        {
          id: 'idea-old',
          author_id: 'user-2',
          author_user: { display_name: 'Other User' },
          title: 'Older',
          description: 'Older idea',
          status: 'accepted',
          tags: [],
          created_at: '2026-05-02T10:00:00Z',
          updated_at: '2026-05-02T10:00:00Z',
        },
      ],
      error: null,
      count: 2,
    });

    const res = await GET(
      new Request('http://localhost/api/ideas', {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.orderArgs).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mocks.limitArg).toHaveBeenCalledWith(21);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        ideas: [
          {
            id: 'idea-new',
            author_id: 'user-1',
            author_name: 'Author One',
            title: 'Newest',
            description: 'Latest idea',
            status: 'pending',
            tags: ['script'],
            created_at: '2026-05-02T11:00:00Z',
            updated_at: '2026-05-02T11:00:00Z',
            is_editable_by_me: true,
          },
          {
            id: 'idea-old',
            author_id: 'user-2',
            author_name: 'Other User',
            title: 'Older',
            description: 'Older idea',
            status: 'accepted',
            tags: [],
            created_at: '2026-05-02T10:00:00Z',
            updated_at: '2026-05-02T10:00:00Z',
            is_editable_by_me: false,
          },
        ],
        total: 2,
        next_cursor: null,
      },
    });
  });

  it('applies status, author, tag, cursor and limit filters', async () => {
    const cursor = Buffer.from('2026-05-02T10:00:00Z').toString('base64');

    const res = await GET(
      new Request(`http://localhost/api/ideas?status=pending&author_id=me&tag=script&cursor=${cursor}&limit=999`, {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.eqArgs).toHaveBeenCalledWith('status', 'pending');
    expect(mocks.eqArgs).toHaveBeenCalledWith('author_id', 'user-1');
    expect(mocks.containsArgs).toHaveBeenCalledWith('tags', ['script']);
    expect(mocks.ltArgs).toHaveBeenCalledWith('created_at', '2026-05-02T10:00:00Z');
    expect(mocks.limitArg).toHaveBeenCalledWith(101);
  });

  it('returns next_cursor when one extra row is fetched', async () => {
    mocks.selectIdeas.mockResolvedValueOnce({
      data: [
        {
          id: 'idea-1',
          author_id: 'user-1',
          author_user: { display_name: 'Author One' },
          title: 'Visible idea',
          description: 'Visible',
          status: 'pending',
          tags: [],
          created_at: '2026-05-02T11:00:00Z',
          updated_at: '2026-05-02T11:00:00Z',
        },
        {
          id: 'idea-2',
          author_id: 'user-2',
          author_user: { display_name: 'Other User' },
          title: 'Extra idea',
          description: 'Extra',
          status: 'pending',
          tags: [],
          created_at: '2026-05-02T10:00:00Z',
          updated_at: '2026-05-02T10:00:00Z',
        },
      ],
      error: null,
      count: 2,
    });

    const res = await GET(
      new Request('http://localhost/api/ideas?limit=1', {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        ideas: [
          expect.objectContaining({
            id: 'idea-1',
            is_editable_by_me: true,
          }),
        ],
        total: 2,
        next_cursor: Buffer.from('2026-05-02T10:00:00Z').toString('base64'),
      },
    });
  });

  it('marks every idea editable for admin users', async () => {
    mocks.selectActor.mockResolvedValueOnce({
      data: { role: 'admin', display_name: 'Admin One' },
      error: null,
    });
    mocks.selectIdeas.mockResolvedValueOnce({
      data: [
        {
          id: 'idea-1',
          author_id: 'user-2',
          author_user: { display_name: 'Other User' },
          title: 'Other idea',
          description: 'Admin can edit',
          status: 'pending',
          tags: [],
          created_at: '2026-05-02T11:00:00Z',
          updated_at: '2026-05-02T11:00:00Z',
        },
      ],
      error: null,
      count: 1,
    });

    const res = await GET(
      new Request('http://localhost/api/ideas', {
        headers: { authorization: 'Bearer token' },
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data.ideas[0].is_editable_by_me).toBe(true);
  });
});
