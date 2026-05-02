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

beforeEach(() => {
  ideas.mockReset();
  ideaDetail.mockReset();
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

  it('opens idea detail', async () => {
    render(<IdeasRoute user={user} reloadKey={0} onBack={vi.fn()} onCreateIdea={vi.fn()} />);

    fireEvent.click(await screen.findByText('睡前故事三段反转'));

    expect(await screen.findByText('想法详情')).toBeTruthy();
    expect(ideaDetail).toHaveBeenCalledWith('idea-1');
  });
});
