import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsRoute } from './SkillsRoute';
import { api } from '../lib/api';
import { loadActiveSkillIds, saveActiveSkillIds, toggleActiveSkillId } from '../lib/skill-activation';

vi.mock('../lib/api', () => ({
  api: {
    skills: vi.fn(),
    createSkill: vi.fn(),
  },
}));

vi.mock('../lib/skill-activation', () => ({
  loadActiveSkillIds: vi.fn(),
  saveActiveSkillIds: vi.fn(),
  toggleActiveSkillId: vi.fn(),
}));

vi.mock('../stores/use-auth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'creator@beva.com',
      display_name: 'Creator',
      team: 'FableGlitch',
      role: 'admin',
    },
    logout: vi.fn(),
  }),
}));

const scriptSkill = {
  id: 'auto-script',
  name_cn: '自动剧本生成器',
  category: 'script-writer',
  default_model: 'deepseek-v4-flash',
  version: 1,
  description: '从创意概念生成完整剧本。',
};

const sceneSkill = {
  id: 'scene-camera',
  name_cn: '场景多机位助手',
  category: 'storyboard',
  default_model: 'deepseek-v4-pro',
  version: 1,
  description: '为分镜阶段生成多角度场景参考。',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.skills).mockResolvedValue({ ok: true, data: { skills: [scriptSkill, sceneSkill] } });
  vi.mocked(api.createSkill).mockResolvedValue({ ok: true, data: { skill: sceneSkill } });
  vi.mocked(loadActiveSkillIds).mockResolvedValue(['auto-script']);
  vi.mocked(saveActiveSkillIds).mockResolvedValue(undefined);
  vi.mocked(toggleActiveSkillId).mockResolvedValue(['auto-script', 'scene-camera']);
});

describe('SkillsRoute', () => {
  it('shows marketplace skills and the active skill shelf', async () => {
    render(<SkillsRoute onBack={vi.fn()} />);

    expect(await screen.findByText('Skills Hub')).toBeTruthy();
    expect(screen.getAllByText('自动剧本生成器').length).toBeGreaterThan(0);
    expect(screen.getByText('场景多机位助手')).toBeTruthy();
    expect(screen.getByText('我的技能')).toBeTruthy();
    expect(screen.getByText('已激活 1')).toBeTruthy();
  });

  it('activates and deactivates skills locally', async () => {
    render(<SkillsRoute onBack={vi.fn()} />);

    await screen.findByText('场景多机位助手');
    fireEvent.click(screen.getByRole('button', { name: '激活 场景多机位助手' }));

    await waitFor(() => {
      expect(toggleActiveSkillId).toHaveBeenCalledWith('scene-camera');
      expect(screen.getByText('已激活 2')).toBeTruthy();
    });
  });

  it('creates a custom skill and activates it', async () => {
    render(<SkillsRoute onBack={vi.fn()} />);

    await screen.findByText('Skills Hub');
    fireEvent.change(screen.getByLabelText('Skill 名称'), { target: { value: '镜头规划助手' } });
    fireEvent.change(screen.getByLabelText('Skill ID'), { target: { value: 'shot-planner' } });
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'storyboard' } });
    fireEvent.change(screen.getByLabelText('简介'), { target: { value: '把剧本拆成稳定镜头。' } });
    fireEvent.change(screen.getByLabelText('Skill 指令'), { target: { value: '# Role\nPlan shots.' } });
    fireEvent.click(screen.getByRole('button', { name: '创建 Skill' }));

    await waitFor(() => {
      expect(api.createSkill).toHaveBeenCalledWith({
        id: 'shot-planner',
        name_cn: '镜头规划助手',
        category: 'storyboard',
        description: '把剧本拆成稳定镜头。',
        body: '# Role\nPlan shots.',
      });
      expect(saveActiveSkillIds).toHaveBeenCalledWith(['auto-script', 'scene-camera']);
    });
  });
});
