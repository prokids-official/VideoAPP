export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface AssetCountRow {
  type_code: string;
  status: string;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin()
    .from('episodes')
    .select(
      `
        id, name_cn, status, episode_path, created_at, updated_at,
        contents:content_id ( name_cn, albums:album_id ( name_cn, series:series_id ( name_cn ) ) ),
        created_by_user:created_by ( display_name )
      `,
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    return err('INTERNAL_ERROR', error?.message ?? 'not found', undefined, 404);
  }

  const { data: counts } = await supabaseAdmin()
    .from('assets')
    .select('type_code,status')
    .eq('episode_id', id);
  const countsByType: Record<string, { pushed: number; superseded: number }> = {};

  for (const asset of (counts ?? []) as AssetCountRow[]) {
    countsByType[asset.type_code] ??= { pushed: 0, superseded: 0 };

    if (asset.status === 'pushed') {
      countsByType[asset.type_code].pushed += 1;
    }

    if (asset.status === 'superseded') {
      countsByType[asset.type_code].superseded += 1;
    }
  }

  const episode = data as {
    id: string;
    name_cn: string;
    status: string;
    episode_path: string;
    created_at: string;
    updated_at: string;
    contents?: {
      name_cn?: string;
      albums?: { name_cn?: string; series?: { name_cn?: string } };
    };
    created_by_user?: { display_name?: string };
  };

  return ok({
    episode: {
      id: episode.id,
      name_cn: episode.name_cn,
      status: episode.status,
      episode_path: episode.episode_path,
      content_name: episode.contents?.name_cn,
      album_name: episode.contents?.albums?.name_cn,
      series_name: episode.contents?.albums?.series?.name_cn,
      created_by_name: episode.created_by_user?.display_name,
      created_at: episode.created_at,
      updated_at: episode.updated_at,
    },
    counts: { by_type: countsByType },
  });
}
