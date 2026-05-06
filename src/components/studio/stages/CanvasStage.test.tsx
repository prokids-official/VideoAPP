import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { CanvasStage } from './CanvasStage';

const project: StudioProject = {
  id: 'studio-1',
  name: 'Rain Machine',
  size_kind: 'short',
  inspiration_text: 'rainy ruined city',
  current_stage: 'canvas',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('CanvasStage', () => {
  it('groups local assets by type and advances to export', () => {
    const onAdvance = vi.fn();

    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('script-1', 'SCRIPT', 'Main script', 2048),
          makeAsset('char-1', 'CHAR', 'Li Huowang', null),
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512),
        ]}
        onAdvance={onAdvance}
      />,
    );

    expect(screen.getByText('Main script')).toBeTruthy();
    expect(screen.getByText('Li Huowang')).toBeTruthy();
    expect(screen.getByText('Image prompt 01')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '准备入库 →' }));

    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it('shows prompt to generated asset links', () => {
    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'wide shot',
          }),
          makeAsset('shot-img-1', 'SHOT_IMG', 'Generated image 01', 4096, {
            source_prompt_asset_id: 'prompt-img-1',
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
          }),
        ]}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Storyboard 01')).toHaveLength(2);
    expect(screen.getByText('1 generated output')).toBeTruthy();
    expect(screen.getByText('From prompt: Image prompt 01')).toBeTruthy();
  });

  it('threads storyboard prompts and generated outputs into a shot timeline', () => {
    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('storyboard-1', 'STORYBOARD_UNIT', 'Rain opener', 1024, {
            number: 1,
            duration_s: 15,
            summary: 'Rain falls over the gate',
          }),
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'wide shot, rain, gate',
          }),
          makeAsset('prompt-vid-1', 'PROMPT_VID', 'Video prompt 01', 768, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            prompt_text: 'slow push in',
          }),
          makeAsset('shot-img-1', 'SHOT_IMG', 'Generated image 01', 4096, {
            source_prompt_asset_id: 'prompt-img-1',
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
          }),
          makeAsset('shot-vid-1', 'SHOT_VID', 'Generated video 01', 8192, {
            source_prompt_asset_id: 'prompt-vid-1',
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
          }),
        ]}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.getByText('SHOT 01')).toBeTruthy();
    expect(screen.getByText('Rain falls over the gate')).toBeTruthy();
    expect(screen.getByText('Image prompt 01')).toBeTruthy();
    expect(screen.getByText('Generated image 01')).toBeTruthy();
    expect(screen.getByText('Video prompt 01')).toBeTruthy();
    expect(screen.getByText('Generated video 01')).toBeTruthy();
  });

  it('opens and hides the embedded external canvas tab', async () => {
    const canvasBridge = {
      liblibShow: vi.fn(async () => ({
        ok: true as const,
        url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
      })),
      liblibSetBounds: vi.fn(async () => ({ ok: true as const })),
      liblibHide: vi.fn(async () => ({ ok: true as const })),
      liblibOpenExternal: vi.fn(async () => ({
        ok: true as const,
        url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
      })),
    };
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: { canvas: canvasBridge },
    });
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 100,
      y: 120,
      width: 800,
      height: 500,
      top: 120,
      left: 100,
      right: 900,
      bottom: 620,
      toJSON: () => ({}),
    }));
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', vi.fn(function ResizeObserver() {
      return { observe, disconnect };
    }));
    const onSaveState = vi.fn(async () => {});

    render(
      <CanvasStage
        project={project}
        assets={[]}
        stateJson={JSON.stringify({ liblib_url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd' })}
        onSaveState={onSaveState}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'LibLib 画布' }));
    fireEvent.click(screen.getByRole('button', { name: '嵌入打开' }));

    await waitFor(() => {
      expect(canvasBridge.liblibShow).toHaveBeenCalledWith({
        url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
        bounds: { x: 100, y: 120, width: 800, height: 500 },
      });
    });
    await waitFor(() => {
      expect(onSaveState).toHaveBeenCalledWith(expect.stringContaining('"active_tab":"liblib"'));
    });

    fireEvent.click(screen.getByRole('button', { name: '链路预览' }));

    await waitFor(() => {
      expect(canvasBridge.liblibHide).toHaveBeenCalled();
    });
  });

  it('imports a downloaded external canvas output back onto a shot prompt', async () => {
    const onImportExternalOutput = vi.fn(async () => makeAsset('shot-img-new', 'SHOT_IMG', 'Imported image 01', 4));
    Object.defineProperty(window, 'fableglitch', {
      configurable: true,
      value: {
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

    render(
      <CanvasStage
        project={project}
        assets={[
          makeAsset('storyboard-1', 'STORYBOARD_UNIT', 'Rain opener', 1024, {
            number: 1,
            duration_s: 15,
            summary: 'Rain falls over the gate',
          }),
          makeAsset('prompt-img-1', 'PROMPT_IMG', 'Image prompt 01', 512, {
            storyboard_asset_id: 'storyboard-1',
            storyboard_number: 1,
            storyboard_summary: 'Rain falls over the gate',
            prompt_text: 'wide shot, rain, gate',
          }),
        ]}
        onImportExternalOutput={onImportExternalOutput}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /LibLib/ }));
    fireEvent.click(screen.getByRole('button', { name: '导入外部产物' }));

    await waitFor(() => {
      expect(onImportExternalOutput).toHaveBeenCalledWith({
        typeCode: 'SHOT_IMG',
        promptAssetId: 'prompt-img-1',
        storyboardAssetId: 'storyboard-1',
        storyboardNumber: 1,
        storyboardSummary: 'Rain falls over the gate',
        promptText: 'wide shot, rain, gate',
        file: {
          name: 'liblib-shot-01.png',
          content: new Uint8Array([1, 2, 3, 4]),
          mimeType: 'image/png',
          sizeBytes: 4,
        },
      });
    });
  });

  it('lets the embedded canvas tab scroll when the window is short', () => {
    render(
      <CanvasStage
        project={project}
        assets={[]}
        onAdvance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /LibLib/ }));

    expect(screen.getByTestId('canvas-liblib-scroll').className).toContain('overflow-y-auto');
  });
});

function makeAsset(
  id: string,
  typeCode: string,
  name: string,
  sizeBytes: number | null,
  meta: Record<string, unknown> = {},
): StudioAsset {
  return {
    id,
    project_id: 'studio-1',
    type_code: typeCode,
    name,
    variant: null,
    version: 1,
    meta_json: JSON.stringify(meta),
    content_path: null,
    size_bytes: sizeBytes,
    mime_type: typeCode === 'PROMPT_IMG' ? 'text/markdown' : null,
    pushed_to_episode_id: null,
    pushed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
