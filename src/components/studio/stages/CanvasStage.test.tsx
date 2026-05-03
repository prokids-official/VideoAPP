import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { CanvasStage } from './CanvasStage';

const project: StudioProject = {
  id: 'studio-1',
  name: 'Rain Machine',
  size_kind: 'short',
  inspiration_text: 'rainy ruined city',
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
          makeAsset('script-1', 'SCRIPT', 'Main script', 2048),
          makeAsset('char-1', 'CHAR', 'Li Huowang', null),
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512),
        ]}
        onAdvance={onAdvance}
      />,
    );

    expect(screen.getByText('Main script')).toBeTruthy();
    expect(screen.getByText('Li Huowang')).toBeTruthy();
    expect(screen.getByText('Image prompt 01')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button'));

    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it('shows prompt to generated asset links', () => {
    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'wide shot',
          }),
          makeAsset('shot-img-1', 'SHOT_IMG', 'Generated image 01', 4096, {
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
    expect(screen.getByText('From prompt: Image prompt 01')).toBeTruthy();
  });

  it('threads storyboard prompts and generated outputs into a shot timeline', () => {
    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('storyboard-1', 'STORYBOARD_UNIT', 'Rain opener', 1024, {
            number: 1,
            duration_s: 15,
            summary: 'Rain falls over the gate',
          }),
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'wide shot, rain, gate',
          }),
          makeAsset('prompt-vid-1', 'PROMPT_VID', 'Video prompt 01', 768, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'slow push in',
          }),
          makeAsset('shot-img-1', 'SHOT_IMG', 'Generated image 01', 4096, {
            source_prompt_asset_id: 'prompt-img-1',
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
          }),
          makeAsset('shot-vid-1', 'SHOT_VID', 'Generated video 01', 8192, {
            source_prompt_asset_id: 'prompt-vid-1',
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
          }),
        ]}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByText('SHOT 01')).toBeTruthy();
    expect(screen.getByText('Rain falls over the gate')).toBeTruthy();
    expect(screen.getByText('Image prompt 01')).toBeTruthy();
    expect(screen.getByText('Generated image 01')).toBeTruthy();
    expect(screen.getByText('Video prompt 01')).toBeTruthy();
    expect(screen.getByText('Generated video 01')).toBeTruthy();
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
