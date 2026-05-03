import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImagePreview } from './ImagePreview';

describe('ImagePreview', () => {
  it('shows loading then renders the image', () => {
    render(<ImagePreview src="https://example.com/a.png" alt="角色图" />);

    expect(screen.getByText('loading image...')).toBeTruthy();
    const image = screen.getByAltText('角色图');
    fireEvent.load(image);
    expect(image.className).toContain('block');
  });

  it('shows an error state', () => {
    render(<ImagePreview src="https://example.com/a.png" alt="角色图" />);

    fireEvent.error(screen.getByAltText('角色图'));
    expect(screen.getByText('图片加载失败')).toBeTruthy();
  });

  it('shows a copy-image context menu', async () => {
    const onCopyImage = vi.fn();

    render(<ImagePreview src="https://example.com/a.png" alt="角色图" onCopyImage={onCopyImage} />);

    const image = screen.getByAltText('角色图');
    fireEvent.load(image);
    fireEvent.contextMenu(image, { clientX: 24, clientY: 32 });

    await userEvent.click(screen.getByRole('button', { name: '复制图片' }));

    expect(onCopyImage).toHaveBeenCalledTimes(1);
  });
});
