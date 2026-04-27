export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RawEpisode {
  id: string;
  name_cn: string;
  status: string;
  updated_at: string;
  episode_path: string;
  assets: { count: number }[];
}

interface RawContent {
  id: string;
  name_cn: string;
  episodes: RawEpisode[];
}

interface RawAlbum {
  id: string;
  name_cn: string;
  contents: RawContent[];
}

interface RawSeries {
  id: string;
  name_cn: string;
  albums: RawAlbum[];
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { data, error } = await supabaseAdmin()
    .from('series')
    .select(
      `
        id, name_cn,
        albums (
          id, name_cn,
          contents (
            id, name_cn,
            episodes (
              id, name_cn, status, updated_at, episode_path,
              assets ( count )
            )
          )
        )
      `,
    )
    .order('name_cn');

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  const series = ((data ?? []) as RawSeries[]).map((seriesItem) => ({
    ...seriesItem,
    albums: seriesItem.albums.map((album) => ({
      ...album,
      contents: album.contents.map((content) => ({
        ...content,
        episodes: content.episodes.map((episode) => ({
          id: episode.id,
          name_cn: episode.name_cn,
          status: episode.status,
          updated_at: episode.updated_at,
          episode_path: episode.episode_path,
          asset_count_pushed: episode.assets?.[0]?.count ?? 0,
        })),
      })),
    })),
  }));

  return ok({ series });
}
