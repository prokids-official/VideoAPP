import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EpisodeWizard } from './EpisodeWizard';

describe('EpisodeWizard', () => {
  it('submits four-step episode creation payload', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 'ep-1' });
    const onCreated = vi.fn();
    render(<EpisodeWizard open onClose={() => {}} onCreate={onCreate} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('系列'), { target: { value: '童话剧' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.change(screen.getByLabelText('专辑'), { target: { value: 'NA' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.change(screen.getByLabelText('内容'), { target: { value: '侏儒怪' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.change(screen.getByLabelText('剧集'), { target: { value: '第一集' } });
    expect(screen.getByText('童话剧_NA_侏儒怪')).toBeTruthy();
    fireEvent.click(screen.getByText('创建剧集'));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        series_name_cn: '童话剧',
        album_name_cn: 'NA',
        content_name_cn: '侏儒怪',
        episode_name_cn: '第一集',
      }),
    );
    expect(onCreated).toHaveBeenCalledWith('ep-1');
  });
});
