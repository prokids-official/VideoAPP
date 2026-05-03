import { useState } from 'react';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import type { IdeaSummary, User } from '../../../shared/types';

export function NewIdeaDialog({
  open,
  user,
  onClose,
  onCreated,
}: {
  open: boolean;
  user: User;
  onClose: () => void;
  onCreated: (idea: IdeaSummary) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setTags('');
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || !trimmedDescription) {
      setError('标题和说明都要写一点。');
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await api.createIdea({
      title: trimmedTitle,
      description: trimmedDescription,
      tags: user.role === 'admin' ? splitTags(tags) : undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    onCreated(result.data.idea);
    resetForm();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-idea-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-5 backdrop-blur-xl"
    >
      <div className="w-full max-w-[660px] rounded-xl border border-border bg-surface/95 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-4">Ideas Board</p>
            <h2 id="new-idea-title" className="text-2xl font-semibold tracking-tight text-text">
              记录一个新想法
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-2">
              写成团队能马上理解的提案。后面可以补参考、状态和标签。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭新想法"
            onClick={handleClose}
            className="grid h-9 w-9 place-items-center rounded-full text-xl leading-none text-text-2 transition hover:bg-surface-2 hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              autoFocus
              className="h-[52px] w-full rounded-xl border border-border bg-surface-2 px-4 text-lg font-semibold text-text outline-none transition placeholder:text-text-4 focus:border-border-hi focus:bg-surface-3"
              placeholder="例如：把睡前故事做成三段反转"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text">说明</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4000}
              rows={7}
              className="w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-base leading-7 text-text outline-none transition placeholder:text-text-4 focus:border-border-hi focus:bg-surface-3"
              placeholder="核心梗、观众感受、适合哪一类角色或系列，都可以先粗略写。"
            />
          </label>

          {user.role === 'admin' && (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">标签</span>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-surface-2 px-4 text-base text-text outline-none transition placeholder:text-text-4 focus:border-border-hi focus:bg-surface-3"
                placeholder="角色, 短视频, 节奏"
              />
            </label>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" size="lg" onClick={handleClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="gradient"
            size="lg"
            disabled={submitting || !title.trim() || !description.trim()}
            onClick={() => void handleSubmit()}
            className="min-w-[136px]"
          >
            {submitting ? '发布中...' : '发布想法'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function splitTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\n，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}
