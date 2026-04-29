import { useEffect, useState } from 'react';
import { TopNav } from '../components/chrome/TopNav';
import { ProjectTree } from '../components/chrome/ProjectTree';
import { api } from '../lib/api';
import type { TreeResponse } from '../../shared/types';

interface AssetType {
  code: string;
  name_cn: string;
  icon: string;
  sort_order: number;
  enabled: boolean;
}

const PANELS_P0: AssetType[] = [
  { code: 'SCRIPT', name_cn: '剧本', icon: '📝', sort_order: 10, enabled: true },
  { code: 'PROMPT_IMG', name_cn: '分镜图提示词', icon: '🖼️', sort_order: 20, enabled: true },
  { code: 'PROMPT_VID', name_cn: '分镜视频提示词', icon: '🎞️', sort_order: 21, enabled: true },
  { code: 'SHOT_IMG', name_cn: '分镜图', icon: '🖼️', sort_order: 22, enabled: true },
  { code: 'SHOT_VID', name_cn: '分镜视频', icon: '🎬', sort_order: 23, enabled: true },
  { code: 'CHAR', name_cn: '角色', icon: '👤', sort_order: 30, enabled: true },
  { code: 'PROP', name_cn: '道具', icon: '🎒', sort_order: 31, enabled: true },
  { code: 'SCENE', name_cn: '场景', icon: '🏞️', sort_order: 32, enabled: true },
];

const PANELS_P4: AssetType[] = [
  { code: 'DIALOG', name_cn: '对白', icon: '💬', sort_order: 40, enabled: false },
  { code: 'BGM', name_cn: '配乐', icon: '🎵', sort_order: 41, enabled: false },
  { code: 'SONG', name_cn: '歌曲', icon: '🎤', sort_order: 42, enabled: false },
  { code: 'SFX', name_cn: '音效', icon: '🔊', sort_order: 43, enabled: false },
];

interface EpisodeDetail {
  episode: {
    id: string;
    name_cn: string;
    status: string;
    episode_path: string;
    series_name: string;
    album_name: string;
    content_name: string;
    created_by_name: string;
    created_at: string;
    updated_at: string;
  };
  counts: { by_type: Record<string, { pushed: number; superseded: number }> };
}

export function TreeRoute() {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [selectedEpId, setSelectedEpId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await api.tree();
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setTree(result.data);
      } else {
        setError(result.message);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedEpId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await api.episodeDetail(selectedEpId);
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setDetail(result.data as EpisodeDetail);
      } else {
        setError(result.message);
      }
      setDetailLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEpId]);

  if (loading) {
    return <StatusScreen label="loading..." />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <TopNav />
      <div className="flex-1 flex overflow-hidden">
        <ProjectTree
          series={tree?.series ?? []}
          selectedEpisodeId={selectedEpId}
          onSelectEpisode={(id) => {
            setSelectedEpId(id);
            setDetail(null);
            setDetailLoading(true);
          }}
        />
        <main className="flex-1 overflow-y-auto px-10 py-12">
          {error ? (
            <StatusPanel title="加载失败" text={error} />
          ) : detailLoading ? (
            <StatusPanel title="读取剧集" text="fetching episode..." />
          ) : detail ? (
            <Dashboard detail={detail} />
          ) : (
            <EmptyHint />
          )}
        </main>
      </div>
    </div>
  );
}

function StatusScreen({ label }: { label: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
      {label}
    </div>
  );
}

function StatusPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-[880px] mx-auto text-center pt-24">
      <div className="text-xl text-text-2 mb-2">{title}</div>
      <p className="font-mono text-sm text-text-3">{text}</p>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="max-w-[880px] mx-auto text-center pt-24">
      <div className="text-xl text-text-2 mb-2">从左侧选一个剧集</div>
      <p className="font-mono text-sm text-text-3">点击项目树里的任意剧集查看详情</p>
    </div>
  );
}

function Dashboard({ detail }: { detail: EpisodeDetail }) {
  const ep = detail.episode;
  const counts = detail.counts.by_type;

  return (
    <div className="max-w-[880px] mx-auto">
      <div className="font-mono text-xs text-text-3 mb-3">
        {ep.series_name}
        <span className="text-text-4 mx-1.5">/</span>
        {ep.album_name}
        <span className="text-text-4 mx-1.5">/</span>
        {ep.content_name}
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-3.5">{ep.name_cn}</h1>
      <div className="font-mono text-xs text-text-3 mb-12">
        created by {ep.created_by_name}
        <span className="text-text-4 mx-2">·</span>
        {new Date(ep.created_at).toLocaleString('zh-CN')}
        <span className="text-text-4 mx-2">·</span>
        <span className="text-warn">
          <span className="inline-block w-2 h-2 rounded-full bg-warn mr-1.5 align-[1px]" />
          {ep.status}
        </span>
      </div>

      <div className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-4">P0 资产面板</div>
      <div className="grid grid-cols-4 gap-3 mb-10">
        {PANELS_P0.map((panel) => (
          <PanelCard key={panel.code} panel={panel} count={counts[panel.code]?.pushed ?? 0} disabled={false} />
        ))}
      </div>

      <div className="text-xs font-semibold text-text-3 uppercase tracking-widest mb-4">P4 音频扩展</div>
      <div className="grid grid-cols-4 gap-3">
        {PANELS_P4.map((panel) => (
          <PanelCard key={panel.code} panel={panel} count={0} disabled />
        ))}
      </div>
    </div>
  );
}

function PanelCard({ panel, count, disabled }: { panel: AssetType; count: number; disabled: boolean }) {
  return (
    <div
      className={`relative bg-surface border border-border rounded-lg p-5 min-h-[124px] transition ${
        disabled ? 'opacity-50' : 'hover:border-border-hi hover:bg-surface-2'
      }`}
    >
      {disabled && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-2xs font-mono text-warn border border-warn/40 bg-warn/10">
          P4
        </div>
      )}
      <div className="text-3xl mb-3 leading-none">{panel.icon}</div>
      <div className="text-base font-medium mb-2">{panel.name_cn}</div>
      <div className="font-mono text-xs text-text-3 flex items-center gap-1.5">
        {disabled ? (
          '即将推出'
        ) : count > 0 ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-good" />
            {count} 个已入库
          </>
        ) : (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn" />
            暂无资产
          </>
        )}
      </div>
    </div>
  );
}
