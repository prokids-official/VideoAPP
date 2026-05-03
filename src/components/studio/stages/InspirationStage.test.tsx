import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspirationStage } from './InspirationStage';
import type { StudioProject } from '../../../../shared/types';

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'inspiration',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('InspirationStage', () => {
  it('saves inspiration text and tags', async () => {
    const onSave = vi.fn(async () => {});

    render(
      <InspirationStage
        project={project}
        stateJson={JSON.stringify({ tags: ['赛博'] })}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('灵感梗概'), { target: { value: '雨夜废城里的机械少女' } });
    fireEvent.change(screen.getByLabelText('题材标签'), { target: { value: '赛博, 雨夜, 机械少女' } });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        inspirationText: '雨夜废城里的机械少女',
        tags: ['赛博', '雨夜', '机械少女'],
      });
    });
  });

  it('saves before advancing to the next stage', async () => {
    const onSave = vi.fn(async () => {});
    const onAdvance = vi.fn();

    render(<InspirationStage project={project} stateJson={null} onSave={onSave} onAdvance={onAdvance} />);

    fireEvent.click(screen.getByRole('button', { name: '下一阶段：剧本' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(onAdvance).toHaveBeenCalled();
    });
  });
});
