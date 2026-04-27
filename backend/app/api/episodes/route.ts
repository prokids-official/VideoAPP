export const runtime = 'nodejs';
export const maxDuration = 30;

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { composeEpisodePath, normalize } from '@/lib/filename-resolver';
import { createCommitWithFiles, GithubConflictError } from '@/lib/github';
import { putObject } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logUsage } from '@/lib/usage';

const bodySchema = z.object({
  series_name_cn: z.string().trim().min(1),
  album_name_cn: z.string().trim().min(1),
  content_name_cn: z.string().trim().min(1),
  episode_name_cn: z.string().trim().min(1),
});

const SKELETON_DIRS = [
  '01_Project',
  '02_Data/Script',
  '02_Data/Prompt/Image',
  '02_Data/Prompt/Video',
  '03_Export',
  '04_Feedback',
  '05_Deliver',
];

function r2PlaceholderDirs(episode: string): string[] {
  return [
    `02_Data/Shot/${episode}/Images`,
    `02_Data/Shot/${episode}/Videos`,
    '02_Data/Assets/Characters',
    '02_Data/Assets/Props',
    '02_Data/Assets/Scenes',
  ];
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400);
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const { series_name_cn, album_name_cn, content_name_cn, episode_name_cn } = parsed.data;
  const admin = supabaseAdmin();
  let episodePath: string;
  let episodeNormalized: string;

  try {
    episodePath = composeEpisodePath({
      series: series_name_cn,
      album: album_name_cn,
      content: content_name_cn,
    });
    episodeNormalized = normalize(episode_name_cn);
  } catch {
    return err('PAYLOAD_MALFORMED', 'Names contain only illegal characters', undefined, 400);
  }

  const { data: series, error: seriesError } = await admin
    .from('series')
    .upsert({ name_cn: series_name_cn, created_by: auth.user_id }, { onConflict: 'name_cn' })
    .select('id')
    .single();

  if (seriesError || !series) {
    return err('INTERNAL_ERROR', seriesError?.message ?? 'series upsert failed', undefined, 500);
  }

  const { data: album, error: albumError } = await admin
    .from('albums')
    .upsert(
      { series_id: series.id, name_cn: album_name_cn, created_by: auth.user_id },
      { onConflict: 'series_id,name_cn' },
    )
    .select('id')
    .single();

  if (albumError || !album) {
    return err('INTERNAL_ERROR', albumError?.message ?? 'album upsert failed', undefined, 500);
  }

  const { data: content, error: contentError } = await admin
    .from('contents')
    .upsert(
      { album_id: album.id, name_cn: content_name_cn, created_by: auth.user_id },
      { onConflict: 'album_id,name_cn' },
    )
    .select('id')
    .single();

  if (contentError || !content) {
    return err('INTERNAL_ERROR', contentError?.message ?? 'content upsert failed', undefined, 500);
  }

  const { data: episode, error: episodeError } = await admin
    .from('episodes')
    .insert({
      content_id: content.id,
      name_cn: episode_name_cn,
      episode_path: episodePath,
      created_by: auth.user_id,
    })
    .select('id,name_cn,status,episode_path,created_at')
    .single();

  if (episodeError || !episode) {
    if (episodeError?.code === '23505') {
      return err('PAYLOAD_MALFORMED', 'Episode name already exists', undefined, 409);
    }

    return err('INTERNAL_ERROR', episodeError?.message ?? 'episode insert failed', undefined, 500);
  }

  const { data: userRow } = await admin
    .from('users')
    .select('display_name')
    .eq('id', auth.user_id)
    .single();
  const displayName = userRow?.display_name ?? 'unknown';
  const readme = `# ${episode_name_cn}

- 系列：${series_name_cn}
- 专辑：${album_name_cn}
- 内容：${content_name_cn}
- 创建者：${displayName}
- 创建时间：${episode.created_at}
`;
  const skeletonFiles = [
    ...SKELETON_DIRS.map((directory) => ({
      path: `${episodePath}/${directory}/.gitkeep`,
      content: '',
    })),
    { path: `${episodePath}/README.md`, content: readme },
  ];
  let commitSha: string | null = null;

  try {
    const result = await createCommitWithFiles({
      message: `chore(${episode_name_cn}): init skeleton by ${displayName}`,
      files: skeletonFiles,
    });
    commitSha = result.commit_sha;
    await logUsage({
      userId: auth.user_id,
      provider: 'github',
      action: 'commit',
      episodeId: episode.id,
    });
  } catch (error) {
    await admin.from('episodes').delete().eq('id', episode.id);

    if (error instanceof GithubConflictError) {
      return err('INTERNAL_ERROR', 'GitHub conflict on skeleton commit; please retry', undefined, 502);
    }

    return err('INTERNAL_ERROR', `GitHub error: ${(error as Error).message}`, undefined, 502);
  }

  let r2Created = true;

  for (const dir of r2PlaceholderDirs(episodeNormalized)) {
    try {
      await putObject({
        key: `${episodePath}/${dir}/.keep`,
        body: new Uint8Array(0),
        contentType: 'application/octet-stream',
      });
      await logUsage({
        userId: auth.user_id,
        provider: 'r2',
        action: 'upload',
        bytesTransferred: 0,
        episodeId: episode.id,
      });
    } catch (error) {
      console.warn(`R2 placeholder failed for ${dir}:`, (error as Error).message);
      r2Created = false;
    }
  }

  return ok(
    {
      episode,
      github_commit_sha: commitSha,
      r2_prefix_created: r2Created,
    },
    201,
  );
}
