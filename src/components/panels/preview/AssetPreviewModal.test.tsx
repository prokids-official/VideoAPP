import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssetPreviewModal } from './AssetPreviewModal';
import type { AssetRow } from '../../../../shared/types';

const asset: AssetRow = {
  id: 'asset-1',
  type_code: 'SCRIPT',
  name: 'Script asset',
  variant: null,
  version: 1,
  stage: 'FINAL',
  language: 'ZH',
  final_filename: 'script.md',
  storage_backend: 'github',
  storage_ref: 'x/script.md',
  file_size_bytes: 10,
  mime_type: 'text/markdown',
  pushed_at: '2026-04-30T00:00:00Z',
  status: 'pushed',
};

describe('AssetPreviewModal', () => {
  it('renders markdown asset content in a dialog', () => {
    render(
      <AssetPreviewModal
        open
        asset={asset}
        content={{ kind: 'markdown', content: '# Script', content_type: 'text/markdown' }}
        loading={false}
        error={null}
        actionStatus={null}
        onClose={() => {}}
        onCopyText={() => {}}
        onCopyImage={() => {}}
        onDownloadAsset={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Script' })).toBeTruthy();
  });

  it('lets users copy and download markdown content', async () => {
    const onCopyText = vi.fn();
    const onDownloadAsset = vi.fn();

    render(
      <AssetPreviewModal
        open
        asset={asset}
        content={{ kind: 'markdown', content: '# Script', content_type: 'text/markdown' }}
        loading={false}
        error={null}
        actionStatus={null}
        onClose={() => {}}
        onCopyText={onCopyText}
        onCopyImage={() => {}}
        onDownloadAsset={onDownloadAsset}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '复制文本' }));
    await userEvent.click(screen.getByRole('button', { name: '下载到本地' }));

    expect(onCopyText).toHaveBeenCalledTimes(1);
    expect(onDownloadAsset).toHaveBeenCalledTimes(1);
  });

  it('lets users copy and download url-backed image content without showing text copy', async () => {
    const onCopyImage = vi.fn();
    const onDownloadAsset = vi.fn();

    render(
      <AssetPreviewModal
        open
        asset={{ ...asset, type_code: 'CHARACTER', mime_type: 'image/png', final_filename: 'character.png' }}
        content={{ kind: 'url', url: 'https://example.test/character.png', expires_at: '2026-05-02T00:00:00Z' }}
        loading={false}
        error={null}
        actionStatus={null}
        onClose={() => {}}
        onCopyText={vi.fn()}
        onCopyImage={onCopyImage}
        onDownloadAsset={onDownloadAsset}
      />,
    );

    expect(screen.queryByRole('button', { name: '复制文本' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '复制图片' }));
    await userEvent.click(screen.getByRole('button', { name: '下载到本地' }));

    expect(onCopyImage).toHaveBeenCalledTimes(1);
    expect(onDownloadAsset).toHaveBeenCalledTimes(1);
  });

  it('shows related prompt and generated assets when available', () => {
    render(
      <AssetPreviewModal
        open
        asset={{ ...asset, type_code: 'PROMPT_IMG' }}
        content={{ kind: 'markdown', content: 'wide shot', content_type: 'text/markdown' }}
        relations={{
          asset_id: 'asset-1',
          outgoing: [
            {
              id: 'rel-source',
              relation_type: 'derived_from_storyboard',
              metadata: { storyboard_number: 1 },
              created_at: '2026-05-03T00:00:00Z',
              asset: {
                id: 'storyboard-1',
                type_code: 'STORYBOARD_UNIT',
                name: 'Storyboard 01',
                final_filename: 'storyboard.md',
                storage_backend: 'github',
                storage_ref: 'path/storyboard.md',
                mime_type: 'text/markdown',
              },
            },
          ],
          incoming: [
            {
              id: 'rel-generated',
              relation_type: 'generated_from_prompt',
              metadata: {},
              created_at: '2026-05-03T00:01:00Z',
              asset: {
                id: 'shot-img-1',
                type_code: 'SHOT_IMG',
                name: 'Shot image 01',
                final_filename: 'shot.png',
                storage_backend: 'r2',
                storage_ref: 'path/shot.png',
                mime_type: 'image/png',
              },
            },
          ],
        }}
        loading={false}
        error={null}
        actionStatus={null}
        onClose={() => {}}
        onCopyText={() => {}}
        onCopyImage={() => {}}
        onDownloadAsset={() => {}}
      />,
    );

    expect(screen.getByText('Related assets')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Storyboard 01')).toBeTruthy();
    expect(screen.getByText('Generated')).toBeTruthy();
    expect(screen.getByText('Shot image 01')).toBeTruthy();
  });
});
