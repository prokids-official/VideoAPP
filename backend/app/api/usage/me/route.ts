export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface UsageRow {
  provider: string;
  action: string;
  bytes_transferred?: number | string | null;
  cost_usd?: number | string | null;
  model?: string | null;
  at: string;
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(req.url);
  const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from('usage_logs')
    .select('provider,action,bytes_transferred,cost_usd,model,at')
    .eq('user_id', auth.user_id)
    .gte('at', since)
    .order('at', { ascending: false });

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  const rows = (data ?? []) as UsageRow[];
  const totalUsd = rows.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const totalBytes = rows.reduce((sum, row) => sum + Number(row.bytes_transferred ?? 0), 0);
  const byProvider: Record<string, { usd: number; bytes: number; count: number }> = {};

  for (const row of rows) {
    byProvider[row.provider] ??= { usd: 0, bytes: 0, count: 0 };
    byProvider[row.provider].usd += Number(row.cost_usd ?? 0);
    byProvider[row.provider].bytes += Number(row.bytes_transferred ?? 0);
    byProvider[row.provider].count += 1;
  }

  return ok({
    total_usd: totalUsd,
    total_bytes: totalBytes,
    by_provider: byProvider,
    recent: rows.slice(0, 50),
  });
}
