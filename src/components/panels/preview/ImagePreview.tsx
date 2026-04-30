import { useState } from 'react';

export function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-surface-2 p-3">
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
    </div>
  );
}
