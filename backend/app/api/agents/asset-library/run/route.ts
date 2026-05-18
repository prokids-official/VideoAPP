export const runtime = 'nodejs';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { callOpenAICompatibleChat, missingProviderConfig } from '@/lib/ai-chat';
import { resolveChatProviderConfig } from '@/lib/ai-provider';
import { requireUser } from '@/lib/auth-guard';
import { env } from '@/lib/env';
import { loadSkillCatalog } from '@/lib/skill-loader';
import { logUsage } from '@/lib/usage';

const storyboardUnitSchema = z.object({
  number: z.number().int().min(1),
  summary: z.string().trim().min(1).max(2000),
  duration_s: z.number().int().min(1).max(600),
});

const inputSchema = z.object({
  project_name: z.string().trim().min(1),
  style_hint: z.string().trim().max(2000).default(''),
  inspiration_text: z.string().trim().max(8000).default(''),
  script_markdown: z.string().trim().max(100000).default(''),
  storyboard_units: z.array(storyboardUnitSchema).max(300).default([]),
}).refine((input) => input.inspiration_text || input.script_markdown || input.storyboard_units.length > 0, {
  message: 'Asset library input needs inspiration, script, or storyboard units',
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

const characterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  variant: z.string().trim().max(120).nullable().optional(),
  appearance: z.string().trim().max(2000).optional().default(''),
  clothing: z.string().trim().max(2000).optional().default(''),
  personality: z.string().trim().max(2000).optional().default(''),
  palette: z.string().trim().max(1000).optional().default(''),
  visual_anchor: z.string().trim().max(2000).optional().default(''),
  ai_prompt: z.string().trim().max(5000).optional().default(''),
});

const sceneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  variant: z.string().trim().max(120).nullable().optional(),
  atmosphere: z.string().trim().max(2000).optional().default(''),
  materials: z.string().trim().max(2000).optional().default(''),
  landmarks: z.string().trim().max(2000).optional().default(''),
  color_temperature: z.string().trim().max(1000).optional().default(''),
  visual_anchor: z.string().trim().max(2000).optional().default(''),
  ai_prompt: z.string().trim().max(5000).optional().default(''),
});

const propSchema = z.object({
  name: z.string().trim().min(1).max(120),
  variant: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).optional().default(''),
  visual_anchor: z.string().trim().max(2000).optional().default(''),
  ai_prompt: z.string().trim().max(5000).optional().default(''),
});

const assetLibraryResponseSchema = z.object({
  characters: z.array(characterSchema).max(100).default([]),
  scenes: z.array(sceneSchema).max(100).default([]),
  props: z.array(propSchema).max(100).default([]),
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

  const skills = await loadSkillCatalog(undefined, { category: 'asset-library' });
  const skill = skills.find((item) => item.id === parsed.data.skill_id);
  if (!skill) {
    return err('PAYLOAD_MALFORMED', `Unknown asset-library skill: ${parsed.data.skill_id}`, undefined, 400);
  }

  const messages = [
    {
      role: 'system' as const,
      content: skill.body,
    },
    {
      role: 'user' as const,
      content: buildAssetLibraryUserPrompt(parsed.data.input),
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
    const assets = parseAssetLibraryOutputs(completion.content);

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
        assets,
        usage: completion.usage,
      },
    });
  } catch (cause) {
    return err('INTERNAL_ERROR', cause instanceof Error ? cause.message : 'AI provider request failed', undefined, 502);
  }
}

function parseAssetLibraryOutputs(content: string) {
  const parsedJson = parseJsonContent(content);
  const parsed = assetLibraryResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('Asset library agent returned invalid JSON');
  }

  return parsed.data;
}

function parseJsonContent(content: string): unknown {
  const trimmed = stripCodeFence(content.trim());
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Asset library agent returned invalid JSON');
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

function buildAssetLibraryUserPrompt(input: z.infer<typeof inputSchema>): string {
  return [
    'Build a reusable VideoAPP asset library from the following production context.',
    'Output JSON only. Do not include Markdown or explanation.',
    '',
    `Project name: ${input.project_name}`,
    `Style hint: ${input.style_hint || 'not provided'}`,
    '',
    'Inspiration:',
    input.inspiration_text || 'not provided',
    '',
    'Script:',
    input.script_markdown || 'not provided',
    '',
    'Storyboard units:',
    input.storyboard_units.length > 0 ? JSON.stringify(input.storyboard_units) : 'not provided',
    '',
    'Required JSON shape:',
    '{"characters":[{"name":"...","variant":"...","appearance":"...","clothing":"...","personality":"...","palette":"...","visual_anchor":"...","ai_prompt":"..."}],"scenes":[{"name":"...","variant":"...","atmosphere":"...","materials":"...","landmarks":"...","color_temperature":"...","visual_anchor":"...","ai_prompt":"..."}],"props":[{"name":"...","variant":"...","description":"...","visual_anchor":"...","ai_prompt":"..."}]}',
  ].join('\n');
}
