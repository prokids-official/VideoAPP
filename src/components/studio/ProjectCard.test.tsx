import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectCard } from './ProjectCard';
import type { StudioProject } from '../../../shared/types';

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: null,
  current_stage: 'character',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('ProjectCard', () => {
  it('opens and deletes a project through callbacks', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();

    render(
      <ProjectCard
        project={project}
        assetCount={3}
        pendingPushCount={2}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('末日机械人')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /打开项目/ }));
    fireEvent.click(screen.getByRole('button', { name: /删除项目/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
