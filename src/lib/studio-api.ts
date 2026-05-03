import type {
  StudioAsset,
  StudioProject,
  StudioProjectBundle,
  StudioSizeKind,
  StudioStage,
} from '../../shared/types';

/**
 * Renderer-side wrapper around `window.fableglitch.studio.*` IPC.
 *
 * Owns no state; just exposes typed helpers. The Electron main process owns
 * the local SQLite (electron/local-db.mjs) and the file storage; renderer
 * speaks only this surface (per the locked IPC contract in P1.2 spec §8.2).
 *
 * NEVER bypass this and call window.fableglitch.studio directly from a
 * component — that defeats centralization and makes future contract changes
 * harder to audit. If you need a missing helper, add it here first.
 */
const bridge = () => {
  if (typeof window === 'undefined' || !window.fableglitch?.studio) {
    throw new Error('Studio bridge not available — are we in Electron?');
  }
  return window.fableglitch.studio;
};

export interface CreateProjectInput {
  name: string;
  size_kind: StudioSizeKind;
  inspiration_text?: string | null;
}

export const studioApi = {
  // ───── projects ─────
  createProject(input: CreateProjectInput): Promise<StudioProject> {
    return bridge().projectCreate(input);
  },
  listProjects(): Promise<StudioProject[]> {
    return bridge().projectList();
  },
  getProject(id: string): Promise<StudioProjectBundle | null> {
    return bridge().projectGet(id);
  },
  updateProject(
    id: string,
    patch: Partial<Pick<StudioProject, 'name' | 'size_kind' | 'inspiration_text' | 'current_stage'>>,
  ): Promise<StudioProject> {
    return bridge().projectUpdate(id, patch);
  },
  deleteProject(id: string): Promise<void> {
    return bridge().projectDelete(id);
  },

  // ───── assets ─────
  saveAsset(input: Partial<StudioAsset> & Pick<StudioAsset, 'project_id' | 'type_code' | 'name'>): Promise<StudioAsset> {
    return bridge().assetSave(input);
  },
  listAssets(projectId: string, typeCode?: string | null): Promise<StudioAsset[]> {
    return bridge().assetList(projectId, typeCode ?? null);
  },
  deleteAsset(id: string): Promise<void> {
    return bridge().assetDelete(id);
  },
  writeAssetFile(id: string, content: string | ArrayBuffer | Uint8Array): Promise<{ path: string; size_bytes: number }> {
    return bridge().assetWriteFile(id, content);
  },
  readAssetFile(id: string): Promise<Uint8Array> {
    return bridge().assetReadFile(id);
  },

  // ───── stages ─────
  saveStage(projectId: string, stage: StudioStage, stateJson: string): Promise<void> {
    return bridge().stageSave(projectId, stage, stateJson);
  },
  getStage(projectId: string, stage: StudioStage): Promise<string | null> {
    return bridge().stageGet(projectId, stage);
  },
};

// ───── stage helpers ─────

/** Display labels keyed by stage id, in flow order. */
export const STAGE_LABELS: Record<StudioStage, string> = {
  inspiration: '灵感',
  script: '剧本',
  character: '角色',
  scene: '场景',
  prop: '道具',
  storyboard: '分镜',
  'prompt-img': '图片提示词',
  'prompt-vid': '视频提示词',
  canvas: '画布',
  export: '入库',
};

/** Flow order, used by progress bar + "next stage" button. */
export const STAGE_ORDER: StudioStage[] = [
  'inspiration',
  'script',
  'character',
  'scene',
  'prop',
  'storyboard',
  'prompt-img',
  'prompt-vid',
  'canvas',
  'export',
];

export function nextStage(current: StudioStage): StudioStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

export function previousStage(current: StudioStage): StudioStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return STAGE_ORDER[idx - 1];
}

/** Progress percentage based on completed stages out of total. */
export function stageProgress(completedCount: number): number {
  return Math.round((completedCount / STAGE_ORDER.length) * 100);
}
