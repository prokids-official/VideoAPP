import { useEffect, useMemo, useState } from 'react';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { Button } from '../../ui/Button';
import { StudioThreeColumn } from '../StudioThreeColumn';

export interface EntityField {
  key: string;
  label: string;
  placeholder?: string;
  rows?: number;
}

export interface AssetEntityConfig {
  typeCode: 'CHAR' | 'SCENE' | 'PROP';
  stageLabel: string;
  nameLabel: string;
  saveLabel: string;
  nextLabel: string;
  aiGenerateLabel: string;
  aiExtractLabel: string;
  fields: EntityField[];
}

export interface SaveEntityInput {
  typeCode: 'CHAR' | 'SCENE' | 'PROP';
  name: string;
  variant: string | null;
  meta: Record<string, string>;
}

export interface ImportEntityImageInput {
  asset: StudioAsset;
  file: {
    name: string;
    content: Uint8Array;
    mimeType: string;
    sizeBytes: number;
  };
}

interface EntityState {
  name?: string;
  variant?: string | null;
  meta?: Record<string, string>;
}

export function AssetEntityStage({
  project,
  assets,
  stateJson,
  config,
  onSave,
  onImportImage,
  onReadAssetFile,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  config: AssetEntityConfig;
  onSave: (input: SaveEntityInput) => Promise<StudioAsset>;
  onImportImage?: (input: ImportEntityImageInput) => Promise<StudioAsset>;
  onReadAssetFile?: (asset: StudioAsset) => Promise<Uint8Array>;
  onAdvance: () => void | Promise<void>;
}) {
  const initialState = useMemo(() => parseEntityState(stateJson), [stateJson]);
  const [name, setName] = useState(initialState.name ?? '');
  const [variant, setVariant] = useState(initialState.variant ?? '');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    for (const field of config.fields) {
      values[field.key] = initialState.meta?.[field.key] ?? '';
    }
    return values;
  });
  const [saving, setSaving] = useState(false);
  const [importingAssetId, setImportingAssetId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanName = name.trim();
  const meta = Object.fromEntries(
    config.fields.map((field) => [field.key, (fieldValues[field.key] ?? '').trim()]),
  );

  async function save() {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await onSave({
        typeCode: config.typeCode,
        name: cleanName,
        variant: variant.trim() || null,
        meta,
      });
      setStatus(`${config.typeCode} 资产已保存`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndAdvance() {
    await save();
    await onAdvance();
  }

  function updateField(key: string, value: string) {
    setFieldValues((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setName('');
    setVariant('');
    setFieldValues(Object.fromEntries(config.fields.map((field) => [field.key, ''])));
    setStatus(null);
    setError(null);
  }

  async function copyPrompt() {
    const prompt = (fieldValues.ai_prompt ?? '').trim();
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus('AI 图片 prompt 已复制');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '复制失败');
    }
  }

  async function importGeneratedImage(asset: StudioAsset) {
    if (!onImportImage) return;

    setImportingAssetId(asset.id);
    setStatus(null);
    setError(null);
    try {
      const selected = await window.fableglitch?.fs?.openFileDialog?.(imageFileDialogFilters());
      if (!selected) return;
      await onImportImage({
        asset,
        file: {
          name: selected.name,
          content: selected.content,
          mimeType: inferImageMimeType(selected.name),
          sizeBytes: selected.size_bytes,
        },
      });
      setStatus(`${config.stageLabel}生成图片已导入`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入生成图片失败');
      throw cause;
    } finally {
      setImportingAssetId(null);
    }
  }

  return (
    <StudioThreeColumn
      left={
        <div className="flex min-h-full flex-col gap-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">{config.stageLabel}资产</div>
            <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
            <p className="mt-2 text-sm leading-6 text-text-3">
              手动整理本阶段资产；保存后会进入本地资产篮子，入库时映射到公司 {config.typeCode} 板块。
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">AI 协助</div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" disabled>
                {config.aiGenerateLabel}
              </Button>
              <Button type="button" variant="secondary" disabled>
                {config.aiExtractLabel}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-3">P1.3 接入 Agent 后启用。</p>
          </div>

          <Button type="button" variant="secondary" onClick={resetForm}>
            新建{config.stageLabel}
          </Button>

          <div className="mt-auto rounded-lg border border-border bg-surface-2 p-3 text-sm text-text-3">
            <div className="font-mono text-xs text-text-4">{assets.length} LOCAL ASSETS</div>
            <p className="mt-2 leading-6">点击右侧资产可用于后续版本编辑；P1.2 先保留当前表单。</p>
          </div>
        </div>
      }
      center={
        <form
          className="flex min-h-full flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor={`studio-${config.typeCode}-name`}>
                {config.nameLabel}
              </label>
              <input
                id={`studio-${config.typeCode}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor={`studio-${config.typeCode}-variant`}>
                版本/定位
              </label>
              <input
                id={`studio-${config.typeCode}-variant`}
                value={variant}
                onChange={(event) => setVariant(event.target.value)}
                placeholder="主角 / 反派 / 关键场景 / 线索道具..."
                className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
          </div>

          {config.fields.map((field) => (
            <div key={field.key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-text-2" htmlFor={`studio-${config.typeCode}-${field.key}`}>
                  {field.label}
                </label>
                {field.key === 'ai_prompt' && (
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    disabled={!((fieldValues.ai_prompt ?? '').trim())}
                    className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text-3 transition hover:border-accent/40 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    复制 AI 图片 prompt
                  </button>
                )}
              </div>
              <textarea
                id={`studio-${config.typeCode}-${field.key}`}
                value={fieldValues[field.key] ?? ''}
                rows={field.rows ?? 3}
                onChange={(event) => updateField(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
          ))}

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            {status && <div className="text-xs text-good">{status}</div>}
            {error && <div className="text-xs text-bad">{error}</div>}
            <Button type="submit" variant="secondary" disabled={saving || !cleanName}>
              {saving ? '保存中...' : config.saveLabel}
            </Button>
            <Button type="button" variant="gradient" disabled={saving || !cleanName} onClick={() => void saveAndAdvance()}>
              {config.nextLabel}
            </Button>
          </div>
        </form>
      }
      right={
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-text-4">资产篮子</div>
          {assets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-6 text-sm leading-6 text-text-3">
              保存后会出现在这里。
            </div>
          ) : (
            assets.map((asset) => (
              <EntityAssetCard
                key={asset.id}
                asset={asset}
                stageLabel={config.stageLabel}
                importing={importingAssetId === asset.id}
                onImportImage={onImportImage ? () => void importGeneratedImage(asset) : undefined}
                onReadAssetFile={onReadAssetFile}
              />
            ))
          )}
        </div>
      }
    />
  );
}

function EntityAssetCard({
  asset,
  stageLabel,
  importing,
  onImportImage,
  onReadAssetFile,
}: {
  asset: StudioAsset;
  stageLabel: string;
  importing: boolean;
  onImportImage?: () => void;
  onReadAssetFile?: (asset: StudioAsset) => Promise<Uint8Array>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <EntityImagePreview asset={asset} onReadAssetFile={onReadAssetFile} />
      <div className="p-3">
        <div className="text-sm font-medium text-text">{asset.name}</div>
        <div className="mt-2 flex items-center justify-between text-xs text-text-3">
          <span>{asset.variant ?? stageLabel}</span>
          <span className="font-mono">v{asset.version}</span>
        </div>
        <div className="mt-2 text-xs text-text-3">{formatSize(asset.size_bytes)}</div>
        {onImportImage && (
          <Button
            type="button"
            variant="secondary"
            disabled={importing}
            onClick={onImportImage}
            className="mt-3 w-full"
          >
            {importing ? '导入中...' : '导入生成图片'}
          </Button>
        )}
      </div>
    </div>
  );
}

function EntityImagePreview({
  asset,
  onReadAssetFile,
}: {
  asset: StudioAsset;
  onReadAssetFile?: (asset: StudioAsset) => Promise<Uint8Array>;
}) {
  const [preview, setPreview] = useState<{ assetId: string; src: string } | null>(null);
  const canPreview = Boolean(asset.content_path && asset.mime_type?.startsWith('image/') && onReadAssetFile);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!canPreview || !onReadAssetFile || typeof URL.createObjectURL !== 'function') {
      return undefined;
    }

    void (async () => {
      try {
        const content = await onReadAssetFile(asset);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([toArrayBuffer(content)], { type: asset.mime_type ?? 'image/png' }));
        setPreview({ assetId: asset.id, src: objectUrl });
      } catch {
        // Keep the lightweight placeholder if the local file is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [asset, canPreview, onReadAssetFile]);

  const src = preview?.assetId === asset.id ? preview.src : null;
  if (src) {
    return (
      <div className="aspect-video border-b border-border bg-black">
        <img src={src} alt={`${asset.name} 预览`} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="flex aspect-video items-center justify-center border-b border-border bg-surface px-3 text-center text-xs text-text-4">
      {asset.mime_type?.startsWith('image/') ? '图片已导入' : '等待生成图片'}
    </div>
  );
}

function parseEntityState(stateJson: string | null | undefined): EntityState {
  if (!stateJson) {
    return {};
  }
  try {
    return JSON.parse(stateJson) as EntityState;
  } catch {
    return {};
  }
}

function imageFileDialogFilters() {
  return [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }];
}

function inferImageMimeType(filename: string) {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return 'image/png';
  }
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

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
