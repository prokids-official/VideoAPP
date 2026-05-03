import { useEffect, useMemo, useState } from 'react';
import type {
  ApiResponse,
  AssetPushItem,
  AssetPushPayload,
  AssetPushResult,
  PreviewFilenameResult,
  StudioAsset,
  StudioProject,
  TreeResponse,
} from '../../../../shared/types';
import { PushTargetSelector, type PushTarget } from '../PushTargetSelector';
import { Button } from '../../ui/Button';
import { api } from '../../../lib/api';
import { getAssetType } from '../../../lib/asset-types';
import { studioApi } from '../../../lib/studio-api';

interface ExportAsset {
  asset: StudioAsset;
  file: {
    content: ArrayBuffer;
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
  };
  item: AssetPushItem;
}

interface PreviewRow {
  assetId: string;
  preview: PreviewFilenameResult;
}

interface PreflightShot {
  key: string;
  number: number;
  title: string;
  missing: string[];
}

interface PreflightReport {
  readyShots: number;
  totalShots: number;
  globalMissing: string[];
  shots: PreflightShot[];
}

const NON_PUSHABLE_TYPES = new Set(['STORYBOARD_UNIT']);

export function ExportStage({
  project,
  assets,
}: {
  project: StudioProject;
  assets: StudioAsset[];
}) {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [target, setTarget] = useState<PushTarget | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(pushableAssets(assets).map((asset) => asset.id)));
  const [commitMessageOverride, setCommitMessageOverride] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewFilenameResult>>({});
  const [loadingTree, setLoadingTree] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pushable = useMemo(() => pushableAssets(assets), [assets]);
  const selectedAssets = useMemo(
    () => pushable.filter((asset) => selectedIds.has(asset.id)),
    [pushable, selectedIds],
  );
  const preflight = useMemo(() => buildPreflightReport(assets), [assets]);
  const defaultCommitMessage = target ? `feat(${target.episode.name_cn}): 来自创作舱「${project.name}」推送` : '';
  const commitMessage = commitMessageOverride ?? defaultCommitMessage;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingTree(true);
      const result = await api.tree();
      if (cancelled) return;
      if (result.ok) {
        setTree(result.data);
      } else {
        setError(result.message);
      }
      setLoadingTree(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runPreview(): Promise<PreviewRow[]> {
    if (!target || selectedAssets.length === 0) return [];
    setPreviewing(true);
    setError(null);
    try {
      const rows = await Promise.all(
        selectedAssets.map(async (asset) => {
          const item = toPushItemSkeleton(asset, target.episode.id);
          const result = await api.previewFilename({
            episode_id: target.episode.id,
            type_code: asset.type_code,
            name: item.name,
            variant: item.variant,
            number: item.number,
            version: item.version,
            stage: item.stage,
            language: item.language,
            original_filename: originalFilenameFor(asset),
          });
          if (!result.ok) {
            throw new Error(result.message);
          }
          return { assetId: asset.id, preview: result.data };
        }),
      );
      setPreviews(Object.fromEntries(rows.map((row) => [row.assetId, row.preview])));
      return rows;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预览失败');
      return [];
    } finally {
      setPreviewing(false);
    }
  }

  async function runPush() {
    if (!target || selectedAssets.length === 0 || pushing) return;
    setPushing(true);
    setStatus(null);
    setError(null);
    try {
      const selectedAssetIdsForRelations = new Set(selectedAssets.map((asset) => asset.id));
      const exportAssets = await Promise.all(
        selectedAssets.map((asset) => prepareExportAsset(asset, target.episode.id, selectedAssetIdsForRelations)),
      );
      const payload: AssetPushPayload = {
        idempotency_key: crypto.randomUUID(),
        commit_message: commitMessage,
        items: exportAssets.map((entry) => entry.item),
      };
      const files = Object.fromEntries(exportAssets.map((entry) => [entry.asset.id, entry.file.content]));
      const result = await window.fableglitch.net.assetPush({ payload, items: payload.items, files });
      const body = result.body;
      if (result.status >= 200 && result.status < 300 && body?.ok) {
        await markPushed(body.data, exportAssets, target.episode.id);
        setStatus(`已推送 ${exportAssets.length} 项到 ${target.episode.name_cn}`);
        return;
      }
      setError(parsePushError(result.status, body));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '推送失败');
    } finally {
      setPushing(false);
    }
  }

  function toggleAsset(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-lg border border-border bg-surface p-5">
      <header className="border-b border-border pb-4">
        <div className="text-xs uppercase tracking-widest text-text-4">入库 review</div>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">入库到公司项目</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-3">
              把本地创作舱资产推送到团队资产库。成功后本地资产会保留，并标记已推送目标剧集。
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!target || selectedAssets.length === 0 || previewing} onClick={() => void runPreview()}>
              {previewing ? '预览中...' : '预览最终文件名'}
            </Button>
            <Button type="button" variant="gradient" disabled={!target || selectedAssets.length === 0 || pushing} onClick={() => void runPush()}>
              {pushing ? '推送中...' : `推送 ${selectedAssets.length} 项`}
            </Button>
          </div>
        </div>
      </header>

      {error && <div className="rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      {status && <div role="status" className="rounded border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{status}</div>}

      <PreflightPanel report={preflight} />

      <section className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="mb-3 text-xs uppercase tracking-widest text-text-4">目标公司项目</div>
        {loadingTree ? (
          <div className="font-mono text-xs text-text-3">loading tree...</div>
        ) : tree ? (
          <PushTargetSelector tree={tree} target={target} onTargetChange={setTarget} />
        ) : (
          <div className="text-sm text-text-3">无法加载公司项目树。</div>
        )}
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-widest text-text-4">本地资产</div>
          <div className="font-mono text-xs text-text-3">{selectedAssets.length} / {pushable.length}</div>
        </div>
        {pushable.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-2 p-8 text-center text-sm text-text-3">
            暂无可入库资产。分镜单元是内部数据，不直接入库；请先保存 SCRIPT / CHAR / SCENE / PROP / PROMPT_IMG / PROMPT_VID。
          </div>
        ) : (
          <div className="space-y-3">
            {pushable.map((asset) => (
              <AssetExportRow
                key={asset.id}
                asset={asset}
                selected={selectedIds.has(asset.id)}
                preview={previews[asset.id]}
                onToggle={() => toggleAsset(asset.id)}
              />
            ))}
          </div>
        )}
      </section>

      <label className="block border-t border-border pt-4">
        <span className="mb-2 block text-sm font-medium text-text-2">commit message</span>
        <textarea
          value={commitMessage}
          onChange={(event) => setCommitMessageOverride(event.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-3 font-mono text-sm leading-6 text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
        />
      </label>
    </div>
  );
}

function PreflightPanel({ report }: { report: PreflightReport }) {
  const hasWarnings = report.globalMissing.length > 0 || report.shots.some((shot) => shot.missing.length > 0);
  return (
    <section className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-text-4">Preflight review</div>
          <h3 className="mt-2 text-lg font-semibold text-text">入库前资产检查</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-3">
            这里只做提示，不阻塞推送。缺口补齐后，公司项目里的 prompt、图片和视频关系会更完整。
          </p>
        </div>
        <div className="grid min-w-[220px] grid-cols-2 gap-2">
          <PreflightMetric label="Ready shots" value={`${report.readyShots} / ${report.totalShots}`} />
          <PreflightMetric label="Warnings" value={String(report.globalMissing.length + report.shots.reduce((sum, shot) => sum + shot.missing.length, 0))} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-4">全局板块</div>
          {report.globalMissing.length === 0 ? (
            <PreflightChip tone="good">Global assets ready</PreflightChip>
          ) : (
            <div className="flex flex-wrap gap-2">
              {report.globalMissing.map((label) => (
                <PreflightChip key={label} tone="warn">{label}</PreflightChip>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-text-4">分镜链路</div>
            <span className={hasWarnings ? 'text-xs text-warn' : 'text-xs text-good'}>
              {hasWarnings ? 'Needs attention' : 'Ready to push'}
            </span>
          </div>
          {report.shots.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface-2 p-4 text-sm text-text-3">
              No storyboard units yet
            </div>
          ) : (
            <div className="grid gap-2 xl:grid-cols-2">
              {report.shots.map((shot) => (
                <div key={shot.key} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">
                      SHOT {padNumber(shot.number)}
                    </span>
                    <span className={shot.missing.length === 0 ? 'text-xs text-good' : 'text-xs text-warn'}>
                      {shot.missing.length === 0 ? 'Complete' : `${shot.missing.length} missing`}
                    </span>
                  </div>
                  <div className="mt-2 line-clamp-1 text-sm font-medium text-text">{shot.title}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shot.missing.length === 0 ? (
                      <PreflightChip tone="good">Ready</PreflightChip>
                    ) : (
                      shot.missing.map((label) => (
                        <PreflightChip key={label} tone="warn">{label}</PreflightChip>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PreflightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[11px] uppercase tracking-widest text-text-4">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-text">{value}</div>
    </div>
  );
}

function PreflightChip({ children, tone }: { children: string; tone: 'good' | 'warn' }) {
  const className = tone === 'good'
    ? 'border-good/30 bg-good/10 text-good'
    : 'border-warn/30 bg-warn/10 text-warn';
  return (
    <span className={`rounded border px-2 py-1 text-xs ${className}`}>
      {children}
    </span>
  );
}

function AssetExportRow({
  asset,
  selected,
  preview,
  onToggle,
}: {
  asset: StudioAsset;
  selected: boolean;
  preview?: PreviewFilenameResult;
  onToggle: () => void;
}) {
  const type = getAssetType(asset.type_code);
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-2 p-4 transition hover:border-border-hi">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-text-3">{asset.type_code}</span>
          <span className="font-medium text-text">{asset.name}</span>
          {asset.variant && <span className="text-sm text-text-3">{asset.variant}</span>}
          {asset.pushed_at && <span className="rounded border border-good/30 bg-good/10 px-2 py-0.5 text-xs text-good">已推送</span>}
        </div>
        <div className="mt-2 text-xs text-text-3">{type?.name_cn ?? asset.type_code}</div>
        {preview && (
          <div className="mt-3 rounded border border-border bg-surface px-3 py-2">
            <div className="break-all font-mono text-xs text-text">{preview.final_filename}</div>
            <div className="mt-1 break-all font-mono text-2xs text-text-3">{preview.storage_ref}</div>
          </div>
        )}
      </div>
      <div className="font-mono text-xs text-text-3">{formatBytes(asset.size_bytes)}</div>
    </label>
  );
}

function pushableAssets(assets: StudioAsset[]) {
  return assets.filter((asset) => !NON_PUSHABLE_TYPES.has(asset.type_code));
}

function buildPreflightReport(assets: StudioAsset[]): PreflightReport {
  const globalMissing = requiredGlobalTypes()
    .filter((item) => !assets.some((asset) => asset.type_code === item.typeCode))
    .map((item) => item.label);
  const storyboards = assets
    .filter((asset) => asset.type_code === 'STORYBOARD_UNIT')
    .map((asset, index) => {
      const meta = parseMeta(asset.meta_json);
      return {
        asset,
        meta,
        number: positiveInteger(meta.number) ?? positiveInteger(meta.storyboard_number) ?? index + 1,
        title: stringMeta(meta.summary) ?? asset.name,
      };
    })
    .sort((a, b) => a.number - b.number);

  if (storyboards.length === 0) {
    globalMissing.push('Missing storyboard units');
  }

  const prompts = assets.filter((asset) => asset.type_code === 'PROMPT_IMG' || asset.type_code === 'PROMPT_VID');
  const generated = assets.filter((asset) => asset.type_code === 'SHOT_IMG' || asset.type_code === 'SHOT_VID');

  const shots = storyboards.map((storyboard): PreflightShot => {
    const promptImg = prompts.some((asset) => asset.type_code === 'PROMPT_IMG' && belongsToStoryboard(asset, storyboard.asset.id, storyboard.number));
    const promptVid = prompts.some((asset) => asset.type_code === 'PROMPT_VID' && belongsToStoryboard(asset, storyboard.asset.id, storyboard.number));
    const shotImg = generated.some((asset) => asset.type_code === 'SHOT_IMG' && generatedBelongsToStoryboard(asset, prompts, storyboard.asset.id, storyboard.number));
    const shotVid = generated.some((asset) => asset.type_code === 'SHOT_VID' && generatedBelongsToStoryboard(asset, prompts, storyboard.asset.id, storyboard.number));
    const missing = [
      ...(!promptImg ? ['Missing image prompt'] : []),
      ...(!promptVid ? ['Missing video prompt'] : []),
      ...(!shotImg ? ['Missing generated image'] : []),
      ...(!shotVid ? ['Missing generated video'] : []),
    ];
    return {
      key: storyboard.asset.id,
      number: storyboard.number,
      title: storyboard.title,
      missing,
    };
  });

  return {
    readyShots: shots.filter((shot) => shot.missing.length === 0).length,
    totalShots: shots.length,
    globalMissing,
    shots,
  };
}

function requiredGlobalTypes() {
  return [
    { typeCode: 'SCRIPT', label: 'Missing script' },
    { typeCode: 'CHAR', label: 'Missing character assets' },
    { typeCode: 'SCENE', label: 'Missing scene assets' },
  ];
}

function belongsToStoryboard(asset: StudioAsset, storyboardAssetId: string, storyboardNumber: number) {
  const meta = parseMeta(asset.meta_json);
  return stringMeta(meta.storyboard_asset_id) === storyboardAssetId
    || positiveInteger(meta.storyboard_number) === storyboardNumber;
}

function generatedBelongsToStoryboard(
  asset: StudioAsset,
  prompts: StudioAsset[],
  storyboardAssetId: string,
  storyboardNumber: number,
) {
  if (belongsToStoryboard(asset, storyboardAssetId, storyboardNumber)) return true;
  const meta = parseMeta(asset.meta_json);
  const promptId = stringMeta(meta.source_prompt_asset_id) ?? stringMeta(meta.generated_from_prompt_asset_id);
  const prompt = promptId ? prompts.find((item) => item.id === promptId) : null;
  return prompt ? belongsToStoryboard(prompt, storyboardAssetId, storyboardNumber) : false;
}

async function prepareExportAsset(
  asset: StudioAsset,
  episodeId: string,
  selectedAssetIdsForRelations: ReadonlySet<string>,
): Promise<ExportAsset> {
  const generated = await exportFileFor(asset);
  return {
    asset,
    file: generated,
    item: {
      ...toPushItemSkeleton(asset, episodeId, selectedAssetIdsForRelations),
      original_filename: generated.originalFilename,
      mime_type: generated.mimeType,
      size_bytes: generated.sizeBytes,
    },
  };
}

function toPushItemSkeleton(
  asset: StudioAsset,
  episodeId: string,
  selectedAssetIdsForRelations: ReadonlySet<string> = new Set(),
): Omit<AssetPushItem, 'mime_type' | 'size_bytes'> & {
  mime_type?: string;
  size_bytes?: number;
} {
  const meta = parseMeta(asset.meta_json);
  return {
    local_draft_id: asset.id,
    episode_id: episodeId,
    type_code: asset.type_code,
    name: asset.name,
    variant: asset.variant ?? undefined,
    number: numberFromAsset(asset, meta),
    version: asset.version,
    stage: 'ROUGH',
    language: 'ZH',
    source: 'studio-export',
    original_filename: originalFilenameFor(asset),
    relations: relationsForAsset(meta, selectedAssetIdsForRelations),
  };
}

function relationsForAsset(
  meta: Record<string, unknown>,
  selectedAssetIdsForRelations: ReadonlySet<string>,
): AssetPushItem['relations'] {
  const relations: NonNullable<AssetPushItem['relations']> = [];
  const sourcePromptAssetId = stringMeta(meta.source_prompt_asset_id)
    ?? stringMeta(meta.generated_from_prompt_asset_id);

  if (sourcePromptAssetId && selectedAssetIdsForRelations.has(sourcePromptAssetId)) {
    relations.push({
      relation_type: 'generated_from_prompt',
      target_local_draft_id: sourcePromptAssetId,
      metadata: storyboardMetadata(meta),
    });
  }

  const storyboardAssetId = stringMeta(meta.storyboard_asset_id);
  if (storyboardAssetId && selectedAssetIdsForRelations.has(storyboardAssetId)) {
    relations.push({
      relation_type: 'derived_from_storyboard',
      target_local_draft_id: storyboardAssetId,
      metadata: storyboardMetadata(meta),
    });
  }

  return relations.length > 0 ? relations : undefined;
}

function storyboardMetadata(meta: Record<string, unknown>) {
  const storyboardNumber = Number(meta.storyboard_number);
  return Number.isInteger(storyboardNumber) && storyboardNumber >= 0
    ? { storyboard_number: storyboardNumber }
    : {};
}

function stringMeta(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function exportFileFor(asset: StudioAsset) {
  if (asset.content_path) {
    const data = await studioApi.readAssetFile(asset.id);
    const content = toArrayBuffer(data);
    return {
      content,
      mimeType: asset.mime_type ?? 'application/octet-stream',
      originalFilename: originalFilenameFor(asset),
      sizeBytes: asset.size_bytes ?? content.byteLength,
    };
  }

  const markdown = studioAssetMarkdown(asset);
  const data = new TextEncoder().encode(markdown);
  return {
    content: toArrayBuffer(data),
    mimeType: 'text/markdown',
    originalFilename: `${safeFilename(asset.name)}.md`,
    sizeBytes: data.byteLength,
  };
}

async function markPushed(result: AssetPushResult, entries: ExportAsset[], episodeId: string) {
  const pushedIds = new Set(result.assets.map((asset) => asset.local_draft_id));
  const now = Date.now();
  await Promise.all(
    entries
      .filter((entry) => pushedIds.has(entry.asset.id))
      .map((entry) => studioApi.saveAsset({
        ...entry.asset,
        pushed_to_episode_id: episodeId,
        pushed_at: now,
      })),
  );
}

function parsePushError(status: number, body: ApiResponse<AssetPushResult> | null) {
  if (body && !body.ok) return body.error.message;
  return `HTTP ${status}`;
}

function originalFilenameFor(asset: StudioAsset) {
  if (asset.content_path) {
    const ext = extensionForMime(asset.mime_type) ?? '.md';
    return `${safeFilename(asset.name)}${ext}`;
  }
  return `${safeFilename(asset.name)}.md`;
}

function extensionForMime(mimeType: string | null) {
  switch (mimeType) {
    case 'text/markdown':
      return '.md';
    case 'text/plain':
      return '.txt';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    default:
      return null;
  }
}

function studioAssetMarkdown(asset: StudioAsset) {
  const meta = parseMeta(asset.meta_json);
  const lines = [`# ${asset.name}`, '', `- type: ${asset.type_code}`, `- version: ${asset.version}`];
  if (asset.variant) {
    lines.push(`- variant: ${asset.variant}`);
  }
  lines.push('', '## Metadata', '');
  for (const [key, value] of Object.entries(meta)) {
    lines.push(`- ${key}: ${formatMetaValue(value)}`);
  }
  return `${lines.join('\n')}\n`;
}

function numberFromAsset(asset: StudioAsset, meta: Record<string, unknown>) {
  const raw = meta.storyboard_number ?? meta.number;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  const match = /(\d+)/.exec(asset.name);
  return match ? Number(match[1]) : undefined;
}

function parseMeta(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function formatMetaValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function toArrayBuffer(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'studio-asset';
}

function formatBytes(value: number | null) {
  if (value == null) return 'meta';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function padNumber(value: number) {
  return String(value).padStart(2, '0');
}
