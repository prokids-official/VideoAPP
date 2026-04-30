import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
