import { AnimatePresence, motion } from 'framer-motion';
import type { AssetContentResult, AssetRow } from '../../../../shared/types';
import { Button } from '../../ui/Button';
import { ImagePreview } from './ImagePreview';
import { MdPreview } from './MdPreview';
import { VideoPreview } from './VideoPreview';

export function AssetPreviewModal({
  open,
  asset,
  content,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  asset: AssetRow | null;
  content: AssetContentResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && asset && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-xl px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[92vh] w-full max-w-[1100px] flex-col rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
          >
            <div className="mb-5 flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="font-mono text-xs text-text-3 mb-2">{asset.type_code} · v{asset.version}</div>
                <h2 className="truncate text-xl font-bold tracking-tight">{asset.name}</h2>
                <div className="mt-1 font-mono text-xs text-text-3 break-all">{asset.final_filename}</div>
              </div>
              <Button variant="secondary" onClick={onClose}>
                关闭
              </Button>
            </div>

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center font-mono text-xs text-text-3">
                loading preview...
              </div>
            ) : error ? (
              <div className="flex min-h-[320px] items-center justify-center font-mono text-xs text-bad">{error}</div>
            ) : content ? (
              <PreviewContent asset={asset} content={content} />
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PreviewContent({ asset, content }: { asset: AssetRow; content: AssetContentResult }) {
  if (content.kind === 'markdown') {
    return <MdPreview markdown={content.content} />;
  }

  if (isImage(asset.mime_type)) {
    return <ImagePreview src={content.url} alt={asset.name} />;
  }

  if (isVideo(asset.mime_type)) {
    return <VideoPreview src={content.url} />;
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-6 font-mono text-xs text-text-3">
      暂不支持该文件类型预览
    </div>
  );
}

function isImage(mimeType: string | null) {
  return Boolean(mimeType?.startsWith('image/'));
}

function isVideo(mimeType: string | null) {
  return Boolean(mimeType?.startsWith('video/'));
}
