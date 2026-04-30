import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PasteTextDialog } from './PasteTextDialog';
import { ASSET_TYPES } from '../../lib/asset-types';

describe('PasteTextDialog', () => {
  it('continues with pasted markdown text for enabled types', async () => {
    const onContinue = vi.fn().mockResolvedValue(undefined);
    render(<PasteTextDialog open assetType={ASSET_TYPES[0]} onClose={() => {}} onContinue={onContinue} />);

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '剧本' } });
    fireEvent.change(screen.getByLabelText('文本内容'), { target: { value: '# hello' } });
    fireEvent.click(screen.getByText('继续'));

    await waitFor(() => expect(onContinue).toHaveBeenCalledWith({ name: '剧本', markdown: '# hello' }));
  });

  it('does not render the editor for disabled paste types', () => {
    render(<PasteTextDialog open assetType={ASSET_TYPES[3]} onClose={() => {}} onContinue={vi.fn()} />);

    expect(screen.getByText('该资产类型不支持粘贴文本')).toBeTruthy();
    expect(screen.queryByLabelText('文本内容')).toBeNull();
  });

  it('validates empty pasted content', async () => {
    const onContinue = vi.fn();
    render(<PasteTextDialog open assetType={ASSET_TYPES[0]} onClose={() => {}} onContinue={onContinue} />);

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '剧本' } });
    fireEvent.click(screen.getByText('继续'));

    expect(await screen.findByText('请先粘贴文本内容')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
