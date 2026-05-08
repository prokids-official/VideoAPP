import { describe, expect, it } from 'vitest';
import type { StudioAgentRunSummary } from '../../shared/types';
import { createAgentRunSummary, withAgentRunMeta } from './agent-run-summary';

describe('agent run summary', () => {
  it('creates stable source metadata for a completed agent run', () => {
    expect(createAgentRunSummary({
      stage: 'prompt-img',
      skill: { id: 'prompt-image-director', name_cn: '图片提示词导演' },
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      outputCount: 2,
      now: 123,
    })).toEqual({
      id: 'run_prompt-img_123',
      stage: 'prompt-img',
      skill_id: 'prompt-image-director',
      skill_name_cn: '图片提示词导演',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      status: 'completed',
      output_count: 2,
      created_at: 123,
    });
  });

  it('attaches agent run metadata without changing manual save metadata', () => {
    const run: StudioAgentRunSummary = createAgentRunSummary({
      stage: 'storyboard',
      skill: { id: 'storyboard-breakdown', name_cn: '分镜拆解工坊' },
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      outputCount: 3,
      now: 456,
    });

    expect(withAgentRunMeta({ number: 1 }, run)).toEqual({ number: 1, agent_run: run });
    expect(withAgentRunMeta({ number: 1 })).toEqual({ number: 1 });
  });
});
