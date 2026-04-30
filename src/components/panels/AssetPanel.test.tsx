import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetPanel } from './AssetPanel';
import { ASSET_TYPES } from '../../lib/asset-types';
import type { AssetRow, LocalDraft } from '../../../shared/types';

describe('AssetPanel', () => {
  it('renders import, paste, drafts, and pushed lists from data', () => {
    const onImport = vi.fn();
    render(
      <AssetPanel
        assetType={ASSET_TYPES[0]}
        episodeId="ep-1"
        drafts={[{ id: 'd1', name: '剧本草稿', final_filename: 'a.md' } as LocalDraft]}
        pushedAssets={[{ id: 'a1', name: '剧本入库', final_filename: 'b.md' } as AssetRow]}
        onImport={onImport}
        onPaste={vi.fn()}
        onPreviewAsset={vi.fn()}
      />,
    );

    expect(screen.getByText('剧本')).toBeTruthy();
    expect(screen.getByText('导入文件')).toBeTruthy();
    expect(screen.getByText('粘贴文本')).toBeTruthy();
    expect(screen.getByText('剧本草稿')).toBeTruthy();
    expect(screen.getByText('剧本入库')).toBeTruthy();

    fireEvent.click(screen.getByText('导入文件'));
    expect(onImport).toHaveBeenCalledWith(ASSET_TYPES[0]);
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
