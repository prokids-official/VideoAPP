import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AssetType } from '../../../shared/types';
import { formatBytes } from '../../lib/file-meta';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export function PasteTextDialog({
  open,
  assetType,
  onClose,
  onContinue,
}: {
  open: boolean;
  assetType: AssetType;
  onClose: () => void;
  onContinue: (input: { name: string; markdown: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byteSize = useMemo(() => new TextEncoder().encode(markdown).byteLength, [markdown]);
  const charCount = useMemo(() => markdown.replace(/\s/g, '').length, [markdown]);

  async function submit() {
    const trimmedName = name.trim();
    const trimmedMarkdown = markdown.trim();

    if (!trimmedName) {
      setError('请填写名称');
      return;
    }

    if (!trimmedMarkdown) {
      setError('请先粘贴文本内容');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onContinue({ name: trimmedName, markdown });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成预览失败');
    } finally {
      setBusy(false);
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
            className="w-full max-w-[760px] rounded-2xl border border-border bg-surface p-8 shadow-2xl"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
          >
            <div className="mb-6 flex items-start justify-between gap-6">
              <div>
                <div className="font-mono text-xs text-text-3 mb-2">PASTE TEXT · {assetType.code}</div>
                <h2 className="text-xl font-bold tracking-tight">粘贴文本 · {assetType.name_cn}</h2>
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

            {!assetType.supports_paste ? (
              <div className="rounded-lg border border-border bg-surface-2 px-4 py-6 text-sm text-text-3">
                该资产类型不支持粘贴文本
              </div>
            ) : (
              <>
                <Input label="名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="剧本 / 提示词" />

                <label className="block text-sm text-text-2 font-medium mb-2" htmlFor="paste-text">
                  文本内容
                </label>
                <textarea
                  id="paste-text"
                  className="min-h-64 w-full rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/35 focus:bg-surface-3"
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  placeholder="在这里粘贴 markdown / 文本内容..."
                />

                <div className="mt-3 flex justify-between font-mono text-xs text-text-3">
                  <span>{charCount} 字</span>
                  <span>{formatBytes(byteSize)}</span>
                </div>

                {error && <div className="font-mono text-xs text-bad mt-3">{error}</div>}

                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="secondary" onClick={onClose} disabled={busy}>
                    取消
                  </Button>
                  <Button variant="gradient" onClick={() => void submit()} disabled={busy}>
                    {busy ? '生成中...' : '继续'}
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
