import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioWorkspaceRoute } from './StudioWorkspaceRoute';
import type { StudioProjectBundle } from '../../shared/types';

const bundle: StudioProjectBundle = {
  project: {
    id: 'studio-1',
    name: '末日机械人',
    size_kind: 'short',
    inspiration_text: null,
    current_stage: 'script',
    owner_id: 'local',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  assets: [
    {
      id: 'asset-1',
      project_id: 'studio-1',
      type_code: 'SCRIPT',
      name: '主线剧本',
      variant: null,
      version: 1,
      meta_json: '{}',
      content_path: null,
      size_bytes: null,
      mime_type: null,
      pushed_to_episode_id: null,
      pushed_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
  ],
  stage_state: {
    inspiration: '{"text":"idea"}',
  },
};

const studio = {
  projectCreate: vi.fn(),
  projectList: vi.fn(),
  projectGet: vi.fn(),
  projectUpdate: vi.fn(),
  projectDelete: vi.fn(),
  assetSave: vi.fn(),
  assetList: vi.fn(),
  assetDelete: vi.fn(),
  assetWriteFile: vi.fn(),
  assetReadFile: vi.fn(),
  stageSave: vi.fn(),
  stageGet: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: { studio },
  });
  studio.projectGet.mockResolvedValue(bundle);
  studio.projectUpdate.mockResolvedValue({ ...bundle.project, current_stage: 'character' });
});

describe('StudioWorkspaceRoute', () => {
  it('loads a project bundle and advances stages', async () => {
    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    expect(await screen.findByText('末日机械人')).toBeTruthy();
    expect(screen.getByText('主线剧本')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /下一阶段/ }));

    await waitFor(() => {
      expect(studio.projectUpdate).toHaveBeenCalledWith('studio-1', { current_stage: 'character' });
    });
  });

  it('saves inspiration stage through the studio bridge', async () => {
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'inspiration', inspiration_text: '' },
      stage_state: {},
    });
    studio.projectUpdate.mockResolvedValueOnce({
      ...bundle.project,
      current_stage: 'inspiration',
      inspiration_text: '雨夜废城里的机械少女',
    });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('灵感梗概'), {
      target: { value: '雨夜废城里的机械少女' },
    });
    fireEvent.change(screen.getByLabelText('题材标签'), { target: { value: '赛博, 雨夜' } });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => {
      expect(studio.projectUpdate).toHaveBeenCalledWith('studio-1', {
        inspiration_text: '雨夜废城里的机械少女',
        current_stage: 'inspiration',
      });
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'inspiration',
        JSON.stringify({ inspiration_text: '雨夜废城里的机械少女', tags: ['赛博', '雨夜'] }),
      );
    });
  });
});
