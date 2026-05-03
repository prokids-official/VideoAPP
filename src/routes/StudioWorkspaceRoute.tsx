import { useEffect, useMemo, useState } from 'react';
import type { StudioAsset, StudioProjectBundle, StudioStage } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { StageProgressBar } from '../components/studio/StageProgressBar';
import { StudioThreeColumn } from '../components/studio/StudioThreeColumn';
import { InspirationStage } from '../components/studio/stages/InspirationStage';
import { ScriptStage, type SaveScriptInput } from '../components/studio/stages/ScriptStage';
import { CharacterStage } from '../components/studio/stages/CharacterStage';
import { SceneStage } from '../components/studio/stages/SceneStage';
import { PropStage } from '../components/studio/stages/PropStage';
import { StoryboardStage, type SaveStoryboardInput } from '../components/studio/stages/StoryboardStage';
import type { SaveEntityInput } from '../components/studio/stages/AssetEntityStage';
import { STAGE_LABELS, nextStage, studioApi } from '../lib/studio-api';

/**
 * Personal Creation Cockpit — single-project workspace.
 *
 * Wraps the staged creation flow with a top progress bar + three-column
 * editor layout. The actual per-stage UI is deferred to dedicated stage
 * components (Tasks 5-11 in the P1.2 plan); this shell handles:
 *
 *   - loading the project bundle from the studio bridge
 *   - rendering the progress bar and "← back to list" nav
 *   - hosting whichever stage editor is currently active
 *   - persisting current_stage when the user navigates between stages
 *
 * Per spec §2 decision 2 (assets ↔ company panels 1:1), the assets that
 * stages produce share `type_code` semantics with company asset_types so a
 * later push is a straight 1:1 mapping. We don't enforce that contract
 * here; the stage editors do.
 */
export function StudioWorkspaceRoute({
  projectId,
  onBackToList,
}: {
  projectId: string;
  onBackToList: () => void;
}) {
  const [bundle, setBundle] = useState<StudioProjectBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<StudioStage>('inspiration');

  // Load project bundle on mount / projectId change.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await studioApi.getProject(projectId);
        if (cancelled) return;
        if (!result) {
          setError('项目不存在或已被删除');
          return;
        }
        setBundle(result);
        setActiveStage(result.project.current_stage);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : '读取项目失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Stages with non-empty saved state count as "done" in the progress bar.
  const doneStages = useMemo<ReadonlySet<StudioStage>>(() => {
    if (!bundle) return new Set();
    const set = new Set<StudioStage>();
    for (const [stage, json] of Object.entries(bundle.stage_state)) {
      if (json && json.length > 0) set.add(stage as StudioStage);
    }
    return set;
  }, [bundle]);

  async function gotoStage(stage: StudioStage) {
    if (!bundle || stage === activeStage) {
      setActiveStage(stage);
      return;
    }
    setActiveStage(stage);
    // Persist as project's current_stage (best-effort, non-blocking UI)
    try {
      const updated = await studioApi.updateProject(bundle.project.id, { current_stage: stage });
      setBundle((prev) => (prev ? { ...prev, project: updated } : prev));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新阶段失败');
    }
  }

  async function handleAdvance() {
    const next = nextStage(activeStage);
    if (next) await gotoStage(next);
  }

  async function handleSaveInspiration(input: { inspirationText: string; tags: string[] }) {
    const stateJson = JSON.stringify({
      inspiration_text: input.inspirationText,
      tags: input.tags,
    });
    const updated = await studioApi.updateProject(projectId, {
      inspiration_text: input.inspirationText,
      current_stage: 'inspiration',
    });
    await studioApi.saveStage(projectId, 'inspiration', stateJson);
    setBundle((prev) => (
      prev
        ? {
            ...prev,
            project: updated,
            stage_state: { ...prev.stage_state, inspiration: stateJson },
          }
        : prev
    ));
  }

  async function handleSaveScript(input: SaveScriptInput): Promise<StudioAsset> {
    const meta = {
      mode: input.mode,
      style_hint: input.styleHint,
      duration_sec: input.durationSec,
      skill_id: input.skillId,
      provider: input.provider,
      view_mode: input.viewMode,
      score: null,
      ai_feedback: null,
    };
    const saved = await studioApi.saveAsset({
      project_id: projectId,
      type_code: 'SCRIPT',
      name: input.name,
      variant: null,
      version: 1,
      meta_json: JSON.stringify(meta),
      mime_type: 'text/markdown',
    });
    const file = await studioApi.writeAssetFile(saved.id, input.body);
    const updatedAsset: StudioAsset = {
      ...saved,
      content_path: file.path,
      size_bytes: file.size_bytes,
      updated_at: Date.now(),
    };
    const stateJson = JSON.stringify({
      ...meta,
      name: input.name,
      asset_id: saved.id,
    });
    await studioApi.saveStage(projectId, 'script', stateJson);
    setBundle((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assets: [
          updatedAsset,
          ...prev.assets.filter((asset) => asset.id !== updatedAsset.id),
        ],
        stage_state: { ...prev.stage_state, script: stateJson },
      };
    });
    return updatedAsset;
  }

  async function handleSaveEntity(input: SaveEntityInput): Promise<StudioAsset> {
    const stage = entityStage(input.typeCode);
    const saved = await studioApi.saveAsset({
      project_id: projectId,
      type_code: input.typeCode,
      name: input.name,
      variant: input.variant,
      version: 1,
      meta_json: JSON.stringify(input.meta),
      mime_type: null,
    });
    const stateJson = JSON.stringify({
      type_code: input.typeCode,
      asset_count: countAssetsAfterSave(bundle?.assets ?? [], saved),
      last_asset_id: saved.id,
      last_asset_name: saved.name,
    });
    await studioApi.saveStage(projectId, stage, stateJson);
    setBundle((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assets: [
          saved,
          ...prev.assets.filter((asset) => asset.id !== saved.id),
        ],
        stage_state: { ...prev.stage_state, [stage]: stateJson },
      };
    });
    return saved;
  }

  async function handleSaveStoryboard(input: SaveStoryboardInput): Promise<StudioAsset> {
    const meta = {
      number: input.number,
      summary: input.summary,
      duration_s: input.durationS,
    };
    const saved = await studioApi.saveAsset({
      project_id: projectId,
      type_code: 'STORYBOARD_UNIT',
      name: `分镜 ${padStoryboardNumber(input.number)}`,
      variant: null,
      version: 1,
      meta_json: JSON.stringify(meta),
      mime_type: null,
    });
    const stateJson = JSON.stringify({
      unit_count: countAssetsAfterSave(bundle?.assets ?? [], saved),
      last_asset_id: saved.id,
      last_number: input.number,
    });
    await studioApi.saveStage(projectId, 'storyboard', stateJson);
    setBundle((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assets: [
          saved,
          ...prev.assets.filter((asset) => asset.id !== saved.id),
        ],
        stage_state: { ...prev.stage_state, storyboard: stateJson },
      };
    });
    return saved;
  }

  if (loading) {
    return <CenteredStatus text="loading project…" />;
  }
  if (error || !bundle) {
    return (
      <div className="h-full overflow-y-auto bg-bg px-10 py-10 text-text">
        <div className="mx-auto max-w-[680px] rounded-lg border border-bad/40 bg-bad/10 p-6">
          <h2 className="mb-2 text-lg font-semibold text-bad">无法打开项目</h2>
          <p className="mb-4 text-sm text-text-2">{error ?? '未知错误'}</p>
          <Button variant="secondary" onClick={onBackToList}>
            回项目列表
          </Button>
        </div>
      </div>
    );
  }

  const { project, assets } = bundle;
  const stageAssets = filterStageAssets(assets, activeStage);

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      {/* sub-nav */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <button
          type="button"
          onClick={onBackToList}
          className="text-sm text-text-3 transition hover:text-text"
        >
          ← 项目列表
        </button>
        <span className="text-text-4">/</span>
        <span className="text-sm font-semibold">{project.name}</span>
        <span className="text-text-4">·</span>
        <span className="text-xs text-text-3">{STAGE_LABELS[activeStage]}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-text-3 md:inline">本地工作区 · 协作 P2</span>
          <Button variant="secondary" disabled>
            邀请成员
          </Button>
          <Button variant="secondary" onClick={handleAdvance} disabled={!nextStage(activeStage)}>
            下一阶段 →
          </Button>
        </div>
      </div>

      {/* progress strip */}
      <div className="border-b border-border bg-surface/60 px-4">
        <StageProgressBar
          currentStage={activeStage}
          doneStages={doneStages}
          onSelect={(s) => void gotoStage(s)}
        />
      </div>

      {/* stage editor area */}
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {activeStage === 'inspiration' ? (
          <InspirationStage
            project={project}
            stateJson={bundle.stage_state.inspiration ?? null}
            onSave={handleSaveInspiration}
            onAdvance={handleAdvance}
          />
        ) : activeStage === 'script' ? (
          <ScriptStage
            project={project}
            assets={stageAssets}
            stateJson={bundle.stage_state.script ?? null}
            onSave={handleSaveScript}
            onAdvance={handleAdvance}
          />
        ) : activeStage === 'character' ? (
          <CharacterStage
            project={project}
            assets={stageAssets}
            stateJson={bundle.stage_state.character ?? null}
            onSave={handleSaveEntity}
            onAdvance={handleAdvance}
          />
        ) : activeStage === 'scene' ? (
          <SceneStage
            project={project}
            assets={stageAssets}
            stateJson={bundle.stage_state.scene ?? null}
            onSave={handleSaveEntity}
            onAdvance={handleAdvance}
          />
        ) : activeStage === 'prop' ? (
          <PropStage
            project={project}
            assets={stageAssets}
            stateJson={bundle.stage_state.prop ?? null}
            onSave={handleSaveEntity}
            onAdvance={handleAdvance}
          />
        ) : activeStage === 'storyboard' ? (
          <StoryboardStage
            project={project}
            assets={stageAssets}
            scriptAssets={assets.filter((asset) => asset.type_code === 'SCRIPT')}
            stateJson={bundle.stage_state.storyboard ?? null}
            onSave={handleSaveStoryboard}
            onAdvance={handleAdvance}
          />
        ) : (
          <StagePlaceholder stage={activeStage} assets={stageAssets} />
        )}
      </div>
    </div>
  );
}

/**
 * Filter the project's assets to those relevant for the current stage.
 * Stage → asset type_code mapping per spec §2 decision 2.
 */
function filterStageAssets(assets: StudioAsset[], stage: StudioStage): StudioAsset[] {
  const code = stageTypeCode(stage);
  if (!code) return [];
  return assets.filter((a) => a.type_code === code);
}

function stageTypeCode(stage: StudioStage): string | null {
  switch (stage) {
    case 'script':
      return 'SCRIPT';
    case 'character':
      return 'CHAR';
    case 'scene':
      return 'SCENE';
    case 'prop':
      return 'PROP';
    case 'storyboard':
      return 'STORYBOARD_UNIT';
    case 'prompt-img':
      return 'PROMPT_IMG';
    case 'prompt-vid':
      return 'PROMPT_VID';
    default:
      return null;
  }
}

function entityStage(typeCode: SaveEntityInput['typeCode']): StudioStage {
  switch (typeCode) {
    case 'CHAR':
      return 'character';
    case 'SCENE':
      return 'scene';
    case 'PROP':
      return 'prop';
  }
}

function countAssetsAfterSave(assets: StudioAsset[], saved: StudioAsset) {
  const ids = new Set(assets.filter((asset) => asset.type_code === saved.type_code).map((asset) => asset.id));
  ids.add(saved.id);
  return ids.size;
}

function padStoryboardNumber(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * Placeholder rendered until each stage's real editor lands in Tasks 5-11.
 * Shows the assets the workspace has loaded so the user can verify the
 * shell + bridge round-trip is working.
 */
function StagePlaceholder({ stage, assets }: { stage: StudioStage; assets: StudioAsset[] }) {
  return (
    <StudioThreeColumn
      left={
        <div className="text-sm text-text-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-text-4">参数 / 输入</div>
          <p className="text-text-2">
            「{STAGE_LABELS[stage]}」阶段编辑器即将上线。
          </p>
          <p className="mt-2 text-xs text-text-3">
            P1.2 plan 任务 {stageTaskNumber(stage)} 会落地这一阶段的具体表单。
          </p>
        </div>
      }
      center={
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-text-4">编辑区</div>
          {assets.length === 0 ? (
            <p className="text-sm leading-6 text-text-2">
              这个阶段还没有保存的内容。
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {assets.map((a) => (
                <li
                  key={a.id}
                  className="rounded border border-border bg-surface-2 px-3 py-2"
                >
                  <span className="font-medium text-text">{a.name}</span>
                  {a.variant && <span className="ml-2 text-text-3">· {a.variant}</span>}
                  <span className="ml-2 font-mono text-xs text-text-3">v{a.version}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
      right={
        <div className="text-sm text-text-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-text-4">资产篮子</div>
          <p className="text-text-2">
            <span className="font-mono">{assets.length}</span> 项本地资产
          </p>
          <p className="mt-2 text-xs text-text-3">历史版本对比留待 P1.4。</p>
        </div>
      }
    />
  );
}

function stageTaskNumber(stage: StudioStage): string {
  switch (stage) {
    case 'inspiration':
      return '5';
    case 'script':
      return '6';
    case 'character':
    case 'scene':
    case 'prop':
      return '7';
    case 'storyboard':
      return '8';
    case 'prompt-img':
    case 'prompt-vid':
      return '9';
    case 'canvas':
      return '10';
    case 'export':
      return '11';
  }
}

function CenteredStatus({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-bg font-mono text-xs text-text-3">
      {text}
    </div>
  );
}
