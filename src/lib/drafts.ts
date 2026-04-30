import type { CreateLocalDraftInput, LocalDraft } from '../../shared/types';

export function saveDraftFile(payload: {
  localDraftId: string;
  extension: string;
  content: string | ArrayBuffer | Uint8Array | number[];
}): Promise<{ path: string; size_bytes: number }> {
  return window.fableglitch.fs.saveDraftFile(payload);
}

export function createDraft(input: CreateLocalDraftInput): Promise<LocalDraft> {
  return window.fableglitch.db.draftCreate(input);
}

export function listDrafts(episodeId: string): Promise<LocalDraft[]> {
  return window.fableglitch.db.draftsList(episodeId);
}

export function deleteDraft(id: string): Promise<void> {
  return window.fableglitch.db.draftDelete(id);
}
