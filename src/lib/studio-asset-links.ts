import type { StudioAsset } from '../../shared/types';

export interface StudioAssetLinkSummary {
  storyboardAssetId: string | null;
  storyboardNumber: number | null;
  sourcePromptAssetId: string | null;
  sourcePromptName: string | null;
  generatedAssetIds: string[];
}

export function buildStudioAssetLinkIndex(assets: StudioAsset[]): Map<string, StudioAssetLinkSummary> {
  const metaByAsset = new Map<string, Record<string, unknown>>();
  const promptById = new Map<string, StudioAsset>();
  const generatedByPrompt = new Map<string, string[]>();

  for (const asset of assets) {
    const meta = parseMeta(asset.meta_json);
    metaByAsset.set(asset.id, meta);
    if (asset.type_code === 'PROMPT_IMG' || asset.type_code === 'PROMPT_VID') {
      promptById.set(asset.id, asset);
    }

    const sourcePromptId = readString(meta.source_prompt_asset_id)
      ?? readString(meta.generated_from_prompt_asset_id);
    if (sourcePromptId) {
      const current = generatedByPrompt.get(sourcePromptId) ?? [];
      current.push(asset.id);
      generatedByPrompt.set(sourcePromptId, current);
    }
  }

  const index = new Map<string, StudioAssetLinkSummary>();
  for (const asset of assets) {
    const meta = metaByAsset.get(asset.id) ?? {};
    const sourcePromptAssetId = readString(meta.source_prompt_asset_id)
      ?? readString(meta.generated_from_prompt_asset_id);
    index.set(asset.id, {
      storyboardAssetId: readString(meta.storyboard_asset_id),
      storyboardNumber: readPositiveNumber(meta.storyboard_number),
      sourcePromptAssetId,
      sourcePromptName: sourcePromptAssetId ? promptById.get(sourcePromptAssetId)?.name ?? null : null,
      generatedAssetIds: generatedByPrompt.get(asset.id) ?? [],
    });
  }

  return index;
}

export function studioAssetLinkLabels(asset: StudioAsset, summary: StudioAssetLinkSummary | undefined): string[] {
  if (!summary) return [];
  const labels: string[] = [];

  if (summary.storyboardNumber != null) {
    labels.push(`Storyboard ${pad(summary.storyboardNumber)}`);
  }

  if (asset.type_code === 'PROMPT_IMG' || asset.type_code === 'PROMPT_VID') {
    labels.push(`${summary.generatedAssetIds.length} generated output${summary.generatedAssetIds.length === 1 ? '' : 's'}`);
  }

  if (summary.sourcePromptAssetId) {
    labels.push(`From prompt: ${summary.sourcePromptName ?? summary.sourcePromptAssetId}`);
  }

  return labels;
}

function parseMeta(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
