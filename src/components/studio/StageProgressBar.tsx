import type { StudioStage } from '../../../shared/types';
import { STAGE_LABELS, STAGE_ORDER } from '../../lib/studio-api';

/**
 * 9-segment horizontal progress strip across the top of the studio workspace.
 *
 * Each stage has three states:
 *   - 'todo'      未触及，灰色描边
 *   - 'active'    当前阶段，accent 实色填充
 *   - 'done'      已有内容（stage state 非空），绿色实心 + ✓
 *
 * Click any segment to navigate to that stage; parent owns confirmation if
 * the user has unsaved changes (we don't intercept here).
 */
export function StageProgressBar({
  currentStage,
  doneStages,
  onSelect,
}: {
  currentStage: StudioStage;
  doneStages: ReadonlySet<StudioStage>;
  onSelect: (stage: StudioStage) => void;
}) {
  return (
    <nav
      role="navigation"
      aria-label="创作流程进度"
      className="flex items-center gap-1 overflow-x-auto px-1 py-3"
    >
      {STAGE_ORDER.map((stage, index) => {
        const isActive = stage === currentStage;
        const isDone = doneStages.has(stage) && !isActive;
        const state: 'active' | 'done' | 'todo' = isActive ? 'active' : isDone ? 'done' : 'todo';

        return (
          <div key={stage} className="flex items-center">
            <StageBadge
              index={index + 1}
              label={STAGE_LABELS[stage]}
              state={state}
              onClick={() => onSelect(stage)}
            />
            {index < STAGE_ORDER.length - 1 && (
              <div
                aria-hidden
                className={`mx-1 h-px w-6 flex-none ${isDone ? 'bg-good/50' : 'bg-border'}`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function StageBadge({
  index,
  label,
  state,
  onClick,
}: {
  index: number;
  label: string;
  state: 'active' | 'done' | 'todo';
  onClick: () => void;
}) {
  const dot =
    state === 'active'
      ? 'border-2 border-accent bg-accent text-white'
      : state === 'done'
      ? 'border border-good/60 bg-good/20 text-good'
      : 'border border-border bg-surface text-text-3';

  const text =
    state === 'active'
      ? 'text-accent font-semibold'
      : state === 'done'
      ? 'text-text-2'
      : 'text-text-3';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-surface-2"
      aria-current={state === 'active' ? 'step' : undefined}
    >
      <span
        className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-semibold tabular-nums ${dot}`}
      >
        {state === 'done' ? '✓' : index}
      </span>
      <span className={`text-xs tracking-tight ${text}`}>{label}</span>
    </button>
  );
}
