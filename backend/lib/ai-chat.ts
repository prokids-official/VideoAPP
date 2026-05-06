import type { AgentMessage } from '../../shared/types';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatCompletionInput extends OpenAICompatibleConfig {
  messages: AgentMessage[];
}

export interface ChatCompletionResult {
  id: string | null;
  content: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

interface OpenAICompatibleResponse {
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

export function missingProviderConfig(config: OpenAICompatibleConfig): string | null {
  if (!config.baseUrl.trim()) {
    return 'AI_CHAT_BASE_URL is not configured';
  }
  if (!config.apiKey.trim()) {
    return 'AI_CHAT_API_KEY is not configured';
  }
  if (!config.model.trim()) {
    return 'AI_CHAT_MODEL is not configured';
  }
  return null;
}

export async function callOpenAICompatibleChat(input: ChatCompletionInput): Promise<ChatCompletionResult> {
  const res = await fetch(chatCompletionsUrl(input.baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
    }),
  });
  const payload = await readJson(res);

  if (!res.ok) {
    throw new Error(`AI provider error ${res.status}: ${providerErrorMessage(payload)}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI provider returned an empty assistant message');
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

async function readJson(res: Response): Promise<OpenAICompatibleResponse> {
  try {
    const parsed = await res.json();
    return parsed && typeof parsed === 'object' ? parsed as OpenAICompatibleResponse : {};
  } catch {
    return {};
  }
}

function providerErrorMessage(payload: OpenAICompatibleResponse) {
  return typeof payload.error?.message === 'string' && payload.error.message.trim()
    ? payload.error.message
    : 'request failed';
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
