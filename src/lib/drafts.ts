import type { CreateLocalDraftInput, LocalDraft } from '../../shared/types';

export function createDraft(input: CreateLocalDraftInput): Promise<LocalDraft> {
  return window.fableglitch.db.draftCreate(input);
}

export function listDrafts(episodeId: string): Promise<LocalDraft[]> {
  return window.fableglitch.db.draftsList(episodeId);
}

export function deleteDraft(id: string): Promise<void> {
  return window.fableglitch.db.draftDelete(id);
}
