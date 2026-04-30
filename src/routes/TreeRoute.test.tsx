import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreeRoute } from './TreeRoute';
import { AuthContext, type AuthState } from '../stores/auth-store';
import { api } from '../lib/api';
import type { LocalDraft, TreeResponse, User } from '../../shared/types';

vi.mock('../lib/api', () => ({
  api: {
    tree: vi.fn(),
    episodeDetail: vi.fn(),
    assets: vi.fn(),
    assetContent: vi.fn(),
    previewFilename: vi.fn(),
  },
}));

const draftsList = vi.fn<(episodeId: string) => Promise<LocalDraft[]>>();

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

const tree: TreeResponse = {
  series: [
    {
      id: 'series-1',
      name_cn: '童话剧',
      albums: [
        {
          id: 'album-1',
          name_cn: 'NA',
          contents: [
            {
              id: 'content-1',
              name_cn: '侏儒怪',
              episodes: [
                {
                  id: 'episode-1',
                  name_cn: '侏儒怪 第一集',
                  status: 'drafting',
                  updated_at: '2026-04-30T00:00:00Z',
                  episode_path: '童话剧_NA_侏儒怪',
                  asset_count_pushed: 0,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function draft(id: string): LocalDraft {
  return {
    id,
    episode_id: 'episode-1',
    type_code: 'SCRIPT',
    name: 'script',
    variant: null,
    number: null,
    version: 1,
    stage: 'ROUGH',
    language: 'ZH',
    original_filename: 'script.md',
    final_filename: `${id}.md`,
    storage_backend: 'github',
    storage_ref: `drafts/${id}.md`,
    local_file_path: `D:/drafts/${id}.md`,
    size_bytes: 1,
    mime_type: 'text/markdown',
    source: 'pasted',
    created_at: '2026-04-30T00:00:00Z',
  };
}

function renderTree(onOpenPushReview = vi.fn()) {
  render(
    <AuthContext.Provider value={authState}>
      <TreeRoute
        selectedEpisodeId="episode-1"
        reloadKey={0}
        onSelectEpisode={vi.fn()}
        onCreateEpisode={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenPushReview={onOpenPushReview}
      />
    </AuthContext.Provider>,
  );
  return onOpenPushReview;
}

beforeEach(() => {
  vi.mocked(api.tree).mockResolvedValue({ ok: true, data: tree });
  vi.mocked(api.episodeDetail).mockResolvedValue({
    ok: true,
    data: {
      episode: {
        id: 'episode-1',
        name_cn: '侏儒怪 第一集',
        status: 'drafting',
        episode_path: '童话剧_NA_侏儒怪',
        series_name: '童话剧',
        album_name: 'NA',
        content_name: '侏儒怪',
        created_by_name: '乐美林',
        created_at: '2026-04-30T00:00:00Z',
        updated_at: '2026-04-30T00:00:00Z',
      },
      counts: { by_type: {} },
    },
  });
  draftsList.mockReset();
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: {
      db: {
        draftsList,
        viewCacheGet: vi.fn(),
        viewCacheSet: vi.fn(),
      },
      fs: {
        readDraftFile: vi.fn(),
        saveViewCacheFile: vi.fn(),
        openFileDialog: vi.fn(),
      },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TreeRoute push review FAB', () => {
  it('does not render the FAB when there are no local drafts', async () => {
    draftsList.mockResolvedValue([]);

    renderTree();

    await screen.findByRole('heading', { name: '侏儒怪 第一集' });
    expect(screen.queryByTestId('push-review-fab')).toBeNull();
    expect(screen.queryByRole('button', { name: /入库评审/ })).toBeNull();
  });

  it('renders a floating FAB with the local draft count', async () => {
    draftsList.mockResolvedValue([draft('d1'), draft('d2'), draft('d3')]);

    renderTree();

    const fab = await screen.findByTestId('push-review-fab');
    expect(fab.textContent).toContain('一键入库');
    expect(fab.textContent).toContain('(3)');
  });

  it('opens push review for the current episode when clicked', async () => {
    draftsList.mockResolvedValue([draft('d1'), draft('d2')]);
    const onOpenPushReview = renderTree();

    fireEvent.click(await screen.findByTestId('push-review-fab'));

    expect(onOpenPushReview).toHaveBeenCalledWith({
      id: 'episode-1',
      name: '侏儒怪 第一集',
    });
  });
});
