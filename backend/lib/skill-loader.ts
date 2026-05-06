import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

export interface SkillDefinition {
  id: string;
  name_cn: string;
  category: string;
  default_model: string;
  enabled: boolean;
  version: number;
  description: string;
  body: string;
}

export interface LoadSkillOptions {
  category?: string | null;
}

export async function loadSkillCatalog(
  root = join(process.cwd(), 'skills'),
  options: LoadSkillOptions = {},
): Promise<SkillDefinition[]> {
  const files = await listMarkdownFiles(root);
  const skills = await Promise.all(files.map((file) => readSkillFile(root, file)));
  return skills
    .filter((skill) => skill.enabled)
    .filter((skill) => !options.category || skill.category === options.category)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name_cn.localeCompare(b.name_cn));
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  }));

  return nested.flat();
}

async function readSkillFile(root: string, filePath: string): Promise<SkillDefinition> {
  const raw = await readFile(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const inferred = inferSkillPath(root, filePath);
  const id = readString(frontmatter.id) ?? readString(frontmatter.name) ?? inferred.id;
  const category = readString(frontmatter.category) ?? inferred.category;
  if (!id) {
    throw new Error(`Skill ${filePath} is missing id or name`);
  }
  if (!category) {
    throw new Error(`Skill ${filePath} is missing category`);
  }
  return {
    id,
    name_cn: readString(frontmatter.name_cn) ?? readString(frontmatter.display_name) ?? id,
    category,
    default_model: readString(frontmatter.default_model) ?? 'company-default',
    enabled: readBoolean(frontmatter.enabled) ?? true,
    version: readNumber(frontmatter.version) ?? 1,
    description: readString(frontmatter.description) ?? '',
    body: body.trim(),
  };
}

function inferSkillPath(root: string, filePath: string): { id: string | null; category: string | null } {
  const parts = relative(root, filePath).split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) {
    return { id: null, category: null };
  }

  if (basename(filePath).toLowerCase() === 'skill.md') {
    return {
      id: parts.length >= 2 ? parts[parts.length - 2] : null,
      category: parts.length >= 3 ? parts[parts.length - 3] : null,
    };
  }

  return {
    id: basename(filePath).replace(/\.md$/i, ''),
    category: parts.length >= 2 ? basename(dirname(filePath)) : null,
  };
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  if (!raw.startsWith('---\n')) {
    return { frontmatter: {}, body: raw };
  }

  const end = raw.indexOf('\n---', 4);
  if (end === -1) {
    return { frontmatter: {}, body: raw };
  }

  const lines = raw.slice(4, end).split(/\r?\n/);
  const frontmatter: Record<string, string> = {};
  for (const line of lines) {
    const delimiter = line.indexOf(':');
    if (delimiter === -1) continue;
    const key = line.slice(0, delimiter).trim();
    const value = line.slice(delimiter + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body: raw.slice(end + 4) };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
