import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { StudioSizeKind } from '../../../shared/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const SIZE_OPTIONS: { value: StudioSizeKind; label: string; hint: string }[] = [
  { value: 'short', label: '短片', hint: '5-15 分钟，约 15-30 个分镜单元' },
  { value: 'shorts', label: '短视频', hint: '< 60 秒，竖屏抖音/小红书风' },
  { value: 'feature', label: '长片', hint: '30 分钟以上，多剧集分发' },
  { value: 'unknown', label: '待定', hint: '先开个项目，体量晚点定' },
];

export function NewProjectDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; size_kind: StudioSizeKind; inspiration_text?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [sizeKind, setSizeKind] = useState<StudioSizeKind>('short');
  const [inspiration, setInspiration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setSizeKind('short');
    setInspiration('');
    setError(null);
    setSubmitting(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = name.trim() || `创作舱草稿 #${Math.floor(Math.random() * 1000)}`;
      await onCreate({
        name: trimmed,
        size_kind: sizeKind,
        inspiration_text: inspiration.trim() ? inspiration.trim() : null,
      });
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
            className="w-full max-w-[520px] rounded-xl border border-border bg-surface p-7"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
          >
            <h2 id="new-project-title" className="mb-1 text-lg font-bold tracking-tight">
              新建本地创作项目
            </h2>
            <p className="mb-6 text-xs text-text-3 leading-5">
              内容会保存到这台电脑的本地数据库 · 后续可以选择推送入公司项目
            </p>

            <Input
              label="项目名"
              required
              placeholder="如：末日机械人"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-text-2">体量</label>
              <div className="grid grid-cols-2 gap-2">
                {SIZE_OPTIONS.map((opt) => {
                  const active = sizeKind === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSizeKind(opt.value)}
                      className={`flex flex-col items-start rounded-md border p-3 text-left transition ${
                        active
                          ? 'border-accent bg-accent/10 text-text'
                          : 'border-border bg-surface-2 text-text-2 hover:border-border-hi'
                      }`}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="mt-1 text-2xs text-text-3">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="inspiration">
                灵感（可选，可后续在工作台补全）
              </label>
              <textarea
                id="inspiration"
                value={inspiration}
                onChange={(e) => setInspiration(e.target.value)}
                placeholder="一句话梗概、参考视频链接、想要的氛围…"
                rows={3}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none transition placeholder:text-text-4 focus:border-accent/50 focus:bg-surface-3"
              />
            </div>

            {error && (
              <div className="mb-3 rounded border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
              <Button type="button" variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="gradient" disabled={submitting}>
                {submitting ? '创建中…' : '创建项目'}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
