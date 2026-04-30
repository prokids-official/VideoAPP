import { useState } from 'react';

export function VideoPreview({ src }: { src: string }) {
  const [metadata, setMetadata] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      {failed ? (
        <div className="flex min-h-[240px] items-center justify-center font-mono text-xs text-bad">视频加载失败</div>
      ) : (
        <>
          <video
            src={src}
            controls
            preload="metadata"
            className="max-h-[72vh] w-full rounded border border-border bg-bg"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              setMetadata({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
              });
            }}
            onError={() => setFailed(true)}
          />
          <div className="mt-3 font-mono text-xs text-text-3">
            {metadata
              ? `${formatDuration(metadata.duration)} · ${metadata.width}x${metadata.height}`
              : 'loading metadata...'}
          </div>
        </>
      )}
    </div>
  );
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value)) {
    return '00:00';
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
