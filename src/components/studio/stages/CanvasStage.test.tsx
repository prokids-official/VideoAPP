import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { CanvasStage } from './CanvasStage';

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'canvas',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('CanvasStage', () => {
  it('groups local assets by type and advances to export', () => {
    const onAdvance = vi.fn();

    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('script-1', 'SCRIPT', '主线剧本', 2048),
          makeAsset('char-1', 'CHAR', '李火旺', null),
          makeAsset('prompt-img-1', 'PROMPT_IMG', '图片提示词 01', 512),
        ]}
        onAdvance={onAdvance}
      />,
    );

    expect(screen.getByText('主线剧本')).toBeTruthy();
    expect(screen.getByText('李火旺')).toBeTruthy();
    expect(screen.getByText('图片提示词 01')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '准备入库 →' }));

    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it('shows prompt to generated asset links', () => {
    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('prompt-img-1', 'PROMPT_IMG', '鍥剧墖鎻愮ず璇?01', 512, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'wide shot',
          }),
          makeAsset('shot-img-1', 'SHOT_IMG', '鍒嗛暅鍥?01', 4096, {
            source_prompt_asset_id: 'prompt-img-1',
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
          }),
        ]}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Storyboard 01')).toHaveLength(2);
    expect(screen.getByText('1 generated output')).toBeTruthy();
    expect(screen.getByText('From prompt: 鍥剧墖鎻愮ず璇?01')).toBeTruthy();
  });
});

function makeAsset(
  id: string,
  typeCode: string,
  name: string,
  sizeBytes: number | null,
  meta: Record<string, unknown> = {},
): StudioAsset {
  return {
    id,
    project_id: 'studio-1',
    type_code: typeCode,
    name,
    variant: null,
    version: 1,
    meta_json: JSON.stringify(meta),
    content_path: null,
    size_bytes: sizeBytes,
    mime_type: typeCode === 'PROMPT_IMG' ? 'text/markdown' : null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
