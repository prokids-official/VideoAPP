import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { api } from '../../../lib/api';
import { loadAiProviderSettings } from '../../../lib/ai-provider-settings';
import { loadActiveSkillIds } from '../../../lib/skill-activation';
import { StoryboardStage } from './StoryboardStage';

vi.mock('../../../lib/ai-provider-settings', () => ({
  defaultAiProviderSettings: {
    mode: 'official-deepseek',
    model: 'deepseek-v4-flash',
  },
  loadAiProviderSettings: vi.fn(),
}));

vi.mock('../../../lib/skill-activation', () => ({
  loadActiveSkillIds: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    skills: vi.fn(),
    storyboardRun: vi.fn(),
  },
}));

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'storyboard',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

const scriptAsset: StudioAsset = {
  id: 'script-1',
  project_id: 'studio-1',
  type_code: 'SCRIPT',
  name: '主线剧本',
  variant: null,
  version: 1,
  meta_json: '{}',
  content_path: 'E:\\studio\\script-1.md',
  size_bytes: 120,
  mime_type: 'text/markdown',
  pushed_to_episode_id: null,
  pushed_at: null,
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('StoryboardStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAiProviderSettings).mockResolvedValue({
      mode: 'official-deepseek',
      model: 'deepseek-v4-flash',
    });
    vi.mocked(loadActiveSkillIds).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue({
      ok: true,
      data: {
        skills: [
          {
            id: 'storyboard-breakdown',
            name_cn: '分镜拆解助手',
            category: 'storyboard',
            default_model: 'deepseek-v4-pro',
            version: 1,
            description: '把剧本拆成分镜单元。',
          },
        ],
      },
    });
    vi.mocked(api.storyboardRun).mockResolvedValue({
      ok: true,
      data: {
        run: {
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          skill: {
            id: 'storyboard-breakdown',
            name_cn: '分镜拆解助手',
            category: 'storyboard',
            version: 1,
          },
          messages: [],
          units: [
            { number: 1, summary: '雨夜打开，霓虹门被雨水照亮。', duration_s: 8 },
            { number: 2, summary: '机械少女第一次睁眼。', duration_s: 10 },
          ],
        },
      },
    });
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
        studio: {
          assetReadFile: vi.fn(async () => new TextEncoder().encode('# Script\n\nRain opens on a broken neon gate.')),
        },
      },
    });
  });

  it('saves a simplified storyboard unit and enables AI split when script exists', async () => {
    const onSave = vi.fn(async () => makeStoryboardAsset());

    render(
      <StoryboardStage
        project={project}
        assets={[]}
        scriptAssets={[scriptAsset]}
        stateJson={null}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect((screen.getByRole('button', { name: /AI/ }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByText('主线剧本')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('分镜编号'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('时长秒数'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('分镜摘要'), {
      target: { value: '雨水从破败霓虹灯上滴落，机械少女第一次睁眼。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存分镜单元' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        number: 1,
        summary: '雨水从破败霓虹灯上滴落，机械少女第一次睁眼。',
        durationS: 8,
      });
    });
  });

  it('runs the storyboard agent and saves returned units', async () => {
    const onSave = vi.fn(async (input: { number: number; summary: string; durationS: number }) =>
      makeStoryboardAsset(input),
    );

    render(
      <StoryboardStage
        project={project}
        assets={[]}
        scriptAssets={[scriptAsset]}
        stateJson={null}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /AI/ }));

    await waitFor(() => {
      expect(api.storyboardRun).toHaveBeenCalledWith({
        skill_id: 'storyboard-breakdown',
        provider_config: {
          mode: 'official-deepseek',
          model: 'deepseek-v4-flash',
        },
        input: {
          project_name: '末日机械人',
          duration_sec: 90,
          style_hint: '',
          script_markdown: '# Script\n\nRain opens on a broken neon gate.',
        },
      });
      expect(onSave).toHaveBeenCalledWith({
        number: 1,
        summary: '雨夜打开，霓虹门被雨水照亮。',
        durationS: 8,
      });
      expect(onSave).toHaveBeenCalledWith({
        number: 2,
        summary: '机械少女第一次睁眼。',
        durationS: 10,
      });
    });
  });

  it('lists existing storyboard units from local assets', () => {
    render(
      <StoryboardStage
        project={project}
        assets={[makeStoryboardAsset()]}
        scriptAssets={[]}
        stateJson={null}
        onSave={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('雨夜开场')).toBeTruthy();
    expect(screen.getAllByText('8s').length).toBeGreaterThan(0);
  });

  it('highlights the located storyboard unit from export preflight', () => {
    render(
      <StoryboardStage
        project={project}
        assets={[makeStoryboardAsset()]}
        scriptAssets={[]}
        stateJson={null}
        locateTarget={{
          stage: 'storyboard',
          storyboardAssetId: 'storyboard-1',
          storyboardNumber: 1,
          reason: 'SHOT 01',
        }}
        onSave={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByText('已定位到 SHOT 01')).toBeTruthy();
    expect(screen.getByTestId('storyboard-unit-storyboard-1').getAttribute('data-located')).toBe('true');
  });
});

function makeStoryboardAsset(input: { number: number; summary: string; durationS: number } = {
  number: 1,
  summary: '雨夜开场',
  durationS: 8,
}): StudioAsset {
  return {
    id: `storyboard-${input.number}`,
    project_id: 'studio-1',
    type_code: 'STORYBOARD_UNIT',
    name: `分镜 ${String(input.number).padStart(2, '0')}`,
    variant: null,
    version: 1,
    meta_json: JSON.stringify({ number: input.number, summary: input.summary, duration_s: input.durationS }),
    content_path: null,
    size_bytes: null,
    mime_type: null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
