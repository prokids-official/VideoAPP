import { useEffect, useMemo, useState } from 'react';
import type { AgentMessage, SkillCatalogItem, StudioAgentRunSummary, StudioAsset, StudioProject } from '../../../../shared/types';
import { defaultAiProviderSettings, loadAiProviderSettings } from '../../../lib/ai-provider-settings';
import { createAgentRunSummary } from '../../../lib/agent-run-summary';
import { api } from '../../../lib/api';
import { providerConfigForSkill } from '../../../lib/ai-model-routing';
import { loadActiveSkillIds } from '../../../lib/skill-activation';
import { Button } from '../../ui/Button';
import { AgentRunCard } from '../AgentRunCard';
import { StudioThreeColumn } from '../StudioThreeColumn';

type ScriptMode = 'from-scratch' | 'optimize-existing' | 'import-existing';
type ScriptViewMode = 'trailer' | 'dialogue-only' | 'shooting-script';

interface ScriptState {
  name?: string;
  body?: string;
  asset_id?: string;
  mode?: ScriptMode;
  style_hint?: string;
  revision_instruction?: string;
  visual_context?: string;
  duration_sec?: number;
  skill_id?: string;
  provider?: string;
  view_mode?: ScriptViewMode;
  last_agent_run?: StudioAgentRunSummary;
}

export interface SaveScriptInput {
  name: string;
  body: string;
  mode: ScriptMode;
  styleHint: string;
  revisionInstruction: string;
  visualContext: string;
  durationSec: number;
  skillId: string;
  provider: string;
  viewMode: ScriptViewMode;
  agentRun?: StudioAgentRunSummary;
}

export function ScriptStage({
  project,
  assets,
  stateJson,
  onSave,
  onAdvance,
  onReadAssetFile,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  onSave: (input: SaveScriptInput) => Promise<StudioAsset>;
  onAdvance: () => void | Promise<void>;
  onReadAssetFile?: (asset: StudioAsset) => Promise<Uint8Array>;
}) {
  const initialState = useMemo(() => parseScriptState(stateJson), [stateJson]);
  const [mode, setMode] = useState<ScriptMode>(initialState.mode ?? 'from-scratch');
  const [name, setName] = useState(initialState.name ?? `${project.name} · 主线剧本`);
  const [styleHint, setStyleHint] = useState(initialState.style_hint ?? '');
  const [revisionInstruction, setRevisionInstruction] = useState(initialState.revision_instruction ?? '');
  const [visualContext, setVisualContext] = useState(initialState.visual_context ?? '');
  const [durationSec, setDurationSec] = useState(String(initialState.duration_sec ?? defaultDuration(project.size_kind)));
  const [body, setBody] = useState(initialState.body ?? '');
  const [skillId, setSkillId] = useState(initialState.skill_id ?? 'grim-fairy-3d');
  const [providerConfig, setProviderConfig] = useState(defaultAiProviderSettings);
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  const [viewMode, setViewMode] = useState<ScriptViewMode>(initialState.view_mode ?? 'shooting-script');
  const [lastAgentRun, setLastAgentRun] = useState<StudioAgentRunSummary | null>(initialState.last_agent_run ?? null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analyzingVision, setAnalyzingVision] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanBody = body.trim();
  const cleanName = name.trim() || `${project.name} · 主线剧本`;
  const cleanDuration = normalizeDuration(durationSec);
  const selectedSkill = skills.find((skill) => skill.id === skillId) ?? null;
  const selectedSkillActive = selectedSkill ? activeSkillIds.includes(selectedSkill.id) : false;
  const routedProviderConfig = providerConfigForSkill(providerConfig, selectedSkill);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingSkills(true);
      const [result, activeIds] = await Promise.all([api.skills('script-writer'), loadActiveSkillIds()]);
      if (cancelled) return;
      setActiveSkillIds(activeIds);
      if (result.ok) {
        const orderedSkills = orderSkillsByActivation(result.data.skills, activeIds);
        const activeDefault = orderedSkills.find((skill) => activeIds.includes(skill.id));
        setSkills(orderedSkills);
        setSkillId((current) => {
          const currentExists = orderedSkills.some((skill) => skill.id === current);
          if (!initialState.skill_id && activeDefault) {
            return activeDefault.id;
          }
          if (!currentExists && orderedSkills[0]) {
            return orderedSkills[0].id;
          }
          return current;
        });
      } else {
        setError(result.message);
      }
      setLoadingSkills(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialState.skill_id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await loadAiProviderSettings();
      if (!cancelled) {
        setProviderConfig(settings);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialState.body || !initialState.asset_id || cleanBody) {
      return;
    }

    const asset = assets.find((item) => item.id === initialState.asset_id);
    if (!asset) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const bytes = onReadAssetFile
          ? await onReadAssetFile(asset)
          : await window.fableglitch.studio.assetReadFile(asset.id);
        if (!cancelled) {
          setBody(new TextDecoder().decode(bytes));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '读取已保存剧本失败');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assets, cleanBody, initialState.asset_id, initialState.body, onReadAssetFile]);

  async function save(overrides: {
    body?: string;
    agentRun?: StudioAgentRunSummary | null;
    revisionInstruction?: string;
  } = {}) {
    const bodyToSave = (overrides.body ?? cleanBody).trim();
    const agentRun = overrides.agentRun ?? lastAgentRun;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await onSave({
        name: cleanName,
        body: bodyToSave,
        mode,
        styleHint: styleHint.trim(),
        revisionInstruction: (overrides.revisionInstruction ?? revisionInstruction).trim(),
        visualContext: visualContext.trim(),
        durationSec: cleanDuration,
        skillId,
        provider: 'company-default',
        viewMode,
        ...(agentRun ? { agentRun } : {}),
      });
      setStatus('SCRIPT 资产已保存');
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

  async function importDocx() {
    setImporting(true);
    setStatus(null);
    setError(null);
    try {
      const picked = await window.fableglitch.fs.openFileDialog([{ name: '剧本', extensions: ['docx'] }]);
      if (!picked) {
        return;
      }
      const { docxToMarkdown } = await import('../../../lib/docx');
      const markdown = await docxToMarkdown(uint8ToArrayBuffer(picked.content));
      setBody(markdown);
      setMode('import-existing');
      if (!name.trim()) {
        setName(picked.name.replace(/\.docx$/i, ''));
      }
      setStatus('已导入 .docx');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败');
    } finally {
      setImporting(false);
    }
  }

  async function runVisionBrief() {
    setAnalyzingVision(true);
    setStatus(null);
    setError(null);
    try {
      const picked = await window.fableglitch.fs.openFileDialog([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]);
      if (!picked) {
        return;
      }
      const result = await api.visionBriefRun({
        skill_id: 'reference-image-briefing',
        input: {
          prompt: 'Summarize visible reference-image facts for the downstream DeepSeek script writer.',
          images: [
            {
              url: imageDataUrl(picked.name, picked.content),
              label: picked.name,
            },
          ],
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setVisualContext(result.data.run.brief);
      setStatus(`Vision brief generated with ${result.data.run.provider}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vision brief failed');
    } finally {
      setAnalyzingVision(false);
    }
  }

  async function runScriptWriter(options: { saveAfter?: boolean; advanceAfter?: boolean } = {}) {
    if (!skillId || loadingSkills || runningAgent) {
      return;
    }
    setRunningAgent(true);
    setStatus(null);
    setError(null);
    try {
      const result = await api.scriptWriterRun({
        skill_id: skillId,
        dry_run: false,
        provider_config: routedProviderConfig,
        input: {
          project_name: project.name,
          mode,
          duration_sec: cleanDuration,
          style_hint: styleHint.trim(),
          revision_instruction: revisionInstruction.trim(),
          inspiration_text: buildInspirationText(project.inspiration_text?.trim() ?? '', visualContext.trim()),
          existing_script: cleanBody,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data.run.status === 'completed' && result.data.run.content) {
        const agentRun = createAgentRunSummary({
          stage: 'script',
          skill: result.data.run.skill,
          provider: result.data.run.provider,
          model: result.data.run.model,
          outputCount: 1,
          usage: result.data.run.usage,
        });
        const generatedBody = result.data.run.content;
        setBody(generatedBody);
        setLastAgentRun(agentRun);
        if (options.saveAfter) {
          await save({
            body: generatedBody,
            agentRun,
            revisionInstruction,
          });
          if (options.advanceAfter) {
            await onAdvance();
          }
          setStatus(options.advanceAfter ? 'AI 已生成剧本并进入角色阶段' : 'AI 已生成并保存剧本');
        } else {
          setStatus(`AI script generated with ${result.data.run.provider}`);
        }
      } else {
        setBody(formatDryRunPromptPreview(result.data.run.messages));
        setStatus('Agent dry-run prompt ready');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 写剧本失败');
    } finally {
      setRunningAgent(false);
    }
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
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">剧本 Agent 草案</div>
            <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-script-mode">
              创作模式
            </label>
            <select
              id="studio-script-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as ScriptMode)}
              className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
            >
              <option value="from-scratch">从零创作</option>
              <option value="optimize-existing">优化已有剧本</option>
              <option value="import-existing">导入已有剧本</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-script-name">
              剧本标题
            </label>
            <input
              id="studio-script-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-script-duration">
                目标时长
              </label>
              <input
                id="studio-script-duration"
                type="number"
                min={15}
                max={7200}
                value={durationSec}
                onChange={(event) => setDurationSec(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-text-2">体量</div>
              <div className="flex h-10 items-center rounded-md border border-border bg-surface-2 px-3 text-sm text-text-3">
                {sizeKindLabel(project.size_kind)}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-script-style">
              风格倾向
            </label>
            <textarea
              id="studio-script-style"
              value={styleHint}
              rows={3}
              onChange={(event) => setStyleHint(event.target.value)}
              placeholder="例如：黑色童话、克制冷感、现代短剧节奏..."
              className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-2" htmlFor="studio-script-revision">
              修改要求
            </label>
            <textarea
              id="studio-script-revision"
              aria-label="修改要求"
              value={revisionInstruction}
              rows={3}
              onChange={(event) => setRevisionInstruction(event.target.value)}
              placeholder="例如：保留主角设定，把冲突改得更强；或让结尾更温暖..."
              className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
            />
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">Vision context</div>
            <textarea
              aria-label="Vision context"
              value={visualContext}
              rows={4}
              onChange={(event) => setVisualContext(event.target.value)}
              placeholder="Reference-image facts will appear here before DeepSeek writes the script."
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-6 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
            />
            <Button type="button" variant="secondary" disabled={analyzingVision} className="mt-2 w-full" onClick={() => void runVisionBrief()}>
              {analyzingVision ? 'Vision brief...' : 'Vision brief'}
            </Button>
            <p className="mt-2 text-xs leading-5 text-text-3">
              CodingPlan only describes references; DeepSeek still handles the script.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">Skill / 模型</div>
            <select
              aria-label="script writer skill"
              value={skillId}
              disabled={loadingSkills || skills.length === 0}
              onChange={(event) => setSkillId(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-xs text-text outline-none transition focus:border-accent/60 focus:bg-surface-3"
            >
              {skills.length === 0 ? (
                <option value={skillId}>{loadingSkills ? 'loading skills...' : skillId}</option>
              ) : (
                skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.id}
                  </option>
                ))
              )}
            </select>
            <div className="mt-2 text-sm font-medium text-text">{selectedSkill?.name_cn ?? skillId}</div>
            <div className="mt-1 text-xs leading-5 text-text-3">
              {selectedSkill ? `${routedProviderConfig.model} · v${selectedSkill.version}` : routedProviderConfig.model}
            </div>
            {selectedSkillActive && (
              <div className="mt-2 inline-flex rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent">
                已激活
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" disabled={loadingSkills || runningAgent || !skillId} onClick={() => void runScriptWriter()}>
              {runningAgent ? 'AI 生成中...' : 'AI 生成草稿'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loadingSkills || runningAgent || !skillId || !cleanBody || !revisionInstruction.trim()}
              onClick={() => void runScriptWriter()}
            >
              按修改要求重写
            </Button>
            <Button
              type="button"
              variant="gradient"
              disabled={loadingSkills || runningAgent || !skillId}
              onClick={() => void runScriptWriter({ saveAfter: true, advanceAfter: true })}
            >
              AI 生成并进入角色阶段
            </Button>
          </div>

          <Button type="button" variant="secondary" disabled={importing} onClick={() => void importDocx()}>
            {importing ? '导入中...' : '导入 .docx'}
          </Button>

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            {status && <div className="text-xs text-good">{status}</div>}
            {error && <div className="text-xs text-bad">{error}</div>}
            <Button type="submit" variant="secondary" disabled={saving || !cleanBody}>
              {saving ? '保存中...' : '保存为 SCRIPT 资产'}
            </Button>
            <Button type="button" variant="gradient" disabled={saving || !cleanBody} onClick={() => void saveAndAdvance()}>
              下一阶段：角色
            </Button>
          </div>
        </form>
      }
      center={
        <div className="flex min-h-full flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 text-xs uppercase tracking-widest text-text-4">Markdown 剧本编辑器</div>
              <h2 className="text-xl font-semibold tracking-tight">{cleanName}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {SCRIPT_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setViewMode(view.id)}
                  className={`h-9 rounded-md border px-3 text-xs transition ${
                    viewMode === view.id
                      ? 'border-accent/60 bg-accent/15 text-accent'
                      : 'border-border bg-surface-2 text-text-3 hover:text-text'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            aria-label="剧本正文"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="粘贴、导入或手写剧本。P1.3 后这里会接入剧本 Agent 与评分官。"
            className="min-h-[420px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-4 py-4 font-mono text-sm leading-7 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60 focus:bg-surface-3"
          />
          <div className="flex items-center justify-between text-xs text-text-3">
            <span>{cleanBody.length} 字符</span>
            <span>当前视图：{SCRIPT_VIEWS.find((view) => view.id === viewMode)?.label}</span>
          </div>
        </div>
      }
      right={
        <div className="space-y-5">
          <AgentRunCard run={lastAgentRun} />

          <section>
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">SCRIPT 资产</div>
            {assets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-6 text-sm leading-6 text-text-3">
                保存后会在这里出现，可在入库阶段推送到公司 SCRIPT 板块。
              </div>
            ) : (
              <div className="space-y-2">
                {assets.map((asset) => (
                  <div key={asset.id} className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="text-sm font-medium text-text">{asset.name}</div>
                    <div className="mt-2 flex items-center justify-between font-mono text-xs text-text-3">
                      <span>v{asset.version}</span>
                      <span>{asset.size_bytes ? `${asset.size_bytes} bytes` : 'local draft'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">评分官</div>
            <div className="text-sm font-semibold text-text">未评分</div>
            <p className="mt-2 text-xs leading-5 text-text-3">
              P1.3 上线后启用。评分 ≥80 自动放行，低于 80 可让 AI 重写或手动通过。
            </p>
          </section>

          <section className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-text-4">协作者</div>
            <div className="text-sm text-text-2">当前仅本地作者</div>
            <Button type="button" variant="secondary" disabled className="mt-3 w-full">
              邀请协作者
            </Button>
            <p className="mt-2 text-xs leading-5 text-text-3">P2 启用多人协作、权限和工作区邀请。</p>
          </section>
        </div>
      }
    />
  );
}

const SCRIPT_VIEWS: Array<{ id: ScriptViewMode; label: string }> = [
  { id: 'shooting-script', label: '外包友好式' },
  { id: 'trailer', label: '预告片式' },
  { id: 'dialogue-only', label: '纯台词式' },
];

function parseScriptState(stateJson: string | null | undefined): ScriptState {
  if (!stateJson) {
    return {};
  }
  try {
    return JSON.parse(stateJson) as ScriptState;
  } catch {
    return {};
  }
}

function defaultDuration(sizeKind: StudioProject['size_kind']) {
  switch (sizeKind) {
    case 'short':
      return 60;
    case 'shorts':
      return 90;
    case 'feature':
      return 5400;
    case 'unknown':
      return 120;
  }
}

function sizeKindLabel(sizeKind: StudioProject['size_kind']) {
  switch (sizeKind) {
    case 'short':
      return '概念短片';
    case 'shorts':
      return '叙事短片';
    case 'feature':
      return '长片/系列';
    case 'unknown':
      return '待定';
  }
}

function normalizeDuration(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.min(7200, Math.max(15, Math.round(parsed)));
}

function orderSkillsByActivation(skills: SkillCatalogItem[], activeIds: string[]) {
  const activeSet = new Set(activeIds);
  return [...skills].sort((a, b) => Number(activeSet.has(b.id)) - Number(activeSet.has(a.id)));
}

function formatDryRunPromptPreview(messages: AgentMessage[]) {
  const parts = messages.map((message) => `## ${message.role.toUpperCase()}\n\n${message.content.trim()}`);
  return `# Script Writer Agent Dry Run\n\n${parts.join('\n\n---\n\n')}\n`;
}

function buildInspirationText(inspirationText: string, visualContext: string) {
  if (!visualContext) {
    return inspirationText;
  }
  return [inspirationText, '', 'Reference image context:', visualContext].filter((part) => part !== '').join('\n');
}

function imageDataUrl(filename: string, content: Uint8Array) {
  return `data:${imageMimeType(filename)};base64,${uint8ToBase64(content)}`;
}

function imageMimeType(filename: string) {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return 'image/png';
  }
}

function uint8ToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.slice();
  return copy.buffer as ArrayBuffer;
}
