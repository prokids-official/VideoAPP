import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterStage } from './CharacterStage';
import { SceneStage } from './SceneStage';
import { PropStage } from './PropStage';
import type { StudioProject } from '../../../../shared/types';

const project: StudioProject = {
  id: 'studio-1',
  name: '末日机械人',
  size_kind: 'short',
  inspiration_text: '雨夜废城',
  current_stage: 'character',
  owner_id: 'local',
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('AssetEntityStage', () => {
  it('saves a structured CHAR asset and keeps future AI controls disabled', async () => {
    const onSave = vi.fn(async () => makeAsset('CHAR', '李火旺'));

    render(<CharacterStage project={project} assets={[]} stateJson={null} onSave={onSave} onAdvance={vi.fn()} />);

    expect((screen.getByRole('button', { name: 'AI 生成角色' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '从剧本提取角色' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('角色名称'), { target: { value: '李火旺' } });
    fireEvent.change(screen.getByLabelText('版本/定位'), { target: { value: '主角' } });
    fireEvent.change(screen.getByLabelText('外貌'), { target: { value: '青年男性，眼神锐利' } });
    fireEvent.change(screen.getByLabelText('服装'), { target: { value: '深色古装，湿冷破损' } });
    fireEvent.change(screen.getByLabelText('性格'), { target: { value: '警惕、孤勇、克制' } });
    fireEvent.change(screen.getByLabelText('配色'), { target: { value: '深褐、暗红、冷灰' } });
    fireEvent.change(screen.getByLabelText('视觉锚点'), { target: { value: '雨水、破伞、发光眼瞳' } });
    fireEvent.change(screen.getByLabelText('AI 图片 prompt'), { target: { value: 'cinematic character sheet' } });
    fireEvent.click(screen.getByRole('button', { name: '保存角色资产' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        typeCode: 'CHAR',
        name: '李火旺',
        variant: '主角',
        meta: {
          appearance: '青年男性，眼神锐利',
          clothing: '深色古装，湿冷破损',
          personality: '警惕、孤勇、克制',
          palette: '深褐、暗红、冷灰',
          visual_anchor: '雨水、破伞、发光眼瞳',
          ai_prompt: 'cinematic character sheet',
        },
      });
    });
  });

  it('saves a SCENE asset with scene-specific fields', async () => {
    const onSave = vi.fn(async () => makeAsset('SCENE', '破庙'));

    render(<SceneStage project={{ ...project, current_stage: 'scene' }} assets={[]} stateJson={null} onSave={onSave} onAdvance={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('场景名称'), { target: { value: '破庙' } });
    fireEvent.change(screen.getByLabelText('氛围'), { target: { value: '雨夜、压迫、危险' } });
    fireEvent.change(screen.getByLabelText('材质'), { target: { value: '湿木、青苔、残砖' } });
    fireEvent.change(screen.getByLabelText('地标'), { target: { value: '断裂佛像' } });
    fireEvent.change(screen.getByLabelText('色温'), { target: { value: '冷蓝夹暗红' } });
    fireEvent.change(screen.getByLabelText('视觉锚点'), { target: { value: '香灰和雨水混成泥' } });
    fireEvent.change(screen.getByLabelText('AI 提示词'), { target: { value: 'ruined temple at night' } });
    fireEvent.click(screen.getByRole('button', { name: '保存场景资产' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        typeCode: 'SCENE',
        name: '破庙',
        meta: expect.objectContaining({ atmosphere: '雨夜、压迫、危险' }),
      }));
    });
  });

  it('saves a PROP asset with prop-specific fields', async () => {
    const onSave = vi.fn(async () => makeAsset('PROP', '铜铃'));

    render(<PropStage project={{ ...project, current_stage: 'prop' }} assets={[]} stateJson={null} onSave={onSave} onAdvance={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('道具名称'), { target: { value: '铜铃' } });
    fireEvent.change(screen.getByLabelText('版本/定位'), { target: { value: '线索道具' } });
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '锈蚀铜铃，内壁有刻字' } });
    fireEvent.change(screen.getByLabelText('视觉锚点'), { target: { value: '雨水顺着铃口滴落' } });
    fireEvent.change(screen.getByLabelText('AI 提示词'), { target: { value: 'ancient bronze bell prop' } });
    fireEvent.click(screen.getByRole('button', { name: '保存道具资产' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        typeCode: 'PROP',
        name: '铜铃',
        variant: '线索道具',
        meta: expect.objectContaining({ description: '锈蚀铜铃，内壁有刻字' }),
      }));
    });
  });
});

function makeAsset(typeCode: string, name: string) {
  return {
    id: `asset-${typeCode}`,
    project_id: 'studio-1',
    type_code: typeCode,
    name,
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
}
