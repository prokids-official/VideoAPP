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
  asset_id: z.string().trim().min(1),
  number: z.number().int().min(1),
  summary: z.string().trim().min(1).max(2000),
  duration_s: z.number().int().min(1).max(600),
  image_prompt: z.string().trim().max(5000).default(''),
});

const inputSchema = z.object({
  project_name: z.string().trim().min(1),
  style_hint: z.string().trim().max(2000).default(''),
  storyboard_units: z.array(storyboardUnitSchema).min(1).max(300),
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

const promptOutputSchema = z.object({
  storyboard_asset_id: z.string().trim().min(1),
  storyboard_number: z.number().int().min(1),
  prompt_text: z.string().trim().min(1).max(5000),
});

const promptResponseSchema = z.union([
  z.object({ prompts: z.array(promptOutputSchema).min(1).max(300) }),
  z.array(promptOutputSchema).min(1).max(300),
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

  const skills = await loadSkillCatalog(undefined, { category: 'prompt-vid' });
  const skill = skills.find((item) => item.id === parsed.data.skill_id);
  if (!skill) {
    return err('PAYLOAD_MALFORMED', `Unknown prompt-vid skill: ${parsed.data.skill_id}`, undefined, 400);
  }

  const messages = [
    {
      role: 'system' as const,
      content: skill.body,
    },
    {
      role: 'user' as const,
      content: buildPromptVideoUserPrompt(parsed.data.input),
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
    const prompts = parsePromptOutputs(completion.content);

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
        prompts,
        usage: completion.usage,
      },
    });
  } catch (cause) {
    return err('INTERNAL_ERROR', cause instanceof Error ? cause.message : 'AI provider request failed', undefined, 502);
  }
}

function parsePromptOutputs(content: string) {
  const parsedJson = parseJsonContent(content);
  const parsed = promptResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('Prompt video agent returned invalid JSON');
  }

  return Array.isArray(parsed.data) ? parsed.data : parsed.data.prompts;
}

function parseJsonContent(content: string): unknown {
  const trimmed = stripCodeFence(content.trim());
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Prompt video agent returned invalid JSON');
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

function buildPromptVideoUserPrompt(input: z.infer<typeof inputSchema>): string {
  return [
    'Turn the storyboard units below into AI video generation prompts.',
    '',
    `Project: ${input.project_name}`,
    `Style hint: ${input.style_hint || 'none'}`,
    '',
    'Storyboard units JSON:',
    JSON.stringify(input.storyboard_units, null, 2),
    '',
    'Output rules:',
    '- Output JSON only. No Markdown. No explanation.',
    '- Return one video prompt for every input storyboard unit.',
    '- Use the image_prompt as visual continuity reference when it exists.',
    '- prompt_text should include duration, camera movement, subject action, pacing, scene continuity, lighting changes, and ending state.',
    '- JSON shape: {"prompts":[{"storyboard_asset_id":"...","storyboard_number":1,"prompt_text":"..."}]}',
  ].join('\n');
}
