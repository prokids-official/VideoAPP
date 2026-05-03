import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TopNav } from '../components/chrome/TopNav';
import { ASSET_TYPES, getAssetType } from '../lib/asset-types';
import { listDrafts } from '../lib/drafts';
import { useAuth } from '../stores/use-auth';
import type {
  ApiResponse,
  AssetPushItem,
  AssetPushPayload,
  AssetPushResult,
  AssetSource,
  AssetType,
  LocalDraft,
} from '../../shared/types';

interface Props {
  episodeId: string;
  episodeName: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onPushed: (count: number) => void;
}

interface DraftGroup {
  assetType: AssetType;
  drafts: LocalDraft[];
}

const SOURCE_STYLES: Record<AssetSource, string> = {
  imported: 'border-accent/35 bg-accent/10 text-accent-hi',
  pasted: 'border-good/30 bg-good/10 text-good',
  'ai-generated': 'border-warn/35 bg-warn/10 text-warn',
  'studio-export': 'border-border-hi bg-surface-2 text-text-2',
};

const SOURCE_LABELS: Record<AssetSource, string> = {
  imported: 'imported',
  pasted: 'pasted',
  'ai-generated': 'ai-generated',
  'studio-export': 'studio export',
};

interface ToastState {
  tone: 'error' | 'info';
  message: string;
}

export function PushReviewRoute({ episodeId, episodeName, onBack, onOpenSettings, onPushed }: Props) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [conflictKey, setConflictKey] = useState<string | null>(null);
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

  async function runPush(idempotencyKey: string) {
    if (selectedDrafts.length === 0 || pushing) {
      return;
    }

    setPushing(true);
    setToast(null);
    setConflictKey(null);

    const draftSnapshot = selectedDrafts;
    const items = draftSnapshot.map(toPushItem);
    const payload: AssetPushPayload = {
      idempotency_key: idempotencyKey,
      commit_message: commitMessage,
      items,
    };

    try {
      const files = await readDraftFiles(draftSnapshot);
      const result = await window.fableglitch.net.assetPush({ payload, items, files });
      const body = result.body;

      if (result.status >= 200 && result.status < 300 && body?.ok) {
        await cleanupLocalDrafts(body.data, draftSnapshot);
        onPushed(draftSnapshot.length);
        return;
      }

      const failure = parseFailure(result.status, body, result.retryAfter);
      if (failure.code === 'GITHUB_CONFLICT') {
        setConflictKey(idempotencyKey);
        return;
      }
      setToast({ tone: 'error', message: failure.message });
    } catch {
      setToast({ tone: 'error', message: '网络异常' });
    } finally {
      setPushing(false);
    }
  }

  function handlePush() {
    void runPush(crypto.randomUUID());
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopNav onOpenSettings={onOpenSettings} />
      {toast && <Toast tone={toast.tone} message={toast.message} />}
      <div className="border-b border-border bg-surface px-8 py-3">
        <button
          type="button"
          aria-label="Back to episode dashboard"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-2 text-[0] transition hover:border-border-hi hover:text-text"
        >
          <span className="text-sm">返回剧集 Dashboard</span>
        </button>
      </div>

      <main className="flex-1 overflow-y-auto px-10 py-12 pb-36">
        <div className="mx-auto max-w-[880px]">
          <h1 className="mb-3.5 text-3xl font-bold tracking-tight">入库评审 · {episodeName}</h1>
          <div
            aria-label={`${drafts.length} 项待入库 · ${formatBytes(totalBytes)}`}
            className="mb-12 text-sm text-text-3"
          >
            <span className="font-mono text-text-2">{drafts.length}</span> 项待入库
            <span className="mx-2 text-text-4">·</span>
            <span className="font-mono text-text-2">{formatBytes(totalBytes)}</span>
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
          <div data-testid="push-selected-summary" className="text-sm text-text-3">
            已选 <span className="font-mono text-accent-hi">{selectedDrafts.length}</span> 项
            <span className="mx-2 text-text-4">·</span>
            <span className="font-mono text-text">{formatBytes(selectedBytes)}</span>
          </div>
          <button
            type="button"
            disabled={selectedDrafts.length === 0 || pushing}
            onClick={handlePush}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-0 bg-gradient-brand px-7 text-base font-semibold tracking-tight text-white shadow-[0_6px_18px_-2px_rgba(155,124,255,0.45)] transition hover:brightness-110 hover:shadow-[0_8px_22px_-2px_rgba(155,124,255,0.55)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                推送中...
              </>
            ) : (
              '⚡ 推送'
            )}
          </button>
        </div>
      </div>
      {pushing && <PushOverlay />}
      {conflictKey && (
        <ConflictDialog
          onRetry={() => void runPush(conflictKey)}
          onLater={onBack}
        />
      )}
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
        <div className="text-xs text-text-3"><span className="font-mono">{group.drafts.length}</span> 项</div>
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

function Toast({ tone, message }: ToastState) {
  return (
    <div
      role="status"
      className={`fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full border px-4 py-2 font-mono text-xs shadow-lg ${
        tone === 'error'
          ? 'border-red/30 bg-red/10 text-red'
          : 'border-accent/30 bg-accent/10 text-accent-hi'
      }`}
    >
      {message}
    </div>
  );
}

function PushOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/55 backdrop-blur-sm">
      <div className="w-80 rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 text-center text-sm font-medium text-text-2">正在入库资产</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full w-1/2 rounded-full bg-gradient-brand"
            animate={{ x: ['-100%', '220%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </div>
  );
}

function ConflictDialog({ onRetry, onLater }: { onRetry: () => void; onLater: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
      <div role="dialog" className="w-[420px] rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-2 text-lg font-semibold">同事刚推过新内容，重试？</div>
        <p className="mb-6 text-sm leading-relaxed text-text-3">
          GitHub main 分支刚刚被更新。可以用同一个幂等 key 重试，避免重复入库。
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onLater}
            className="h-9 rounded border border-border bg-surface-2 px-4 text-sm text-text-2 transition hover:text-text"
          >
            稍后
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded bg-gradient-brand px-4 text-sm font-semibold text-white transition hover:brightness-110"
          >
            重试
          </button>
        </div>
      </div>
    </div>
  );
}

function toPushItem(draft: LocalDraft): AssetPushItem {
  return {
    local_draft_id: draft.id,
    episode_id: draft.episode_id,
    type_code: draft.type_code,
    name: draft.name,
    variant: draft.variant ?? undefined,
    number: draft.number ?? undefined,
    version: draft.version,
    stage: draft.stage,
    language: draft.language,
    source: draft.source,
    original_filename: draft.original_filename ?? undefined,
    mime_type: draft.mime_type,
    size_bytes: draft.size_bytes,
  };
}

async function readDraftFiles(drafts: LocalDraft[]): Promise<Record<string, ArrayBuffer>> {
  const entries = await Promise.all(
    drafts.map(async (draft) => {
      const data = await window.fableglitch.fs.readDraftFile(draft.local_file_path);
      return [draft.id, toArrayBuffer(data)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function cleanupLocalDrafts(result: AssetPushResult, selectedDrafts: LocalDraft[]) {
  const pushedIds = new Set(result.assets.map((asset) => asset.local_draft_id));
  const ids = pushedIds.size > 0 ? pushedIds : new Set(selectedDrafts.map((draft) => draft.id));

  await Promise.all(
    selectedDrafts
      .filter((draft) => ids.has(draft.id))
      .map(async (draft) => {
        await window.fableglitch.db.draftDelete(draft.id);
        await window.fableglitch.fs.deleteDraftFile(draft.id);
      }),
  );
}

function parseFailure(
  status: number,
  body: ApiResponse<AssetPushResult> | null,
  retryAfter?: number | null,
): { code: string; message: string } {
  if (!body || body.ok) {
    return { code: 'NETWORK', message: `HTTP ${status}` };
  }

  const detailCode = detailString(body.error.details, 'code');
  const code = detailCode ?? body.error.code;
  if (code === 'GITHUB_CONFLICT') {
    return { code, message: body.error.message };
  }
  if (code === 'BACKEND_UNAVAILABLE' || status === 502) {
    return { code, message: '后端临时不可用，请稍后重试' };
  }
  if (code === 'RATE_LIMITED' || status === 429) {
    const seconds = retryAfter ?? detailNumber(body.error.details, 'retry_after') ?? detailNumber(body.error.details, 'retry_after_seconds');
    return { code, message: seconds ? `请求太频繁，请 ${seconds}s 后重试` : '请求太频繁，请稍后重试' };
  }
  return { code, message: body.error.message };
}

function detailString(details: unknown, key: string): string | null {
  if (typeof details === 'object' && details !== null && key in details) {
    const value = (details as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function detailNumber(details: unknown, key: string): number | null {
  if (typeof details === 'object' && details !== null && key in details) {
    const value = (details as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : null;
  }
  return null;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
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
