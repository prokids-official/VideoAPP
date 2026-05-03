import { useMemo, useState } from 'react';
import type { StudioProject } from '../../../../shared/types';
import { Button } from '../../ui/Button';
import { StudioThreeColumn } from '../StudioThreeColumn';

interface InspirationState {
  tags?: string[];
}

interface SaveInput {
  inspirationText: string;
  tags: string[];
}

export function InspirationStage({
  project,
  stateJson,
  onSave,
  onAdvance,
}: {
  project: StudioProject;
  stateJson: string | null | undefined;
  onSave: (input: SaveInput) => Promise<void>;
  onAdvance: () => void | Promise<void>;
}) {
  const initialTags = useMemo(() => parseTags(stateJson), [stateJson]);
  const [text, setText] = useState(project.inspiration_text ?? '');
  const [tagText, setTagText] = useState(initialTags.join(', '));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tags = normalizeTags(tagText);
  const previewText = text.trim();

  async function save() {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await onSave({ inspirationText: previewText, tags });
      setStatus('已保存');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndAdvance() {
    await save();
    await onAdvance();
  }

  return (
    <StudioThreeColumn
      left={
        <form
          className="flex min-h-full flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">灵感输入</div>
            <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-inspiration-text">
              灵感梗概
            </label>
            <textarea
              id="studio-inspiration-text"
              value={text}
              maxLength={4000}
              rows={10}
              onChange={(event) => setText(event.target.value)}
              placeholder="写下故事种子、人物处境、世界观或参考片段..."
              className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
            />
            <div className="mt-1 text-right font-mono text-2xs text-text-4">{text.length}/4000</div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-inspiration-tags">
              题材标签
            </label>
            <input
              id="studio-inspiration-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="赛博, 雨夜, 亲情"
              className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
            />
            <p className="mt-2 text-xs leading-5 text-text-3">用逗号分隔，后续会用于筛选风格、模板和 AI 生成上下文。</p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">AI 协助</div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" disabled>
                从点子王导入
              </Button>
              <Button type="button" variant="secondary" disabled>
                Agent 扩写灵感
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-3">P1.3 接入 Agent 后启用；P1.4 支持 accepted idea 一键转项目。</p>
          </div>

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            {status && <div className="text-xs text-good">{status}</div>}
            {error && <div className="text-xs text-bad">{error}</div>}
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? '保存中...' : '保存草稿'}
            </Button>
            <Button type="button" variant="gradient" disabled={saving} onClick={() => void saveAndAdvance()}>
              下一阶段：剧本
            </Button>
          </div>
        </form>
      }
      center={
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">预览</div>
            <h2 className="text-xl font-semibold tracking-tight">{project.name}</h2>
          </div>

          {previewText ? (
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-5 py-4 text-sm leading-7 text-text-2">
              {previewText}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface-2 px-5 py-10 text-center text-sm text-text-3">
              先写一个故事种子。它会成为后续剧本、角色和场景阶段的上下文。
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-2">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      }
      right={
        <div className="text-sm text-text-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-text-4">版本</div>
          <p className="leading-6 text-text-2">P1.2 先保存当前草稿。版本对比、从点子王一键转项目留到 P1.4。</p>
        </div>
      }
    />
  );
}

function parseTags(stateJson: string | null | undefined) {
  if (!stateJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(stateJson) as InspirationState;
    return Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}
