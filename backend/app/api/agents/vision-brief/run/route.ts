export const runtime = 'nodejs';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { callOpenAICompatibleVision, missingVisionProviderConfig } from '@/lib/ai-vision';
import { resolveVisionProviderConfig } from '@/lib/ai-provider';
import { requireUser } from '@/lib/auth-guard';
import { env } from '@/lib/env';
import { loadSkillCatalog } from '@/lib/skill-loader';
import { logUsage } from '@/lib/usage';

const imageSchema = z.object({
  url: z.string().trim().min(1).max(2_000_000),
  label: z.string().trim().max(120).optional(),
});

const inputSchema = z.object({
  prompt: z.string().trim().max(2000).default(''),
  images: z.array(imageSchema).min(1).max(8),
});

const bodySchema = z.object({
  skill_id: z.string().trim().min(1),
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

  const skills = await loadSkillCatalog(undefined, { category: 'vision-context' });
  const skill = skills.find((item) => item.id === parsed.data.skill_id);
  if (!skill) {
    return err('PAYLOAD_MALFORMED', `Unknown vision-context skill: ${parsed.data.skill_id}`, undefined, 400);
  }

  const providerConfig = resolveVisionProviderConfig({
    provider: env.AI_VISION_PROVIDER,
    baseUrl: env.AI_VISION_BASE_URL,
    apiKey: env.AI_VISION_API_KEY ?? '',
    model: env.AI_VISION_MODEL || skill.default_model,
  });
  const missing = missingVisionProviderConfig(providerConfig);
  if (missing) {
    return err('INTERNAL_ERROR', missing, undefined, 500);
  }

  try {
    const completion = await callOpenAICompatibleVision({
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      system: skill.body,
      text: buildVisionBriefPrompt(parsed.data.input),
      images: parsed.data.input.images.map((image) => ({ url: image.url })),
    });

    await logUsage({
      userId: auth.user_id,
      provider: 'openai-compatible',
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
        brief: completion.content,
        usage: completion.usage,
      },
    });
  } catch (cause) {
    return err('INTERNAL_ERROR', cause instanceof Error ? cause.message : 'AI vision provider request failed', undefined, 502);
  }
}

function buildVisionBriefPrompt(input: z.infer<typeof inputSchema>): string {
  const labels = input.images
    .map((image, index) => `${index + 1}. ${image.label || `image-${index + 1}`}`)
    .join('\n');

  return [
    'Describe the attached reference images as compact factual context for downstream DeepSeek agents.',
    'Do not write a story. Do not invent unseen details.',
    'Focus on subjects, scene, composition, lighting, color, style, text/logos if visible, and production constraints.',
    '',
    'User instruction:',
    input.prompt || 'No extra instruction.',
    '',
    'Image labels:',
    labels,
    '',
    'Output a concise Markdown brief that another text-only model can use.',
  ].join('\n');
}
