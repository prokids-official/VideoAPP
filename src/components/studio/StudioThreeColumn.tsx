import type { ReactNode } from 'react';

/**
 * Three-column workspace layout used by every stage editor:
 *
 *   ┌──────┬─────────────────────┬──────┐
 *   │ left │ center              │ right│
 *   │ 280  │ flexible            │ 280  │
 *   └──────┴─────────────────────┴──────┘
 *
 * Below 960px the layout collapses to a single column and parents are
 * expected to render their own internal tab/segmented control if they want
 * to keep the three regions accessible. P1.2 MVP doesn't ship that —
 * mobile / narrow Electron windows are out of scope.
 */
export function StudioThreeColumn({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px] md:grid-cols-[280px_minmax(0,1fr)] grid-cols-1">
      <aside className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-4">
        {left}
      </aside>
      <main className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-4">
        {center}
      </main>
      {right !== undefined && (
        <aside className="hidden lg:block min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-4">
          {right}
        </aside>
      )}
    </div>
  );
}
