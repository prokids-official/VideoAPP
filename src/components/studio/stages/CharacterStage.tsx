import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { AssetEntityStage, type SaveEntityInput } from './AssetEntityStage';

const CHARACTER_FIELDS = [
  { key: 'appearance', label: '外貌', placeholder: '年龄、脸型、眼神、发型、体态...' },
  { key: 'clothing', label: '服装', placeholder: '服饰结构、材质、时代感、破损/干净程度...' },
  { key: 'personality', label: '性格', placeholder: '内在冲突、行为方式、情绪基调...' },
  { key: 'palette', label: '配色', placeholder: '主色、辅色、材质反光...' },
  { key: 'visual_anchor', label: '视觉锚点', placeholder: '让角色一眼被记住的视觉特征...' },
  { key: 'ai_prompt', label: 'AI 图片 prompt', placeholder: '可直接复制到生图工具的角色提示词...' },
];

export function CharacterStage({
  project,
  assets,
  stateJson,
  onSave,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  onSave: (input: SaveEntityInput) => Promise<StudioAsset>;
  onAdvance: () => void | Promise<void>;
}) {
  return (
    <AssetEntityStage
      project={project}
      assets={assets}
      stateJson={stateJson}
      config={{
        typeCode: 'CHAR',
        stageLabel: '角色',
        nameLabel: '角色名称',
        saveLabel: '保存角色资产',
        nextLabel: '下一阶段：场景',
        aiGenerateLabel: 'AI 生成角色',
        aiExtractLabel: '从剧本提取角色',
        fields: CHARACTER_FIELDS,
      }}
      onSave={onSave}
      onAdvance={onAdvance}
    />
  );
}
