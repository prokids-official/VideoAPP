const STORAGE_KEY = 'active_skill_ids';

export async function loadActiveSkillIds(): Promise<string[]> {
  try {
    const raw = await window.fableglitch.db.sessionGet(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveActiveSkillIds(ids: string[]): Promise<void> {
  await window.fableglitch.db.sessionSet(STORAGE_KEY, JSON.stringify(normalizeIds(ids)));
}

export async function toggleActiveSkillId(id: string): Promise<string[]> {
  const current = await loadActiveSkillIds();
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
  await saveActiveSkillIds(next);
  return next;
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())));
}
