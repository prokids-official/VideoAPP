import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioRoute } from './StudioRoute';
import type { StudioAsset, StudioProject } from '../../shared/types';

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: null,
  current_stage: 'inspiration',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

const pushedAsset: StudioAsset = {
  id: 'asset-1',
  project_id: project.id,
  type_code: 'SCRIPT',
  name: '主线剧本',
  variant: null,
  version: 1,
  meta_json: '{}',
  content_path: null,
  size_bytes: null,
  mime_type: null,
  pushed_to_episode_id: 'episode-1',
  pushed_at: Date.now(),
  created_at: Date.now(),
  updated_at: Date.now(),
};

const pendingAsset: StudioAsset = {
  ...pushedAsset,
  id: 'asset-2',
  pushed_to_episode_id: null,
  pushed_at: null,
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
  studio.projectList.mockResolvedValue([project]);
  studio.assetList.mockResolvedValue([pushedAsset, pendingAsset]);
  studio.projectCreate.mockResolvedValue(project);
});

describe('StudioRoute', () => {
  it('lists local projects with asset counts', async () => {
    render(<StudioRoute onBack={vi.fn()} onOpenProject={vi.fn()} />);

    expect(await screen.findByText('末日机械人')).toBeTruthy();
    expect(studio.projectList).toHaveBeenCalledTimes(1);
    expect(studio.assetList).toHaveBeenCalledWith(project.id, null);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('creates a project and opens its workspace', async () => {
    const onOpenProject = vi.fn();
    studio.projectList.mockResolvedValue([]);

    render(<StudioRoute onBack={vi.fn()} onOpenProject={onOpenProject} />);

    await screen.findByText(/还没有本地项目/);
    fireEvent.click(screen.getByRole('button', { name: /创建第一个项目/ }));
    fireEvent.change(screen.getByLabelText(/项目名/), { target: { value: '末日机械人' } });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    await waitFor(() => {
      expect(studio.projectCreate).toHaveBeenCalledWith({
        name: '末日机械人',
        size_kind: 'short',
        inspiration_text: null,
      });
      expect(onOpenProject).toHaveBeenCalledWith(project.id);
    });
  });
});
