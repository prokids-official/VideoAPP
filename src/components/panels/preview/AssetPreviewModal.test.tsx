import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssetPreviewModal } from './AssetPreviewModal';
import type { AssetRow } from '../../../../shared/types';

const asset: AssetRow = {
  id: 'asset-1',
  type_code: 'SCRIPT',
  name: '剧本入库',
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
        content={{ kind: 'markdown', content: '# 剧本', content_type: 'text/markdown' }}
        loading={false}
        error={null}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '剧本' })).toBeTruthy();
  });
});
