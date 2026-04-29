import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TreeAlbum, TreeContent, TreeEpisode, TreeSeries } from '../../../shared/types';

interface Props {
  series: TreeSeries[];
  selectedEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
}

const STATUS_DOT: Record<TreeEpisode['status'], string> = {
  drafting: 'bg-warn',
  review: 'bg-accent',
  published: 'bg-good',
  archived: 'bg-text-4',
};

export function ProjectTree({ series, selectedEpisodeId, onSelectEpisode }: Props) {
  return (
    <aside className="w-[280px] flex-none border-r border-border bg-surface overflow-y-auto">
      <div className="px-5 py-4 text-xs font-semibold text-text-3 uppercase tracking-widest">项目树</div>
      {series.length === 0 ? (
        <div className="px-5 py-3 text-sm text-text-3">
          暂无剧集
          <span className="block font-mono text-xs text-text-4 mt-1">// no episodes yet</span>
        </div>
      ) : (
        <div className="pb-6 px-2">
          {series.map((item) => (
            <SeriesNode
              key={item.id}
              series={item}
              selectedEpisodeId={selectedEpisodeId}
              onSelectEpisode={onSelectEpisode}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function SeriesNode({
  series,
  selectedEpisodeId,
  onSelectEpisode,
}: {
  series: TreeSeries;
  selectedEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const epCount = series.albums.reduce(
    (sum, album) => sum + album.contents.reduce((subSum, content) => subSum + content.episodes.length, 0),
    0,
  );

  return (
    <div>
      <TreeButton levelClass="pl-3" onClick={() => setOpen((value) => !value)}>
        <span className="text-text-3 text-xs w-3">{open ? '▾' : '▸'}</span>
        <span className="text-sm">📚</span>
        <span className="text-sm text-text font-medium truncate">{series.name_cn}</span>
        <span className="ml-auto font-mono text-2xs text-text-4">{epCount}</span>
      </TreeButton>
      {open &&
        series.albums.map((album) => (
          <AlbumNode
            key={album.id}
            album={album}
            selectedEpisodeId={selectedEpisodeId}
            onSelectEpisode={onSelectEpisode}
          />
        ))}
    </div>
  );
}

function AlbumNode({
  album,
  selectedEpisodeId,
  onSelectEpisode,
}: {
  album: TreeAlbum;
  selectedEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <TreeButton levelClass="pl-6" onClick={() => setOpen((value) => !value)}>
        <span className="text-text-3 text-2xs w-3">{open ? '▾' : '▸'}</span>
        <span className="text-sm">📁</span>
        <span className="text-sm text-text-2 truncate">{album.name_cn}</span>
      </TreeButton>
      {open &&
        album.contents.map((content) => (
          <ContentNode
            key={content.id}
            content={content}
            selectedEpisodeId={selectedEpisodeId}
            onSelectEpisode={onSelectEpisode}
          />
        ))}
    </div>
  );
}

function ContentNode({
  content,
  selectedEpisodeId,
  onSelectEpisode,
}: {
  content: TreeContent;
  selectedEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <TreeButton levelClass="pl-10" onClick={() => setOpen((value) => !value)}>
        <span className="text-text-3 text-2xs w-3">{open ? '▾' : '▸'}</span>
        <span className="text-sm">📄</span>
        <span className="text-sm text-text-2 truncate">{content.name_cn}</span>
      </TreeButton>
      {open &&
        content.episodes.map((episode) => (
          <button
            key={episode.id}
            type="button"
            onClick={() => onSelectEpisode(episode.id)}
            className={`w-full flex items-center gap-2 pr-3 py-1.5 rounded-md transition text-left ${
              selectedEpisodeId === episode.id
                ? 'bg-accent/10 text-accent-hi'
                : 'hover:bg-surface-2 text-text-2 hover:text-text'
            }`}
          >
            <span className="pl-14" />
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${STATUS_DOT[episode.status]}`} />
            <span className="text-sm truncate">{episode.name_cn}</span>
          </button>
        ))}
    </div>
  );
}

function TreeButton({
  children,
  levelClass,
  onClick,
}: {
  children: ReactNode;
  levelClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 pr-3 py-1.5 rounded-md hover:bg-surface-2 transition text-left ${levelClass}`}
    >
      {children}
    </button>
  );
}
