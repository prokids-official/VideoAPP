import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { AssetEntityStage, type ImportEntityImageInput, type SaveEntityInput } from './AssetEntityStage';

const SCENE_FIELDS = [
  { key: 'atmosphere', label: '氛围', placeholder: '情绪、危险程度、空间压迫感...' },
  { key: 'materials', label: '材质', placeholder: '墙面、地面、植被、水汽、金属/木头...' },
  { key: 'landmark', label: '地标', placeholder: '画面中一眼识别该场景的核心物件...' },
  { key: 'color_temperature', label: '色温', placeholder: '冷暖关系、主光色、反差色...' },
  { key: 'visual_anchor', label: '视觉锚点', placeholder: '可复用的构图/光影/环境特征...' },
  { key: 'ai_prompt', label: 'AI 提示词', placeholder: '场景生图/环境图可复用提示词...' },
];

export function SceneStage({
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
        typeCode: 'SCENE',
        stageLabel: '场景',
        nameLabel: '场景名称',
        saveLabel: '保存场景资产',
        nextLabel: '下一阶段：道具',
        aiGenerateLabel: 'AI 生成场景',
        aiExtractLabel: '从剧本提取场景',
        fields: SCENE_FIELDS,
      }}
      onSave={onSave}
      onImportImage={onImportImage}
      onReadAssetFile={onReadAssetFile}
      onAdvance={onAdvance}
    />
  );
}
