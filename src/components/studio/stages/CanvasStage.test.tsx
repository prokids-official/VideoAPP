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
});

function makeAsset(id: string, typeCode: string, name: string, sizeBytes: number | null): StudioAsset {
  return {
    id,
    project_id: 'studio-1',
    type_code: typeCode,
    name,
    variant: null,
    version: 1,
    meta_json: '{}',
    content_path: null,
    size_bytes: sizeBytes,
    mime_type: typeCode === 'PROMPT_IMG' ? 'text/markdown' : null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
