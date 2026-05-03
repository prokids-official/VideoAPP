import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, AssetPushResult, StudioAsset, StudioProject, TreeResponse } from '../../../../shared/types';
import { api } from '../../../lib/api';
import { ExportStage } from './ExportStage';

vi.mock('../../../lib/api', () => ({
  api: {
    tree: vi.fn(),
    previewFilename: vi.fn(),
  },
}));

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
                  name_cn: '第一集',
                  status: 'drafting',
                  episode_path: '童话剧/NA/侏儒怪/第一集',
                  updated_at: '2026-05-03T00:00:00.000Z',
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

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: null,
  current_stage: 'export',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

const assetPush = vi.fn();
const assetReadFile = vi.fn();
const assetSave = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.tree).mockResolvedValue({ ok: true, data: tree });
  vi.mocked(api.previewFilename).mockResolvedValue({
    ok: true,
    data: {
      final_filename: '侏儒怪_PROMPT_IMG_001_v001.md',
      storage_backend: 'github',
      storage_ref: '02_Data/Prompt/Image/侏儒怪_PROMPT_IMG_001_v001.md',
    },
  });
  assetPush.mockResolvedValue({
    status: 201,
    body: {
      ok: true,
      data: {
        assets: [
          { local_draft_id: 'prompt-img-1', id: 'remote-asset-1', status: 'pushed' },
          { local_draft_id: 'char-1', id: 'remote-asset-2', status: 'pushed' },
        ],
      },
    } satisfies ApiResponse<AssetPushResult>,
  });
  assetReadFile.mockResolvedValue(new TextEncoder().encode('wide shot, rainy city'));
  assetSave.mockImplementation(async (input: StudioAsset) => input);
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: {
      net: { assetPush },
      studio: { assetReadFile, assetSave },
    },
  });
});

describe('ExportStage', () => {
  it('previews filenames and pushes selected studio assets to a company episode', async () => {
    render(
      <ExportStage
        project={project}
        assets={[makePromptAsset(), makeCharacterAsset()]}
      />,
    );

    expect(await screen.findByText('第一集')).toBeTruthy();
    expect(screen.getByText('图片提示词 01')).toBeTruthy();
    expect(screen.getByText('李火旺')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByDisplayValue('feat(第一集): 来自创作舱「末日机械人」推送')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '预览最终文件名' }));

    await waitFor(() => {
      expect(api.previewFilename).toHaveBeenCalledWith(expect.objectContaining({
        episode_id: 'episode-1',
        type_code: 'PROMPT_IMG',
      }));
      expect(screen.getAllByText('侏儒怪_PROMPT_IMG_001_v001.md').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '推送 2 项' }));

    await waitFor(() => {
      expect(assetPush).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          commit_message: 'feat(第一集): 来自创作舱「末日机械人」推送',
          items: [
            expect.objectContaining({ local_draft_id: 'prompt-img-1', source: 'studio-export' }),
            expect.objectContaining({ local_draft_id: 'char-1', source: 'studio-export' }),
          ],
        }),
      }));
      expect(assetSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'prompt-img-1',
        pushed_to_episode_id: 'episode-1',
      }));
    });
  });
});

function makePromptAsset(): StudioAsset {
  return {
    id: 'prompt-img-1',
    project_id: 'studio-1',
    type_code: 'PROMPT_IMG',
    name: '图片提示词 01',
    variant: null,
    version: 1,
    meta_json: JSON.stringify({ storyboard_number: 1, prompt_text: 'wide shot, rainy city' }),
    content_path: 'E:\\studio\\prompt-img-1.md',
    size_bytes: 21,
    mime_type: 'text/markdown',
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function makeCharacterAsset(): StudioAsset {
  return {
    id: 'char-1',
    project_id: 'studio-1',
    type_code: 'CHAR',
    name: '李火旺',
    variant: '主角',
    version: 1,
    meta_json: JSON.stringify({ appearance: '青年男性', personality: '冷静' }),
    content_path: null,
    size_bytes: null,
    mime_type: null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
