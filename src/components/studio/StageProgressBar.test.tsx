import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageProgressBar } from './StageProgressBar';

describe('StageProgressBar', () => {
  it('renders all stages and selects a stage', () => {
    const onSelect = vi.fn();

    render(<StageProgressBar currentStage="script" doneStages={new Set(['inspiration'])} onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(10);
    expect(screen.getByRole('button', { current: 'step' })).toBeTruthy();

    fireEvent.click(buttons[2]);

    expect(onSelect).toHaveBeenCalledWith('character');
  });
});
