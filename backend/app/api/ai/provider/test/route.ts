export const runtime = 'nodejs';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { callOpenAICompatibleChat, missingProviderConfig } from '@/lib/ai-chat';
import { resolveChatProviderConfig } from '@/lib/ai-provider';
import { requireUser } from '@/lib/auth-guard';
import { env } from '@/lib/env';

const providerConfigSchema = z.object({
  mode: z.enum(['official-deepseek', 'custom-openai-compatible']),
  model: z.string().trim().min(1),
  base_url: z.string().trim().optional(),
  api_key: z.string().trim().optional(),
});

const bodySchema = z.object({
  provider_config: providerConfigSchema,
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

  const providerConfig = resolveChatProviderConfig(parsed.data.provider_config, {
    provider: env.AI_CHAT_PROVIDER,
    baseUrl: env.AI_CHAT_BASE_URL,
    apiKey: env.AI_CHAT_API_KEY ?? '',
    model: env.AI_CHAT_MODEL,
  });
  const missing = missingProviderConfig(providerConfig);
  if (missing) {
    return err('PAYLOAD_MALFORMED', missing, undefined, 400);
  }

  try {
    const completion = await callOpenAICompatibleChat({
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      messages: [
        { role: 'system', content: 'You are a connection test endpoint. Reply with exactly OK.' },
        { role: 'user', content: 'Connection test' },
      ],
    });
    return ok({
      provider: providerConfig.provider,
      model: providerConfig.model,
      ok: true,
      content: completion.content,
      usage: completion.usage,
    });
  } catch (cause) {
    return err('INTERNAL_ERROR', cause instanceof Error ? cause.message : 'AI provider test failed', undefined, 502);
  }
}
