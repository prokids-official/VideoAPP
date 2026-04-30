import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TopNav } from '../components/chrome/TopNav';
import { ASSET_TYPES, getAssetType } from '../lib/asset-types';
import { listDrafts } from '../lib/drafts';
import { useAuth } from '../stores/use-auth';
import type { AssetSource, AssetType, LocalDraft } from '../../shared/types';

interface Props {
  episodeId: string;
  episodeName: string;
  onBack: () => void;
  onOpenSettings: () => void;
}

interface DraftGroup {
  assetType: AssetType;
  drafts: LocalDraft[];
}

const SOURCE_STYLES: Record<AssetSource, string> = {
  imported: 'border-accent/35 bg-accent/10 text-accent-hi',
  pasted: 'border-good/30 bg-good/10 text-good',
  'ai-generated': 'border-warn/35 bg-warn/10 text-warn',
};

const SOURCE_LABELS: Record<AssetSource, string> = {
  imported: 'imported',
  pasted: 'pasted',
  'ai-generated': 'ai-generated',
};

export function PushReviewRoute({ episodeId, episodeName, onBack, onOpenSettings }: Props) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listDrafts(episodeId);
        if (cancelled) {
          return;
        }

        setDrafts(rows);
        setSelectedIds(new Set(rows.map((draft) => draft.id)));
        setCommitMessage(`feat(${episodeName}): ${rows.length} 项资产 by ${user?.display_name ?? user?.email ?? 'unknown'}`);
      } catch (cause) {
        if (cancelled) {
          return;
        }
        setDrafts([]);
        setSelectedIds(new Set());
        setError(cause instanceof Error ? cause.message : '草稿加载失败');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [episodeId, episodeName, user?.display_name, user?.email]);

  const groups = useMemo<DraftGroup[]>(() => {
    const byType = new Map<string, LocalDraft[]>();
    for (const draft of drafts) {
      const rows = byType.get(draft.type_code) ?? [];
      rows.push(draft);
      byType.set(draft.type_code, rows);
    }

    return ASSET_TYPES.filter((type) => byType.has(type.code))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((assetType) => ({
        assetType,
        drafts: [...(byType.get(assetType.code) ?? [])].sort((a, b) =>
          a.final_filename.localeCompare(b.final_filename),
        ),
      }));
  }, [drafts]);

  const selectedDrafts = useMemo(
    () => drafts.filter((draft) => selectedIds.has(draft.id)),
    [drafts, selectedIds],
  );
  const totalBytes = useMemo(() => sumBytes(drafts), [drafts]);
  const selectedBytes = useMemo(() => sumBytes(selectedDrafts), [selectedDrafts]);

  function toggleDraft(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleGroup(groupDrafts: LocalDraft[]) {
    setSelectedIds((current) => {
      const allSelected = groupDrafts.every((draft) => current.has(draft.id));
      const next = new Set(current);
      for (const draft of groupDrafts) {
        if (allSelected) {
          next.delete(draft.id);
        } else {
          next.add(draft.id);
        }
      }
      return next;
    });
  }

  function handlePush() {
    const payload = {
      episode_id: episodeId,
      draft_ids: selectedDrafts.map((draft) => draft.id),
      commit_message: commitMessage,
    };
    console.log('[fableglitch] Task 9 push payload', payload);
    window.alert('Task 9 will wire this up');
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopNav onOpenSettings={onOpenSettings} />
      <div className="border-b border-border bg-surface px-8 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-xs text-text-3 transition hover:text-text"
        >
          ← 返回剧集
        </button>
      </div>

      <main className="flex-1 overflow-y-auto px-10 py-12 pb-36">
        <div className="mx-auto max-w-[880px]">
          <h1 className="mb-3.5 text-4xl font-bold tracking-tight">入库评审 · {episodeName}</h1>
          <div
            aria-label={`${drafts.length} 项待入库 · ${formatBytes(totalBytes)}`}
            className="mb-12 font-mono text-xs text-text-3"
          >
            {drafts.length} 项待入库
            <span className="mx-2 text-text-4">·</span>
            {formatBytes(totalBytes)}
          </div>

          {error ? (
            <StatusPanel title="草稿加载失败" text={error} />
          ) : loading ? (
            <StatusPanel title="读取本地草稿" text="loading drafts..." />
          ) : groups.length === 0 ? (
            <StatusPanel title="暂无待入库草稿" text="先在资产面板保存草稿，再回到这里评审。" />
          ) : (
            <div className="space-y-8">
              {groups.map((group) => (
                <DraftSection
                  key={group.assetType.code}
                  group={group}
                  selectedIds={selectedIds}
                  onToggleDraft={toggleDraft}
                  onToggleGroup={toggleGroup}
                />
              ))}
            </div>
          )}

          <div className="mt-10">
            <label htmlFor="commit-message" className="mb-2 block text-sm font-medium text-text-2">
              commit message
            </label>
            <textarea
              id="commit-message"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              className="min-h-20 w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm leading-relaxed text-text outline-none transition focus:border-accent/40 focus:bg-surface-2"
            />
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/85 px-10 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4">
          <div data-testid="push-selected-summary" className="font-mono text-sm text-text-2">
            已选 <span className="text-accent-hi">{selectedDrafts.length}</span> 项
            <span className="mx-2 text-text-4">·</span>
            {formatBytes(selectedBytes)}
          </div>
          <motion.button
            type="button"
            disabled={selectedDrafts.length === 0}
            onClick={handlePush}
            animate={
              selectedDrafts.length > 0
                ? { boxShadow: ['0 0 0 0 rgba(155,124,255,0.42)', '0 0 0 14px rgba(155,124,255,0)'] }
                : { boxShadow: '0 0 0 0 rgba(155,124,255,0)' }
            }
            transition={{ duration: 2.4, repeat: selectedDrafts.length > 0 ? Infinity : 0, ease: 'easeInOut' }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-0 bg-gradient-brand px-7 text-base font-semibold tracking-tight text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⚡ 推送
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function DraftSection({
  group,
  selectedIds,
  onToggleDraft,
  onToggleGroup,
}: {
  group: DraftGroup;
  selectedIds: Set<string>;
  onToggleDraft: (id: string) => void;
  onToggleGroup: (drafts: LocalDraft[]) => void;
}) {
  const allSelected = group.drafts.every((draft) => selectedIds.has(draft.id));
  const panelName = getAssetType(group.assetType.code)?.name_cn ?? group.assetType.name_cn;

  return (
    <section>
      <div className="mb-3.5 flex items-center gap-3">
        <input
          type="checkbox"
          aria-label={`全选 ${panelName}`}
          checked={allSelected}
          onChange={() => onToggleGroup(group.drafts)}
          className="h-4.5 w-4.5 accent-accent"
        />
        <div className="text-lg font-semibold">
          <span className="mr-2">{group.assetType.icon ?? '□'}</span>
          {panelName}
        </div>
        <div className="font-mono text-xs text-text-3">{group.drafts.length} 项</div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {group.drafts.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            selected={selectedIds.has(draft.id)}
            onToggle={() => onToggleDraft(draft.id)}
          />
        ))}
      </div>
    </section>
  );
}

function DraftRow({ draft, selected, onToggle }: { draft: LocalDraft; selected: boolean; onToggle: () => void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3.5 border-b border-border px-5 py-3.5 transition last:border-b-0 hover:bg-surface-2">
      <input
        type="checkbox"
        aria-label={`选择 ${draft.final_filename}`}
        checked={selected}
        onChange={onToggle}
        className="h-4.5 w-4.5 flex-none accent-accent"
      />
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">{draft.final_filename}</span>
      <span className={`flex-none rounded border px-2 py-1 font-mono text-2xs ${SOURCE_STYLES[draft.source]}`}>
        {SOURCE_LABELS[draft.source]}
      </span>
      <span className="flex-none font-mono text-xs text-text-3">{formatBytes(draft.size_bytes)}</span>
    </label>
  );
}

function StatusPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
      <div className="mb-2 text-lg font-semibold text-text-2">{title}</div>
      <p className="font-mono text-sm text-text-3">{text}</p>
    </div>
  );
}

function sumBytes(drafts: LocalDraft[]): number {
  return drafts.reduce((total, draft) => total + draft.size_bytes, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
