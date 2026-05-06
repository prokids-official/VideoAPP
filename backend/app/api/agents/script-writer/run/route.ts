export const runtime = 'nodejs';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { loadSkillCatalog } from '@/lib/skill-loader';

const inputSchema = z.object({
  project_name: z.string().trim().min(1),
  mode: z.enum(['from-scratch', 'optimize-existing', 'import-existing']),
  duration_sec: z.number().int().min(15).max(7200),
  style_hint: z.string().trim().max(2000).default(''),
  inspiration_text: z.string().trim().max(8000).default(''),
  existing_script: z.string().trim().max(50000).default(''),
});

const bodySchema = z.object({
  skill_id: z.string().trim().min(1),
  dry_run: z.literal(true).default(true),
  input: inputSchema,
});

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('PAYLOAD_MALFORMED', 'Body must be JSON', undefined, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const skills = await loadSkillCatalog(undefined, { category: 'script-writer' });
  const skill = skills.find((item) => item.id === parsed.data.skill_id);
  if (!skill) {
    return err('PAYLOAD_MALFORMED', `Unknown script-writer skill: ${parsed.data.skill_id}`, undefined, 400);
  }

  return ok({
    run: {
      status: 'dry-run',
      provider: 'dry-run',
      model: skill.default_model,
      skill: {
        id: skill.id,
        name_cn: skill.name_cn,
        category: skill.category,
        version: skill.version,
      },
      messages: [
        {
          role: 'system',
          content: skill.body,
        },
        {
          role: 'user',
          content: buildScriptWriterUserPrompt(parsed.data.input),
        },
      ],
    },
  });
}

function buildScriptWriterUserPrompt(input: z.infer<typeof inputSchema>): string {
  return [
    '请基于以下创作舱上下文生成或优化剧本草案。',
    '',
    `项目名称：${input.project_name}`,
    `创作模式：${input.mode}`,
    `目标时长：${input.duration_sec} 秒`,
    `风格倾向：${input.style_hint || '未填写'}`,
    '',
    '灵感梗概：',
    input.inspiration_text || '未填写',
    '',
    '已有剧本：',
    input.existing_script || '无',
    '',
    '输出要求：',
    '- 给出可进入个人创作舱下一阶段的 Markdown 剧本。',
    '- 明确角色、场景、关键动作和镜头节奏。',
    '- 内容要方便后续拆分镜头、生成图片 prompt 和视频 prompt。',
  ].join('\n');
}
