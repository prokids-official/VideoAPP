import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportPreviewDialog } from './ImportPreviewDialog';
import { ASSET_TYPES } from '../../lib/asset-types';

describe('ImportPreviewDialog', () => {
  it('shows final filename, markdown preview, and saves draft', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportPreviewDialog
        open
        assetType={ASSET_TYPES[0]}
        episodeId="11111111-1111-4111-8111-111111111111"
        file={{
          name: 'script.md',
          size: 12,
          mime_type: 'text/markdown',
          content: new TextEncoder().encode('# 剧本').buffer,
          preview_kind: 'markdown',
          preview_text: '# 剧本',
          save_content: '# 剧本',
        }}
        preview={{
          final_filename: '童话剧_侏儒怪_SCRIPT.md',
          storage_backend: 'github',
          storage_ref: 'x/y/童话剧_侏儒怪_SCRIPT.md',
        }}
        onClose={() => {}}
        onSaveDraft={onSave}
      />,
    );

    expect(screen.getByText('童话剧_侏儒怪_SCRIPT.md')).toBeTruthy();
    expect(screen.getByText('内容预览')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '主角' } });
    fireEvent.click(screen.getByText('保存为草稿'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      episode_id: '11111111-1111-4111-8111-111111111111',
      type_code: 'SCRIPT',
      name: '主角',
      final_filename: '童话剧_侏儒怪_SCRIPT.md',
      storage_backend: 'github',
      storage_ref: 'x/y/童话剧_侏儒怪_SCRIPT.md',
      source: 'imported',
    });
  });
});
