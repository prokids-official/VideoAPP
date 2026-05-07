export const runtime = 'nodejs';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { callOpenAICompatibleChat, missingProviderConfig } from '@/lib/ai-chat';
import { resolveChatProviderConfig } from '@/lib/ai-provider';
import { requireUser } from '@/lib/auth-guard';
import { env } from '@/lib/env';
import { loadSkillCatalog } from '@/lib/skill-loader';
import { logUsage } from '@/lib/usage';

const inputSchema = z.object({
  project_name: z.string().trim().min(1),
  duration_sec: z.number().int().min(15).max(7200),
  style_hint: z.string().trim().max(2000).default(''),
  script_markdown: z.string().trim().min(1).max(100000),
});

const bodySchema = z.object({
  skill_id: z.string().trim().min(1),
  provider_config: z.object({
    mode: z.enum(['official-deepseek', 'custom-openai-compatible']),
    model: z.string().trim().min(1),
    base_url: z.string().trim().optional(),
    api_key: z.string().trim().optional(),
  }).optional(),
  input: inputSchema,
});

const storyboardUnitSchema = z.object({
  number: z.number().int().min(1),
  summary: z.string().trim().min(1).max(2000),
  duration_s: z.number().int().min(1).max(600),
});

const storyboardResponseSchema = z.union([
  z.object({ units: z.array(storyboardUnitSchema).min(1).max(300) }),
  z.array(storyboardUnitSchema).min(1).max(300),
]);

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

  const skills = await loadSkillCatalog(undefined, { category: 'storyboard' });
  const skill = skills.find((item) => item.id === parsed.data.skill_id);
  if (!skill) {
    return err('PAYLOAD_MALFORMED', `Unknown storyboard skill: ${parsed.data.skill_id}`, undefined, 400);
  }

  const messages = [
    {
      role: 'system' as const,
      content: skill.body,
    },
    {
      role: 'user' as const,
      content: buildStoryboardUserPrompt(parsed.data.input),
    },
  ];

  const providerConfig = resolveChatProviderConfig(parsed.data.provider_config, {
    provider: env.AI_CHAT_PROVIDER,
    baseUrl: env.AI_CHAT_BASE_URL,
    apiKey: env.AI_CHAT_API_KEY ?? '',
    model: env.AI_CHAT_MODEL || skill.default_model,
  });
  const missing = missingProviderConfig(providerConfig);
  if (missing) {
    return err('INTERNAL_ERROR', missing, undefined, 500);
  }

  try {
    const completion = await callOpenAICompatibleChat({
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      messages,
    });
    const units = parseStoryboardUnits(completion.content);

    await logUsage({
      userId: auth.user_id,
      provider: usageProvider(providerConfig.provider),
      model: providerConfig.model,
      action: 'chat',
      tokensInput: completion.usage.promptTokens ?? undefined,
      tokensOutput: completion.usage.completionTokens ?? undefined,
      requestId: completion.id ?? undefined,
    });

    return ok({
      run: {
        status: 'completed',
        provider: providerConfig.provider,
        model: providerConfig.model,
        skill: {
          id: skill.id,
          name_cn: skill.name_cn,
          category: skill.category,
          version: skill.version,
        },
        messages,
        units,
        usage: completion.usage,
      },
    });
  } catch (cause) {
    return err('INTERNAL_ERROR', cause instanceof Error ? cause.message : 'AI provider request failed', undefined, 502);
  }
}

function parseStoryboardUnits(content: string) {
  const parsedJson = parseJsonContent(content);
  const parsed = storyboardResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('Storyboard agent returned invalid JSON');
  }

  return Array.isArray(parsed.data) ? parsed.data : parsed.data.units;
}

function parseJsonContent(content: string): unknown {
  const trimmed = stripCodeFence(content.trim());
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Storyboard agent returned invalid JSON');
  }
}

function stripCodeFence(value: string) {
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? value;
}

function usageProvider(value: string) {
  switch (value) {
    case 'openai':
    case 'openai-compatible':
    case 'deepseek':
    case 'anthropic':
    case 'nanobanana':
    case 'gptimage':
      return value;
    case 'custom-openai-compatible':
      return 'openai-compatible';
    default:
      return 'openai-compatible';
  }
}

function buildStoryboardUserPrompt(input: z.infer<typeof inputSchema>): string {
  return [
    '请把以下剧本拆成可用于后续图片提示词和视频提示词生成的分镜单元。',
    '',
    `项目名称：${input.project_name}`,
    `目标总时长：${input.duration_sec} 秒`,
    `风格倾向：${input.style_hint || '未填写'}`,
    '',
    '剧本正文：',
    input.script_markdown,
    '',
    '输出要求：',
    '- 只输出 JSON，不要 Markdown，不要解释。',
    '- 每个分镜是一段连续动作，摘要要包含画面、动作、节奏和必要角色/场景信息。',
    '- duration_s 使用整数秒，所有分镜时长之和尽量接近目标总时长。',
    '- JSON 格式必须为：{"units":[{"number":1,"summary":"...","duration_s":8}]}',
  ].join('\n');
}
