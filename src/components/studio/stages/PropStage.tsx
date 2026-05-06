import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { AssetEntityStage, type ImportEntityImageInput, type SaveEntityInput } from './AssetEntityStage';

const PROP_FIELDS = [
  { key: 'description', label: '描述', placeholder: '造型、材质、年代感、磨损情况...' },
  { key: 'visual_anchor', label: '视觉锚点', placeholder: '这个道具最容易被观众记住的特征...' },
  { key: 'ai_prompt', label: 'AI 提示词', placeholder: '道具生图/概念图可复用提示词...' },
];

export function PropStage({
  project,
  assets,
  stateJson,
  onSave,
  onImportImage,
  onReadAssetFile,
  onAdvance,
}: {
  project: StudioProject;
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  onSave: (input: SaveEntityInput) => Promise<StudioAsset>;
  onImportImage?: (input: ImportEntityImageInput) => Promise<StudioAsset>;
  onReadAssetFile?: (asset: StudioAsset) => Promise<Uint8Array>;
  onAdvance: () => void | Promise<void>;
}) {
  return (
    <AssetEntityStage
      project={project}
      assets={assets}
      stateJson={stateJson}
      config={{
        typeCode: 'PROP',
        stageLabel: '道具',
        nameLabel: '道具名称',
        saveLabel: '保存道具资产',
        nextLabel: '下一阶段：分镜',
        aiGenerateLabel: 'AI 生成道具',
        aiExtractLabel: '从剧本提取道具',
        fields: PROP_FIELDS,
      }}
      onSave={onSave}
      onImportImage={onImportImage}
      onReadAssetFile={onReadAssetFile}
      onAdvance={onAdvance}
    />
  );
}
