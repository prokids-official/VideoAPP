import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VideoPreview } from './VideoPreview';

describe('VideoPreview', () => {
  it('shows duration and resolution metadata', () => {
    render(<VideoPreview src="https://example.com/a.mp4" />);

    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    Object.defineProperty(video, 'duration', { configurable: true, value: 125 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    fireEvent.loadedMetadata(video!);

    expect(screen.getByText('02:05 · 1920x1080')).toBeTruthy();
  });
});
