export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(req.url);
  const episodeId = url.searchParams.get('episode_id');
  const typeCode = url.searchParams.get('type_code');
  const status = url.searchParams.get('status') ?? 'pushed';
  const includeWithdrawn = url.searchParams.get('include_withdrawn') === 'true';

  if (!episodeId) {
    return err('PAYLOAD_MALFORMED', 'episode_id required', undefined, 400);
  }

  let query = supabaseAdmin()
    .from('assets')
    .select(
      'id,type_code,name,variant,version,stage,language,final_filename,storage_backend,storage_ref,file_size_bytes,mime_type,author:author_id(display_name),pushed_at,status,withdrawn_at',
      { count: 'exact' },
    )
    .eq('episode_id', episodeId)
    .eq('status', status);

  if (!includeWithdrawn) {
    query = query.is('withdrawn_at', null);
  }

  if (typeCode) {
    query = query.eq('type_code', typeCode);
  }

  const { data, error, count } = await query.order('pushed_at', { ascending: false });

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  return ok({ assets: data ?? [], total: count ?? 0 });
}
