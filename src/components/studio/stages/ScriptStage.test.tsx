import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { api } from '../../../lib/api';
import { ScriptStage } from './ScriptStage';

vi.mock('../../../lib/api', () => ({
  api: {
    skills: vi.fn(),
    scriptWriterRun: vi.fn(),
  },
}));

vi.mock('../../../lib/docx', () => ({
  docxToMarkdown: vi.fn(async () => '# Imported script\n\nRain wakes the city.'),
}));

const project: StudioProject = {
  id: 'studio-1',
  name: 'Mecha Project',
  size_kind: 'short',
  inspiration_text: 'Rain city',
  current_stage: 'script',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

const scriptAsset: StudioAsset = {
  id: 'asset-script-1',
  project_id: 'studio-1',
  type_code: 'SCRIPT',
  name: 'Main script',
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
    vi.mocked(api.skills).mockResolvedValue({
      ok: true,
      data: {
        skills: [
          {
            id: 'grim-fairy-3d',
            name_cn: 'Grim Fairy 3D Director',
            category: 'script-writer',
            default_model: 'deepseek-v4-pro',
            version: 1,
            description: 'Write compact animated shorts.',
          },
        ],
      },
    });
    vi.mocked(api.scriptWriterRun).mockResolvedValue({
      ok: true,
      data: {
        run: {
          status: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          skill: {
            id: 'grim-fairy-3d',
            name_cn: 'Grim Fairy 3D Director',
            category: 'script-writer',
            version: 1,
          },
          messages: [
            { role: 'system', content: 'You are a grim fairy 3D animation director.' },
            { role: 'user', content: 'project_name: Mecha Project\nmode: from-scratch' },
          ],
          content: '# Script\n\nRain opens on a broken neon gate.',
          usage: {
            promptTokens: 123,
            completionTokens: 45,
            totalTokens: 168,
          },
        },
      },
    });
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

  it('loads script writer skills and enables the dry-run write action', async () => {
    render(<ScriptStage project={project} assets={[]} stateJson={null} onSave={vi.fn()} onAdvance={vi.fn()} />);

    await waitFor(() => {
      expect(api.skills).toHaveBeenCalledWith('script-writer');
    });

    expect(screen.getByDisplayValue('grim-fairy-3d')).toBeTruthy();
    expect(findButton('AI').disabled).toBe(false);
    expect(screen.getByText('Grim Fairy 3D Director')).toBeTruthy();
  });

  it('runs the script writer agent and writes the generated script into the editor', async () => {
    const { container } = render(
      <ScriptStage project={project} assets={[]} stateJson={null} onSave={vi.fn()} onAdvance={vi.fn()} />,
    );

    fireEvent.change(requiredInput(container, '#studio-script-style'), { target: { value: 'Cold fairytale' } });
    fireEvent.change(requiredInput(container, '#studio-script-duration'), { target: { value: '90' } });
    fireEvent.click(await waitFor(() => findButton('AI')));

    await waitFor(() => {
      expect(api.scriptWriterRun).toHaveBeenCalledWith({
        skill_id: 'grim-fairy-3d',
        dry_run: false,
        input: {
          project_name: 'Mecha Project',
          mode: 'from-scratch',
          duration_sec: 90,
          style_hint: 'Cold fairytale',
          inspiration_text: 'Rain city',
          existing_script: '',
        },
      });
    });
    const editor = screen.getByLabelText('剧本正文') as HTMLTextAreaElement;
    expect(editor.value).toBe('# Script\n\nRain opens on a broken neon gate.');
  });

  it('saves markdown as a SCRIPT asset with reproducible agent metadata', async () => {
    const onSave = vi.fn(async () => scriptAsset);
    const { container } = render(
      <ScriptStage project={project} assets={[]} stateJson={null} onSave={onSave} onAdvance={vi.fn()} />,
    );

    fireEvent.change(requiredInput(container, '#studio-script-name'), { target: { value: 'Main script' } });
    fireEvent.change(requiredInput(container, '#studio-script-style'), { target: { value: 'Cold fairytale' } });
    fireEvent.change(requiredInput(container, '#studio-script-duration'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('剧本正文'), { target: { value: 'Rain falls on the broken neon.' } });
    fireEvent.submit(requiredElement(container, 'form'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: 'Main script',
        body: 'Rain falls on the broken neon.',
        mode: 'from-scratch',
        styleHint: 'Cold fairytale',
        durationSec: 90,
        skillId: 'grim-fairy-3d',
        provider: 'company-default',
        viewMode: 'shooting-script',
      });
    });
  });

  it('imports docx content into the editor', async () => {
    render(<ScriptStage project={project} assets={[]} stateJson={null} onSave={vi.fn()} onAdvance={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /docx/i }));

    expect(await screen.findByDisplayValue(/Imported script/)).toBeTruthy();
  });
});

function findButton(labelPart: string): HTMLButtonElement {
  const button = screen.getAllByRole('button').find((item) => item.textContent?.includes(labelPart));
  if (!button) {
    throw new Error(`Button containing ${labelPart} not found`);
  }
  return button as HTMLButtonElement;
}

function requiredInput(container: HTMLElement, selector: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const element = requiredElement(container, selector);
  if (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
  ) {
    return element;
  }
  throw new Error(`${selector} is not a form control`);
}

function requiredElement(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector(selector);
  if (!element) {
    throw new Error(`${selector} not found`);
  }
  return element as HTMLElement;
}
