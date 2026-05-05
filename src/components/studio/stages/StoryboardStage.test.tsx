import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoryboardStage } from './StoryboardStage';
import type { StudioAsset, StudioProject } from '../../../../shared/types';

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
  it('saves a simplified storyboard unit and keeps AI split disabled', async () => {
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

    expect((screen.getByRole('button', { name: 'AI 拆分镜头' }) as HTMLButtonElement).disabled).toBe(true);
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
