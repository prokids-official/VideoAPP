import type { StudioAsset, StudioProject } from '../../../../shared/types';
import type { PreflightLocateTarget } from './ExportStage';
import { PromptStageBase, type AttachGeneratedInput, type SavePromptInput } from './PromptStageBase';

export type { AttachGeneratedInput, SavePromptInput };

export function PromptImgStage({
  project,
  storyboardAssets,
  assets,
  generatedAssets,
  stateJson,
  locateTarget,
  onSave,
  onAttachGenerated,
  onDeleteGenerated,
  onAdvance,
}: {
  project: StudioProject;
  storyboardAssets: StudioAsset[];
  assets: StudioAsset[];
  generatedAssets?: StudioAsset[];
  stateJson: string | null | undefined;
  locateTarget?: PreflightLocateTarget | null;
  onSave: (input: SavePromptInput) => Promise<StudioAsset>;
  onAttachGenerated?: (input: AttachGeneratedInput) => Promise<StudioAsset>;
  onDeleteGenerated?: (asset: StudioAsset) => Promise<void>;
  onAdvance: () => void | Promise<void>;
}) {
  return (
    <PromptStageBase
      project={project}
      storyboardAssets={storyboardAssets}
      assets={assets}
      generatedAssets={generatedAssets}
      stateJson={stateJson}
      locateTarget={locateTarget}
      copy={{
        stageLabel: '图片提示词',
        shortLabel: '图像 Prompt',
        aiButton: 'AI 生成图片提示词',
        savePrefix: '图片提示词',
        nextLabel: '下一阶段：视频提示词',
        typeCode: 'PROMPT_IMG',
        outputTypeCode: 'SHOT_IMG',
        outputKind: 'image',
      }}
      onSave={onSave}
      onAttachGenerated={onAttachGenerated}
      onDeleteGenerated={onDeleteGenerated}
      onAdvance={onAdvance}
    />
  );
}
