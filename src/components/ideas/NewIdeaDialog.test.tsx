import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewIdeaDialog } from './NewIdeaDialog';
import { api } from '../../lib/api';
import type { IdeaSummary, User } from '../../../shared/types';

vi.mock('../../lib/api', () => ({
  api: {
    createIdea: vi.fn(),
  },
}));

const admin: User = {
  id: 'user-1',
  email: 'meilinle@beva.com',
  display_name: '乐美林',
  team: 'FableGlitch',
  role: 'admin',
};

const createdIdea: IdeaSummary = {
  id: 'idea-1',
  author_id: admin.id,
  author_name: admin.display_name,
  title: '三段反转',
  description: '先温柔，再误会，最后和解。',
  status: 'pending',
  tags: ['节奏'],
  created_at: '2026-05-02T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
};

const createIdea = vi.mocked(api.createIdea);

beforeEach(() => {
  createIdea.mockReset();
});

describe('NewIdeaDialog', () => {
  it('creates an admin idea with tags', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    createIdea.mockResolvedValue({ ok: true, data: { idea: createdIdea } });

    render(<NewIdeaDialog open user={admin} onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '三段反转' } });
    fireEvent.change(screen.getByLabelText('说明'), { target: { value: '先温柔，再误会，最后和解。' } });
    fireEvent.change(screen.getByLabelText('标签'), { target: { value: '节奏, 亲子, 节奏' } });
    fireEvent.click(screen.getByRole('button', { name: '发布想法' }));

    await waitFor(() => {
      expect(createIdea).toHaveBeenCalledWith({
        title: '三段反转',
        description: '先温柔，再误会，最后和解。',
        tags: ['节奏', '亲子'],
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdIdea);
    expect(onClose).toHaveBeenCalled();
  });

  it('uses theme tokens instead of fixed dark panels', () => {
    render(<NewIdeaDialog open user={admin} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByRole('dialog').innerHTML).not.toContain('#1c1c1e');
    expect(screen.getByRole('dialog').innerHTML).not.toContain('#2c2c2e');
    expect(screen.getByRole('dialog').innerHTML).toContain('bg-surface');
  });

  it('keeps the dialog open and shows backend errors', async () => {
    createIdea.mockResolvedValue({ ok: false, status: 400, code: 'IDEA_INVALID_TITLE', message: 'bad title' });

    render(<NewIdeaDialog open user={admin} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('说明'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: '发布想法' }));

    expect((await screen.findByRole('alert')).textContent).toContain('bad title');
  });
});
