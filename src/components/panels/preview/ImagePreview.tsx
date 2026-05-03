import { useState, type MouseEvent } from 'react';

export function ImagePreview({ src, alt, onCopyImage }: { src: string; alt: string; onCopyImage?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  function handleContextMenu(event: MouseEvent) {
    if (!onCopyImage || failed) {
      return;
    }

    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  function handleCopyImage() {
    onCopyImage?.();
    setContextMenu(null);
  }

  return (
    <div
      className="relative flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-surface-2 p-3"
      onClick={() => setContextMenu(null)}
      onContextMenu={handleContextMenu}
    >
      {!loaded && !failed && <div className="font-mono text-xs text-text-3">loading image...</div>}
      {failed ? (
        <div className="font-mono text-xs text-bad">图片加载失败</div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`max-h-[72vh] max-w-full object-contain ${loaded ? 'block' : 'hidden'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {contextMenu && (
        <button
          type="button"
          className="fixed z-[60] rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-2xl hover:border-border-hi hover:bg-surface-2"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => {
            event.stopPropagation();
            handleCopyImage();
          }}
        >
          复制图片
        </button>
      )}
    </div>
  );
}
