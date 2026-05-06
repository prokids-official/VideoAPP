import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioWorkspaceRoute } from './StudioWorkspaceRoute';
import type { StudioProjectBundle } from '../../shared/types';

const bundle: StudioProjectBundle = {
  project: {
    id: 'studio-1',
    name: '末日机械人',
    size_kind: 'short',
    inspiration_text: null,
    current_stage: 'script',
    owner_id: 'local',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  assets: [
    {
      id: 'asset-1',
      project_id: 'studio-1',
      type_code: 'SCRIPT',
      name: '主线剧本',
      variant: null,
      version: 1,
      meta_json: '{}',
      content_path: null,
      size_bytes: null,
      mime_type: null,
      pushed_to_episode_id: null,
      pushed_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
  ],
  stage_state: {
    inspiration: '{"text":"idea"}',
  },
};

const studio = {
  projectCreate: vi.fn(),
  projectList: vi.fn(),
  projectGet: vi.fn(),
  projectUpdate: vi.fn(),
  projectDelete: vi.fn(),
  assetSave: vi.fn(),
  assetList: vi.fn(),
  assetDelete: vi.fn(),
  assetWriteFile: vi.fn(),
  assetReadFile: vi.fn(),
  stageSave: vi.fn(),
  stageGet: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'fableglitch', {
    configurable: true,
    value: { studio },
  });
  studio.projectGet.mockResolvedValue(bundle);
  studio.projectUpdate.mockResolvedValue({ ...bundle.project, current_stage: 'character' });
});

describe('StudioWorkspaceRoute', () => {
  it('loads a project bundle and advances stages', async () => {
    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    expect(await screen.findByText('末日机械人')).toBeTruthy();
    expect(screen.getByText('主线剧本')).toBeTruthy();
    expect((screen.getByRole('button', { name: '邀请成员' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '下一阶段 →' }));

    await waitFor(() => {
      expect(studio.projectUpdate).toHaveBeenCalledWith('studio-1', { current_stage: 'character' });
    });
  });

  it('saves inspiration stage through the studio bridge', async () => {
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'inspiration', inspiration_text: '' },
      stage_state: {},
    });
    studio.projectUpdate.mockResolvedValueOnce({
      ...bundle.project,
      current_stage: 'inspiration',
      inspiration_text: '雨夜废城里的机械少女',
    });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('灵感梗概'), {
      target: { value: '雨夜废城里的机械少女' },
    });
    fireEvent.change(screen.getByLabelText('题材标签'), { target: { value: '赛博, 雨夜' } });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => {
      expect(studio.projectUpdate).toHaveBeenCalledWith('studio-1', {
        inspiration_text: '雨夜废城里的机械少女',
        current_stage: 'inspiration',
      });
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'inspiration',
        JSON.stringify({ inspiration_text: '雨夜废城里的机械少女', tags: ['赛博', '雨夜'] }),
      );
    });
  });

  it('saves script markdown as a local SCRIPT asset through the studio bridge', async () => {
    const savedAsset = {
      id: 'script-asset-new',
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
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'script' },
      assets: [],
      stage_state: {},
    });
    studio.assetSave.mockResolvedValueOnce(savedAsset);
    studio.assetWriteFile.mockResolvedValueOnce({ path: 'E:\\studio\\script-asset-new.md', size_bytes: 42 });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('剧本标题'), { target: { value: '主线剧本' } });
    fireEvent.change(screen.getByLabelText('剧本正文'), {
      target: { value: '雨水从破败霓虹灯上滴落，机械少女第一次睁眼。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存为 SCRIPT 资产' }));

    await waitFor(() => {
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'studio-1',
        type_code: 'SCRIPT',
        name: '主线剧本',
        mime_type: 'text/markdown',
      }));
      expect(studio.assetWriteFile).toHaveBeenCalledWith(
        'script-asset-new',
        '雨水从破败霓虹灯上滴落，机械少女第一次睁眼。',
      );
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'script',
        expect.stringContaining('"asset_id":"script-asset-new"'),
      );
    });
  });

  it('saves character assets through the studio bridge', async () => {
    const savedAsset = {
      id: 'char-asset-new',
      project_id: 'studio-1',
      type_code: 'CHAR',
      name: '李火旺',
      variant: '主角',
      version: 1,
      meta_json: '{}',
      content_path: null,
      size_bytes: null,
      mime_type: null,
      pushed_to_episode_id: null,
      pushed_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'character' },
      assets: [],
      stage_state: {},
    });
    studio.assetSave.mockResolvedValueOnce(savedAsset);

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('角色名称'), { target: { value: '李火旺' } });
    fireEvent.change(screen.getByLabelText('版本/定位'), { target: { value: '主角' } });
    fireEvent.change(screen.getByLabelText('外貌'), { target: { value: '青年男性，眼神锐利' } });
    fireEvent.click(screen.getByRole('button', { name: '保存角色资产' }));

    await waitFor(() => {
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'studio-1',
        type_code: 'CHAR',
        name: '李火旺',
        variant: '主角',
      }));
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'character',
        expect.stringContaining('"last_asset_id":"char-asset-new"'),
      );
    });
  });

  it('saves storyboard units through the studio bridge', async () => {
    const savedAsset = {
      id: 'storyboard-unit-new',
      project_id: 'studio-1',
      type_code: 'STORYBOARD_UNIT',
      name: '分镜 01',
      variant: null,
      version: 1,
      meta_json: '{}',
      content_path: null,
      size_bytes: null,
      mime_type: null,
      pushed_to_episode_id: null,
      pushed_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'storyboard' },
      assets: [],
      stage_state: {},
    });
    studio.assetSave.mockResolvedValueOnce(savedAsset);

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('分镜编号'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('时长秒数'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('分镜摘要'), { target: { value: '雨夜开场' } });
    fireEvent.click(screen.getByRole('button', { name: '保存分镜单元' }));

    await waitFor(() => {
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'studio-1',
        type_code: 'STORYBOARD_UNIT',
        name: '分镜 01',
      }));
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'storyboard',
        expect.stringContaining('"last_asset_id":"storyboard-unit-new"'),
      );
    });
  });

  it('saves image prompts through the studio bridge', async () => {
    const savedAsset = makeSavedPromptAsset('prompt-img-new', 'PROMPT_IMG', '图片提示词 01');
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'prompt-img' },
      assets: [makeStoryboardAsset()],
      stage_state: {},
    });
    studio.assetSave.mockResolvedValueOnce(savedAsset);
    studio.assetWriteFile.mockResolvedValueOnce({ path: 'E:\\studio\\prompt-img-new.md', size_bytes: 58 });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('图片提示词 01'), {
      target: { value: 'wide shot, rainy ruined city, cinematic neon reflection' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存图片提示词 01' }));

    await waitFor(() => {
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'studio-1',
        type_code: 'PROMPT_IMG',
        name: '图片提示词 01',
        mime_type: 'text/markdown',
      }));
      expect(studio.assetWriteFile).toHaveBeenCalledWith(
        'prompt-img-new',
        'wide shot, rainy ruined city, cinematic neon reflection',
      );
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'prompt-img',
        expect.stringContaining('"last_asset_id":"prompt-img-new"'),
      );
    });
  });

  it('saves video prompts through the studio bridge', async () => {
    const savedAsset = makeSavedPromptAsset('prompt-vid-new', 'PROMPT_VID', '视频提示词 01');
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'prompt-vid' },
      assets: [makeStoryboardAsset()],
      stage_state: {},
    });
    studio.assetSave.mockResolvedValueOnce(savedAsset);
    studio.assetWriteFile.mockResolvedValueOnce({ path: 'E:\\studio\\prompt-vid-new.md', size_bytes: 40 });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('视频提示词 01'), {
      target: { value: 'slow push-in, rain drops on lens, 8 seconds' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存视频提示词 01' }));

    await waitFor(() => {
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'studio-1',
        type_code: 'PROMPT_VID',
        name: '视频提示词 01',
        mime_type: 'text/markdown',
      }));
      expect(studio.assetWriteFile).toHaveBeenCalledWith(
        'prompt-vid-new',
        'slow push-in, rain drops on lens, 8 seconds',
      );
      expect(studio.stageSave).toHaveBeenCalledWith(
        'studio-1',
        'prompt-vid',
        expect.stringContaining('"last_asset_id":"prompt-vid-new"'),
      );
    });
  });

  it('renders the read-only canvas preview and advances to export', async () => {
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'canvas' },
      assets: [
        makeSavedPromptAsset('prompt-img-1', 'PROMPT_IMG', '图片提示词 01'),
        makeSavedPromptAsset('prompt-vid-1', 'PROMPT_VID', '视频提示词 01'),
      ],
      stage_state: {},
    });
    studio.projectUpdate.mockResolvedValueOnce({ ...bundle.project, current_stage: 'export' });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    expect(await screen.findByText('图片提示词 01')).toBeTruthy();
    expect(screen.getByText('视频提示词 01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '准备入库 →' }));

    await waitFor(() => {
      expect(studio.projectUpdate).toHaveBeenCalledWith('studio-1', { current_stage: 'export' });
    });
  });

  it('imports external canvas output through the studio bridge', async () => {
    const savedAsset = {
      id: 'shot-img-new',
      project_id: 'studio-1',
      type_code: 'SHOT_IMG',
      name: '鍒嗛暅鍥?01',
      variant: null,
      version: 1,
      meta_json: '{}',
      content_path: null,
      size_bytes: null,
      mime_type: 'image/png',
      pushed_to_episode_id: null,
      pushed_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
        studio,
        fs: {
          openFileDialog: vi.fn(async () => ({
            path: 'E:\\outputs\\liblib-shot-01.png',
            name: 'liblib-shot-01.png',
            size_bytes: 4,
            content: new Uint8Array([1, 2, 3, 4]),
          })),
        },
      },
    });
    studio.projectGet.mockResolvedValueOnce({
      ...bundle,
      project: { ...bundle.project, current_stage: 'canvas' },
      assets: [
        makeStoryboardAsset(),
        {
          ...makeSavedPromptAsset('prompt-img-1', 'PROMPT_IMG', '鍥剧墖鎻愮ず璇?01'),
          meta_json: JSON.stringify({
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            storyboard_summary: 'Rain opener',
            prompt_text: 'wide shot, rainy ruined city, cinematic neon reflection',
          }),
        },
      ],
      stage_state: {},
    });
    studio.assetSave.mockResolvedValueOnce(savedAsset);
    studio.assetWriteFile.mockResolvedValueOnce({ path: 'E:\\studio\\shot-img-new.png', size_bytes: 4 });

    render(<StudioWorkspaceRoute projectId="studio-1" onBackToList={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /LibLib/ }));
    fireEvent.click(screen.getByRole('button', { name: '导入外部产物' }));

    await waitFor(() => {
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'studio-1',
        type_code: 'SHOT_IMG',
        mime_type: 'image/png',
      }));
      expect(studio.assetSave).toHaveBeenCalledWith(expect.objectContaining({
        meta_json: expect.stringContaining('"source_prompt_asset_id":"prompt-img-1"'),
      }));
      expect(studio.assetWriteFile).toHaveBeenCalledWith(
        'shot-img-new',
        new Uint8Array([1, 2, 3, 4]),
      );
    });
  });
});

function makeStoryboardAsset() {
  return {
    id: 'storyboard-1',
    project_id: 'studio-1',
    type_code: 'STORYBOARD_UNIT',
    name: '分镜 01',
    variant: null,
    version: 1,
    meta_json: JSON.stringify({ number: 1, summary: '雨夜开场', duration_s: 8 }),
    content_path: null,
    size_bytes: null,
    mime_type: null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function makeSavedPromptAsset(id: string, typeCode: 'PROMPT_IMG' | 'PROMPT_VID', name: string) {
  return {
    id,
    project_id: 'studio-1',
    type_code: typeCode,
    name,
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
}
