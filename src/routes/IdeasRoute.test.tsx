import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdeasRoute } from './IdeasRoute';
import { api } from '../lib/api';
import type { IdeaSummary, User } from '../../shared/types';

vi.mock('../lib/api', () => ({
  api: {
    ideas: vi.fn(),
    ideaDetail: vi.fn(),
    updateIdea: vi.fn(),
    deleteIdea: vi.fn(),
  },
}));

const user: User = {
  id: 'user-1',
  email: 'meilinle@beva.com',
  display_name: '乐美林',
  team: 'FableGlitch',
  role: 'admin',
};

const idea: IdeaSummary = {
  id: 'idea-1',
  author_id: user.id,
  author_name: user.display_name,
  title: '睡前故事三段反转',
  description: '一个适合做成短视频开头的节奏想法。',
  status: 'pending',
  tags: ['节奏', '短视频'],
  created_at: '2026-05-02T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
  is_editable_by_me: true,
};

const ideas = vi.mocked(api.ideas);
const ideaDetail = vi.mocked(api.ideaDetail);
const deleteIdea = vi.mocked(api.deleteIdea);

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  ideas.mockReset();
  ideaDetail.mockReset();
  deleteIdea.mockReset();
  ideas.mockImplementation(async (input = {}) => {
    if (input.limit === 1) {
      return {
        ok: true,
        data: { ideas: [], total: input.status === 'pending' ? 1 : input.status === 'all' ? 1 : 0, next_cursor: null },
      };
    }

    return { ok: true, data: { ideas: [idea], total: 1, next_cursor: null } };
  });
  ideaDetail.mockResolvedValue({ ok: true, data: { idea, references: [] } });
  deleteIdea.mockResolvedValue({ ok: true, data: { id: idea.id, deleted_at: '2026-05-02T01:00:00Z' } });
});

describe('IdeasRoute', () => {
  it('renders the board with ideas and status counts', async () => {
    render(<IdeasRoute user={user} reloadKey={0} onBack={vi.fn()} onCreateIdea={vi.fn()} />);

    expect(await screen.findByText('芝兰点子王')).toBeTruthy();
    expect(await screen.findByText('睡前故事三段反转')).toBeTruthy();
    expect(screen.getByRole('button', { name: /待评估1/ })).toBeTruthy();
    expect(screen.getByText(/当前视图/)).toBeTruthy();
  });

  it('filters to my ideas', async () => {
    render(<IdeasRoute user={user} reloadKey={0} onBack={vi.fn()} onCreateIdea={vi.fn()} />);

    await screen.findByText('睡前故事三段反转');
    fireEvent.click(screen.getByRole('button', { name: '只看我的' }));

    await waitFor(() => {
      expect(ideas).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'me', limit: 20 }));
    });
  });

  it('initializes filters from URL search params and keeps them in sync', async () => {
    window.history.replaceState({}, '', '/ideas?status=accepted&scope=mine');

    render(<IdeasRoute user={user} reloadKey={0} onBack={vi.fn()} onCreateIdea={vi.fn()} />);

    await screen.findByText('睡前故事三段反转');
    expect(ideas).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', authorId: 'me', limit: 20 }));

    fireEvent.click(screen.getByRole('button', { name: /待评估1/ }));

    await waitFor(() => {
      expect(window.location.search).toContain('status=pending');
      expect(window.location.search).toContain('scope=mine');
    });
  });

  it('shows editable card actions and supports quick soft delete', async () => {
    render(<IdeasRoute user={user} reloadKey={0} onBack={vi.fn()} onCreateIdea={vi.fn()} />);

    await screen.findByText('睡前故事三段反转');
    expect(screen.getByRole('button', { name: '编辑 睡前故事三段反转' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '删除 睡前故事三段反转' }));
    expect(screen.getByRole('button', { name: '确认删除 睡前故事三段反转' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认删除 睡前故事三段反转' }));

    await waitFor(() => {
      expect(deleteIdea).toHaveBeenCalledWith('idea-1');
    });
  });

  it('opens idea detail', async () => {
    render(<IdeasRoute user={user} reloadKey={0} onBack={vi.fn()} onCreateIdea={vi.fn()} />);

    fireEvent.click(await screen.findByText('睡前故事三段反转'));

    expect(await screen.findByText('想法详情')).toBeTruthy();
    expect(ideaDetail).toHaveBeenCalledWith('idea-1');
  });
});
