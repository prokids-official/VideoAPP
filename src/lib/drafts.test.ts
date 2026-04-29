import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateLocalDraftInput } from '../../shared/types';
import { createDraft, deleteDraft, listDrafts } from './drafts';

const bridge = {
  db: {
    draftCreate: vi.fn(),
    draftsList: vi.fn(),
    draftDelete: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'fableglitch', {
    value: bridge as unknown as Window['fableglitch'],
    configurable: true,
  });
});

describe('draft renderer wrapper', () => {
  it('forwards draft CRUD calls to Electron bridge', async () => {
    const input: CreateLocalDraftInput = {
      id: 'draft-1',
      episode_id: 'ep-1',
      type_code: 'SCRIPT',
      name: '侏儒怪',
      variant: null,
      number: null,
      version: 1,
      stage: 'ROUGH',
      language: 'ZH',
      original_filename: 'script.md',
      final_filename: '童话剧_侏儒怪_SCRIPT.md',
      storage_backend: 'github',
      storage_ref: '童话剧_NA_侏儒怪/02_Data/Script/童话剧_侏儒怪_SCRIPT.md',
      local_file_path: 'D:/drafts/draft-1.md',
      size_bytes: 12,
      mime_type: 'text/markdown',
      source: 'pasted',
    };
    bridge.db.draftCreate.mockResolvedValueOnce({ ...input, created_at: '2026-04-29T00:00:00Z' });
    bridge.db.draftsList.mockResolvedValueOnce([{ ...input, created_at: '2026-04-29T00:00:00Z' }]);

    await expect(createDraft(input)).resolves.toMatchObject({ id: 'draft-1' });
    await expect(listDrafts('ep-1')).resolves.toHaveLength(1);
    await deleteDraft('draft-1');

    expect(bridge.db.draftCreate).toHaveBeenCalledWith(input);
    expect(bridge.db.draftsList).toHaveBeenCalledWith('ep-1');
    expect(bridge.db.draftDelete).toHaveBeenCalledWith('draft-1');
  });
});
