import type { SkillCatalogItem, StudioAgentRunSummary, StudioStage } from '../../shared/types';

type AgentRunUsage = NonNullable<StudioAgentRunSummary['usage']>;

export function createAgentRunSummary({
  stage,
  skill,
  provider,
  model,
  outputCount,
  usage,
  now = Date.now(),
}: {
  stage: StudioStage;
  skill: Pick<SkillCatalogItem, 'id' | 'name_cn'>;
  provider: string;
  model: string;
  outputCount: number;
  usage?: AgentRunUsage;
  now?: number;
}): StudioAgentRunSummary {
  return {
    id: `run_${stage}_${now}`,
    stage,
    skill_id: skill.id,
    skill_name_cn: skill.name_cn,
    provider,
    model,
    status: 'completed',
    output_count: outputCount,
    created_at: now,
    ...(usage ? { usage } : {}),
  };
}

export function withAgentRunMeta<T extends Record<string, unknown>>(
  meta: T,
  agentRun?: StudioAgentRunSummary,
): T & { agent_run?: StudioAgentRunSummary } {
  return agentRun ? { ...meta, agent_run: agentRun } : meta;
}
