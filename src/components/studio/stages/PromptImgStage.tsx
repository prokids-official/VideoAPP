import type { StudioAsset, StudioProject } from '../../../../shared/types';
import { PromptStageBase, type SavePromptInput } from './PromptStageBase';

export type { SavePromptInput };

export function PromptImgStage({
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
        stageLabel: '图片提示词',
        shortLabel: '图像 Prompt',
        aiButton: 'AI 生成图片提示词',
        savePrefix: '图片提示词',
        nextLabel: '下一阶段：视频提示词',
        typeCode: 'PROMPT_IMG',
      }}
      onSave={onSave}
      onAdvance={onAdvance}
    />
  );
}
