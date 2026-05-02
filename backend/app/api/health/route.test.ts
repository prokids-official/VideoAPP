import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabasePing: vi.fn(),
  githubGet: vi.fn(),
  r2Send: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe('users');
      return {
        select: (columns: string) => {
          expect(columns).toBe('id');
          return {
            limit: async (count: number) => {
              expect(count).toBe(1);
              return mocks.supabasePing();
            },
          };
        },
      };
    },
  }),
}));

vi.mock('@/lib/github', () => ({
  getOctokit: () => ({
    rest: {
      repos: {
        get: mocks.githubGet,
      },
    },
  }),
}));

vi.mock('@/lib/r2', () => ({
  getS3Client: () => ({
    send: mocks.r2Send,
  }),
}));

vi.mock('@/lib/env', () => ({
  env: {
    GITHUB_REPO_OWNER: 'ProKids-digital',
    GITHUB_REPO_NAME: 'asset-library',
    R2_BUCKET_NAME: 'fableglitch-assets',
  },
}));

import { GET } from './route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabasePing.mockResolvedValue({ data: [{ id: 'u-1' }], error: null });
    mocks.githubGet.mockResolvedValue({ data: { id: 1 } });
    mocks.r2Send.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('200 when Supabase, GitHub, and R2 are all reachable', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      services: {
        supabase: 'ok',
        github: 'ok',
        r2: 'ok',
      },
      latency_ms: {
        supabase: expect.any(Number),
        github: expect.any(Number),
        r2: expect.any(Number),
      },
    });
    expect(mocks.githubGet).toHaveBeenCalledWith({
      owner: 'ProKids-digital',
      repo: 'asset-library',
    });
    expect(mocks.r2Send).toHaveBeenCalledTimes(1);
  });

  it('503 when any upstream is red', async () => {
    mocks.githubGet.mockRejectedValueOnce(new Error('bad credentials'));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.services).toEqual({
      supabase: 'ok',
      github: 'error',
      r2: 'ok',
    });
    expect(body.latency_ms.github).toEqual(expect.any(Number));
  });

  it('marks an upstream red after the 1s timeout', async () => {
    vi.useFakeTimers();
    mocks.r2Send.mockImplementationOnce(() => new Promise(() => {}));

    const pending = GET();
    await vi.advanceTimersByTimeAsync(1001);
    const res = await pending;

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.services.r2).toBe('error');
    expect(body.latency_ms.r2).toBeGreaterThanOrEqual(1000);
  });
});
