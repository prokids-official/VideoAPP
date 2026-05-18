export interface OpenAICompatibleVisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface VisionImageInput {
  url: string;
}

export interface VisionCompletionInput extends OpenAICompatibleVisionConfig {
  system: string;
  text: string;
  images: VisionImageInput[];
}

export interface VisionCompletionResult {
  id: string | null;
  content: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

interface OpenAICompatibleVisionResponse {
  id?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
  error?: {
    message?: unknown;
  };
}

export function missingVisionProviderConfig(config: OpenAICompatibleVisionConfig): string | null {
  if (!config.baseUrl.trim()) {
    return 'AI_VISION_BASE_URL is not configured';
  }
  if (!config.apiKey.trim()) {
    return 'AI_VISION_API_KEY is not configured';
  }
  if (!config.model.trim()) {
    return 'AI_VISION_MODEL is not configured';
  }
  return null;
}

export async function callOpenAICompatibleVision(input: VisionCompletionInput): Promise<VisionCompletionResult> {
  const res = await fetch(chatCompletionsUrl(input.baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: input.text },
            ...input.images.map((image) => ({
              type: 'image_url',
              image_url: { url: image.url },
            })),
          ],
        },
      ],
    }),
  });
  const payload = await readJson(res);

  if (!res.ok) {
    throw new Error(`AI vision provider error ${res.status}: ${providerErrorMessage(payload)}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI vision provider returned an empty assistant message');
  }

  return {
    id: typeof payload.id === 'string' ? payload.id : null,
    content,
    usage: {
      promptTokens: numberOrNull(payload.usage?.prompt_tokens),
      completionTokens: numberOrNull(payload.usage?.completion_tokens),
      totalTokens: numberOrNull(payload.usage?.total_tokens),
    },
  };
}

function chatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

async function readJson(res: Response): Promise<OpenAICompatibleVisionResponse> {
  try {
    const parsed = await res.json();
    return parsed && typeof parsed === 'object' ? parsed as OpenAICompatibleVisionResponse : {};
  } catch {
    return {};
  }
}

function providerErrorMessage(payload: OpenAICompatibleVisionResponse) {
  return typeof payload.error?.message === 'string' && payload.error.message.trim()
    ? payload.error.message
    : 'request failed';
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
