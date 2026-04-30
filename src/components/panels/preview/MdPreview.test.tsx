import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MdPreview } from './MdPreview';

describe('MdPreview', () => {
  it('renders markdown headings, links, and code', () => {
    render(<MdPreview markdown={'# 标题\n\n正文 [链接](https://example.com)\n\n`code`'} />);

    expect(screen.getByRole('heading', { name: '标题' })).toBeTruthy();
    expect(screen.getByText('正文')).toBeTruthy();
    expect(screen.getByRole('link', { name: '链接' }).getAttribute('href')).toBe('https://example.com');
    expect(screen.getByText('code')).toBeTruthy();
  });
});
