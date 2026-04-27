export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const admin = supabaseAdmin();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', auth.user_id)
    .single<{ role: string }>();

  if (me?.role !== 'admin') {
    return err('UNAUTHORIZED', 'admin only', undefined, 403);
  }

  const url = new URL(req.url);
  const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const userId = url.searchParams.get('user_id');
  let query = admin
    .from('usage_logs')
    .select('user_id,provider,action,bytes_transferred,cost_usd,model,at')
    .gte('at', since);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.order('at', { ascending: false }).limit(1000);

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  return ok({ rows: data ?? [] });
}
