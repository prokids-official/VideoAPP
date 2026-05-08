import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { api } from '../../../lib/api';
import { loadAiProviderSettings } from '../../../lib/ai-provider-settings';
import { loadActiveSkillIds } from '../../../lib/skill-activation';
import { PromptImgStage } from './PromptImgStage';
import { PromptVidStage } from './PromptVidStage';

vi.mock('../../../lib/ai-provider-settings', () => ({
  defaultAiProviderSettings: {
    mode: 'official-deepseek',
    model: 'deepseek-v4-flash',
  },
  loadAiProviderSettings: vi.fn(),
}));

vi.mock('../../../lib/skill-activation', () => ({
  loadActiveSkillIds: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    skills: vi.fn(),
    promptImageRun: vi.fn(),
    promptVideoRun: vi.fn(),
  },
}));

const mockedApi = api as typeof api & {
  promptImageRun: ReturnType<typeof vi.fn>;
  promptVideoRun: ReturnType<typeof vi.fn>;
};

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'prompt-img',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('PromptStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAiProviderSettings).mockResolvedValue({
      mode: 'official-deepseek',
      model: 'deepseek-v4-flash',
    });
    vi.mocked(loadActiveSkillIds).mockResolvedValue([]);
    vi.mocked(api.skills).mockImplementation(async (category?: string) => ({
      ok: true,
      data: {
        skills: [
          category === 'prompt-vid'
            ? {
                id: 'prompt-video-director',
                name_cn: '视频提示词导演',
                category: 'prompt-vid',
                default_model: 'deepseek-v4-pro',
                version: 1,
                description: '把分镜和图片提示词转换成视频提示词。',
              }
            : {
                id: 'prompt-image-director',
                name_cn: '图片提示词导演',
                category: 'prompt-img',
                default_model: 'deepseek-v4-pro',
                version: 1,
                description: '把分镜拆成图像生成提示词。',
              },
        ],
      },
    }));
    mockedApi.promptImageRun.mockResolvedValue({
      ok: true,
      data: {
        run: {
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          skill: {
            id: 'prompt-image-director',
            name_cn: '图片提示词导演',
            category: 'prompt-img',
            version: 1,
          },
          messages: [],
          prompts: [
            {
              storyboard_asset_id: 'storyboard-1',
              storyboard_number: 1,
              prompt_text: 'wide shot, rainy ruined city, cinematic neon reflection',
            },
          ],
        },
      },
    });
    mockedApi.promptVideoRun.mockResolvedValue({
      ok: true,
      data: {
        run: {
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          skill: {
            id: 'prompt-video-director',
            name_cn: '视频提示词导演',
            category: 'prompt-vid',
            version: 1,
          },
          messages: [],
          prompts: [
            {
              storyboard_asset_id: 'storyboard-1',
              storyboard_number: 1,
              prompt_text: '8s slow push-in through rain, neon reflection on wet ground, gentle handheld drift',
            },
          ],
        },
      },
    });
  });

  it('saves a manual image prompt for a storyboard unit', async () => {
    const onSave = vi.fn(async () => makePromptAsset('PROMPT_IMG'));

    render(
      <PromptImgStage
        project={project}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[]}
        stateJson={null}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'AI 生成图片提示词' }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('雨夜开场')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('图片提示词 01'), {
      target: { value: 'wide shot, rainy ruined city, cinematic neon reflection' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存图片提示词 01' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        storyboardAssetId: 'storyboard-1',
        storyboardNumber: 1,
        storyboardSummary: '雨夜开场',
        promptText: 'wide shot, rainy ruined city, cinematic neon reflection',
      });
    });
  });

  it('runs the image prompt agent and saves returned prompts', async () => {
    const onSave = vi.fn(async (input: {
      storyboardAssetId: string;
      storyboardNumber: number;
      storyboardSummary: string;
      promptText: string;
    }) => makePromptAsset('PROMPT_IMG', input.promptText));

    render(
      <PromptImgStage
        project={project}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[]}
        stateJson={null}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'AI 生成图片提示词' }));

    await waitFor(() => {
      expect(mockedApi.promptImageRun).toHaveBeenCalledWith({
        skill_id: 'prompt-image-director',
        provider_config: {
          mode: 'official-deepseek',
          model: 'deepseek-v4-flash',
        },
        input: {
          project_name: '末日机械人',
          style_hint: '',
          storyboard_units: [
            {
              asset_id: 'storyboard-1',
              number: 1,
              summary: '雨夜开场',
              duration_s: 8,
            },
          ],
        },
      });
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        storyboardAssetId: 'storyboard-1',
        storyboardNumber: 1,
        storyboardSummary: '雨夜开场',
        promptText: 'wide shot, rainy ruined city, cinematic neon reflection',
        agentRun: expect.objectContaining({
          stage: 'prompt-img',
          skill_id: 'prompt-image-director',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          output_count: 1,
        }),
      }));
    });
    expect(screen.getByText('Agent Run')).toBeTruthy();
    expect(screen.getByText('prompt-image-director')).toBeTruthy();
  });

  it('runs the video prompt agent with image prompts and saves returned prompts', async () => {
    const onSave = vi.fn(async (input: {
      storyboardAssetId: string;
      storyboardNumber: number;
      storyboardSummary: string;
      promptText: string;
    }) => makePromptAsset('PROMPT_VID', input.promptText));

    render(
      <PromptVidStage
        project={{ ...project, current_stage: 'prompt-vid' }}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[makePromptAsset('PROMPT_IMG')]}
        stateJson={null}
        onSave={onSave}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'AI 生成视频提示词' }));

    await waitFor(() => {
      expect(mockedApi.promptVideoRun).toHaveBeenCalledWith({
        skill_id: 'prompt-video-director',
        provider_config: {
          mode: 'official-deepseek',
          model: 'deepseek-v4-flash',
        },
        input: {
          project_name: '末日机械人',
          style_hint: '',
          storyboard_units: [
            {
              asset_id: 'storyboard-1',
              number: 1,
              summary: '雨夜开场',
              duration_s: 8,
              image_prompt: 'wide shot, rainy ruined city, cinematic neon reflection',
            },
          ],
        },
      });
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        storyboardAssetId: 'storyboard-1',
        storyboardNumber: 1,
        storyboardSummary: '雨夜开场',
        promptText: '8s slow push-in through rain, neon reflection on wet ground, gentle handheld drift',
        agentRun: expect.objectContaining({
          stage: 'prompt-vid',
          skill_id: 'prompt-video-director',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          output_count: 1,
        }),
      }));
    });
    expect(screen.getByText('Agent Run')).toBeTruthy();
    expect(screen.getByText('prompt-video-director')).toBeTruthy();
  });

  it('prefills existing video prompts from local assets', () => {
    render(
      <PromptVidStage
        project={{ ...project, current_stage: 'prompt-vid' }}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[makePromptAsset('PROMPT_VID')]}
        stateJson={null}
        onSave={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('slow push-in, rain drops on lens, 8 seconds')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存视频提示词 01' })).toBeTruthy();
  });

  it('highlights the located storyboard unit from export preflight', () => {
    render(
      <PromptVidStage
        project={{ ...project, current_stage: 'prompt-vid' }}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[makePromptAsset('PROMPT_VID')]}
        stateJson={null}
        locateTarget={{
          stage: 'prompt-vid',
          storyboardAssetId: 'storyboard-1',
          storyboardNumber: 1,
          reason: 'Missing video prompt',
        }}
        onSave={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByText('已定位到 SHOT 01')).toBeTruthy();
    expect(screen.getByTestId('prompt-unit-storyboard-1').getAttribute('data-located')).toBe('true');
  });

  it('attaches a generated image output to an existing image prompt', async () => {
    const onAttachGenerated = vi.fn(async () => makeGeneratedAsset('SHOT_IMG'));
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
        fs: {
          openFileDialog: vi.fn(async () => ({
            path: 'E:\\outputs\\shot-01.png',
            name: 'shot-01.png',
            size_bytes: 4,
            content: new Uint8Array([1, 2, 3, 4]),
          })),
        },
      },
    });

    render(
      <PromptImgStage
        project={project}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[makePromptAsset('PROMPT_IMG')]}
        generatedAssets={[]}
        stateJson={null}
        onSave={vi.fn()}
        onAttachGenerated={onAttachGenerated}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '挂载图片输出 01' }));

    await waitFor(() => {
      expect(onAttachGenerated).toHaveBeenCalledWith(expect.objectContaining({
        promptAssetId: 'prompt_img-1',
        storyboardAssetId: 'storyboard-1',
        storyboardNumber: 1,
        storyboardSummary: '雨夜开场',
        promptText: 'wide shot, rainy ruined city, cinematic neon reflection',
        file: {
          content: new Uint8Array([1, 2, 3, 4]),
          mimeType: 'image/png',
          name: 'shot-01.png',
          sizeBytes: 4,
        },
      }));
    });
  });

  it('previews and deletes an attached generated image output', async () => {
    const onDeleteGenerated = vi.fn(async () => {});
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:shot-img-1'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
        studio: {
          assetReadFile: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
        },
      },
    });

    render(
      <PromptImgStage
        project={project}
        storyboardAssets={[makeStoryboardAsset()]}
        assets={[makePromptAsset('PROMPT_IMG')]}
        generatedAssets={[makeGeneratedAsset('SHOT_IMG')]}
        stateJson={null}
        onSave={vi.fn()}
        onDeleteGenerated={onDeleteGenerated}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByText('分镜图 01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '预览 分镜图 01' }));

    expect(await screen.findByAltText('分镜图 01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭预览' }));
    fireEvent.click(screen.getByRole('button', { name: '删除 分镜图 01' }));

    await waitFor(() => {
      expect(onDeleteGenerated).toHaveBeenCalledWith(expect.objectContaining({ id: 'shot_img-1' }));
    });
  });
});

function makeStoryboardAsset(): StudioAsset {
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

function makePromptAsset(typeCode: 'PROMPT_IMG' | 'PROMPT_VID', promptText?: string): StudioAsset {
  return {
    id: `${typeCode.toLowerCase()}-1`,
    project_id: 'studio-1',
    type_code: typeCode,
    name: typeCode === 'PROMPT_IMG' ? '图片提示词 01' : '视频提示词 01',
    variant: null,
    version: 1,
    meta_json: JSON.stringify({
      storyboard_asset_id: 'storyboard-1',
      storyboard_number: 1,
      storyboard_summary: '雨夜开场',
      prompt_text: promptText ?? (typeCode === 'PROMPT_IMG'
        ? 'wide shot, rainy ruined city, cinematic neon reflection'
        : 'slow push-in, rain drops on lens, 8 seconds'),
    }),
    content_path: null,
    size_bytes: null,
    mime_type: 'text/markdown',
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function makeGeneratedAsset(typeCode: 'SHOT_IMG' | 'SHOT_VID'): StudioAsset {
  return {
    id: `${typeCode.toLowerCase()}-1`,
    project_id: 'studio-1',
    type_code: typeCode,
    name: typeCode === 'SHOT_IMG' ? '分镜图 01' : '分镜视频 01',
    variant: null,
    version: 1,
    meta_json: JSON.stringify({
      source_prompt_asset_id: 'prompt_img-1',
      storyboard_number: 1,
    }),
    content_path: 'E:\\studio\\output',
    size_bytes: 4,
    mime_type: typeCode === 'SHOT_IMG' ? 'image/png' : 'video/mp4',
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
