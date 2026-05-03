export const runtime = 'edge';

import type { AssetRelationDetail, AssetRelationsResult } from '@shared/types';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface AssetRow {
  id: string;
  episode_id: string;
  withdrawn_at?: string | null;
}

interface RelatedAssetRow {
  id: string;
  type_code: string;
  name: string;
  final_filename: string;
  storage_backend: 'github' | 'r2';
  storage_ref: string;
  mime_type: string | null;
}

interface RelationRow {
  id: string;
  relation_type: AssetRelationDetail['relation_type'];
  metadata: Record<string, unknown>;
  created_at: string;
  source_asset_id: string;
  target_asset_id: string;
  source_asset?: RelatedAssetRow | RelatedAssetRow[] | null;
  target_asset?: RelatedAssetRow | RelatedAssetRow[] | null;
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
  const admin = supabaseAdmin();
  const { data: asset, error: assetError } = await admin
    .from('assets')
    .select('id,episode_id,withdrawn_at')
    .eq('id', id)
    .single<AssetRow>();

  if (assetError || !asset) {
    return err('PAYLOAD_MALFORMED', 'asset not found', undefined, 404);
  }

  if (asset.withdrawn_at) {
    return err('ASSET_WITHDRAWN', '该资产已撤回', { withdrawn_at: asset.withdrawn_at }, 410);
  }

  const [outgoing, incoming] = await Promise.all([
    admin
      .from('asset_relations')
      .select(
        `id,relation_type,metadata,created_at,source_asset_id,target_asset_id,
        target_asset:target_asset_id(id,type_code,name,final_filename,storage_backend,storage_ref,mime_type)`,
      )
      .eq('source_asset_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('asset_relations')
      .select(
        `id,relation_type,metadata,created_at,source_asset_id,target_asset_id,
        source_asset:source_asset_id(id,type_code,name,final_filename,storage_backend,storage_ref,mime_type)`,
      )
      .eq('target_asset_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (outgoing.error) {
    return err('INTERNAL_ERROR', outgoing.error.message, undefined, 500);
  }

  if (incoming.error) {
    return err('INTERNAL_ERROR', incoming.error.message, undefined, 500);
  }

  const result: AssetRelationsResult = {
    asset_id: id,
    outgoing: ((outgoing.data ?? []) as RelationRow[]).map((row) => toDetail(row, 'target_asset')),
    incoming: ((incoming.data ?? []) as RelationRow[]).map((row) => toDetail(row, 'source_asset')),
  };

  return ok(result);
}

function toDetail(row: RelationRow, relatedKey: 'source_asset' | 'target_asset'): AssetRelationDetail {
  return {
    id: row.id,
    relation_type: row.relation_type,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    asset: normalizeRelatedAsset(row[relatedKey]),
  };
}

function normalizeRelatedAsset(value: RelatedAssetRow | RelatedAssetRow[] | null | undefined): RelatedAssetRow {
  if (Array.isArray(value)) {
    return value[0]!;
  }

  return value!;
}
