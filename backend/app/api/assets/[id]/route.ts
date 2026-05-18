export const runtime = 'edge';

import { z } from 'zod';
import type { AssetRow } from '@shared/types';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const assetSelect =
  'id,type_code,name,variant,version,stage,language,final_filename,storage_backend,storage_ref,storage_metadata,file_size_bytes,mime_type,pushed_at,status,withdrawn_at';

const bodySchema = z.object({
  storage_metadata: z.object({
    ai_prompt: z.string().trim().max(5000).nullable().optional(),
  }).strict(),
});

interface StoredAssetRow extends AssetRow {
  withdrawn_at?: string | null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
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

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { data: asset, error: assetError } = await admin
    .from('assets')
    .select('id,storage_metadata,withdrawn_at')
    .eq('id', id)
    .single<Pick<StoredAssetRow, 'id' | 'storage_metadata' | 'withdrawn_at'>>();

  if (assetError || !asset) {
    return err('PAYLOAD_MALFORMED', 'asset not found', undefined, 404);
  }

  if (asset.withdrawn_at) {
    return err('ASSET_WITHDRAWN', '该资产已撤回', { withdrawn_at: asset.withdrawn_at }, 410);
  }

  const nextMetadata = mergeAssetMetadata(asset.storage_metadata, parsed.data.storage_metadata);
  const { data: updated, error: updateError } = await admin
    .from('assets')
    .update({ storage_metadata: nextMetadata })
    .eq('id', id)
    .select(assetSelect)
    .single<StoredAssetRow>();

  if (updateError || !updated) {
    return err('INTERNAL_ERROR', updateError?.message ?? 'asset metadata update failed', undefined, 500);
  }

  return ok({ asset: toAssetRow(updated) });
}

function mergeAssetMetadata(
  current: Record<string, unknown> | null | undefined,
  patch: { ai_prompt?: string | null },
) {
  const next = { ...(current ?? {}) };

  if ('ai_prompt' in patch) {
    const prompt = (patch.ai_prompt ?? '').trim();
    if (prompt) {
      next.ai_prompt = prompt;
    } else {
      delete next.ai_prompt;
    }
  }

  return next;
}

function toAssetRow(row: StoredAssetRow): AssetRow {
  return {
    id: row.id,
    type_code: row.type_code,
    name: row.name,
    variant: row.variant,
    version: row.version,
    stage: row.stage,
    language: row.language,
    final_filename: row.final_filename,
    storage_backend: row.storage_backend,
    storage_ref: row.storage_ref,
    storage_metadata: row.storage_metadata,
    file_size_bytes: row.file_size_bytes,
    mime_type: row.mime_type,
    pushed_at: row.pushed_at,
    status: row.status,
  };
}
