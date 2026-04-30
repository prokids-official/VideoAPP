import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushReviewRoute } from './PushReviewRoute';
import { AuthContext, type AuthState } from '../stores/auth-store';
import type { ApiResponse, AssetPushItem, AssetPushPayload, AssetPushResult, LocalDraft, User } from '../../shared/types';

const draftsList = vi.fn<() => Promise<LocalDraft[]>>();
const readDraftFile = vi.fn<(path: string) => Promise<Uint8Array>>();
const deleteDraftFile = vi.fn<(localDraftId: string) => Promise<void>>();
const draftDelete = vi.fn<(id: string) => Promise<void>>();
const assetPush = vi.fn<
  (input: {
    payload: AssetPushPayload;
    items: AssetPushItem[];
    files: Record<string, ArrayBuffer>;
  }) => Promise<{ status: number; body: ApiResponse<AssetPushResult> | null; retryAfter?: number | null }>
>();
const onPushed = vi.fn<(count: number) => void>();
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000001';

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
        onPushed={onPushed}
      />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  draftsList.mockReset();
  readDraftFile.mockReset();
  deleteDraftFile.mockReset();
  draftDelete.mockReset();
  assetPush.mockReset();
  onPushed.mockReset();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(IDEMPOTENCY_KEY);
  readDraftFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  deleteDraftFile.mockResolvedValue();
  draftDelete.mockResolvedValue();
  vi.stubGlobal('alert', vi.fn());
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: {
      db: {
        draftsList,
        draftDelete,
      },
      fs: {
        readDraftFile,
        deleteDraftFile,
      },
      net: {
        assetPush,
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PushReviewRoute', () => {
  it('renders a clear back-to-dashboard control', async () => {
    draftsList.mockResolvedValue([]);

    renderRoute();

    expect(await screen.findByRole('button', { name: 'Back to episode dashboard' })).toBeTruthy();
  });

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

  it('pushes selected drafts, deletes local rows and files, then returns to dashboard', async () => {
    assetPush.mockResolvedValue({
      status: 201,
      body: {
        ok: true,
        data: {
          commit_sha: 'commit-1',
          assets: [
            { local_draft_id: 'd1', id: 'asset-1', status: 'pushed' },
            { local_draft_id: 'd2', id: 'asset-2', status: 'pushed' },
          ],
        },
      },
    });
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md', local_file_path: 'D:/drafts/d1.md' }),
      draft({ id: 'd2', type_code: 'PROMPT_IMG', final_filename: 'prompt.md', source: 'pasted', local_file_path: 'D:/drafts/d2.md' }),
    ]);

    renderRoute();

    await screen.findByText('script.md');
    fireEvent.click(screen.getByRole('button', { name: /推送/ }));

    await screen.findByText('推送中...');
    expect(assetPush).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          idempotency_key: IDEMPOTENCY_KEY,
          commit_message: 'feat(侏儒怪 第一集): 2 项资产 by 乐美林',
        }),
        items: expect.arrayContaining([
          expect.objectContaining({ local_draft_id: 'd1', episode_id: 'episode-1', type_code: 'SCRIPT' }),
          expect.objectContaining({ local_draft_id: 'd2', episode_id: 'episode-1', type_code: 'PROMPT_IMG' }),
        ]),
        files: {
          d1: expect.any(ArrayBuffer),
          d2: expect.any(ArrayBuffer),
        },
      }),
    );
    expect(draftDelete).toHaveBeenCalledWith('d1');
    expect(draftDelete).toHaveBeenCalledWith('d2');
    expect(deleteDraftFile).toHaveBeenCalledWith('d1');
    expect(deleteDraftFile).toHaveBeenCalledWith('d2');
    expect(onPushed).toHaveBeenCalledWith(2);
  });

  it('shows a retry dialog on GitHub conflict and retries with the same idempotency key', async () => {
    assetPush
      .mockResolvedValueOnce({
        status: 409,
        body: { ok: false, error: { code: 'GITHUB_CONFLICT', message: 'conflict' } },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          ok: true,
          data: { assets: [{ local_draft_id: 'd1', id: 'asset-1', status: 'pushed' }] },
        },
      });
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md', local_file_path: 'D:/drafts/d1.md' }),
    ]);

    renderRoute();

    await screen.findByText('script.md');
    fireEvent.click(screen.getByRole('button', { name: /推送/ }));
    expect(await screen.findByText('同事刚推过新内容，重试？')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await screen.findByText('推送中...');
    expect(assetPush).toHaveBeenCalledTimes(2);
    expect(assetPush.mock.calls[0]![0].payload.idempotency_key).toBe(IDEMPOTENCY_KEY);
    expect(assetPush.mock.calls[1]![0].payload.idempotency_key).toBe(IDEMPOTENCY_KEY);
    expect(onPushed).toHaveBeenCalledWith(1);
  });

  it('keeps the review page and shows an error toast when backend rejects a file', async () => {
    assetPush.mockResolvedValue({
      status: 400,
      body: { ok: false, error: { code: 'FILE_TOO_LARGE', message: 'file too large' } },
    });
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md', local_file_path: 'D:/drafts/d1.md' }),
    ]);

    renderRoute();

    await screen.findByText('script.md');
    fireEvent.click(screen.getByRole('button', { name: /推送/ }));

    expect(await screen.findByText('file too large')).toBeTruthy();
    expect(draftDelete).not.toHaveBeenCalled();
    expect(onPushed).not.toHaveBeenCalled();
  });

  it('shows a network toast when the push request rejects', async () => {
    assetPush.mockRejectedValue(new Error('socket closed'));
    draftsList.mockResolvedValue([
      draft({ id: 'd1', type_code: 'SCRIPT', final_filename: 'script.md', local_file_path: 'D:/drafts/d1.md' }),
    ]);

    renderRoute();

    await screen.findByText('script.md');
    fireEvent.click(screen.getByRole('button', { name: /推送/ }));

    expect(await screen.findByText('网络异常')).toBeTruthy();
    expect(onPushed).not.toHaveBeenCalled();
  });
});
