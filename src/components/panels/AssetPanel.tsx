import type { AssetRow, AssetType, LocalDraft } from '../../../shared/types';
import { fileDialogFiltersFor, formatBytes } from '../../lib/file-meta';
import { Button } from '../ui/Button';

export function AssetPanel({
  assetType,
  episodeId,
  drafts,
  pushedAssets,
  onImport,
  onPaste,
  onPreviewAsset,
  onBack,
}: {
  assetType: AssetType;
  episodeId: string;
  drafts: LocalDraft[];
  pushedAssets: AssetRow[];
  onImport: (assetType: AssetType) => void;
  onPaste: (assetType: AssetType) => void;
  onPreviewAsset: (asset: AssetRow) => void;
  onBack?: () => void;
}) {
  const filters = fileDialogFiltersFor(assetType);

  return (
    <div className="max-w-[980px] mx-auto">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          {onBack && (
            <Button
              variant="secondary"
              size="sm"
              className="mb-5 text-[0]"
              aria-label="Back to episode dashboard"
              onClick={onBack}
            >
              <span className="mr-2 font-mono text-sm">←</span>
              <span className="text-sm">返回剧集 Dashboard</span>
              返回
            </Button>
          )}
          <div className="text-4xl mb-3 leading-none">{assetType.icon}</div>
          <h1 className="text-4xl font-bold tracking-tight">{assetType.name_cn}</h1>
          <div className="font-mono text-xs text-text-3 mt-2">
            {episodeId} · {drafts.length} drafts · {pushedAssets.length} pushed
          </div>
          <div className="font-mono text-xs text-text-4 mt-2">{assetType.file_exts.join(', ')}</div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => onImport(assetType)}
            title={`${filters[0].name}: ${filters[0].extensions.join(', ')}`}
          >
            导入文件
          </Button>
          {assetType.supports_paste && (
            <Button variant="gradient" onClick={() => onPaste(assetType)}>
              📋 粘贴文本
            </Button>
          )}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-3">本地草稿</h2>
        <div className="space-y-2">
          {drafts.length > 0 ? (
            drafts.map((draft) => (
              <AssetListRow
                key={draft.id}
                label={draft.name}
                filename={draft.final_filename}
                meta={`${draft.stage} · ${draft.source} · ${formatBytes(draft.size_bytes)}`}
              />
            ))
          ) : (
            <EmptyRow label="暂无本地草稿" />
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-3">已入库</h2>
        <div className="space-y-2">
          {pushedAssets.length > 0 ? (
            pushedAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onPreviewAsset(asset)}
                className="block w-full text-left"
              >
                <AssetListRow
                  label={asset.name}
                  filename={asset.final_filename}
                  meta={`${asset.stage} · v${String(asset.version).padStart(3, '0')} · ${formatBytes(
                    asset.file_size_bytes,
                  )}`}
                />
              </button>
            ))
          ) : (
            <EmptyRow label="暂无已入库资产" />
          )}
        </div>
      </section>
    </div>
  );
}

function AssetListRow({ label, filename, meta }: { label: string; filename: string; meta: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-border-hi hover:bg-surface-2">
      <div className="text-sm text-text">{label}</div>
      <div className="font-mono text-xs text-text-3 mt-1 break-all">{filename}</div>
      <div className="font-mono text-xs text-text-4 mt-1">{meta}</div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-5 font-mono text-xs text-text-3">
      {label}
    </div>
  );
}
