import { useEffect, useMemo, useState } from 'react';
import type { TreeAlbum, TreeContent, TreeEpisode, TreeResponse, TreeSeries } from '../../../shared/types';

export interface PushTarget {
  series: TreeSeries;
  album: TreeAlbum;
  content: TreeContent;
  episode: TreeEpisode;
}

export function PushTargetSelector({
  tree,
  target,
  onTargetChange,
}: {
  tree: TreeResponse;
  target: PushTarget | null;
  onTargetChange: (target: PushTarget | null) => void;
}) {
  const [selection, setSelection] = useState({
    seriesId: tree.series[0]?.id ?? '',
    albumId: '',
    contentId: '',
    episodeId: '',
  });
  const series = useMemo(
    () => tree.series.find((item) => item.id === selection.seriesId) ?? tree.series[0] ?? null,
    [selection.seriesId, tree],
  );
  const album = useMemo(
    () => series?.albums.find((item) => item.id === selection.albumId) ?? series?.albums[0] ?? null,
    [selection.albumId, series],
  );
  const content = useMemo(
    () => album?.contents.find((item) => item.id === selection.contentId) ?? album?.contents[0] ?? null,
    [album, selection.contentId],
  );
  const episode = useMemo(
    () => content?.episodes.find((item) => item.id === selection.episodeId) ?? content?.episodes[0] ?? null,
    [content, selection.episodeId],
  );

  useEffect(() => {
    if (series && album && content && episode) {
      const next = { series, album, content, episode };
      if (target?.episode.id !== next.episode.id) {
        onTargetChange(next);
      }
      return;
    }
    if (target) {
      onTargetChange(null);
    }
  }, [album, content, episode, onTargetChange, series, target]);

  if (tree.series.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-text-3">
        公司项目库暂无可选剧集。请先去公司项目库创建剧集，再回来入库。
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Select
        label="系列"
        value={series?.id ?? ''}
        onChange={(seriesId) => setSelection({ seriesId, albumId: '', contentId: '', episodeId: '' })}
        options={tree.series.map((item) => ({ id: item.id, name: item.name_cn }))}
      />
      <Select
        label="专辑"
        value={album?.id ?? ''}
        onChange={(albumId) => setSelection((current) => ({ ...current, albumId, contentId: '', episodeId: '' }))}
        options={(series?.albums ?? []).map((item) => ({ id: item.id, name: item.name_cn }))}
      />
      <Select
        label="内容"
        value={content?.id ?? ''}
        onChange={(contentId) => setSelection((current) => ({ ...current, contentId, episodeId: '' }))}
        options={(album?.contents ?? []).map((item) => ({ id: item.id, name: item.name_cn }))}
      />
      <Select
        label="剧集"
        value={episode?.id ?? ''}
        onChange={(episodeId) => setSelection((current) => ({ ...current, episodeId }))}
        options={(content?.episodes ?? []).map((item) => ({ id: item.id, name: item.name_cn }))}
      />
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-widest text-text-4">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
