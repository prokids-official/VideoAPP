import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { PromptImgStage } from './PromptImgStage';
import { PromptVidStage } from './PromptVidStage';

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'prompt-img',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('PromptStage', () => {
  it('saves a manual image prompt for a storyboard unit', async () => {
    const onSave = vi.fn(async () => makePromptAsset('PROMPT_IMG'));

    render(
      <PromptImgStage
        project={project}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[]}
        stateJson={null}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    expect((screen.getByRole('button', { name: 'AI 生成图片提示词' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('雨夜开场')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('图片提示词 01'), {
      target: { value: 'wide shot, rainy ruined city, cinematic neon reflection' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存图片提示词 01' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        storyboardAssetId: 'storyboard-1',
        storyboardNumber: 1,
        storyboardSummary: '雨夜开场',
        promptText: 'wide shot, rainy ruined city, cinematic neon reflection',
      });
    });
  });

  it('prefills existing video prompts from local assets', () => {
    render(
      <PromptVidStage
        project={{ ...project, current_stage: 'prompt-vid' }}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[makePromptAsset('PROMPT_VID')]}
        stateJson={null}
        onSave={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('slow push-in, rain drops on lens, 8 seconds')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存视频提示词 01' })).toBeTruthy();
  });
});

function makeStoryboardAsset(): StudioAsset {
  return {
    id: 'storyboard-1',
    project_id: 'studio-1',
    type_code: 'STORYBOARD_UNIT',
    name: '分镜 01',
    variant: null,
    version: 1,
    meta_json: JSON.stringify({ number: 1, summary: '雨夜开场', duration_s: 8 }),
    content_path: null,
    size_bytes: null,
    mime_type: null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function makePromptAsset(typeCode: 'PROMPT_IMG' | 'PROMPT_VID'): StudioAsset {
  return {
    id: `${typeCode.toLowerCase()}-1`,
    project_id: 'studio-1',
    type_code: typeCode,
    name: typeCode === 'PROMPT_IMG' ? '图片提示词 01' : '视频提示词 01',
    variant: null,
    version: 1,
    meta_json: JSON.stringify({
      storyboard_asset_id: 'storyboard-1',
      storyboard_number: 1,
      storyboard_summary: '雨夜开场',
      prompt_text: typeCode === 'PROMPT_IMG'
        ? 'wide shot, rainy ruined city, cinematic neon reflection'
        : 'slow push-in, rain drops on lens, 8 seconds',
    }),
    content_path: null,
    size_bytes: null,
    mime_type: 'text/markdown',
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
