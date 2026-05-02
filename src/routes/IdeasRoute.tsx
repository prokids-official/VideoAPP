import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import type { IdeaDetailResult, IdeaStatus, IdeaSummary, User } from '../../shared/types';

const PAGE_SIZE = 20;
const STATUS_FILTERS: Array<IdeaStatus | 'all'> = ['all', 'pending', 'accepted', 'shipped', 'rejected'];

const STATUS_COPY: Record<IdeaStatus | 'all', { label: string; dot: string; text: string }> = {
  all: { label: '全部', dot: 'bg-text-4', text: 'text-text-2' },
  pending: { label: '待评估', dot: 'bg-warn', text: 'text-warn' },
  accepted: { label: '已采纳', dot: 'bg-good', text: 'text-good' },
  shipped: { label: '已落地', dot: 'bg-accent', text: 'text-accent' },
  rejected: { label: '暂不做', dot: 'bg-bad', text: 'text-bad' },
};

function initialStatusFilter(): IdeaStatus | 'all' {
  const value = new URLSearchParams(window.location.search).get('status');
  return STATUS_FILTERS.includes(value as IdeaStatus | 'all') ? (value as IdeaStatus | 'all') : 'all';
}

function initialScope(): 'team' | 'mine' {
  return new URLSearchParams(window.location.search).get('scope') === 'mine' ? 'mine' : 'team';
}

function syncIdeaFiltersToUrl(status: IdeaStatus | 'all', scope: 'team' | 'mine') {
  const params = new URLSearchParams(window.location.search);

  if (status === 'all') {
    params.delete('status');
  } else {
    params.set('status', status);
  }

  if (scope === 'mine') {
    params.set('scope', 'mine');
  } else {
    params.delete('scope');
  }

  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

export function IdeasRoute({
  user,
  reloadKey,
  onBack,
  onCreateIdea,
}: {
  user: User;
  reloadKey: number;
  onBack: () => void;
  onCreateIdea: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>(() => initialStatusFilter());
  const [scope, setScope] = useState<'team' | 'mine'>(() => initialScope());
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<IdeaStatus | 'all', number>>({
    all: 0,
    pending: 0,
    accepted: 0,
    shipped: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [detail, setDetail] = useState<IdeaDetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const results = await Promise.all(
        STATUS_FILTERS.map(async (status) => {
          const result = await api.ideas({ status, limit: 1 });
          return [status, result.ok ? result.data.total : 0] as const;
        }),
      );

      if (!cancelled) {
        setCounts(Object.fromEntries(results) as Record<IdeaStatus | 'all', number>);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      const result = await api.ideas({
        status: statusFilter,
        authorId: scope === 'mine' ? 'me' : undefined,
        limit: PAGE_SIZE,
      });

      if (cancelled) {
        return;
      }

      if (result.ok) {
        setIdeas(result.data.ideas);
        setTotal(result.data.total);
        setNextCursor(result.data.next_cursor);
      } else {
        setIdeas([]);
        setTotal(0);
        setNextCursor(null);
        setError(result.message);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [statusFilter, scope, reloadKey, refreshKey]);

  useEffect(() => {
    if (!detailId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setDetailLoading(true);
      setDetailError(null);
      const result = await api.ideaDetail(detailId);

      if (cancelled) {
        return;
      }

      if (result.ok) {
        setDetail(result.data);
      } else {
        setDetail(null);
        setDetailError(result.message);
      }
      setDetailLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const intro = useMemo(() => {
    if (scope === 'mine') {
      return '只看我提出的点子，方便继续补充和收尾。';
    }
    return '团队共用的灵感池，先轻量记录，再由管理员采纳、搁置或推进落地。';
  }, [scope]);

  async function loadMore() {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    const result = await api.ideas({
      status: statusFilter,
      authorId: scope === 'mine' ? 'me' : undefined,
      cursor: nextCursor,
      limit: PAGE_SIZE,
    });
    setLoadingMore(false);

    if (result.ok) {
      setIdeas((current) => [...current, ...result.data.ideas]);
      setNextCursor(result.data.next_cursor);
      setTotal(result.data.total);
    } else {
      setError(result.message);
    }
  }

  function handleIdeaChanged(next: IdeaSummary) {
    setDetail((current) => current ? { ...current, idea: next } : current);
    setRefreshKey((value) => value + 1);
  }

  function handleIdeaDeleted() {
    setDetailId(null);
    setDetail(null);
    setRefreshKey((value) => value + 1);
  }

  function changeStatusFilter(next: IdeaStatus | 'all') {
    setStatusFilter(next);
    syncIdeaFiltersToUrl(next, scope);
  }

  function changeScope(next: 'team' | 'mine') {
    setScope(next);
    syncIdeaFiltersToUrl(statusFilter, next);
  }

  function openIdea(id: string, mode: 'view' | 'edit' = 'view') {
    setDetailMode(mode);
    setDetailId(id);
  }

  async function deleteIdeaFromCard(idea: IdeaSummary) {
    const result = await api.deleteIdea(idea.id);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="h-full overflow-y-auto bg-[#111113] px-6 py-8 text-text md:px-10">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <header className="flex flex-col gap-6 rounded-[24px] border border-white/8 bg-[#1c1c1e] px-6 py-7 shadow-[0_22px_80px_rgba(0,0,0,0.28)] md:flex-row md:items-end md:justify-between md:px-8">
          <div className="max-w-[720px]">
            <button
              type="button"
              onClick={onBack}
              className="mb-5 text-sm font-medium text-[#a1a1aa] transition hover:text-white"
            >
              ← 回到主页
            </button>
            <p className="mb-2 text-sm font-semibold tracking-[0.16em] text-[#8e8e93] uppercase">P1.1 Ideas Board</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">芝兰点子王</h1>
            <p className="mt-4 max-w-[680px] text-base leading-7 text-[#b8b8bf]">{intro}</p>
          </div>
          <Button
            variant="gradient"
            size="lg"
            onClick={onCreateIdea}
            className="h-[54px] min-w-[164px] rounded-xl text-base"
          >
            + 新想法
          </Button>
        </header>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex flex-wrap gap-2" aria-label="想法状态筛选">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  onClick={() => changeStatusFilter(status)}
                  className={`h-11 rounded-full border px-4 text-sm font-semibold transition ${
                    statusFilter === status
                      ? 'border-white/20 bg-white text-black'
                      : 'border-white/10 bg-[#1c1c1e] text-[#d7d7dd] hover:border-white/20 hover:bg-[#252528]'
                  }`}
                >
                  {STATUS_COPY[status].label}
                  <span className="ml-2 font-mono text-xs opacity-70">{counts[status]}</span>
                </button>
              ))}
            </div>

            <div className="flex w-full rounded-full border border-white/10 bg-[#1c1c1e] p-1 md:w-auto">
              <ScopeButton active={scope === 'team'} onClick={() => changeScope('team')} label="团队全部" />
              <ScopeButton active={scope === 'mine'} onClick={() => changeScope('mine')} label="只看我的" />
            </div>
          </div>

          <div className="min-h-[420px]">
            {loading ? (
              <StatusPanel title="读取想法" text="fetching ideas..." />
            ) : error ? (
              <StatusPanel title="加载失败" text={error} tone="bad" />
            ) : ideas.length > 0 ? (
              <>
                <div className="mb-4 text-sm text-[#8e8e93]">
                  当前视图 <span className="font-mono text-[#f5f5f7]">{total}</span> 个想法
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onOpen={() => openIdea(idea.id)}
                      onEdit={() => openIdea(idea.id, 'edit')}
                      onDelete={() => void deleteIdeaFromCard(idea)}
                    />
                  ))}
                </div>
                {nextCursor && (
                  <div className="mt-7 flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                      className="h-[50px] min-w-[160px] rounded-xl"
                    >
                      {loadingMore ? '加载中...' : '加载更多'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState onCreateIdea={onCreateIdea} mine={scope === 'mine'} />
            )}
          </div>
        </section>
      </div>

      <IdeaDetailDialog
        key={detail?.idea.id ?? 'loading'}
        user={user}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        initialEditing={detailMode === 'edit'}
        open={Boolean(detailId)}
        onClose={() => {
          setDetailId(null);
          setDetailMode('view');
          setDetail(null);
          setDetailError(null);
        }}
        onChanged={handleIdeaChanged}
        onDeleted={handleIdeaDeleted}
      />
    </div>
  );
}

function ScopeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 flex-1 rounded-full px-5 text-sm font-semibold transition md:flex-none ${
        active ? 'bg-white text-black' : 'text-[#b8b8bf] hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function IdeaCard({
  idea,
  onOpen,
  onEdit,
  onDelete,
}: {
  idea: IdeaSummary;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_COPY[idea.status];
  const [deleteArmed, setDeleteArmed] = useState(false);
  const canEdit = Boolean(idea.is_editable_by_me);

  return (
    <article className="group relative min-h-[220px] rounded-xl border border-white/10 bg-[#1c1c1e] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-white/22 hover:bg-[#252528]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="mb-5 flex items-center justify-between gap-3 pr-20">
          <span className={`inline-flex items-center gap-2 rounded-full bg-white/6 px-3 py-1 text-xs font-semibold ${meta.text}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <span className="font-mono text-xs text-[#8e8e93]">{formatDate(idea.created_at)}</span>
        </div>

        <h2 className="line-clamp-2 text-xl font-semibold leading-7 tracking-tight text-white">{idea.title}</h2>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#b8b8bf]">{idea.description}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {idea.tags.length > 0 ? (
            idea.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-[#d7d7dd]">
                {tag}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-white/8 px-2.5 py-1 text-xs text-[#8e8e93]">未加标签</span>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm text-[#a1a1aa]">
          <span className="truncate">由 {idea.author_name || '团队成员'} 提出</span>
          <span className="text-white opacity-0 transition group-hover:opacity-100">查看</span>
        </div>
      </button>

      {canEdit && (
        <div className="absolute right-4 top-4 flex gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <button
            type="button"
            aria-label={`编辑 ${idea.title}`}
            onClick={onEdit}
            className="h-8 rounded-full border border-white/10 bg-white/8 px-3 text-xs font-semibold text-white backdrop-blur transition hover:border-white/20 hover:bg-white/14"
          >
            编辑
          </button>
          <button
            type="button"
            aria-label={`${deleteArmed ? '确认删除' : '删除'} ${idea.title}`}
            onClick={() => {
              if (!deleteArmed) {
                setDeleteArmed(true);
                return;
              }
              onDelete();
            }}
            onBlur={() => setDeleteArmed(false)}
            className={`h-8 rounded-full border px-3 text-xs font-semibold backdrop-blur transition ${
              deleteArmed
                ? 'border-bad/40 bg-bad/16 text-bad'
                : 'border-white/10 bg-white/8 text-[#d7d7dd] hover:border-bad/35 hover:text-bad'
            }`}
          >
            {deleteArmed ? '确认' : '删除'}
          </button>
        </div>
      )}
    </article>
  );
}

function EmptyState({ onCreateIdea, mine }: { onCreateIdea: () => void; mine: boolean }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#1c1c1e] px-6 py-16 text-center">
      <p className="text-2xl font-semibold tracking-tight text-white">{mine ? '你还没有提交想法' : '这个视图暂时是空的'}</p>
      <p className="mx-auto mt-3 max-w-[520px] text-sm leading-6 text-[#b8b8bf]">
        先写一个小而清楚的点子就够了。标题负责让人想点开，说明负责让同事知道怎么接下去。
      </p>
      <Button
        type="button"
        variant="gradient"
        size="lg"
        onClick={onCreateIdea}
        className="mt-7 h-[52px] rounded-xl px-7"
      >
        + 新想法
      </Button>
    </div>
  );
}

function StatusPanel({ title, text, tone = 'muted' }: { title: string; text: string; tone?: 'muted' | 'bad' }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#1c1c1e] px-6 py-16 text-center">
      <p className={`text-xl font-semibold ${tone === 'bad' ? 'text-bad' : 'text-white'}`}>{title}</p>
      <p className="mt-2 font-mono text-xs text-[#8e8e93]">{text}</p>
    </div>
  );
}

function IdeaDetailDialog({
  user,
  open,
  detail,
  loading,
  error,
  initialEditing,
  onClose,
  onChanged,
  onDeleted,
}: {
  user: User;
  open: boolean;
  detail: IdeaDetailResult | null;
  loading: boolean;
  error: string | null;
  initialEditing: boolean;
  onClose: () => void;
  onChanged: (idea: IdeaSummary) => void;
  onDeleted: () => void;
}) {
  const idea = detail?.idea ?? null;
  const references = detail?.references ?? [];
  const [editing, setEditing] = useState(() => initialEditing);
  const [title, setTitle] = useState(() => idea?.title ?? '');
  const [description, setDescription] = useState(() => idea?.description ?? '');
  const [status, setStatus] = useState<IdeaStatus>(() => idea?.status ?? 'pending');
  const [tags, setTags] = useState(() => idea?.tags.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEditContent = Boolean(idea && (idea.author_id === user.id || user.role === 'admin'));
  const canModerate = user.role === 'admin';
  const canDelete = canEditContent;

  if (!open) {
    return null;
  }

  async function handleSave() {
    if (!idea) {
      return;
    }

    setSaving(true);
    setActionError(null);
    const result = await api.updateIdea(idea.id, {
      ...(canEditContent ? { title: title.trim(), description: description.trim() } : {}),
      ...(canModerate ? { status, tags: splitTags(tags) } : {}),
    });
    setSaving(false);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    onChanged(result.data.idea);
    setEditing(false);
  }

  async function handleDelete() {
    if (!idea) {
      return;
    }

    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }

    setSaving(true);
    setActionError(null);
    const result = await api.deleteIdea(idea.id);
    setSaving(false);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 px-5 backdrop-blur-xl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-detail-title"
        className="max-h-[86vh] w-full max-w-[820px] overflow-y-auto rounded-xl border border-white/10 bg-[#1c1c1e]/95 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#8e8e93]">Idea Detail</p>
            <h2 id="idea-detail-title" className="text-2xl font-semibold tracking-tight text-white">
              想法详情
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭想法详情"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-xl leading-none text-[#b8b8bf] transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        {loading ? (
          <StatusPanel title="读取想法" text="fetching idea..." />
        ) : error ? (
          <StatusPanel title="读取失败" text={error} tone="bad" />
        ) : idea ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={idea.status} />
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#b8b8bf]">
                {idea.author_name || '团队成员'}
              </span>
              <span className="font-mono text-xs text-[#8e8e93]">{formatDate(idea.created_at)}</span>
            </div>

            {editing ? (
              <div className="space-y-4">
                {canEditContent && (
                  <>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#f5f5f7]">标题</span>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="h-[52px] w-full rounded-xl border border-white/10 bg-[#2c2c2e] px-4 text-lg font-semibold text-white outline-none focus:border-white/28"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#f5f5f7]">说明</span>
                      <textarea
                        value={description}
                        rows={8}
                        onChange={(event) => setDescription(event.target.value)}
                        className="w-full resize-none rounded-xl border border-white/10 bg-[#2c2c2e] px-4 py-3 text-base leading-7 text-white outline-none focus:border-white/28"
                      />
                    </label>
                  </>
                )}
                {canModerate && (
                  <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#f5f5f7]">状态</span>
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as IdeaStatus)}
                        className="h-[52px] w-full rounded-xl border border-white/10 bg-[#2c2c2e] px-4 text-base text-white outline-none focus:border-white/28"
                      >
                        <option value="pending">待评估</option>
                        <option value="accepted">已采纳</option>
                        <option value="shipped">已落地</option>
                        <option value="rejected">暂不做</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#f5f5f7]">标签</span>
                      <input
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        className="h-[52px] w-full rounded-xl border border-white/10 bg-[#2c2c2e] px-4 text-base text-white outline-none focus:border-white/28"
                      />
                    </label>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h3 className="text-3xl font-semibold leading-tight tracking-tight text-white">{idea.title}</h3>
                <p className="mt-5 whitespace-pre-wrap text-base leading-8 text-[#d7d7dd]">{idea.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {idea.tags.length > 0 ? (
                idea.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-white/10 px-3 py-1 text-sm text-[#d7d7dd]">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[#8e8e93]">暂无标签</span>
              )}
            </div>

            <section className="rounded-xl border border-white/10 bg-[#252528] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">参考资料</h4>
                <span className="font-mono text-xs text-[#8e8e93]">{references.length}</span>
              </div>
              {references.length > 0 ? (
                <div className="space-y-2">
                  {references.map((reference) => (
                    <a
                      key={reference.id}
                      href={reference.url}
                      className="block rounded-lg border border-white/8 bg-[#1c1c1e] px-3 py-2 text-sm text-[#d7d7dd] hover:border-white/18"
                    >
                      {reference.title || reference.url}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-[#8e8e93]">还没有参考链接。后续可以在这里挂短视频、文章或竞品素材。</p>
              )}
            </section>

            {actionError && (
              <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
                {actionError}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-white/8 pt-5 md:flex-row md:items-center md:justify-between">
              <div className="text-xs leading-5 text-[#8e8e93]">
                {idea.status_changed_by_name
                  ? `状态由 ${idea.status_changed_by_name} 更新`
                  : '状态还没有被管理员调整'}
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                {canDelete && (
                  <Button type="button" variant="ghost" size="lg" disabled={saving} onClick={() => void handleDelete()}>
                    {deleteArmed ? '确认删除' : '删除'}
                  </Button>
                )}
                {(canEditContent || canModerate) && (
                  editing ? (
                    <>
                      <Button type="button" variant="secondary" size="lg" onClick={() => setEditing(false)}>
                        取消编辑
                      </Button>
                      <Button
                        type="button"
                        variant="gradient"
                        size="lg"
                        disabled={saving}
                        onClick={() => void handleSave()}
                      >
                        {saving ? '保存中...' : '保存'}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="secondary" size="lg" onClick={() => setEditing(true)}>
                      编辑
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: IdeaStatus }) {
  const meta = STATUS_COPY[status];

  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-white/6 px-3 py-1 text-xs font-semibold ${meta.text}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function splitTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\n，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
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
