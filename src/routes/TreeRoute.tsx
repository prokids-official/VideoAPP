import { useEffect, useState } from 'react';
import { TopNav } from '../components/chrome/TopNav';
import { ProjectTree } from '../components/chrome/ProjectTree';
import { Button } from '../components/ui/Button';
import { AssetPanel } from '../components/panels/AssetPanel';
import { ImportPreviewDialog, type PendingImportFile } from '../components/panels/ImportPreviewDialog';
import { api } from '../lib/api';
import { ASSET_TYPES, getAssetType } from '../lib/asset-types';
import { fileDialogFiltersFor } from '../lib/file-meta';
import { createDraft, listDrafts, saveDraftFile } from '../lib/drafts';
import type {
  AssetRow,
  AssetType,
  CreateLocalDraftInput,
  LocalDraft,
  PreviewFilenameResult,
  TreeResponse,
} from '../../shared/types';

const PANELS_P0 = ASSET_TYPES.filter((type) => type.enabled).sort((a, b) => a.sort_order - b.sort_order);
const PANELS_P4 = ASSET_TYPES.filter((type) => !type.enabled).sort((a, b) => a.sort_order - b.sort_order);

interface EpisodeDetail {
  episode: {
    id: string;
    name_cn: string;
    status: string;
    episode_path: string;
    series_name: string;
    album_name: string;
    content_name: string;
    created_by_name: string;
    created_at: string;
    updated_at: string;
  };
  counts: { by_type: Record<string, { pushed: number; superseded: number }> };
}

export function TreeRoute({
  selectedEpisodeId,
  reloadKey,
  onSelectEpisode,
  onCreateEpisode,
  onOpenSettings,
}: {
  selectedEpisodeId: string | null;
  reloadKey: number;
  onSelectEpisode: (id: string) => void;
  onCreateEpisode: () => void;
  onOpenSettings: () => void;
}) {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [selectedPanelCode, setSelectedPanelCode] = useState<string | null>(null);
  const [panelDrafts, setPanelDrafts] = useState<LocalDraft[]>([]);
  const [panelAssets, setPanelAssets] = useState<AssetRow[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    assetType: AssetType;
    file: PendingImportFile;
    preview: PreviewFilenameResult;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await api.tree();
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setTree(result.data);
      } else {
        setError(result.message);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedEpisodeId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await api.episodeDetail(selectedEpisodeId);
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setDetail(result.data as EpisodeDetail);
      } else {
        setError(result.message);
      }
      setDetailLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEpisodeId]);

  useEffect(() => {
    if (!selectedEpisodeId || !selectedPanelCode) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setPanelLoading(true);
      setPanelError(null);

      try {
        const [draftRows, assetResult] = await Promise.all([
          listDrafts(selectedEpisodeId),
          api.assets({ episode_id: selectedEpisodeId, type_code: selectedPanelCode }),
        ]);

        if (cancelled) {
          return;
        }

        setPanelDrafts(draftRows.filter((draft) => draft.type_code === selectedPanelCode));
        if (assetResult.ok) {
          setPanelAssets(assetResult.data.assets);
        } else {
          setPanelAssets([]);
          setPanelError(assetResult.message);
        }
      } catch (cause) {
        if (cancelled) {
          return;
        }
        setPanelDrafts([]);
        setPanelAssets([]);
        setPanelError(cause instanceof Error ? cause.message : '资产加载失败');
      }
      setPanelLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEpisodeId, selectedPanelCode]);

  if (loading) {
    return <StatusScreen label="loading..." />;
  }

  function openPanel(typeCode: string) {
    setPanelDrafts([]);
    setPanelAssets([]);
    setPanelError(null);
    setPanelLoading(true);
    setSelectedPanelCode(typeCode);
  }

  async function handleImport(assetType: AssetType) {
    if (!selectedEpisodeId) {
      return;
    }

    try {
      const selected = await window.fableglitch.fs.openFileDialog(fileDialogFiltersFor(assetType));
      if (!selected) {
        return;
      }

      const file = await prepareImportFile(selected);
      const baseName = basenameWithoutExtension(selected.name);
      const previewResult = await api.previewFilename({
        episode_id: selectedEpisodeId,
        type_code: assetType.code,
        name: baseName,
        number: assetType.filename_tpl.includes('{number') ? 1 : undefined,
        version: 1,
        stage: 'ROUGH',
        language: 'ZH',
        original_filename: selected.name,
      });

      if (!previewResult.ok) {
        setPanelError(previewResult.message);
        return;
      }

      setPendingImport({ assetType, file, preview: previewResult.data });
    } catch (cause) {
      setPanelError(cause instanceof Error ? cause.message : '导入失败');
    }
  }

  async function handleSaveImportDraft(
    draft: Omit<CreateLocalDraftInput, 'id' | 'local_file_path'>,
    content: string | ArrayBuffer,
  ) {
    const id = crypto.randomUUID();
    const saved = await saveDraftFile({
      localDraftId: id,
      extension: extensionFromFilename(draft.final_filename),
      content,
    });
    const created = await createDraft({
      ...draft,
      id,
      local_file_path: saved.path,
      size_bytes: saved.size_bytes,
    });
    setPanelDrafts((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    setPendingImport(null);
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopNav onOpenSettings={onOpenSettings} />
      <div className="flex-1 flex overflow-hidden">
        <ProjectTree
          series={tree?.series ?? []}
          selectedEpisodeId={selectedEpisodeId}
          onSelectEpisode={(id) => {
            onSelectEpisode(id);
            setDetail(null);
            setSelectedPanelCode(null);
            setDetailLoading(true);
          }}
        />
        <main className="flex-1 overflow-y-auto px-10 py-12">
          <div className="mb-8 flex justify-end">
            <Button variant="secondary" onClick={onCreateEpisode}>
              + 新建剧集
            </Button>
          </div>
          {selectedPanelCode && selectedEpisodeId ? (
            <PanelView
              panelCode={selectedPanelCode}
              episodeId={selectedEpisodeId}
              drafts={panelDrafts}
              pushedAssets={panelAssets}
              loading={panelLoading}
              error={panelError}
              onImport={handleImport}
              onBack={() => setSelectedPanelCode(null)}
            />
          ) : error ? (
            <StatusPanel title="加载失败" text={error} />
          ) : detailLoading ? (
            <StatusPanel title="读取剧集" text="fetching episode..." />
          ) : detail ? (
            <Dashboard detail={detail} onOpenPanel={openPanel} />
          ) : (
            <EmptyHint onCreateEpisode={onCreateEpisode} />
          )}
        </main>
      </div>
      {pendingImport && (
        <ImportPreviewDialog
          open
          assetType={pendingImport.assetType}
          episodeId={selectedEpisodeId ?? ''}
          file={pendingImport.file}
          preview={pendingImport.preview}
          onClose={() => setPendingImport(null)}
          onSaveDraft={handleSaveImportDraft}
        />
      )}
    </div>
  );
}

function StatusScreen({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
      {label}
    </div>
  );
}

function StatusPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-[880px] mx-auto text-center pt-24">
      <div className="text-xl text-text-2 mb-2">{title}</div>
      <p className="font-mono text-sm text-text-3">{text}</p>
    </div>
  );
}

function EmptyHint({ onCreateEpisode }: { onCreateEpisode: () => void }) {
  return (
    <div className="max-w-[880px] mx-auto text-center pt-24">
      <div className="text-xl text-text-2 mb-2">从左侧选一个剧集</div>
      <p className="font-mono text-sm text-text-3 mb-8">点击项目树里的任意剧集查看详情</p>
      <Button variant="gradient" onClick={onCreateEpisode}>
        + 新建剧集
      </Button>
    </div>
  );
}

function PanelView({
  panelCode,
  episodeId,
  drafts,
  pushedAssets,
  loading,
  error,
  onImport,
  onBack,
}: {
  panelCode: string;
  episodeId: string;
  drafts: LocalDraft[];
  pushedAssets: AssetRow[];
  loading: boolean;
  error: string | null;
  onImport: (assetType: AssetType) => void;
  onBack: () => void;
}) {
  const assetType = getAssetType(panelCode);

  if (!assetType) {
    return <StatusPanel title="未知资产类型" text={panelCode} />;
  }

  if (loading) {
    return <StatusPanel title="读取资产" text="fetching assets..." />;
  }

  if (error) {
    return <StatusPanel title="资产加载失败" text={error} />;
  }

  return (
    <AssetPanel
      assetType={assetType}
      episodeId={episodeId}
      drafts={drafts}
      pushedAssets={pushedAssets}
      onImport={onImport}
      onPaste={() => {}}
      onPreviewAsset={() => {}}
      onBack={onBack}
    />
  );
}

async function prepareImportFile(file: {
  name: string;
  size_bytes: number;
  content: Uint8Array;
}): Promise<PendingImportFile> {
  const ext = extensionFromFilename(file.name).toLowerCase();
  const content = toArrayBuffer(file.content);

  if (ext === '.docx') {
    const { docxToMarkdown } = await import('../lib/docx');
    const markdown = await docxToMarkdown(content);
    return {
      name: file.name,
      size: encodedSize(markdown),
      mime_type: 'text/markdown',
      content,
      preview_kind: 'markdown',
      preview_text: markdown,
      save_content: markdown,
    };
  }

  if (ext === '.xlsx') {
    const { xlsxToMarkdown } = await import('../lib/xlsx');
    const markdown = await xlsxToMarkdown(content);
    return {
      name: file.name,
      size: encodedSize(markdown),
      mime_type: 'text/markdown',
      content,
      preview_kind: 'markdown',
      preview_text: markdown,
      save_content: markdown,
    };
  }

  if (ext === '.md' || ext === '.txt') {
    const text = new TextDecoder().decode(content);
    return {
      name: file.name,
      size: file.size_bytes,
      mime_type: ext === '.md' ? 'text/markdown' : 'text/plain',
      content,
      preview_kind: 'markdown',
      preview_text: text,
      save_content: text,
    };
  }

  const mimeType = mimeTypeForExtension(ext);
  return {
    name: file.name,
    size: file.size_bytes,
    mime_type: mimeType,
    content,
    preview_kind: mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'binary',
    save_content: content,
  };
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function basenameWithoutExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function extensionFromFilename(filename: string): string {
  const match = /\.[^.]+$/.exec(filename);
  return match ? match[0] : '.bin';
}

function encodedSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function mimeTypeForExtension(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

function Dashboard({ detail, onOpenPanel }: { detail: EpisodeDetail; onOpenPanel: (typeCode: string) => void }) {
  const ep = detail.episode;
  const counts = detail.counts.by_type;

  return (
    <div className="max-w-[880px] mx-auto">
      <div className="font-mono text-xs text-text-3 mb-3">
        {ep.series_name}
        <span className="text-text-4 mx-1.5">/</span>
        {ep.album_name}
        <span className="text-text-4 mx-1.5">/</span>
        {ep.content_name}
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-3.5">{ep.name_cn}</h1>
      <div className="font-mono text-xs text-text-3 mb-12">
        created by {ep.created_by_name}
        <span className="text-text-4 mx-2">·</span>
        {new Date(ep.created_at).toLocaleString('zh-CN')}
        <span className="text-text-4 mx-2">·</span>
        <span className="text-warn">
          <span className="inline-block w-2 h-2 rounded-full bg-warn mr-1.5 align-[1px]" />
          {ep.status}
        </span>
      </div>

      <div className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-4">P0 资产面板</div>
      <div className="grid grid-cols-4 gap-3 mb-10">
        {PANELS_P0.map((panel) => (
          <PanelCard
            key={panel.code}
            panel={panel}
            count={counts[panel.code]?.pushed ?? 0}
            disabled={false}
            onClick={() => onOpenPanel(panel.code)}
          />
        ))}
      </div>

      <div className="text-xs font-semibold text-text-3 uppercase tracking-widest mb-4">P4 音频扩展</div>
      <div className="grid grid-cols-4 gap-3">
        {PANELS_P4.map((panel) => (
          <PanelCard key={panel.code} panel={panel} count={0} disabled onClick={() => {}} />
        ))}
      </div>
    </div>
  );
}

function PanelCard({
  panel,
  count,
  disabled,
  onClick,
}: {
  panel: AssetType;
  count: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative bg-surface border border-border rounded-lg p-5 min-h-[124px] transition text-left ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-border-hi hover:bg-surface-2'
      }`}
    >
      {disabled && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-2xs font-mono text-warn border border-warn/40 bg-warn/10">
          P4
        </div>
      )}
      <div className="text-3xl mb-3 leading-none">{panel.icon ?? '□'}</div>
      <div className="text-base font-medium mb-2">{panel.name_cn}</div>
      <div className="font-mono text-xs text-text-3 flex items-center gap-1.5">
        {disabled ? (
          '即将推出'
        ) : count > 0 ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-good" />
            {count} 个已入库
          </>
        ) : (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn" />
            暂无资产
          </>
        )}
      </div>
    </button>
  );
}
