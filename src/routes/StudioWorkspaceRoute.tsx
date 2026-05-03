import { useEffect, useMemo, useState } from 'react';
import type { StudioAsset, StudioProjectBundle, StudioStage } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { StageProgressBar } from '../components/studio/StageProgressBar';
import { StudioThreeColumn } from '../components/studio/StudioThreeColumn';
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
        <StagePlaceholder stage={activeStage} assets={stageAssets} />
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
