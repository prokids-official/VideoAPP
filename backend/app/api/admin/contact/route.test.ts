import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAdmins: vi.fn(),
  selectArg: vi.fn(),
  eqArg: vi.fn(),
  orderArg: vi.fn(),
  limitArg: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe('users');
      return {
        select: (columns: string) => {
          mocks.selectArg(columns);
          return {
            eq: (column: string, value: string) => {
              mocks.eqArg(column, value);
              return {
                order: (column: string, options: unknown) => {
                  mocks.orderArg(column, options);
                  return {
                    limit: async (count: number) => {
                      mocks.limitArg(count);
                      return mocks.listAdmins();
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  }),
}));

import { GET } from './route';

describe('GET /api/admin/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns up to five admin contacts without auth', async () => {
    mocks.listAdmins.mockResolvedValueOnce({
      data: [
        { display_name: '乐美林', email: 'loy27felix@gmail.com' },
        { display_name: 'Admin Two', email: 'admin2@beva.com' },
      ],
      error: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        contacts: [
          { display_name: '乐美林', email: 'loy27felix@gmail.com' },
          { display_name: 'Admin Two', email: 'admin2@beva.com' },
        ],
      },
    });
    expect(mocks.selectArg).toHaveBeenCalledWith('display_name,email');
    expect(mocks.eqArg).toHaveBeenCalledWith('role', 'admin');
    expect(mocks.orderArg).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(mocks.limitArg).toHaveBeenCalledWith(5);
  });

  it('500 on Supabase errors', async () => {
    mocks.listAdmins.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable' },
    });

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'database unavailable',
      },
    });
  });
});
