import { useEffect, useMemo, useState } from 'react';
import type { AIProviderConfigInput, SkillCatalogItem, StudioAsset, StudioProject } from '../../../../shared/types';
import { api } from '../../../lib/api';
import { defaultAiProviderSettings, loadAiProviderSettings } from '../../../lib/ai-provider-settings';
import { loadActiveSkillIds } from '../../../lib/skill-activation';
import { Button } from '../../ui/Button';
import { StudioThreeColumn } from '../StudioThreeColumn';
import type { PreflightLocateTarget } from './ExportStage';

interface StoryboardState {
  number?: number;
  summary?: string;
  duration_s?: number;
}

interface StoryboardUnitMeta {
  number?: number;
  summary?: string;
  duration_s?: number;
}

export interface SaveStoryboardInput {
  number: number;
  summary: string;
  durationS: number;
}

export function StoryboardStage({
  project,
  assets,
  scriptAssets,
  stateJson,
  locateTarget,
  onSave,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  scriptAssets: StudioAsset[];
  stateJson: string | null | undefined;
  locateTarget?: PreflightLocateTarget | null;
  onSave: (input: SaveStoryboardInput) => Promise<StudioAsset>;
  onAdvance: () => void | Promise<void>;
}) {
  const units = useMemo(() => parseStoryboardUnits(assets), [assets]);
  const locatedUnit = useMemo(
    () => locateTarget?.stage === 'storyboard'
      ? units.find((unit) => matchesLocateTarget(locateTarget, unit)) ?? null
      : null,
    [locateTarget, units],
  );
  const initialState = useMemo(() => parseStoryboardState(stateJson), [stateJson]);
  const [number, setNumber] = useState(String(initialState.number ?? nextNumber(units)));
  const [duration, setDuration] = useState(String(initialState.duration_s ?? 8));
  const [summary, setSummary] = useState(initialState.summary ?? '');
  const [saving, setSaving] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  const [providerConfig, setProviderConfig] = useState<AIProviderConfigInput>(defaultAiProviderSettings);
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedSkills = useMemo(
    () => orderSkills(skills, activeSkillIds),
    [activeSkillIds, skills],
  );
  const selectedSkill = orderedSkills.find((skill) => skill.id === selectedSkillId) ?? orderedSkills[0] ?? null;
  const cleanSummary = summary.trim();
  const cleanNumber = normalizePositiveNumber(number, nextNumber(units));
  const cleanDuration = normalizePositiveNumber(duration, 8);
  const canRunAgent = scriptAssets.length > 0 && Boolean(selectedSkill) && !saving && !runningAgent;

  useEffect(() => {
    let cancelled = false;

    async function loadAgentSettings() {
      const [settings, activeIds, catalog] = await Promise.all([
        loadAiProviderSettings(),
        loadActiveSkillIds(),
        api.skills('storyboard'),
      ]);

      if (cancelled) {
        return;
      }

      setProviderConfig(settings);
      setActiveSkillIds(activeIds);
      if (catalog.ok) {
        const loadedSkills = catalog.data.skills;
        const ordered = orderSkills(loadedSkills, activeIds);
        setSkills(loadedSkills);
        setSelectedSkillId((current) => current || ordered[0]?.id || '');
      } else {
        setError(catalog.message);
      }
    }

    void loadAgentSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await onSave({
        number: cleanNumber,
        summary: cleanSummary,
        durationS: cleanDuration,
      });
      setStatus('分镜单元已保存');
      setNumber(String(cleanNumber + 1));
      setSummary('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function runStoryboardAgent() {
    if (!selectedSkill || scriptAssets.length === 0) {
      return;
    }

    setRunningAgent(true);
    setStatus(null);
    setError(null);
    try {
      const scriptAsset = scriptAssets[0];
      if (!scriptAsset) {
        throw new Error('还没有 SCRIPT 资产');
      }
      const scriptBytes = await window.fableglitch.studio.assetReadFile(scriptAsset.id);
      const scriptMarkdown = new TextDecoder().decode(scriptBytes);
      const result = await api.storyboardRun({
        skill_id: selectedSkill.id,
        provider_config: providerConfig,
        input: {
          project_name: project.name,
          duration_sec: storyboardTargetDuration(project.size_kind),
          style_hint: '',
          script_markdown: scriptMarkdown,
        },
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      for (const unit of result.data.run.units) {
        await onSave({
          number: unit.number,
          summary: unit.summary,
          durationS: unit.duration_s,
        });
      }

      setStatus(`AI 已拆分 ${result.data.run.units.length} 个分镜`);
      setNumber(String(nextNumberFromOutputs(result.data.run.units)));
      setSummary('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 拆分失败');
    } finally {
      setRunningAgent(false);
    }
  }

  async function saveAndAdvance() {
    await save();
    await onAdvance();
  }

  return (
    <StudioThreeColumn
      left={
        <div className="flex min-h-full flex-col gap-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">分镜拆分</div>
            <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
            <p className="mt-2 text-sm leading-6 text-text-3">
              P1.3 已接入 Storyboard Agent，可从 SCRIPT 自动拆出分镜单元，后续图片和视频提示词会按这里逐条展开。
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">AI 协助</div>
            {orderedSkills.length > 1 && (
              <select
                aria-label="storyboard skill"
                value={selectedSkill?.id ?? ''}
                onChange={(event) => setSelectedSkillId(event.target.value)}
                className="mb-2 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text outline-none focus:border-accent/60"
              >
                {orderedSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name_cn}
                  </option>
                ))}
              </select>
            )}
            {selectedSkill && (
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-text-3">
                <span className="truncate">{selectedSkill.name_cn}</span>
                <span className="font-mono">{providerConfig.model}</span>
              </div>
            )}
            <Button type="button" variant="secondary" disabled={!canRunAgent} className="w-full" onClick={() => void runStoryboardAgent()}>
              {runningAgent ? 'AI 拆分中...' : 'AI 拆分分镜'}
            </Button>
            <p className="mt-2 text-xs leading-5 text-text-3">
              读取最新 SCRIPT，输出编号、摘要和秒数，保存为 STORYBOARD_UNIT。
            </p>
          </div>

          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">剧本参考</div>
            {scriptAssets.length === 0 ? (
              <p className="text-sm leading-6 text-text-3">还没有 SCRIPT 资产。可以先手动拆分，也可以回到剧本阶段保存。</p>
            ) : (
              <div className="space-y-2">
                {scriptAssets.slice(0, 3).map((asset) => (
                  <div key={asset.id} className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="text-sm font-medium text-text">{asset.name}</div>
                    <div className="mt-1 font-mono text-xs text-text-3">v{asset.version}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
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
          <div className="grid gap-3 md:grid-cols-[120px_120px_minmax(0,1fr)]">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-storyboard-number">
                分镜编号
              </label>
              <input
                id="studio-storyboard-number"
                type="number"
                min={1}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-storyboard-duration">
                时长秒数
              </label>
              <input
                id="studio-storyboard-duration"
                type="number"
                min={1}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-storyboard-summary">
                分镜摘要
              </label>
              <textarea
                id="studio-storyboard-summary"
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="一句话描述这一镜：画面、动作、节奏..."
                className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
          </div>

          <section className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-3 text-xs uppercase tracking-widest text-text-4">分镜单元</div>
            {locatedUnit && (
              <div role="status" className="mb-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
                已定位到 SHOT {pad(locatedUnit.number)}
                <span className="ml-2 text-xs text-text-3">{locateTarget?.reason}</span>
              </div>
            )}
            {units.length === 0 ? (
              <p className="text-sm leading-6 text-text-3">还没有分镜单元。先保存第一条，后续提示词阶段会按这里逐条展开。</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {units.map((unit) => {
                  const located = locatedUnit?.id === unit.id;
                  return (
                    <article
                      key={unit.id}
                      data-testid={`storyboard-unit-${unit.id}`}
                      data-located={located ? 'true' : 'false'}
                      className={`rounded-lg border p-3 transition ${located
                        ? 'border-accent/70 bg-accent/10 ring-2 ring-accent/25'
                        : 'border-border bg-surface'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-semibold text-accent">{pad(unit.number)}</span>
                        <span className="font-mono text-xs text-text-3">{unit.durationS}s</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-text-2">{unit.summary}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            {status && <div className="text-xs text-good">{status}</div>}
            {error && <div className="text-xs text-bad">{error}</div>}
            <Button type="submit" variant="secondary" disabled={saving || !cleanSummary}>
              {saving ? '保存中...' : '保存分镜单元'}
            </Button>
            <Button type="button" variant="gradient" disabled={saving || !cleanSummary} onClick={() => void saveAndAdvance()}>
              下一阶段：图片提示词
            </Button>
          </div>
        </form>
      }
      right={
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">节奏统计</div>
            <div className="text-sm text-text-2">
              <span className="font-mono">{units.length}</span> 个分镜 · <span className="font-mono">{totalDuration(units)}s</span>
            </div>
          </section>
          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">入库说明</div>
            <p className="text-xs leading-5 text-text-3">
              STORYBOARD_UNIT 是创作舱本地数据，不直接推到公司库。后续 PROMPT_IMG / PROMPT_VID 会从它派生。
            </p>
          </section>
        </div>
      }
    />
  );
}

function parseStoryboardState(stateJson: string | null | undefined): StoryboardState {
  if (!stateJson) {
    return {};
  }
  try {
    return JSON.parse(stateJson) as StoryboardState;
  } catch {
    return {};
  }
}

function matchesLocateTarget(target: PreflightLocateTarget, unit: { id: string; number: number }) {
  return target.storyboardAssetId === unit.id || target.storyboardNumber === unit.number;
}

function parseStoryboardUnits(assets: StudioAsset[]) {
  return assets
    .map((asset) => {
      const meta = parseMeta(asset.meta_json);
      return {
        id: asset.id,
        number: normalizePositiveNumber(meta.number, 1),
        summary: String(meta.summary ?? asset.name),
        durationS: normalizePositiveNumber(meta.duration_s, 1),
      };
    })
    .sort((a, b) => a.number - b.number);
}

function parseMeta(value: string): StoryboardUnitMeta {
  try {
    return JSON.parse(value) as StoryboardUnitMeta;
  } catch {
    return {};
  }
}

function orderSkills(skills: SkillCatalogItem[], activeSkillIds: string[]) {
  return [...skills].sort((a, b) => {
    const activeDelta = Number(activeSkillIds.includes(b.id)) - Number(activeSkillIds.includes(a.id));
    if (activeDelta !== 0) {
      return activeDelta;
    }
    return a.name_cn.localeCompare(b.name_cn);
  });
}

function nextNumber(units: Array<{ number: number }>) {
  return units.length === 0 ? 1 : Math.max(...units.map((unit) => unit.number)) + 1;
}

function nextNumberFromOutputs(units: Array<{ number: number }>) {
  return units.length === 0 ? 1 : Math.max(...units.map((unit) => unit.number)) + 1;
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.round(parsed);
}

function storyboardTargetDuration(sizeKind: StudioProject['size_kind']) {
  switch (sizeKind) {
    case 'shorts':
      return 60;
    case 'short':
      return 90;
    case 'feature':
      return 5400;
    case 'unknown':
    default:
      return 120;
  }
}

function totalDuration(units: Array<{ durationS: number }>) {
  return units.reduce((total, unit) => total + unit.durationS, 0);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
