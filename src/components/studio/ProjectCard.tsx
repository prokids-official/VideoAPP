import type { StudioProject, StudioStage } from '../../../shared/types';
import { STAGE_LABELS, STAGE_ORDER } from '../../lib/studio-api';

/**
 * Card displayed in the StudioRoute project list.
 *
 * Shows project name, current stage label + index, asset count, pending-push
 * indicator (if any local asset has no `pushed_to_episode_id`), and last-
 * updated timestamp. Click → enters the workspace at the project's
 * `current_stage`.
 */
export function ProjectCard({
  project,
  assetCount,
  pendingPushCount,
  onOpen,
  onDelete,
}: {
  project: StudioProject;
  assetCount: number;
  pendingPushCount: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const stageIdx = STAGE_ORDER.indexOf(project.current_stage as StudioStage);
  const stageLabel = STAGE_LABELS[project.current_stage as StudioStage] ?? project.current_stage;
  const totalStages = STAGE_ORDER.length;
  const progressPct = Math.max(0, Math.min(100, ((stageIdx + 1) / totalStages) * 100));

  return (
    <div className="group relative flex min-h-[148px] flex-col rounded-lg border border-border bg-surface p-4 transition hover:border-border-hi hover:bg-surface-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col items-start text-left outline-none"
        aria-label={`打开项目 ${project.name}`}
      >
        <div className="text-base font-semibold tracking-tight text-text">{project.name}</div>

        <div className="mt-2 text-xs text-text-3">
          阶段 · <span className="text-text-2">{stageLabel}</span>{' '}
          <span className="font-mono text-text-3">{stageIdx + 1}/{totalStages}</span>
        </div>

        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent/70"
            style={{ width: `${progressPct}%` }}
            aria-hidden
          />
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-text-3">
          <span>
            <span className="font-mono">{assetCount}</span> 本地资产
          </span>
          {pendingPushCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-warn">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn" />
              <span className="font-mono">{pendingPushCount}</span> 待入库
            </span>
          ) : (
            <span className="text-text-4">已全部推送</span>
          )}
          <span className="font-mono text-text-4">{formatRelative(project.updated_at)}</span>
        </div>
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`删除项目 ${project.name}`}
        title="删除项目"
        className="absolute right-2 top-2 hidden h-7 w-7 place-items-center rounded-md text-text-3 transition hover:bg-surface-3 hover:text-bad group-hover:grid"
      >
        <span aria-hidden>🗑</span>
      </button>
    </div>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.round(hour / 24);
  if (day < 7) return `${day} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
