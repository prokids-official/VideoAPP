import type { StudioAgentRunSummary } from '../../../shared/types';

export function AgentRunCard({ run }: { run?: StudioAgentRunSummary | null }) {
  if (!run) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 text-xs uppercase tracking-widest text-text-4">Agent Run</div>
      <div className="text-sm font-semibold text-text">{run.skill_name_cn}</div>
      <div className="mt-1 font-mono text-xs text-text-3">{run.skill_id}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-3">
        <div>
          <div className="text-text-4">Provider</div>
          <div className="mt-1 font-mono text-text-2">{run.provider}</div>
        </div>
        <div>
          <div className="text-text-4">Model</div>
          <div className="mt-1 font-mono text-text-2">{run.model}</div>
        </div>
        <div>
          <div className="text-text-4">Outputs</div>
          <div className="mt-1 font-mono text-text-2">{run.output_count}</div>
        </div>
        <div>
          <div className="text-text-4">Status</div>
          <div className="mt-1 font-mono text-text-2">{run.status}</div>
        </div>
      </div>
    </section>
  );
}
