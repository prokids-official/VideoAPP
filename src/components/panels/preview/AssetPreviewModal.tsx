import { AnimatePresence, motion } from 'framer-motion';
import type { AssetContentResult, AssetRelationDetail, AssetRelationsResult, AssetRow } from '../../../../shared/types';
import { Button } from '../../ui/Button';
import { ImagePreview } from './ImagePreview';
import { MdPreview } from './MdPreview';
import { VideoPreview } from './VideoPreview';

export function AssetPreviewModal({
  open,
  asset,
  content,
  relations,
  loading,
  error,
  actionStatus,
  onClose,
  onCopyText,
  onCopyImage,
  onDownloadAsset,
}: {
  open: boolean;
  asset: AssetRow | null;
  content: AssetContentResult | null;
  relations?: AssetRelationsResult | null;
  loading: boolean;
  error: string | null;
  actionStatus: string | null;
  onClose: () => void;
  onCopyText: () => void;
  onCopyImage: () => void;
  onDownloadAsset: () => void;
}) {
  const canCopy = content?.kind === 'markdown';
  const canCopyImage = content?.kind === 'url' && isImage(asset?.mime_type ?? null);
  const canDownload = Boolean(content);

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
                <div className="mb-2 font-mono text-xs text-text-3">
                  {asset.type_code} · v{asset.version}
                </div>
                <h2 className="truncate text-xl font-bold tracking-tight">{asset.name}</h2>
                <div className="mt-1 break-all font-mono text-xs text-text-3">{asset.final_filename}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canCopy && (
                  <Button variant="secondary" onClick={onCopyText}>
                    复制文本
                  </Button>
                )}
                {canCopyImage && (
                  <Button variant="secondary" onClick={onCopyImage}>
                    复制图片
                  </Button>
                )}
                {canDownload && (
                  <Button variant="secondary" onClick={onDownloadAsset}>
                    下载到本地
                  </Button>
                )}
                <Button variant="secondary" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>

            {actionStatus && (
              <div role="status" className="mb-4 rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-2">
                {actionStatus}
              </div>
            )}

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center font-mono text-xs text-text-3">
                loading preview...
              </div>
            ) : error ? (
              <div className="flex min-h-[320px] items-center justify-center font-mono text-xs text-bad">{error}</div>
            ) : content ? (
              <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <PreviewContent asset={asset} content={content} onCopyImage={onCopyImage} />
                <RelatedAssetsPanel relations={relations ?? null} />
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RelatedAssetsPanel({ relations }: { relations: AssetRelationsResult | null }) {
  const hasRelations = Boolean(relations && (relations.outgoing.length > 0 || relations.incoming.length > 0));

  if (!hasRelations || !relations) {
    return null;
  }

  return (
    <aside className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-4">Related assets</div>
      {relations.outgoing.length > 0 && (
        <RelationGroup title="Source" items={relations.outgoing} />
      )}
      {relations.incoming.length > 0 && (
        <RelationGroup title="Generated" items={relations.incoming} />
      )}
    </aside>
  );
}

function RelationGroup({ title, items }: { title: string; items: AssetRelationDetail[] }) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 text-xs font-medium text-text-3">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-border bg-surface px-3 py-2">
            <div className="truncate text-sm font-medium text-text">{item.asset.name}</div>
            <div className="mt-1 font-mono text-[11px] text-text-4">{item.asset.type_code}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewContent({
  asset,
  content,
  onCopyImage,
}: {
  asset: AssetRow;
  content: AssetContentResult;
  onCopyImage: () => void;
}) {
  if (content.kind === 'markdown') {
    return <MdPreview markdown={content.content} />;
  }

  if (isImage(asset.mime_type)) {
    return <ImagePreview src={content.url} alt={asset.name} onCopyImage={onCopyImage} />;
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
