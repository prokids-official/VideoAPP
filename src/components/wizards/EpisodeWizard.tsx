import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

type Step = 0 | 1 | 2 | 3;

interface EpisodeCreateInput {
  series_name_cn: string;
  album_name_cn: string;
  content_name_cn: string;
  episode_name_cn: string;
}

const steps = ['选系列', '选专辑', '填内容名', '填剧集名'] as const;

export function EpisodeWizard({
  open,
  onClose,
  onCreate,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: EpisodeCreateInput) => Promise<{ id: string }>;
  onCreated: (episodeId: string) => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [series, setSeries] = useState('');
  const [album, setAlbum] = useState('NA');
  const [content, setContent] = useState('');
  const [episode, setEpisode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pathPreview = useMemo(
    () => [series.trim(), album.trim(), content.trim()].filter(Boolean).join('_'),
    [series, album, content],
  );
  const fullPathPreview = useMemo(
    () => [series.trim(), album.trim(), content.trim(), episode.trim()].filter(Boolean).join('_'),
    [series, album, content, episode],
  );

  const currentValue = [series, album, content, episode][step].trim();
  const canContinue = currentValue.length > 0 && !submitting;

  function goNext() {
    if (!canContinue) {
      setError('请先填写当前步骤');
      return;
    }
    setError(null);
    setStep((value) => Math.min(value + 1, 3) as Step);
  }

  async function submit() {
    if (!canContinue) {
      setError('请先填写剧集名');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await onCreate({
        series_name_cn: series.trim(),
        album_name_cn: album.trim(),
        content_name_cn: content.trim(),
        episode_name_cn: episode.trim(),
      });
      onCreated(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败，请稍后再试');
    } finally {
      setSubmitting(false);
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
            aria-labelledby="episode-wizard-title"
            className="relative w-full max-w-[720px] rounded-2xl border border-border bg-surface px-12 py-10 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-text-3 transition hover:bg-surface-2 hover:text-text"
            >
              ×
            </button>

            <StepIndicator step={step} />

            <div className="font-mono text-xs uppercase tracking-[0.08em] text-text-3 mb-2">
              step {step + 1} of 4
            </div>
            <h2 id="episode-wizard-title" className="text-[28px] font-semibold tracking-tight mb-7">
              {step === 0 && '先选择系列'}
              {step === 1 && '这一集属于哪个专辑'}
              {step === 2 && '填写内容名称'}
              {step === 3 && '为这一集起个正式名字'}
            </h2>

            {step === 0 && (
              <Input label="系列" value={series} onChange={(event) => setSeries(event.target.value)} placeholder="童话剧" />
            )}
            {step === 1 && (
              <Input label="专辑" value={album} onChange={(event) => setAlbum(event.target.value)} placeholder="NA" />
            )}
            {step === 2 && (
              <Input label="内容" value={content} onChange={(event) => setContent(event.target.value)} placeholder="侏儒怪" />
            )}
            {step === 3 && (
              <>
                <Input
                  label="剧集"
                  value={episode}
                  onChange={(event) => setEpisode(event.target.value)}
                  placeholder="第一集"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void submit();
                    }
                  }}
                />
                <div className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.04em] text-text-3 mb-2">episode path</div>
                  <div className="font-mono text-sm text-accent-hi break-all">{pathPreview}</div>
                  <div className="font-mono text-xs text-text-3 mt-2 break-all">{fullPathPreview}</div>
                </div>
              </>
            )}

            {error && <div className="font-mono text-xs text-bad mt-4">{error}</div>}

            <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
              <Button
                variant="secondary"
                onClick={step === 0 ? onClose : () => setStep((value) => Math.max(value - 1, 0) as Step)}
              >
                {step === 0 ? '取消' : '← 上一步'}
              </Button>
              <div className="flex items-center gap-4">
                {step === 3 && <span className="font-mono text-xs text-text-3">enter ↵ 创建</span>}
                {step < 3 ? (
                  <Button variant="gradient" onClick={goNext} disabled={!canContinue}>
                    下一步
                  </Button>
                ) : (
                  <Button variant="gradient" disabled={submitting || !canContinue} onClick={() => void submit()}>
                    {submitting ? '创建中...' : '创建剧集'}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="mb-10 flex items-center">
      {steps.map((label, index) => {
        const done = index < step;
        const active = index === step;
        return (
          <div key={label} className="contents">
            <div className="flex items-center gap-2.5 font-mono text-xs">
              <span
                className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border text-sm font-semibold ${
                  done
                    ? 'border-good/40 bg-good/10 text-good'
                    : active
                      ? 'border-accent/35 bg-accent/10 text-accent-hi'
                      : 'border-border bg-surface-2 text-text-3'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <span className={active ? 'text-text' : done ? 'text-text-2' : 'text-text-3'}>{label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`mx-3 h-px flex-1 ${index < step ? 'bg-good/40' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
