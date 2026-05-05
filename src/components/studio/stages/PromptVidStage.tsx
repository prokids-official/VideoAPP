import type { StudioAsset, StudioProject } from '../../../../shared/types';
import type { PreflightLocateTarget } from './ExportStage';
import { PromptStageBase, type AttachGeneratedInput, type SavePromptInput } from './PromptStageBase';

export function PromptVidStage({
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
        stageLabel: '视频提示词',
        shortLabel: 'Video Prompt',
        aiButton: 'AI 生成视频提示词',
        savePrefix: '视频提示词',
        nextLabel: '下一阶段：画布',
        typeCode: 'PROMPT_VID',
        outputTypeCode: 'SHOT_VID',
        outputKind: 'video',
      }}
      onSave={onSave}
      onAttachGenerated={onAttachGenerated}
      onDeleteGenerated={onDeleteGenerated}
      onAdvance={onAdvance}
    />
  );
}
