import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptStage } from './ScriptStage';
import type { StudioAsset, StudioProject } from '../../../../shared/types';

vi.mock('../../../lib/docx', () => ({
  docxToMarkdown: vi.fn(async () => '# 导入剧本\n\n雨夜废城里，机械少女醒来。'),
}));

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'script',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

const scriptAsset: StudioAsset = {
  id: 'asset-script-1',
  project_id: 'studio-1',
  type_code: 'SCRIPT',
  name: '主线剧本',
  variant: null,
  version: 1,
  meta_json: '{}',
  content_path: null,
  size_bytes: null,
  mime_type: 'text/markdown',
  pushed_to_episode_id: null,
  pushed_at: null,
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('ScriptStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
        fs: {
          openFileDialog: vi.fn(async () => ({
            path: 'E:\\draft.docx',
            name: 'draft.docx',
            size_bytes: 12,
            content: new Uint8Array([1, 2, 3]),
          })),
        },
      },
    });
  });

  it('renders the future AI cockpit controls as disabled placeholders', () => {
    render(<ScriptStage project={project} assets={[]} stateJson={null} onSave={vi.fn()} onAdvance={vi.fn()} />);

    expect((screen.getByRole('button', { name: 'AI 写剧本' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'AI 优化' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'AI 评分' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('好莱坞级 3D 动画导演')).toBeTruthy();
    expect(screen.getAllByText(/P1\.3 上线后启用/).length).toBeGreaterThan(0);
  });

  it('saves markdown as a SCRIPT asset with reproducible agent metadata', async () => {
    const onSave = vi.fn(async () => scriptAsset);

    render(<ScriptStage project={project} assets={[]} stateJson={null} onSave={onSave} onAdvance={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('剧本标题'), { target: { value: '主线剧本' } });
    fireEvent.change(screen.getByLabelText('风格倾向'), { target: { value: '黑色童话，克制冷感' } });
    fireEvent.change(screen.getByLabelText('目标时长'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('剧本正文'), {
      target: { value: '雨水从破败霓虹灯上滴落，机械少女第一次睁眼。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存为 SCRIPT 资产' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: '主线剧本',
        body: '雨水从破败霓虹灯上滴落，机械少女第一次睁眼。',
        mode: 'from-scratch',
        styleHint: '黑色童话，克制冷感',
        durationSec: 90,
        skillId: 'grim-fairy-3d',
        provider: 'company-default',
        viewMode: 'shooting-script',
      });
    });
  });

  it('imports docx content into the editor', async () => {
    render(<ScriptStage project={project} assets={[]} stateJson={null} onSave={vi.fn()} onAdvance={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '导入 .docx' }));

    expect(await screen.findByDisplayValue(/导入剧本/)).toBeTruthy();
  });
});
