import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetPanel } from './AssetPanel';
import { ASSET_TYPES } from '../../lib/asset-types';
import type { AssetRow, LocalDraft } from '../../../shared/types';

describe('AssetPanel', () => {
  it('renders a clear back control when provided', () => {
    const onBack = vi.fn();

    render(
      <AssetPanel
        assetType={ASSET_TYPES[0]}
        episodeId="ep-1"
        drafts={[]}
        pushedAssets={[]}
        onImport={vi.fn()}
        onPaste={vi.fn()}
        onPreviewAsset={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to episode dashboard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders import, paste, drafts, and pushed lists from data', () => {
    const onImport = vi.fn();
    const onPreviewAsset = vi.fn();
    const draft: LocalDraft = {
      id: 'd1',
      episode_id: 'ep-1',
      type_code: 'SCRIPT',
      name: '剧本草稿',
      variant: null,
      number: null,
      version: 1,
      stage: 'ROUGH',
      language: 'ZH',
      original_filename: 'a.md',
      final_filename: 'a.md',
      storage_backend: 'github',
      storage_ref: 'x/a.md',
      local_file_path: 'D:/drafts/a.md',
      size_bytes: 1,
      mime_type: 'text/markdown',
      source: 'pasted',
      created_at: '2026-04-30T00:00:00Z',
    };
    const pushed: AssetRow = {
      id: 'a1',
      type_code: 'SCRIPT',
      name: '剧本入库',
      variant: null,
      version: 1,
      stage: 'FINAL',
      language: 'ZH',
      final_filename: 'b.md',
      storage_backend: 'github',
      storage_ref: 'x/b.md',
      file_size_bytes: 2,
      mime_type: 'text/markdown',
      pushed_at: '2026-04-30T00:00:00Z',
      status: 'pushed',
    };
    render(
      <AssetPanel
        assetType={ASSET_TYPES[0]}
        episodeId="ep-1"
        drafts={[draft]}
        pushedAssets={[pushed]}
        onImport={onImport}
        onPaste={vi.fn()}
        onPreviewAsset={onPreviewAsset}
      />,
    );

    expect(screen.getByText('剧本')).toBeTruthy();
    expect(screen.getByText('导入文件')).toBeTruthy();
    expect(screen.getByText(/粘贴文本/)).toBeTruthy();
    expect(screen.getByText('剧本草稿')).toBeTruthy();
    expect(screen.getByText('剧本入库')).toBeTruthy();

    fireEvent.click(screen.getByText('导入文件'));
    expect(onImport).toHaveBeenCalledWith(ASSET_TYPES[0]);
    fireEvent.click(screen.getByText('剧本入库'));
    expect(onPreviewAsset).toHaveBeenCalledWith(pushed);
  });

  it('hides paste action when asset type does not support paste', () => {
    render(
      <AssetPanel
        assetType={ASSET_TYPES[3]}
        episodeId="ep-1"
        drafts={[]}
        pushedAssets={[]}
        onImport={vi.fn()}
        onPaste={vi.fn()}
        onPreviewAsset={vi.fn()}
      />,
    );

    expect(screen.queryByText('粘贴文本')).toBeNull();
    expect(screen.getByText('.png, .jpg, .jpeg, .webp')).toBeTruthy();
  });
});
