import { useEffect, useState } from 'react';
import type { RecentEpisode, User } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';

export function HomeRoute({
  user,
  onOpenTree,
  onOpenSandbox,
  onOpenIdeas,
  onOpenSettings,
  onCreateEpisode,
}: {
  user: User;
  onOpenTree: () => void;
  onOpenSandbox: () => void;
  onOpenIdeas: () => void;
  onOpenSettings: () => void;
  onCreateEpisode: () => void;
}) {
  const [episodes, setEpisodes] = useState<RecentEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await api.recentEpisodes(5);
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setEpisodes(result.data.episodes);
        setError(null);
      } else {
        setError(result.message);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-bg px-10 py-10 text-text">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="mb-2 text-sm text-text-3">FableGlitch Studio</p>
            <h1 className="text-3xl font-bold tracking-tight">欢迎回来，{user.display_name}</h1>
            <p className="mt-2 max-w-[620px] text-sm leading-6 text-text-2">
              从最近剧集继续，或进入个人沙盒写一点只保存在这台电脑上的草稿。
            </p>
          </div>
          <Button variant="secondary" onClick={onOpenSettings}>
            设置
          </Button>
        </header>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">继续我的工作</h2>
            <Button variant="secondary" onClick={onOpenTree}>
              全部项目
            </Button>
          </div>
          {loading ? (
            <div className="rounded-lg border border-border bg-surface p-6 font-mono text-xs text-text-3">
              fetching recent episodes...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-bad">{error}</div>
          ) : episodes.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {episodes.map((episode) => (
                <button
                  key={episode.id}
                  type="button"
                  className="min-h-[132px] rounded-lg border border-border bg-surface p-4 text-left transition hover:border-border-hi hover:bg-surface-2"
                  onClick={onOpenTree}
                >
                  <div className="truncate text-sm text-text-3">
                    {episode.series_name_cn} / {episode.album_name_cn}
                  </div>
                  <div className="mt-2 text-lg font-semibold">{episode.name_cn}</div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-text-3">
                    <span>{episode.asset_count_pushed} 入库资产</span>
                    <span>{formatDate(episode.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-2">
              这是你第一次使用 FableGlitch。可以先创建公司项目，也可以从个人沙盒写起。
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">创作空间</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <HomeCard title="公司项目" text="团队资产库和入库流程" action="进入" onClick={onOpenTree} />
            <HomeCard title="个人沙盒" text="本机草稿，不同步公司资产库" action="打开" onClick={onOpenSandbox} />
            <HomeCard title="芝兰点子王" text="团队想法墙，P1.1 启用" action="预览" onClick={onOpenIdeas} />
            <HomeCard title="AI 工具" text="P1.2 接入模型和配额" action="敬请期待" disabled />
          </div>
          <div className="mt-4">
            <Button variant="gradient" onClick={onCreateEpisode}>
              新建公司剧集
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function HomeCard({
  title,
  text,
  action,
  disabled = false,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-[154px] rounded-lg border border-border bg-surface p-4 text-left transition hover:border-border-hi hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 min-h-[44px] text-sm leading-6 text-text-2">{text}</p>
      <div className="mt-4 text-sm font-semibold text-accent">{action}</div>
    </button>
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
