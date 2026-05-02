export const runtime = 'nodejs';
export const maxDuration = 30;

import { err } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { getBlobContent } from '@/lib/github';
import { getPresignedDownloadUrl } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logUsage } from '@/lib/usage';

interface AssetRow {
  id: string;
  storage_backend: 'github' | 'r2';
  storage_ref: string;
  storage_metadata?: {
    commit_sha?: string;
    blob_sha?: string;
  } | null;
  mime_type?: string | null;
  episode_id?: string | null;
  file_size_bytes?: number | null;
  withdrawn_at?: string | null;
  push_id?: string | null;
}

interface ActorRow {
  role: string | null;
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
  const includeWithdrawn = new URL(req.url).searchParams.get('include_withdrawn') === 'true';
  const { data: asset, error } = await supabaseAdmin()
    .from('assets')
    .select(
      'id,storage_backend,storage_ref,storage_metadata,mime_type,episode_id,file_size_bytes,withdrawn_at,push_id',
    )
    .eq('id', id)
    .single<AssetRow>();

  if (error || !asset) {
    return err('PAYLOAD_MALFORMED', 'asset not found', undefined, 404);
  }

  if (asset.withdrawn_at) {
    let canIncludeWithdrawn = false;

    if (includeWithdrawn) {
      const { data: actor } = await supabaseAdmin()
        .from('users')
        .select('role')
        .eq('auth_user_id', auth.user_id)
        .single<ActorRow>();
      canIncludeWithdrawn = actor?.role === 'admin';
    }

    if (!canIncludeWithdrawn) {
      return Response.json(
        {
          error: {
            code: 'ASSET_WITHDRAWN',
            message: '该资产已撤回',
            details: {
              withdrawn_at: asset.withdrawn_at,
              push_id: asset.push_id,
            },
          },
        },
        { status: 410 },
      );
    }
  }

  if (asset.storage_backend === 'github') {
    const blobSha = asset.storage_metadata?.blob_sha;

    if (!blobSha) {
      return err('INTERNAL_ERROR', 'blob_sha not recorded', undefined, 500);
    }

    const content = await getBlobContent(blobSha);
    await logUsage({
      userId: auth.user_id,
      provider: 'github',
      action: 'download',
      episodeId: asset.episode_id ?? undefined,
      bytesTransferred: asset.file_size_bytes ?? 0,
    });

    return new Response(content, {
      status: 200,
      headers: { 'content-type': asset.mime_type ?? 'text/markdown; charset=utf-8' },
    });
  }

  const url = await getPresignedDownloadUrl({ key: asset.storage_ref, ttlSec: 900 });
  await logUsage({
    userId: auth.user_id,
    provider: 'r2',
    action: 'download',
    episodeId: asset.episode_id ?? undefined,
    bytesTransferred: asset.file_size_bytes ?? 0,
  });

  return Response.redirect(url, 302);
}
