import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AssetType, CreateLocalDraftInput, PreviewFilenameResult } from '../../../shared/types';
import { formatBytes } from '../../lib/file-meta';
import { MdPreview } from './preview/MdPreview';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export type PreviewKind = 'markdown' | 'image' | 'video' | 'binary';

export interface PendingImportFile {
  name: string;
  size: number;
  mime_type: string;
  content: ArrayBuffer;
  preview_kind: PreviewKind;
  preview_text?: string;
  save_content: string | ArrayBuffer;
}

export function ImportPreviewDialog({
  open,
  assetType,
  episodeId,
  file,
  preview,
  onClose,
  onSaveDraft,
  mode = 'import',
}: {
  open: boolean;
  assetType: AssetType;
  episodeId: string;
  file: PendingImportFile;
  preview: PreviewFilenameResult;
  onClose: () => void;
  onSaveDraft: (draft: Omit<CreateLocalDraftInput, 'id' | 'local_file_path'>, content: string | ArrayBuffer) => Promise<void>;
  mode?: 'import' | 'paste';
}) {
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wordCount = useMemo(() => countText(file.preview_text ?? ''), [file.preview_text]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSaveDraft(
        {
          episode_id: episodeId,
          type_code: assetType.code,
          name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
          variant: null,
          number: assetType.filename_tpl.includes('{number') ? 1 : null,
          version: 1,
          stage: 'ROUGH',
          language: 'ZH',
          original_filename: file.name,
          final_filename: preview.final_filename,
          storage_backend: preview.storage_backend,
          storage_ref: preview.storage_ref,
          size_bytes: file.size,
          mime_type: file.mime_type,
          source: mode === 'paste' ? 'pasted' : 'imported',
        },
        file.save_content,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 backdrop-blur-xl px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[780px] rounded-2xl border border-border bg-surface p-8 shadow-2xl"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
          >
            <div className="mb-6 flex items-start justify-between gap-6">
              <div>
                <div className="font-mono text-xs text-text-3 mb-2">
                  {mode === 'paste' ? 'PASTE PREVIEW' : 'IMPORT PREVIEW'} · {assetType.code}
                </div>
                <h2 className="text-xl font-bold tracking-tight">
                  {mode === 'paste' ? '粘贴预览' : '导入预览'} · {assetType.name_cn}
                </h2>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-3 transition hover:bg-surface-2 hover:text-text"
                aria-label="关闭"
                onClick={onClose}
              >
                ×
              </button>
            </div>

            <Input label="名称" value={name} onChange={(event) => setName(event.target.value)} />

            <div className="mb-4 rounded-lg border border-accent/30 bg-accent/10 p-4">
              <div className="font-mono text-xs uppercase tracking-[0.04em] text-text-3 mb-2">final filename</div>
              <div className="font-mono text-sm text-accent-hi break-all">{preview.final_filename}</div>
              <div className="font-mono text-xs text-text-3 mt-2 break-all">{preview.storage_ref}</div>
            </div>

            <div className="mb-4 flex flex-wrap gap-3 font-mono text-xs text-text-3">
              <span>{file.name}</span>
              <span>·</span>
              <span>{formatBytes(file.size)}</span>
              <span>·</span>
              <span>{wordCount > 0 ? `${wordCount} 字` : file.mime_type}</span>
            </div>

            <div className="mb-6">
              <div className="text-xs font-semibold text-text-2 uppercase tracking-widest mb-3">内容预览</div>
              <PreviewBody file={file} />
            </div>

            {error && <div className="font-mono text-xs text-bad mb-4">{error}</div>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                取消
              </Button>
              <Button variant="gradient" onClick={() => void save()} disabled={saving}>
                {saving ? '保存中...' : '保存为草稿'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PreviewBody({ file }: { file: PendingImportFile }) {
  const url = useMemo(() => {
    if (file.preview_kind !== 'image' && file.preview_kind !== 'video') {
      return null;
    }
    return URL.createObjectURL(new Blob([file.content], { type: file.mime_type }));
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  if (file.preview_kind === 'markdown') {
    return <MdPreview markdown={file.preview_text ?? ''} compact />;
  }

  if (file.preview_kind === 'image' && url) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <img src={url} alt={file.name} className="max-h-[320px] w-full object-contain" />
      </div>
    );
  }

  if (file.preview_kind === 'video' && url) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <video src={url} className="max-h-[320px] w-full" controls preload="metadata" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-6 font-mono text-xs text-text-3">
      该文件类型暂不支持内嵌预览，将按原文件保存为草稿。
    </div>
  );
}

function countText(value: string): number {
  return value.replace(/\s/g, '').length;
}
