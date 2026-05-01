import type { NextResponse } from 'next/server';
import { err } from './api-response';
import { supabaseAdmin } from './supabase-admin';

export interface AuthedUser {
  user_id: string;
  email: string;
}

export interface AdminUser extends AuthedUser {
  role: 'admin';
}

export async function requireUser(req: Request): Promise<AuthedUser | NextResponse> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return err('UNAUTHORIZED', 'Missing or malformed Authorization header', undefined, 401);
  }

  const token = match[1] ?? '';
  const { data, error } = await supabaseAdmin().auth.getUser(token);

  if (error || !data.user) {
    return err('UNAUTHORIZED', 'Invalid or expired token', undefined, 401);
  }

  return { user_id: data.user.id, email: data.user.email ?? '' };
}

export async function requireAdmin(req: Request): Promise<AdminUser | NextResponse> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { data, error } = await supabaseAdmin()
    .from('users')
    .select('role')
    .eq('id', auth.user_id)
    .single<{ role: string }>();

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  if (data?.role !== 'admin') {
    return err('UNAUTHORIZED', 'admin only', undefined, 403);
  }

  return { ...auth, role: 'admin' };
}
