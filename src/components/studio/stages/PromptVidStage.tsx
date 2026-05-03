import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { PromptStageBase, type SavePromptInput } from './PromptStageBase';

export function PromptVidStage({
  project,
  storyboardAssets,
  assets,
  stateJson,
  onSave,
  onAdvance,
}: {
  project: StudioProject;
  storyboardAssets: StudioAsset[];
  assets: StudioAsset[];
  stateJson: string | null | undefined;
  onSave: (input: SavePromptInput) => Promise<StudioAsset>;
  onAdvance: () => void | Promise<void>;
}) {
  return (
    <PromptStageBase
      project={project}
      storyboardAssets={storyboardAssets}
      assets={assets}
      stateJson={stateJson}
      copy={{
        stageLabel: '视频提示词',
        shortLabel: 'Video Prompt',
        aiButton: 'AI 生成视频提示词',
        savePrefix: '视频提示词',
        nextLabel: '下一阶段：画布',
        typeCode: 'PROMPT_VID',
      }}
      onSave={onSave}
      onAdvance={onAdvance}
    />
  );
}
