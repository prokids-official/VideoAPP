import { useMemo } from 'react';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { buildStudioAssetLinkIndex, studioAssetLinkLabels } from '../../../lib/studio-asset-links';
import { Button } from '../../ui/Button';

const TYPE_LABELS: Record<string, string> = {
  SCRIPT: '剧本',
  CHAR: '角色',
  SCENE: '场景',
  PROP: '道具',
  STORYBOARD_UNIT: '分镜',
  PROMPT_IMG: '图片提示词',
  PROMPT_VID: '视频提示词',
  SHOT_IMG: '分镜图',
  SHOT_VID: '分镜视频',
};

const TYPE_ORDER = [
  'SCRIPT',
  'CHAR',
  'SCENE',
  'PROP',
  'STORYBOARD_UNIT',
  'PROMPT_IMG',
  'PROMPT_VID',
  'SHOT_IMG',
  'SHOT_VID',
];

const PROMPT_TYPES = new Set(['PROMPT_IMG', 'PROMPT_VID']);
const GENERATED_TYPES = new Set(['SHOT_IMG', 'SHOT_VID']);

interface CanvasTimelineUnit {
  storyboard: StudioAsset;
  number: number;
  summary: string;
  durationS: number | null;
  promptImg: StudioAsset[];
  promptVid: StudioAsset[];
  shotImg: StudioAsset[];
  shotVid: StudioAsset[];
}

interface CanvasView {
  units: CanvasTimelineUnit[];
  looseAssets: StudioAsset[];
}

export function CanvasStage({
  project,
  assets,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  onAdvance: () => void | Promise<void>;
}) {
  const canvasView = useMemo(() => buildCanvasView(assets), [assets]);
  const looseGroups = useMemo(() => groupAssets(canvasView.looseAssets), [canvasView.looseAssets]);
  const fallbackGroups = useMemo(() => groupAssets(assets), [assets]);
  const linkIndex = useMemo(() => buildStudioAssetLinkIndex(assets), [assets]);
  const pushedCount = assets.filter((asset) => asset.pushed_at != null).length;
  const generatedCount = assets.filter((asset) => GENERATED_TYPES.has(asset.type_code)).length;
  const hasTimeline = canvasView.units.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-lg border border-border bg-surface p-5">
      <header className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-text-4">只读画布</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{project.name}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-3">
            按分镜把剧本单元、图片提示词、视频提示词和生成结果串起来，先确认整片资产链路是否齐，再进入入库 review。
          </p>
        </div>
        <Button type="button" variant="gradient" onClick={() => void onAdvance()}>
          准备入库 →
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="本地资产" value={String(assets.length)} />
        <Metric label="分镜单元" value={String(canvasView.units.length)} />
        <Metric label="生成输出" value={String(generatedCount)} />
        <Metric label="已推送" value={String(pushedCount)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-2 p-8 text-center text-sm text-text-3">
            还没有本地资产。先按流程保存剧本、角色、场景、提示词，再回到画布总览。
          </div>
        ) : hasTimeline ? (
          <div className="space-y-5">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text">分镜时间线</h3>
                <span className="font-mono text-xs text-text-3">{canvasView.units.length}</span>
              </div>
              <div className="space-y-3">
                {canvasView.units.map((unit) => (
                  <TimelineUnitCard key={unit.storyboard.id} unit={unit} />
                ))}
              </div>
            </section>

            {looseGroups.length > 0 && (
              <AssetSections groups={looseGroups} linkIndex={linkIndex} title="资产篮子" />
            )}
          </div>
        ) : (
          <AssetSections groups={fallbackGroups} linkIndex={linkIndex} />
        )}
      </div>
    </div>
  );
}

function TimelineUnitCard({ unit }: { unit: CanvasTimelineUnit }) {
  return (
    <article className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-accent/35 bg-accent/10 px-2.5 py-1 font-mono text-xs font-semibold text-accent">
              SHOT {pad(unit.number)}
            </span>
            {unit.durationS != null && (
              <span className="rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text-3">
                {unit.durationS}s
              </span>
            )}
          </div>
          <h4 className="mt-3 text-base font-semibold text-text">{unit.storyboard.name}</h4>
          <p className="mt-2 text-sm leading-6 text-text-3">{unit.summary}</p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text-3">
          {countLinkedOutputs(unit)} outputs
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <TimelineLane
          label="图片链路"
          prompts={unit.promptImg}
          outputs={unit.shotImg}
          emptyPrompt="未挂图片提示词"
          emptyOutput="未挂分镜图"
        />
        <TimelineLane
          label="视频链路"
          prompts={unit.promptVid}
          outputs={unit.shotVid}
          emptyPrompt="未挂视频提示词"
          emptyOutput="未挂分镜视频"
        />
      </div>
    </article>
  );
}

function TimelineLane({
  label,
  prompts,
  outputs,
  emptyPrompt,
  emptyOutput,
}: {
  label: string;
  prompts: StudioAsset[];
  outputs: StudioAsset[];
  emptyPrompt: string;
  emptyOutput: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-text-4">{label}</div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <AssetStack label="Prompt" assets={prompts} emptyLabel={emptyPrompt} />
        <div className="hidden items-center px-1 text-text-4 md:flex">→</div>
        <AssetStack label="Output" assets={outputs} emptyLabel={emptyOutput} />
      </div>
    </section>
  );
}

function AssetStack({ label, assets, emptyLabel }: { label: string; assets: StudioAsset[]; emptyLabel: string }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-text-4">{label}</div>
      {assets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface-2 px-3 py-3 text-xs text-text-4">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <AssetPill key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetPill({ asset }: { asset: StudioAsset }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className="line-clamp-2 text-sm font-medium leading-5 text-text">{asset.name}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-4">
        <span className="font-mono">{asset.type_code}</span>
        <span>{formatSize(asset.size_bytes)}</span>
        {asset.variant && <span>{asset.variant}</span>}
      </div>
    </div>
  );
}

function AssetSections({
  groups,
  linkIndex,
  title,
}: {
  groups: ReturnType<typeof groupAssets>;
  linkIndex: ReturnType<typeof buildStudioAssetLinkIndex>;
  title?: string;
}) {
  return (
    <div className="space-y-5">
      {title && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          <span className="font-mono text-xs text-text-3">{groups.reduce((sum, group) => sum + group.assets.length, 0)}</span>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.typeCode}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">{TYPE_LABELS[group.typeCode] ?? group.typeCode}</h3>
            <span className="font-mono text-xs text-text-3">{group.assets.length}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} linkLabels={studioAssetLinkLabels(asset, linkIndex.get(asset.id))} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="text-xs uppercase tracking-widest text-text-4">{label}</div>
      <div className="mt-2 font-mono text-xl font-semibold text-text">{value}</div>
    </div>
  );
}

function AssetCard({ asset, linkLabels }: { asset: StudioAsset; linkLabels: string[] }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <div className="flex h-24 items-center justify-center border-b border-border bg-surface">
        <span className="rounded-md border border-border bg-surface-2 px-3 py-1 font-mono text-xs text-text-3">
          {asset.type_code}
        </span>
      </div>
      <div className="p-3">
        <div className="line-clamp-2 min-h-[40px] text-sm font-medium leading-5 text-text">{asset.name}</div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-text-3">
          <span className="font-mono">v{asset.version}</span>
          <span>{formatSize(asset.size_bytes)}</span>
        </div>
        {asset.variant && <div className="mt-2 text-xs text-text-3">{asset.variant}</div>}
        {linkLabels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {linkLabels.map((label) => (
              <span
                key={label}
                className="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] leading-none text-accent"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function buildCanvasView(assets: StudioAsset[]): CanvasView {
  const metaById = new Map(assets.map((asset) => [asset.id, parseMeta(asset.meta_json)]));
  const promptById = new Map<string, StudioAsset>();
  const unitsByStoryboardId = new Map<string, CanvasTimelineUnit>();
  const includedIds = new Set<string>();

  for (const asset of assets) {
    if (PROMPT_TYPES.has(asset.type_code)) {
      promptById.set(asset.id, asset);
    }

    if (asset.type_code !== 'STORYBOARD_UNIT') continue;
    const meta = metaById.get(asset.id) ?? {};
    const number = readPositiveNumber(meta.number) ?? readPositiveNumber(meta.storyboard_number) ?? unitsByStoryboardId.size + 1;
    unitsByStoryboardId.set(asset.id, {
      storyboard: asset,
      number,
      summary: readString(meta.summary) ?? readString(meta.text) ?? asset.name,
      durationS: readPositiveNumber(meta.duration_s),
      promptImg: [],
      promptVid: [],
      shotImg: [],
      shotVid: [],
    });
    includedIds.add(asset.id);
  }

  for (const asset of assets) {
    if (!PROMPT_TYPES.has(asset.type_code)) continue;
    const meta = metaById.get(asset.id) ?? {};
    const unit = findUnitForAsset(meta, unitsByStoryboardId);
    if (!unit) continue;

    if (asset.type_code === 'PROMPT_IMG') unit.promptImg.push(asset);
    if (asset.type_code === 'PROMPT_VID') unit.promptVid.push(asset);
    includedIds.add(asset.id);
  }

  for (const asset of assets) {
    if (!GENERATED_TYPES.has(asset.type_code)) continue;
    const meta = metaById.get(asset.id) ?? {};
    const sourcePromptId = readString(meta.source_prompt_asset_id) ?? readString(meta.generated_from_prompt_asset_id);
    const sourcePrompt = sourcePromptId ? promptById.get(sourcePromptId) : null;
    const sourcePromptMeta = sourcePrompt ? metaById.get(sourcePrompt.id) ?? {} : null;
    const unit = sourcePromptMeta
      ? findUnitForAsset(sourcePromptMeta, unitsByStoryboardId)
      : findUnitForAsset(meta, unitsByStoryboardId);
    if (!unit) continue;

    if (asset.type_code === 'SHOT_IMG') unit.shotImg.push(asset);
    if (asset.type_code === 'SHOT_VID') unit.shotVid.push(asset);
    includedIds.add(asset.id);
  }

  return {
    units: Array.from(unitsByStoryboardId.values()).sort((a, b) => a.number - b.number),
    looseAssets: assets.filter((asset) => !includedIds.has(asset.id)),
  };
}

function findUnitForAsset(meta: Record<string, unknown>, unitsByStoryboardId: Map<string, CanvasTimelineUnit>) {
  const storyboardAssetId = readString(meta.storyboard_asset_id);
  if (storyboardAssetId) {
    return unitsByStoryboardId.get(storyboardAssetId) ?? null;
  }

  const storyboardNumber = readPositiveNumber(meta.storyboard_number);
  if (storyboardNumber == null) return null;
  return Array.from(unitsByStoryboardId.values()).find((unit) => unit.number === storyboardNumber) ?? null;
}

function countLinkedOutputs(unit: CanvasTimelineUnit) {
  return unit.shotImg.length + unit.shotVid.length;
}

function groupAssets(assets: StudioAsset[]) {
  const grouped = new Map<string, StudioAsset[]>();
  for (const asset of assets) {
    const list = grouped.get(asset.type_code) ?? [];
    list.push(asset);
    grouped.set(asset.type_code, list);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => typeRank(a) - typeRank(b))
    .map(([typeCode, groupAssets]) => ({
      typeCode,
      assets: groupAssets.sort((a, b) => b.updated_at - a.updated_at),
    }));
}

function typeRank(typeCode: string) {
  const index = TYPE_ORDER.indexOf(typeCode);
  return index === -1 ? TYPE_ORDER.length : index;
}

function parseMeta(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function formatSize(value: number | null) {
  if (value == null) return '未写入文件';
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${formatNumber(kb)} KB`;
  return `${formatNumber(kb / 1024)} MB`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
