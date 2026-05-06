import { supabaseAdmin } from './supabase-admin';

export interface UsageEntry {
  userId: string;
  provider: 'github' | 'r2' | 'supabase' | 'openai' | 'openai-compatible' | 'deepseek' | 'anthropic' | 'nanobanana' | 'gptimage';
  model?: string;
  action: 'commit' | 'upload' | 'download' | 'chat' | 'image-gen' | 'misc';
  tokensInput?: number;
  tokensOutput?: number;
  bytesTransferred?: number;
  costUsd?: number;
  episodeId?: string;
  requestId?: string;
}

export async function logUsage(entry: UsageEntry): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('usage_logs')
    .insert({
      user_id: entry.userId,
      provider: entry.provider,
      model: entry.model ?? null,
      action: entry.action,
      tokens_input: entry.tokensInput ?? null,
      tokens_output: entry.tokensOutput ?? null,
      bytes_transferred: entry.bytesTransferred ?? null,
      cost_usd: entry.costUsd ?? null,
      episode_id: entry.episodeId ?? null,
      request_id: entry.requestId ?? null,
    });

  if (error) {
    console.warn('logUsage failed:', error.message);
  }
}
