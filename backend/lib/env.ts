import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  AUTH_REDIRECT_BASE_URL: z.string().url().optional(),
  UPSTASH_REDIS_URL: z.string().url(),
  UPSTASH_REDIS_TOKEN: z.string().min(1),
  GITHUB_BOT_TOKEN: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().default('fableglitch'),
  GITHUB_REPO_NAME: z.string().default('asset-library'),
  GITHUB_DEFAULT_BRANCH: z.string().default('main'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('fableglitch-assets'),
  R2_ENDPOINT: z.string().url().optional(),
  AI_CHAT_PROVIDER: z.string().default('deepseek'),
  AI_CHAT_BASE_URL: z.string().url().default('https://api.deepseek.com/v1'),
  AI_CHAT_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().default('deepseek-v4-flash'),
  AI_VISION_PROVIDER: z.string().default('codingplan'),
  AI_VISION_BASE_URL: z.string().url().default('https://coding.dashscope.aliyuncs.com/v1'),
  AI_VISION_API_KEY: z.string().optional(),
  AI_VISION_MODEL: z.string().default('qwen3.6-plus'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
