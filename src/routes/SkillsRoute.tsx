import { useEffect, useMemo, useState } from 'react';
import type { SkillCatalogItem, SkillCreatePayload } from '../../shared/types';
import { TopNav } from '../components/chrome/TopNav';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { loadActiveSkillIds, saveActiveSkillIds, toggleActiveSkillId } from '../lib/skill-activation';

const emptyDraft: SkillCreatePayload = {
  id: '',
  name_cn: '',
  category: 'script-writer',
  description: '',
  body: '',
};

export function SkillsRoute({ onBack }: { onBack: () => void }) {
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillCreatePayload>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const [skillResult, active] = await Promise.all([api.skills(), loadActiveSkillIds()]);
      if (cancelled) {
        return;
      }

      if (skillResult.ok) {
        setSkills(skillResult.data.skills);
        setSelectedSkillId((current) => current ?? skillResult.data.skills[0]?.id ?? null);
        setError(null);
      } else {
        setError(skillResult.message);
      }
      setActiveIds(active);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSkills = useMemo(
    () => skills.filter((skill) => activeIds.includes(skill.id)),
    [activeIds, skills],
  );
  const grouped = useMemo(() => groupSkills(skills), [skills]);
  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? skills[0] ?? null,
    [selectedSkillId, skills],
  );

  async function toggleSkill(skill: SkillCatalogItem) {
    const next = await toggleActiveSkillId(skill.id);
    setActiveIds(next);
  }

  async function createSkill() {
    setCreating(true);
    setMessage(null);
    const skillId = draft.id?.trim();
    const result = await api.createSkill({
      id: skillId || undefined,
      name_cn: draft.name_cn.trim(),
      category: draft.category.trim(),
      description: draft.description.trim(),
      body: draft.body.trim(),
    });

    if (result.ok) {
      const created = result.data.skill;
      const nextActive = Array.from(new Set([...activeIds, created.id]));
      setSkills((current) => [...current.filter((skill) => skill.id !== created.id), created]);
      setActiveIds(nextActive);
      setSelectedSkillId(created.id);
      await saveActiveSkillIds(nextActive);
      setDraft(emptyDraft);
      setMessage('Skill 已创建并激活');
    } else {
      setMessage(result.message);
    }
    setCreating(false);
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopNav onBackHome={onBack} />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto grid max-w-[1280px] gap-6 xl:grid-cols-[1fr_360px]">
          <section className="min-w-0">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">Agent Skills</p>
                <h1 className="mt-2 text-4xl font-bold tracking-tight">Skills Hub</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-text-2">
                  激活可复用的创作流程，把剧本、分镜、提示词和多 Agent 协作沉淀成可调用的技能。
                </p>
              </div>
              <Button variant="secondary" onClick={onBack}>返回首页</Button>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <Metric label="全部技能" value={String(skills.length)} />
              <Metric label="已激活" value={String(activeIds.length)} />
              <Metric label="分类" value={String(grouped.length)} />
            </div>

            {loading ? (
              <div className="rounded-lg border border-border bg-surface p-6 font-mono text-xs text-text-3">
                loading skills...
              </div>
            ) : error ? (
              <div className="rounded-lg border border-border bg-surface p-6 text-sm text-bad">{error}</div>
            ) : (
              <div className="space-y-7">
                <ActiveShelf skills={activeSkills} activeCount={activeIds.length} />
                {grouped.map(([category, items]) => (
                  <section key={category}>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-xl font-semibold">{categoryLabel(category)}</h2>
                      <span className="font-mono text-xs text-text-4">{items.length} skills</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {items.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          active={activeIds.includes(skill.id)}
                          selected={selectedSkill?.id === skill.id}
                          onOpen={() => setSelectedSkillId(skill.id)}
                          onToggle={() => void toggleSkill(skill)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <aside className="xl:sticky xl:top-8 xl:self-start">
            <div className="space-y-4">
              <SkillDetailPanel
                skill={selectedSkill}
                active={selectedSkill ? activeIds.includes(selectedSkill.id) : false}
                onToggle={() => selectedSkill && void toggleSkill(selectedSkill)}
              />
              <CreateSkillPanel
                draft={draft}
                creating={creating}
                message={message}
                onChange={setDraft}
                onCreate={() => void createSkill()}
              />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ActiveShelf({ skills, activeCount }: { skills: SkillCatalogItem[]; activeCount: number }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">我的技能</h2>
        <span className="rounded-full border border-border bg-surface-2 px-3 py-1 font-mono text-xs text-text-2">
          已激活 {activeCount}
        </span>
      </div>
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span key={skill.id} className="rounded-full bg-surface-3 px-3 py-1 text-sm text-text-2">
              {skill.name_cn} <span className="font-mono text-xs text-text-4">/{skill.id}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-3">还没有激活的技能。</p>
      )}
    </section>
  );
}

function SkillCard({
  skill,
  active,
  selected,
  onOpen,
  onToggle,
}: {
  skill: SkillCatalogItem;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <article className={`min-h-[190px] rounded-lg border bg-surface p-4 transition hover:border-border-hi hover:bg-surface-2 ${selected ? 'border-accent/60 ring-1 ring-accent/20' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{skill.name_cn}</h3>
          <div className="mt-1 font-mono text-xs text-text-4">/{skill.id} · v{skill.version}</div>
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-2 py-1 font-mono text-2xs text-text-3">
          {skill.default_model}
        </span>
      </div>
      <p className="mt-4 line-clamp-3 min-h-[66px] text-sm leading-6 text-text-2">{skill.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-surface-3 px-3 py-1 text-xs text-text-3">{categoryLabel(skill.category)}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label={`Open skill detail ${skill.id}`}
          onClick={onOpen}
        >
          详情
        </Button>
        <Button
          type="button"
          size="sm"
          variant={active ? 'primary' : 'secondary'}
          aria-label={`${active ? '取消激活' : '激活'} ${skill.name_cn}`}
          onClick={onToggle}
        >
          {active ? '取消激活' : '立即激活'}
        </Button>
      </div>
    </article>
  );
}

function SkillDetailPanel({
  skill,
  active,
  onToggle,
}: {
  skill: SkillCatalogItem | null;
  active: boolean;
  onToggle: () => void;
}) {
  if (!skill) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Skill Detail</div>
        <p className="mt-3 text-sm leading-6 text-text-3">选择一个 skill 查看版本、模型和兼容信息。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Skill Detail</p>
          <h2 className="mt-2 text-xl font-semibold">{skill.name_cn}</h2>
          <div className="mt-1 font-mono text-xs text-text-4">/{skill.id}</div>
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-3 py-1 font-mono text-xs text-text-3">
          v{skill.version}
        </span>
      </div>

      <p className="text-sm leading-6 text-text-2">{skill.description}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <DetailMetric label="Category" value={categoryLabel(skill.category)} />
        <DetailMetric label="Model" value={skill.default_model} mono />
        <DetailMetric label="Format" value="Compatible SKILL.md" />
        <DetailMetric label="Status" value={active ? 'Activated' : 'Inactive'} />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-surface-2 p-3">
        <div className="font-mono text-xs text-text-4">Compatible SKILL.md</div>
        <p className="mt-2 text-xs leading-5 text-text-3">
          支持 Claude/Codex 风格的 frontmatter + SKILL.md 内容；当前 Agent 会按分类读取已激活技能并优先展示。
        </p>
      </div>

      <Button
        type="button"
        variant={active ? 'primary' : 'gradient'}
        aria-label={`${active ? 'Deactivate' : 'Activate'} skill ${skill.id}`}
        onClick={onToggle}
        className="mt-5 w-full"
      >
        {active ? '已激活，点击取消' : '激活这个 Skill'}
      </Button>
    </section>
  );
}

function DetailMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="font-mono text-xs text-text-4">{label}</div>
      <div className={`mt-2 text-sm text-text-2 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function CreateSkillPanel({
  draft,
  creating,
  message,
  onChange,
  onCreate,
}: {
  draft: SkillCreatePayload;
  creating: boolean;
  message: string | null;
  onChange: (draft: SkillCreatePayload) => void;
  onCreate: () => void;
}) {
  const canCreate = draft.name_cn.trim() && draft.category.trim() && draft.description.trim() && draft.body.trim();
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Builder</p>
        <h2 className="mt-2 text-xl font-semibold">新建 Skill</h2>
      </div>
      <div className="space-y-4">
        <TextInput label="Skill 名称" value={draft.name_cn} onChange={(value) => onChange({ ...draft, name_cn: value })} />
        <TextInput label="Skill ID" value={draft.id ?? ''} onChange={(value) => onChange({ ...draft, id: value })} placeholder="shot-planner" />
        <TextInput label="分类" value={draft.category} onChange={(value) => onChange({ ...draft, category: value })} placeholder="script-writer" />
        <TextInput label="简介" value={draft.description} onChange={(value) => onChange({ ...draft, description: value })} />
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-2">Skill 指令</span>
          <textarea
            aria-label="Skill 指令"
            value={draft.body}
            onChange={(event) => onChange({ ...draft, body: event.target.value })}
            className="min-h-[180px] w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-3 font-mono text-xs leading-5 text-text outline-none transition placeholder:text-text-4 focus:border-accent/60"
            placeholder="# Role&#10;You are a..."
          />
        </label>
        <Button type="button" variant="gradient" disabled={!canCreate || creating} onClick={onCreate} className="w-full">
          {creating ? '创建中...' : '创建 Skill'}
        </Button>
        {message && <div className="font-mono text-xs text-text-3">{message}</div>}
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-text-2">{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition placeholder:text-text-4 focus:border-accent/60"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="font-mono text-xs text-text-3">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function groupSkills(skills: SkillCatalogItem[]) {
  const groups = new Map<string, SkillCatalogItem[]>();
  for (const skill of skills) {
    groups.set(skill.category, [...(groups.get(skill.category) ?? []), skill]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    general: '通用技能',
    'script-writer': '剧本创作',
    storyboard: '分镜场景',
    'prompt-image': '图像提示词',
    'prompt-video': '视频提示词',
  };
  return labels[category] ?? category;
}
