import { useMemo, useState } from 'react';
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
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  config: AssetEntityConfig;
  onSave: (input: SaveEntityInput) => Promise<StudioAsset>;
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
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor={`studio-${config.typeCode}-${field.key}`}>
                {field.label}
              </label>
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
              <div key={asset.id} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-sm font-medium text-text">{asset.name}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-text-3">
                  <span>{asset.variant ?? config.stageLabel}</span>
                  <span className="font-mono">v{asset.version}</span>
                </div>
              </div>
            ))
          )}
        </div>
      }
    />
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
