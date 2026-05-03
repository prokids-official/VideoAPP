import { useMemo } from 'react';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
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

export function CanvasStage({
  project,
  assets,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  onAdvance: () => void | Promise<void>;
}) {
  const groups = useMemo(() => groupAssets(assets), [assets]);
  const pushedCount = assets.filter((asset) => asset.pushed_at != null).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-lg border border-border bg-surface p-5">
      <header className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-text-4">只读画布</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{project.name}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-3">
            当前阶段只做资产总览，完整拖拽画布编辑器留到 P1.5。这里确认内容齐了，就进入入库 review。
          </p>
        </div>
        <Button type="button" variant="gradient" onClick={() => void onAdvance()}>
          准备入库 →
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="本地资产" value={String(assets.length)} />
        <Metric label="可入库板块" value={String(groups.filter((group) => group.typeCode !== 'STORYBOARD_UNIT').length)} />
        <Metric label="已推送" value={String(pushedCount)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-2 p-8 text-center text-sm text-text-3">
            还没有本地资产。先按流程保存剧本、角色、场景、提示词，再回到画布总览。
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.typeCode}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text">{TYPE_LABELS[group.typeCode] ?? group.typeCode}</h3>
                  <span className="font-mono text-xs text-text-3">{group.assets.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.assets.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
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

function AssetCard({ asset }: { asset: StudioAsset }) {
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
      </div>
    </article>
  );
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
