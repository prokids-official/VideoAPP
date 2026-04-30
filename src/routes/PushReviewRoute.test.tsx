import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushReviewRoute } from './PushReviewRoute';
import { AuthContext, type AuthState } from '../stores/auth-store';
import type { LocalDraft, User } from '../../shared/types';

const draftsList = vi.fn<() => Promise<LocalDraft[]>>();

const user: User = {
  id: 'user-1',
  email: 'meilinle@beva.com',
  display_name: '乐美林',
  team: 'FableGlitch',
  role: 'admin',
};

const authState: AuthState = {
  user,
  loading: false,
  signup: vi.fn(),
  login: vi.fn(),
  resendVerification: vi.fn(),
  resetPassword: vi.fn(),
  logout: vi.fn(),
};

function draft(input: Partial<LocalDraft> & Pick<LocalDraft, 'id' | 'type_code' | 'final_filename'>): LocalDraft {
  return {
    episode_id: 'episode-1',
    name: input.final_filename,
    variant: null,
    number: null,
    version: 1,
    stage: 'ROUGH',
    language: 'ZH',
    original_filename: input.final_filename,
    storage_backend: 'github',
    storage_ref: `drafts/${input.final_filename}`,
    local_file_path: `D:/drafts/${input.final_filename}`,
    size_bytes: 1024,
    mime_type: 'text/markdown',
    source: 'imported',
    created_at: '2026-04-30T00:00:00Z',
    ...input,
  };
}

function renderRoute() {
  return render(
    <AuthContext.Provider value={authState}>
      <PushReviewRoute
        episodeId="episode-1"
        episodeName="侏儒怪 第一集"
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  draftsList.mockReset();
  vi.stubGlobal('alert', vi.fn());
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: {
      db: {
        draftsList,
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PushReviewRoute', () => {
  it('groups local drafts by asset panel', async () => {
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md' }),
      draft({ id: 'd2', type_code: 'CHAR', final_filename: 'hero.png', storage_backend: 'r2', mime_type: 'image/png' }),
      draft({ id: 'd3', type_code: 'CHAR', final_filename: 'npc.png', storage_backend: 'r2', mime_type: 'image/png' }),
    ]);

    renderRoute();

    const scriptSection = await screen.findByText('剧本');
    const charSection = await screen.findByText('角色');
    expect(scriptSection).toBeTruthy();
    expect(charSection).toBeTruthy();
    expect(screen.getByText('script.md')).toBeTruthy();
    expect(screen.getByText('hero.png')).toBeTruthy();
    expect(screen.getByText('npc.png')).toBeTruthy();
    expect(screen.getByLabelText('3 项待入库 · 3.0 KB')).toBeTruthy();
  });

  it('supports row select and group select', async () => {
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md' }),
      draft({ id: 'd2', type_code: 'CHAR', final_filename: 'hero.png', storage_backend: 'r2', mime_type: 'image/png' }),
      draft({ id: 'd3', type_code: 'CHAR', final_filename: 'npc.png', storage_backend: 'r2', mime_type: 'image/png' }),
    ]);

    renderRoute();

    const rowCheckbox = await screen.findByLabelText('选择 script.md');
    fireEvent.click(rowCheckbox);
    expect(screen.getByTestId('push-selected-summary').textContent).toContain('已选 2 项');

    const charGroupCheckbox = screen.getByLabelText('全选 角色');
    fireEvent.click(charGroupCheckbox);
    expect(screen.getByTestId('push-selected-summary').textContent).toContain('已选 0 项');

    fireEvent.click(charGroupCheckbox);
    expect(screen.getByTestId('push-selected-summary').textContent).toContain('已选 2 项');
  });

  it('disables push when no local drafts exist', async () => {
    draftsList.mockResolvedValue([]);

    renderRoute();

    await screen.findByText('暂无待入库草稿');
    const pushButton = screen.getByRole('button', { name: /推送/ }) as HTMLButtonElement;
    expect(pushButton.disabled).toBe(true);
  });

  it('generates the default commit message from episode, count, and user', async () => {
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md' }),
      draft({ id: 'd2', type_code: 'PROMPT_IMG', final_filename: 'prompt.md', source: 'pasted' }),
    ]);

    renderRoute();

    const textarea = (await screen.findByLabelText('commit message')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('feat(侏儒怪 第一集): 2 项资产 by 乐美林');
  });

  it('logs the Task 9 payload for selected drafts only', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md' }),
      draft({ id: 'd2', type_code: 'PROMPT_IMG', final_filename: 'prompt.md', source: 'pasted' }),
    ]);

    renderRoute();

    fireEvent.click(await screen.findByLabelText('选择 prompt.md'));
    expect(screen.getByTestId('push-selected-summary').textContent).toContain('已选 1 项');
    fireEvent.click(screen.getByRole('button', { name: /推送/ }));

    expect(consoleSpy).toHaveBeenCalledWith('[fableglitch] Task 9 push payload', {
      episode_id: 'episode-1',
      draft_ids: ['d1'],
      commit_message: 'feat(侏儒怪 第一集): 2 项资产 by 乐美林',
    });
    expect(window.alert).toHaveBeenCalledWith('Task 9 will wire this up');
    consoleSpy.mockRestore();
  });
});
