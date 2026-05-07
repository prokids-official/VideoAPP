import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSkillCatalog } from './skill-loader';

let tempRoot: string | null = null;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe('loadSkillCatalog', () => {
  it('loads Codex-style skill folders with SKILL.md and infers category from the folder', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'videoapp-skills-'));
    const skillDir = join(tempRoot, 'script-writer', 'grim-fairy-3d');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: grim-fairy-3d',
        'description: 写黑色童话短片剧本',
        '---',
        '',
        '# Role',
        '你是顶级 AI 编剧。',
      ].join('\n'),
      'utf8',
    );

    const catalog = await loadSkillCatalog(tempRoot);

    expect(catalog).toEqual([
      {
        id: 'grim-fairy-3d',
        name_cn: 'grim-fairy-3d',
        category: 'script-writer',
        default_model: 'company-default',
        enabled: true,
        version: 1,
        description: '写黑色童话短片剧本',
        body: '# Role\n你是顶级 AI 编剧。',
      },
    ]);
  });

  it('loads Claude/Codex-style root skill folders without VideoAPP category metadata', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'videoapp-skills-'));
    const skillDir = join(tempRoot, 'image-prompt-polisher');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: image-prompt-polisher',
        'description: Improves prompt wording for image generation.',
        '---',
        '',
        '# Image Prompt Polisher',
        'Make the prompt concise and visual.',
      ].join('\n'),
      'utf8',
    );

    const catalog = await loadSkillCatalog(tempRoot);

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'image-prompt-polisher',
        name_cn: 'image-prompt-polisher',
        category: 'general',
        description: 'Improves prompt wording for image generation.',
        body: '# Image Prompt Polisher\nMake the prompt concise and visual.',
      }),
    ]);
  });

  it('parses CRLF frontmatter from imported skill files', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'videoapp-skills-'));
    const skillDir = join(tempRoot, 'script-writer', 'crlf-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: crlf-skill',
        'description: Handles Windows-authored skills.',
        '---',
        '',
        '# Role',
        'Write for a Windows-first studio.',
      ].join('\r\n'),
      'utf8',
    );

    const catalog = await loadSkillCatalog(tempRoot, { category: 'script-writer' });

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'crlf-skill',
        category: 'script-writer',
        description: 'Handles Windows-authored skills.',
        body: '# Role\nWrite for a Windows-first studio.',
      }),
    ]);
  });

  it('loads enabled markdown skills with frontmatter and body', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'videoapp-skills-'));
    await writeFile(
      join(tempRoot, 'grim-fairy-3d.md'),
      [
        '---',
        'id: grim-fairy-3d',
        'name_cn: 好莱坞级 3D 动画导演',
        'category: script-writer',
        'default_model: deepseek-v4-pro',
        'enabled: true',
        'version: 3',
        'description: 写黑色童话短片剧本',
        '---',
        '',
        '# Role',
        '你是顶级 AI 编剧。',
      ].join('\n'),
      'utf8',
    );

    const catalog = await loadSkillCatalog(tempRoot);

    expect(catalog).toEqual([
      {
        id: 'grim-fairy-3d',
        name_cn: '好莱坞级 3D 动画导演',
        category: 'script-writer',
        default_model: 'deepseek-v4-pro',
        enabled: true,
        version: 3,
        description: '写黑色童话短片剧本',
        body: '# Role\n你是顶级 AI 编剧。',
      },
    ]);
  });

  it('filters by category and omits disabled skills', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'videoapp-skills-'));
    await writeFile(
      join(tempRoot, 'writer.md'),
      ['---', 'id: writer', 'name_cn: 编剧', 'category: script-writer', 'enabled: true', '---', 'body'].join('\n'),
      'utf8',
    );
    await writeFile(
      join(tempRoot, 'disabled.md'),
      ['---', 'id: disabled', 'name_cn: 关闭', 'category: script-writer', 'enabled: false', '---', 'body'].join('\n'),
      'utf8',
    );
    await writeFile(
      join(tempRoot, 'image.md'),
      ['---', 'id: image', 'name_cn: 生图', 'category: prompt-image', 'enabled: true', '---', 'body'].join('\n'),
      'utf8',
    );

    const catalog = await loadSkillCatalog(tempRoot, { category: 'script-writer' });

    expect(catalog.map((skill) => skill.id)).toEqual(['writer']);
  });
});
