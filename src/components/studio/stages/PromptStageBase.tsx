import { useMemo, useState } from 'react';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { Button } from '../../ui/Button';
import { StudioThreeColumn } from '../StudioThreeColumn';

type PromptTypeCode = 'PROMPT_IMG' | 'PROMPT_VID';

interface StoryboardMeta {
  number?: unknown;
  summary?: unknown;
  duration_s?: unknown;
}

interface PromptMeta {
  storyboard_asset_id?: unknown;
  prompt_text?: unknown;
}

interface PromptStageState {
  prompt_count?: number;
}

interface PromptStageCopy {
  stageLabel: string;
  shortLabel: string;
  aiButton: string;
  savePrefix: string;
  nextLabel: string;
  typeCode: PromptTypeCode;
}

export interface SavePromptInput {
  storyboardAssetId: string;
  storyboardNumber: number;
  storyboardSummary: string;
  promptText: string;
}

export function PromptStageBase({
  project,
  storyboardAssets,
  assets,
  stateJson,
  copy,
  onSave,
  onAdvance,
}: {
  project: StudioProject;
  storyboardAssets: StudioAsset[];
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  copy: PromptStageCopy;
  onSave: (input: SavePromptInput) => Promise<StudioAsset>;
  onAdvance: () => void | Promise<void>;
}) {
  const units = useMemo(() => parseStoryboardUnits(storyboardAssets), [storyboardAssets]);
  const promptMap = useMemo(() => parsePromptMap(assets), [assets]);
  const stageState = useMemo(() => parseStageState(stateJson), [stateJson]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const unit of units) {
      initial[unit.id] = promptMap.get(unit.id) ?? '';
    }
    return initial;
  });
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveUnit(unit: StoryboardUnit) {
    const promptText = (drafts[unit.id] ?? '').trim();
    if (!promptText) return;
    setSavingUnitId(unit.id);
    setStatus(null);
    setError(null);
    try {
      await onSave({
        storyboardAssetId: unit.id,
        storyboardNumber: unit.number,
        storyboardSummary: unit.summary,
        promptText,
      });
      setStatus(`${copy.savePrefix} ${pad(unit.number)} 已保存`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
      throw cause;
    } finally {
      setSavingUnitId(null);
    }
  }

  return (
    <StudioThreeColumn
      left={
        <div className="flex min-h-full flex-col gap-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">{copy.shortLabel}</div>
            <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
            <p className="mt-2 text-sm leading-6 text-text-3">
              每个分镜单元对应一条{copy.stageLabel}。P1.2 只做手填，P1.3 再接入 Agent 自动生成和风格模板。
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">AI 协助</div>
            <Button type="button" variant="secondary" disabled className="w-full">
              {copy.aiButton}
            </Button>
            <p className="mt-2 text-xs leading-5 text-text-3">P1.3 上线后启用自动拼接。</p>
          </div>

          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">分镜来源</div>
            <p className="text-sm leading-6 text-text-3">
              已载入 <span className="font-mono text-text">{units.length}</span> 个分镜单元。
            </p>
          </section>
        </div>
      }
      center={
        <div className="flex min-h-full flex-col gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-text-4">{copy.stageLabel}</div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">按分镜填写提示词</h3>
          </div>

          {units.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm leading-6 text-text-3">
              还没有分镜单元。先到「分镜」阶段保存至少一条，再回来填写{copy.stageLabel}。
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-3">
              {units.map((unit) => {
                const label = `${copy.stageLabel} ${pad(unit.number)}`;
                const value = drafts[unit.id] ?? '';
                const disabled = savingUnitId === unit.id || !value.trim();
                return (
                  <article key={unit.id} className="rounded-lg border border-border bg-surface-2 p-4">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-mono text-sm font-semibold text-accent">{pad(unit.number)}</div>
                        <p className="mt-1 text-sm leading-6 text-text-2">{unit.summary}</p>
                      </div>
                      <span className="font-mono text-xs text-text-3">{unit.durationS}s</span>
                    </div>
                    <label className="mb-2 block text-sm font-medium text-text-2" htmlFor={`studio-${copy.typeCode}-${unit.id}`}>
                      {label}
                    </label>
                    <textarea
                      id={`studio-${copy.typeCode}-${unit.id}`}
                      rows={4}
                      value={value}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [unit.id]: event.target.value }))}
                      placeholder={copy.typeCode === 'PROMPT_IMG'
                        ? '画面主体、构图、景别、光线、风格...'
                        : '镜头运动、动作节奏、时长、转场、画面变化...'}
                      className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
                    />
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => void saveUnit(unit)}
                      >
                        {savingUnitId === unit.id ? '保存中...' : `保存${copy.stageLabel} ${pad(unit.number)}`}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            {status && <div className="text-xs text-good">{status}</div>}
            {error && <div className="text-xs text-bad">{error}</div>}
            <Button type="button" variant="gradient" disabled={units.length === 0} onClick={() => void onAdvance()}>
              {copy.nextLabel}
            </Button>
          </div>
        </div>
      }
      right={
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">资产篮子</div>
            <div className="text-sm text-text-2">
              <span className="font-mono">{assets.length}</span> 条{copy.stageLabel}
            </div>
            {stageState.prompt_count != null && (
              <p className="mt-2 text-xs text-text-3">
                最近记录：<span className="font-mono">{stageState.prompt_count}</span> 条
              </p>
            )}
          </section>
          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">入库映射</div>
            <p className="text-xs leading-5 text-text-3">
              保存后会成为本地 <span className="font-mono">{copy.typeCode}</span> 资产，后续入库阶段可直接推送到公司项目库。
            </p>
          </section>
        </div>
      }
    />
  );
}

interface StoryboardUnit {
  id: string;
  number: number;
  summary: string;
  durationS: number;
}

function parseStoryboardUnits(assets: StudioAsset[]): StoryboardUnit[] {
  return assets
    .map((asset) => {
      const meta = parseJson<StoryboardMeta>(asset.meta_json);
      return {
        id: asset.id,
        number: normalizePositiveNumber(meta.number, 1),
        summary: String(meta.summary ?? asset.name),
        durationS: normalizePositiveNumber(meta.duration_s, 1),
      };
    })
    .sort((a, b) => a.number - b.number);
}

function parsePromptMap(assets: StudioAsset[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of assets) {
    const meta = parseJson<PromptMeta>(asset.meta_json);
    if (typeof meta.storyboard_asset_id === 'string' && typeof meta.prompt_text === 'string') {
      map.set(meta.storyboard_asset_id, meta.prompt_text);
    }
  }
  return map;
}

function parseStageState(stateJson: string | null | undefined): PromptStageState {
  if (!stateJson) return {};
  return parseJson<PromptStageState>(stateJson);
}

function parseJson<T extends object>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.round(parsed);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
