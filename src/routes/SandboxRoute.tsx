import { useEffect, useMemo, useState } from 'react';
import type { SandboxDraft } from '../../shared/types';
import { Button } from '../components/ui/Button';

export function SandboxRoute({ onBack }: { onBack: () => void }) {
  const [drafts, setDrafts] = useState<SandboxDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => drafts.find((draft) => draft.id === selectedId) ?? null,
    [drafts, selectedId],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const rows = await window.fableglitch.db.sandboxDraftsList();
        if (cancelled) {
          return;
        }
        setDrafts(rows);
        if (rows[0]) {
          selectDraft(rows[0]);
        }
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : '读取本地草稿失败');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected || !dirty) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveDraft(selected.id, title, body);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [body, dirty, selected, title]);

  function selectDraft(draft: SandboxDraft) {
    setSelectedId(draft.id);
    setTitle(draft.title);
    setBody(draft.body);
    setDirty(false);
    setStatus(null);
  }

  async function createDraft() {
    try {
      const draft = await window.fableglitch.db.sandboxDraftCreate({
        title: '未命名草稿',
        body: '',
        kind: 'note',
      });
      setDrafts((current) => [draft, ...current]);
      selectDraft(draft);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : '创建本地草稿失败');
    }
  }

  async function saveDraft(id: string, nextTitle: string, nextBody: string) {
    try {
      const updated = await window.fableglitch.db.sandboxDraftUpdate(id, {
        title: nextTitle.trim() || '未命名草稿',
        body: nextBody,
      });
      setDrafts((current) => [updated, ...current.filter((draft) => draft.id !== updated.id)]);
      setDirty(false);
      setStatus('已保存到这台电脑');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : '保存本地草稿失败');
    }
  }

  async function deleteSelectedDraft() {
    if (!selected) {
      return;
    }

    try {
      await window.fableglitch.db.sandboxDraftDelete(selected.id);
      const remaining = drafts.filter((draft) => draft.id !== selected.id);
      setDrafts(remaining);
      if (remaining[0]) {
        selectDraft(remaining[0]);
      } else {
        setSelectedId(null);
        setTitle('');
        setBody('');
      }
      setStatus('草稿已删除');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : '删除本地草稿失败');
    }
  }

  return (
    <div className="h-full overflow-hidden bg-bg text-text">
      <div className="mx-auto flex h-full max-w-[1180px] flex-col gap-5 px-10 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-text-3">个人沙盒</p>
            <h1 className="text-3xl font-bold tracking-tight">本机创作草稿</h1>
            <p className="mt-2 max-w-[720px] text-sm leading-6 text-text-2">
              内容只保存在这台电脑的本地 SQLite，不同步公司资产库，也不会写入 R2 或 GitHub。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onBack}>
              回主页
            </Button>
            <Button variant="gradient" onClick={createDraft}>
              新建草稿
            </Button>
          </div>
        </header>

        {status && (
          <div role="status" className="rounded border border-border bg-surface px-3 py-2 text-sm text-text-2">
            {status}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-4">
          <aside className="overflow-y-auto rounded-lg border border-border bg-surface p-3">
            {loading ? (
              <div className="p-3 font-mono text-xs text-text-3">loading drafts...</div>
            ) : drafts.length === 0 ? (
              <div className="p-3 text-sm leading-6 text-text-2">还没有草稿。点“新建草稿”开始写。</div>
            ) : (
              drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => selectDraft(draft)}
                  className={`mb-2 w-full rounded border px-3 py-3 text-left transition ${
                    draft.id === selectedId
                      ? 'border-accent bg-surface-2'
                      : 'border-border bg-transparent hover:border-border-hi hover:bg-surface-2'
                  }`}
                >
                  <div className="truncate text-sm font-semibold">{draft.title}</div>
                  <div className="mt-1 font-mono text-xs text-text-3">{formatDate(draft.updated_at)}</div>
                </button>
              ))
            )}
          </aside>

          <main className="min-h-0 rounded-lg border border-border bg-surface p-4">
            {selected ? (
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    className="h-11 flex-1 rounded border border-border bg-surface-2 px-3 text-lg font-semibold outline-none focus:border-accent"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setDirty(true);
                    }}
                  />
                  <Button variant="secondary" onClick={() => saveDraft(selected.id, title, body)}>
                    保存
                  </Button>
                  <Button variant="secondary" onClick={deleteSelectedDraft}>
                    删除
                  </Button>
                </div>
                <textarea
                  className="min-h-0 flex-1 resize-none rounded border border-border bg-surface-2 p-4 text-sm leading-7 text-text outline-none focus:border-accent"
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setDirty(true);
                  }}
                  placeholder="写剧本片段、角色设定、prompt 草稿，或者随手记下一个想法。"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-2">
                选择一个草稿，或新建本机草稿。
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
