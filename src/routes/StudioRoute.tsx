import { useEffect, useState } from 'react';
import type { StudioProject } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { ProjectCard } from '../components/studio/ProjectCard';
import { NewProjectDialog } from '../components/studio/NewProjectDialog';
import { studioApi } from '../lib/studio-api';

/**
 * Personal Creation Cockpit — project list landing.
 *
 * Lists all locally-stored studio projects (driven by the SQLite-backed
 * `window.fableglitch.studio.*` IPC contract from P1.2 Task 1). A project
 * card opens its workspace; the [+ 新建项目] button triggers
 * NewProjectDialog and pushes into the workspace on success.
 *
 * Per spec §2 decision 3, project deletion is hard delete + cascade — we
 * just call `studioApi.deleteProject` after a confirm() and remove the row
 * from local state.
 */
export function StudioRoute({
  onBack,
  onOpenProject,
}: {
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [assetCounts, setAssetCounts] = useState<Record<string, { total: number; pending: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await studioApi.listProjects();
        if (cancelled) return;
        setProjects(rows);
        // load asset counts in parallel for each project
        const entries = await Promise.all(
          rows.map(async (project) => {
            try {
              const assets = await studioApi.listAssets(project.id);
              const pending = assets.filter((a) => a.pushed_to_episode_id == null).length;
              return [project.id, { total: assets.length, pending }] as const;
            } catch {
              return [project.id, { total: 0, pending: 0 }] as const;
            }
          }),
        );
        if (cancelled) return;
        setAssetCounts(Object.fromEntries(entries));
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : '读取本地项目失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(input: { name: string; size_kind: StudioProject['size_kind']; inspiration_text?: string | null }) {
    const project = await studioApi.createProject(input);
    setProjects((prev) => [project, ...prev]);
    setAssetCounts((prev) => ({ ...prev, [project.id]: { total: 0, pending: 0 } }));
    setDialogOpen(false);
    onOpenProject(project.id);
  }

  async function handleDelete(project: StudioProject) {
    const ok = window.confirm(`确认删除项目「${project.name}」？\n这会同时删除该项目下的所有本地资产，无法撤销。`);
    if (!ok) return;
    try {
      await studioApi.deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-bg px-10 py-10 text-text">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="mb-2 text-sm text-text-3">个人创作舱</p>
            <h1 className="text-3xl font-bold tracking-tight">本地创作 · 生产驾驶舱</h1>
            <p className="mt-2 max-w-[680px] text-sm leading-6 text-text-2">
              在这台电脑上创建一个完整的漫剧创作项目，从灵感走到分镜与提示词。完成后可一键推送入公司项目库。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onBack}>
              回主页
            </Button>
            <Button variant="gradient" onClick={() => setDialogOpen(true)}>
              + 新建项目
            </Button>
          </div>
        </header>

        {error && (
          <div role="status" className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
            {error}
          </div>
        )}

        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">最近项目</h2>
          {loading ? (
            <div className="rounded-lg border border-border bg-surface p-6 font-mono text-xs text-text-3">
              loading projects…
            </div>
          ) : projects.length === 0 ? (
            <EmptyState onCreate={() => setDialogOpen(true)} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const counts = assetCounts[project.id] ?? { total: 0, pending: 0 };
                return (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    assetCount={counts.total}
                    pendingPushCount={counts.pending}
                    onOpen={() => onOpenProject(project.id)}
                    onDelete={() => void handleDelete(project)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent">
        ✨
      </div>
      <h3 className="mb-2 text-lg font-semibold">还没有本地项目</h3>
      <p className="mx-auto mb-5 max-w-[420px] text-sm leading-6 text-text-2">
        创作舱是你独立的本地工作台。从一个想法、一段梗概、或者一份已有剧本开始，沿着九个阶段把它推到入库。
      </p>
      <Button variant="gradient" onClick={onCreate}>
        + 创建第一个项目
      </Button>
    </div>
  );
}
