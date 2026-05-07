import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillCreatePayload } from '@shared/types';
import type { SkillDefinition } from './skill-loader';

const defaultSkillRoot = join(/*turbopackIgnore: true*/ process.cwd(), 'skills');

export async function createLocalSkill(
  root = defaultSkillRoot,
  input: SkillCreatePayload,
): Promise<SkillDefinition> {
  const id = slugify(input.id || input.name_cn);
  const category = slugify(input.category) || 'general';
  const defaultModel = input.default_model?.trim() || 'deepseek-v4-flash';
  const skillDir = join(root, category, id);
  const body = normalizeBody(input.body);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${yamlString(id)}`,
      `name_cn: ${yamlString(input.name_cn.trim())}`,
      `category: ${yamlString(category)}`,
      `default_model: ${yamlString(defaultModel)}`,
      'enabled: true',
      'version: 1',
      `description: ${yamlString(input.description.trim())}`,
      '---',
      '',
      body,
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    id,
    name_cn: input.name_cn.trim(),
    category,
    default_model: defaultModel,
    enabled: true,
    version: 1,
    description: input.description.trim(),
    body,
  };
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'custom-skill';
}

function normalizeBody(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\n---\s*$/g, '').trim();
}

function yamlString(value: string) {
  return JSON.stringify(value);
}
