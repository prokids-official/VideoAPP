export const runtime = 'nodejs';
export const maxDuration = 60;

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { revertGithubCommit, markR2Orphans } from '@/lib/compensation';
import {
  MissingTemplateVarError,
  OriginalFilenameRequiredError,
  resolveFilename,
} from '@/lib/filename-resolver';
import { createCommitWithFiles, GithubConflictError } from '@/lib/github';
import {
  lookupIdempotency,
  recordIdempotencyDeadLetter,
  recordIdempotencySuccess,
} from '@/lib/idempotency';
import { composeFolderPath, composeFullStorageRef } from '@/lib/path';
import { putObject } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logUsage } from '@/lib/usage';

const SINGLE_FILE_MAX = 50 * 1024 * 1024;
const TOTAL_BATCH_MAX = 200 * 1024 * 1024;
const ITEM_COUNT_MAX = 20;

type Stage = 'ROUGH' | 'REVIEW' | 'FINAL';
type Source = 'imported' | 'pasted' | 'ai-generated' | 'studio-export';
type StorageBackend = 'github' | 'r2';
type AssetRelationType = 'generated_from_prompt' | 'derived_from_storyboard';

interface PushItemRelation {
  relation_type: AssetRelationType;
  target_local_draft_id: string;
  metadata?: Record<string, unknown>;
}

interface PushItem {
  local_draft_id: string;
  episode_id: string;
  type_code: string;
  name?: string;
  variant?: string;
  number?: number;
  version: number;
  stage: Stage;
  language: string;
  source: Source;
  original_filename?: string;
  mime_type: string;
  size_bytes: number;
  relations?: PushItemRelation[];
}

interface PushPayload {
  idempotency_key: string;
  commit_message: string;
  items: PushItem[];
}

interface AssetTypeRow {
  code: string;
  folder_path: string;
  filename_tpl: string;
  storage_ext: string;
  storage_backend: StorageBackend;
}

interface EpisodeRow {
  id: string;
  episode_path: string;
  name_cn: string;
  contents?: {
    name_cn?: string;
    albums?: {
      name_cn?: string;
      series?: {
        name_cn?: string;
      };
    };
  };
}

interface ResolvedItem {
  item: PushItem;
  type: AssetTypeRow;
  final_filename: string;
  storage_ref: string;
}

interface ExistingPushRow {
  id: string;
  github_commit_sha: string | null;
}

interface ExistingAssetRow {
  id: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  final_filename: string;
  status: 'pushed';
}

interface PushResult {
  commit_sha?: string;
  assets: Array<{
    local_draft_id: string;
    id?: string;
    storage_backend?: StorageBackend;
    storage_ref?: string;
    final_filename?: string;
    status: 'pushed';
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStage(value: unknown): value is Stage {
  return value === 'ROUGH' || value === 'REVIEW' || value === 'FINAL';
}

function isSource(value: unknown): value is Source {
  return value === 'imported' || value === 'pasted' || value === 'ai-generated' || value === 'studio-export';
}

function isRelationType(value: unknown): value is AssetRelationType {
  return value === 'generated_from_prompt' || value === 'derived_from_storyboard';
}

function parseRelation(value: unknown): PushItemRelation | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isRelationType(value.relation_type) || typeof value.target_local_draft_id !== 'string') {
    return null;
  }

  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    return null;
  }

  return {
    relation_type: value.relation_type,
    target_local_draft_id: value.target_local_draft_id,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function parseItem(value: unknown): PushItem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.local_draft_id !== 'string' ||
    typeof value.episode_id !== 'string' ||
    typeof value.type_code !== 'string' ||
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !isStage(value.stage) ||
    typeof value.language !== 'string' ||
    !/^[A-Z]{2}$/.test(value.language) ||
    !isSource(value.source) ||
    typeof value.mime_type !== 'string' ||
    typeof value.size_bytes !== 'number' ||
    !Number.isFinite(value.size_bytes) ||
    value.size_bytes < 0
  ) {
    return null;
  }

  if (value.number !== undefined && (typeof value.number !== 'number' || !Number.isInteger(value.number))) {
    return null;
  }

  const relations = value.relations === undefined
    ? undefined
    : Array.isArray(value.relations)
      ? value.relations.map(parseRelation)
      : null;

  if (relations === null || relations?.some((relation) => relation === null)) {
    return null;
  }

  return {
    local_draft_id: value.local_draft_id,
    episode_id: value.episode_id,
    type_code: value.type_code,
    name: typeof value.name === 'string' ? value.name : undefined,
    variant: typeof value.variant === 'string' ? value.variant : undefined,
    number: typeof value.number === 'number' ? value.number : undefined,
    version: value.version,
    stage: value.stage,
    language: value.language,
    source: value.source,
    original_filename: typeof value.original_filename === 'string' ? value.original_filename : undefined,
    mime_type: value.mime_type,
    size_bytes: value.size_bytes,
    relations: relations as PushItemRelation[] | undefined,
  };
}

function parsePayload(raw: unknown): PushPayload | null {
  if (!isRecord(raw) || typeof raw.idempotency_key !== 'string' || typeof raw.commit_message !== 'string') {
    return null;
  }

  if (!Array.isArray(raw.items)) {
    return null;
  }

  const items = raw.items.map(parseItem);

  if (items.some((item) => item === null)) {
    return null;
  }

  return {
    idempotency_key: raw.idempotency_key,
    commit_message: raw.commit_message,
    items: items as PushItem[],
  };
}

async function readPayload(formData: FormData): Promise<PushPayload | null> {
  const payloadRaw = formData.get('payload');

  if (typeof payloadRaw !== 'string') {
    return null;
  }

  try {
    return parsePayload(JSON.parse(payloadRaw));
  } catch {
    return null;
  }
}

async function readFiles(
  formData: FormData,
  items: PushItem[],
): Promise<Map<string, { body: Uint8Array; contentType: string }> | Response> {
  const files = new Map<string, { body: Uint8Array; contentType: string }>();
  let totalBytes = 0;

  for (const item of items) {
    const file = formData.get(`file__${item.local_draft_id}`);

    if (!(file instanceof Blob)) {
      return err(
        'PAYLOAD_MALFORMED',
        `Missing file__${item.local_draft_id}`,
        { code: 'ITEM_FILE_MISSING', local_draft_id: item.local_draft_id },
        400,
      );
    }

    if (file.size > SINGLE_FILE_MAX) {
      return err(
        'PAYLOAD_MALFORMED',
        'Single file exceeds 50MB',
        { code: 'FILE_TOO_LARGE', local_draft_id: item.local_draft_id },
        400,
      );
    }

    totalBytes += file.size;

    if (totalBytes > TOTAL_BATCH_MAX) {
      return err('PAYLOAD_MALFORMED', 'Batch exceeds 200MB', { code: 'FILE_TOO_LARGE' }, 400);
    }

    files.set(item.local_draft_id, {
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || item.mime_type,
    });
  }

  return files;
}

function validateBatch(payload: PushPayload): Response | null {
  if (!payload.idempotency_key.trim()) {
    return err('PAYLOAD_MALFORMED', 'idempotency_key is required', undefined, 400);
  }

  if (payload.items.length === 0 || payload.items.length > ITEM_COUNT_MAX) {
    return err('PAYLOAD_MALFORMED', `items must contain 1-${ITEM_COUNT_MAX} entries`, undefined, 400);
  }

  const episodeIds = new Set(payload.items.map((item) => item.episode_id));

  if (episodeIds.size > 1) {
    return err('PAYLOAD_MALFORMED', 'All items must share one episode_id', { code: 'CROSS_EPISODE' }, 400);
  }

  const seen = new Set<string>();

  for (const item of payload.items) {
    if (seen.has(item.local_draft_id)) {
      return err(
        'PAYLOAD_MALFORMED',
        `Duplicate local_draft_id ${item.local_draft_id}`,
        { code: 'DUPLICATE_DRAFT_ID' },
        400,
      );
    }

    seen.add(item.local_draft_id);
  }

  return null;
}

function resolveItems(
  payload: PushPayload,
  episode: EpisodeRow,
  assetTypes: AssetTypeRow[],
): ResolvedItem[] {
  const typeByCode = new Map(assetTypes.map((type) => [type.code, type]));

  return payload.items.map((item) => {
    const type = typeByCode.get(item.type_code);

    if (!type) {
      throw new MissingTemplateVarError('type_code');
    }

    const finalFilename = resolveFilename({
      template: type.filename_tpl,
      series: episode.contents?.albums?.series?.name_cn,
      album: episode.contents?.albums?.name_cn,
      content: episode.contents?.name_cn,
      episode: episode.name_cn,
      name: item.name,
      variant: item.variant,
      number: item.number,
      version: item.version,
      language: item.language,
      storageExt: type.storage_ext,
      originalFilename: item.original_filename,
    });
    const folderPath = composeFolderPath({
      template: type.folder_path,
      episode: episode.name_cn,
      content: episode.contents?.name_cn,
    });

    return {
      item,
      type,
      final_filename: finalFilename,
      storage_ref: composeFullStorageRef({
        episodePath: episode.episode_path,
        folderPath,
        finalFilename,
      }),
    };
  });
}

async function insertAssetsWithRetry(
  rows: Record<string, unknown>[],
): Promise<{ data: { id: string }[] | null; error: { message?: string } | null }> {
  const admin = supabaseAdmin();
  let lastError: { message?: string } | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error } = await admin.from('assets').insert(rows).select('id');

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }

  return { data: null, error: lastError };
}

async function insertPush(row: Record<string, unknown>): Promise<{ data: { id: string } | null; error: { message?: string } | null }> {
  const { data, error } = await supabaseAdmin().from('pushes').insert(row).select('id').single<{ id: string }>();
  return { data, error };
}

async function rollbackPush(pushId: string): Promise<void> {
  await supabaseAdmin().from('pushes').delete().eq('id', pushId);
}

async function insertAssetRelations(rows: Record<string, unknown>[]): Promise<{ error: { message?: string } | null }> {
  if (rows.length === 0) {
    return { error: null };
  }

  const { error } = await supabaseAdmin().from('asset_relations').insert(rows);
  return { error };
}

async function lookupPersistedPushResult(opts: {
  idempotencyKey: string;
  userId: string;
  resolved: ResolvedItem[];
}): Promise<{ result: PushResult | null; error: string | null }> {
  const admin = supabaseAdmin();
  const { data: push, error: pushError } = await admin
    .from('pushes')
    .select('id,github_commit_sha')
    .eq('pushed_by', opts.userId)
    .eq('idempotency_key', opts.idempotencyKey)
    .maybeSingle<ExistingPushRow>();

  if (pushError) {
    return { result: null, error: pushError.message };
  }

  if (!push) {
    return { result: null, error: null };
  }

  const { data: assets, error: assetsError } = await admin
    .from('assets')
    .select('id,storage_backend,storage_ref,final_filename,status')
    .eq('push_id', push.id)
    .order('pushed_at', { ascending: true });

  if (assetsError) {
    return { result: null, error: assetsError.message };
  }

  const byStorageRef = new Map(
    ((assets ?? []) as ExistingAssetRow[]).map((asset) => [asset.storage_ref, asset]),
  );

  const replayAssets = opts.resolved.map((resolvedItem) => {
    const asset = byStorageRef.get(resolvedItem.storage_ref);

    if (!asset) {
      throw new Error(`persisted push asset missing for ${resolvedItem.storage_ref}`);
    }

    return {
      local_draft_id: resolvedItem.item.local_draft_id,
      id: asset.id,
      storage_backend: asset.storage_backend,
      storage_ref: asset.storage_ref,
      final_filename: asset.final_filename,
      status: 'pushed' as const,
    };
  });

  return {
    result: {
      commit_sha: push.github_commit_sha ?? undefined,
      assets: replayAssets,
    },
    error: null,
  };
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  let formData: FormData;

  try {
    formData = await req.formData();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Request must be multipart/form-data', undefined, 400);
  }

  const payload = await readPayload(formData);

  if (!payload) {
    return err('PAYLOAD_MALFORMED', 'payload JSON invalid', undefined, 400);
  }

  const batchError = validateBatch(payload);

  if (batchError) {
    return batchError;
  }

  const cached = await lookupIdempotency(payload.idempotency_key, auth.user_id);

  if (cached?.status === 'success') {
    return ok(cached.result, 200);
  }

  const admin = supabaseAdmin();
  const episodeId = payload.items[0]?.episode_id ?? '';
  const { data: episode, error: episodeError } = await admin
    .from('episodes')
    .select(
      `id,episode_path,name_cn,
      contents:content_id ( name_cn, albums:album_id ( name_cn, series:series_id ( name_cn ) ) )`,
    )
    .eq('id', episodeId)
    .single<EpisodeRow>();

  if (episodeError || !episode) {
    return err('PAYLOAD_MALFORMED', 'Episode not found', undefined, 404);
  }

  const typeCodes = Array.from(new Set(payload.items.map((item) => item.type_code)));
  const { data: assetTypes, error: assetTypesError } = await admin
    .from('asset_types')
    .select('code,folder_path,filename_tpl,storage_ext,storage_backend')
    .in('code', typeCodes);

  if (assetTypesError || !assetTypes) {
    return err('INTERNAL_ERROR', 'asset_types lookup failed', undefined, 500);
  }

  let resolved: ResolvedItem[];

  try {
    resolved = resolveItems(payload, episode, assetTypes as AssetTypeRow[]);
  } catch (error) {
    if (error instanceof MissingTemplateVarError || error instanceof OriginalFilenameRequiredError) {
      return err('PAYLOAD_MALFORMED', error.message, { code: error.code }, 400);
    }

    return err('PAYLOAD_MALFORMED', (error as Error).message, undefined, 400);
  }

  try {
    const persisted = await lookupPersistedPushResult({
      idempotencyKey: payload.idempotency_key,
      userId: auth.user_id,
      resolved,
    });

    if (persisted.error) {
      return err('INTERNAL_ERROR', persisted.error, undefined, 500);
    }

    if (persisted.result) {
      await recordIdempotencySuccess(payload.idempotency_key, auth.user_id, persisted.result);
      return ok(persisted.result, 200);
    }
  } catch (error) {
    return err('INTERNAL_ERROR', (error as Error).message, undefined, 500);
  }

  const files = await readFiles(formData, payload.items);

  if (files instanceof Response) {
    return files;
  }

  const textItems = resolved.filter((item) => item.type.storage_backend === 'github');
  let commitSha: string | null = null;
  let commitBlobs: Record<string, string> = {};

  if (textItems.length > 0) {
    try {
      const commit = await createCommitWithFiles({
        message: payload.commit_message,
        files: textItems.map((resolvedItem) => ({
          path: resolvedItem.storage_ref,
          content: new TextDecoder('utf-8').decode(files.get(resolvedItem.item.local_draft_id)?.body),
        })),
      });

      commitSha = commit.commit_sha;
      commitBlobs = commit.blobs;
      await logUsage({
        userId: auth.user_id,
        provider: 'github',
        action: 'commit',
        episodeId,
        bytesTransferred: textItems.reduce((sum, item) => sum + item.item.size_bytes, 0),
      });
    } catch (error) {
      if (error instanceof GithubConflictError) {
        return err('INTERNAL_ERROR', 'GitHub conflict after retry exhausted', { code: 'GITHUB_CONFLICT' }, 502);
      }

      return err('INTERNAL_ERROR', `GitHub failure: ${(error as Error).message}`, { code: 'BACKEND_UNAVAILABLE' }, 502);
    }
  }

  const r2Items = resolved.filter((item) => item.type.storage_backend === 'r2');
  const uploadedR2: { key: string; bytes?: number }[] = [];
  const r2Metadata = new Map<string, { etag: string; version_id?: string }>();

  for (const resolvedItem of r2Items) {
    try {
      const file = files.get(resolvedItem.item.local_draft_id);

      if (!file) {
        throw new Error(`missing buffered file ${resolvedItem.item.local_draft_id}`);
      }

      const out = await putObject({
        key: resolvedItem.storage_ref,
        body: file.body,
        contentType: file.contentType,
      });

      uploadedR2.push({ key: resolvedItem.storage_ref, bytes: resolvedItem.item.size_bytes });
      r2Metadata.set(resolvedItem.item.local_draft_id, out);
      await logUsage({
        userId: auth.user_id,
        provider: 'r2',
        action: 'upload',
        episodeId,
        bytesTransferred: resolvedItem.item.size_bytes,
      });
    } catch (error) {
      if (commitSha) {
        await revertGithubCommit(commitSha, 'revert: failed asset push').catch(() => undefined);
      }

      await markR2Orphans(uploadedR2, 'push aborted at R2 stage');
      return err('INTERNAL_ERROR', `R2 failure: ${(error as Error).message}`, { code: 'BACKEND_UNAVAILABLE' }, 502);
    }
  }

  const pushInsert = await insertPush({
    episode_id: episodeId,
    idempotency_key: payload.idempotency_key,
    commit_message: payload.commit_message,
    github_commit_sha: commitSha,
    pushed_by: auth.user_id,
    asset_count: resolved.length,
    total_bytes: resolved.reduce((sum, resolvedItem) => sum + resolvedItem.item.size_bytes, 0),
  });

  if (pushInsert.error || !pushInsert.data) {
    await recordIdempotencyDeadLetter(payload.idempotency_key, auth.user_id, pushInsert.error);
    return err('INTERNAL_ERROR', 'push metadata persistence failed', { code: 'BACKEND_UNAVAILABLE' }, 502);
  }

  const pushId = pushInsert.data.id;
  const rows = resolved.map((resolvedItem) => ({
    episode_id: episodeId,
    idempotency_key: payload.idempotency_key,
    push_id: pushId,
    type_code: resolvedItem.item.type_code,
    name: resolvedItem.item.name ?? '',
    variant: resolvedItem.item.variant ?? null,
    number: resolvedItem.item.number ?? null,
    version: resolvedItem.item.version,
    stage: resolvedItem.item.stage,
    language: resolvedItem.item.language,
    original_filename: resolvedItem.item.original_filename ?? null,
    final_filename: resolvedItem.final_filename,
    storage_backend: resolvedItem.type.storage_backend,
    storage_ref: resolvedItem.storage_ref,
    storage_metadata:
      resolvedItem.type.storage_backend === 'github'
        ? { commit_sha: commitSha, blob_sha: commitBlobs[resolvedItem.storage_ref] }
        : r2Metadata.get(resolvedItem.item.local_draft_id) ?? {},
    file_size_bytes: resolvedItem.item.size_bytes,
    mime_type: resolvedItem.item.mime_type,
    source: resolvedItem.item.source,
    status: 'pushed',
    author_id: auth.user_id,
  }));
  const inserted = await insertAssetsWithRetry(rows);

  if (inserted.error || !inserted.data) {
    await rollbackPush(pushId).catch(() => undefined);
    await recordIdempotencyDeadLetter(payload.idempotency_key, auth.user_id, inserted.error);
    return err('INTERNAL_ERROR', 'metadata persistence failed', { code: 'BACKEND_UNAVAILABLE' }, 502);
  }

  const insertedIdByLocalDraftId = new Map(
    resolved.map((resolvedItem, index) => [resolvedItem.item.local_draft_id, inserted.data?.[index]?.id]),
  );
  const relationRows: Record<string, unknown>[] = [];

  for (const resolvedItem of resolved) {
    const sourceAssetId = insertedIdByLocalDraftId.get(resolvedItem.item.local_draft_id);
    if (!sourceAssetId || !resolvedItem.item.relations) {
      continue;
    }

    for (const relation of resolvedItem.item.relations) {
      const targetAssetId = insertedIdByLocalDraftId.get(relation.target_local_draft_id);
      if (!targetAssetId) {
        await rollbackPush(pushId).catch(() => undefined);
        return err(
          'PAYLOAD_MALFORMED',
          `Relation target ${relation.target_local_draft_id} was not included in this push`,
          { code: 'RELATION_TARGET_MISSING' },
          400,
        );
      }

      relationRows.push({
        episode_id: episodeId,
        source_asset_id: sourceAssetId,
        target_asset_id: targetAssetId,
        relation_type: relation.relation_type,
        metadata: relation.metadata ?? {},
        created_by: auth.user_id,
      });
    }
  }

  const relationInsert = await insertAssetRelations(relationRows);

  if (relationInsert.error) {
    await rollbackPush(pushId).catch(() => undefined);
    await recordIdempotencyDeadLetter(payload.idempotency_key, auth.user_id, relationInsert.error);
    return err('INTERNAL_ERROR', 'asset relation persistence failed', { code: 'BACKEND_UNAVAILABLE' }, 502);
  }

  await admin.from('episodes').update({ updated_at: new Date().toISOString() }).eq('id', episodeId);

  const result: PushResult = {
    commit_sha: commitSha ?? undefined,
    assets: resolved.map((resolvedItem, index) => ({
      local_draft_id: resolvedItem.item.local_draft_id,
      id: inserted.data?.[index]?.id,
      storage_backend: resolvedItem.type.storage_backend,
      storage_ref: resolvedItem.storage_ref,
      final_filename: resolvedItem.final_filename,
      status: 'pushed',
    })),
  };

  await recordIdempotencySuccess(payload.idempotency_key, auth.user_id, result);

  return ok(result, 201);
}
