export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

interface RawRecentEpisode {
  id: string;
  name_cn: string;
  episode_path: string;
  status: 'drafting' | 'review' | 'published' | 'archived';
  updated_at: string;
  assets?: Array<{ count: number }>;
  contents?: {
    name_cn?: string;
    albums?: {
      name_cn?: string;
      series?: {
        name_cn?: string;
      };
    };
  } | null;
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function mapEpisode(row: RawRecentEpisode) {
  return {
    id: row.id,
    name_cn: row.name_cn,
    episode_path: row.episode_path,
    status: row.status,
    updated_at: row.updated_at,
    series_name_cn: row.contents?.albums?.series?.name_cn ?? '',
    album_name_cn: row.contents?.albums?.name_cn ?? '',
    content_name_cn: row.contents?.name_cn ?? '',
    asset_count_pushed: row.assets?.[0]?.count ?? 0,
  };
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const limit = parseLimit(new URL(req.url).searchParams.get('limit'));
  const { data, error } = await supabaseAdmin()
    .from('episodes')
    .select(
      `
        id,name_cn,episode_path,status,updated_at,
        assets(count),
        contents:content_id(
          name_cn,
          albums:album_id(
            name_cn,
            series:series_id(name_cn)
          )
        )
      `,
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  return ok({ episodes: ((data ?? []) as RawRecentEpisode[]).map(mapEpisode) });
}
