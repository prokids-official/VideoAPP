export const runtime = 'nodejs';
export const maxDuration = 5;

import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import { getOctokit } from '@/lib/github';
import { getS3Client } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase-admin';

type ServiceName = 'supabase' | 'github' | 'r2';
type ServiceStatus = 'ok' | 'error';

type HealthServices = Record<ServiceName, ServiceStatus>;
type HealthLatencies = Record<ServiceName, number>;

const TIMEOUT_MS = 1000;

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
}

async function timedCheck(check: () => Promise<unknown>): Promise<{
  status: ServiceStatus;
  latency: number;
}> {
  const started = Date.now();

  try {
    await Promise.race([check(), timeoutAfter(TIMEOUT_MS)]);
    return { status: 'ok', latency: Date.now() - started };
  } catch {
    return { status: 'error', latency: Date.now() - started };
  }
}

async function pingSupabase(): Promise<void> {
  const { error } = await supabaseAdmin().from('users').select('id').limit(1);

  if (error) {
    throw new Error(error.message);
  }
}

async function pingGithub(): Promise<void> {
  await getOctokit().rest.repos.get({
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
  });
}

async function pingR2(): Promise<void> {
  await getS3Client().send(new HeadBucketCommand({ Bucket: env.R2_BUCKET_NAME }));
}

export async function GET(): Promise<Response> {
  const [supabase, github, r2] = await Promise.all([
    timedCheck(pingSupabase),
    timedCheck(pingGithub),
    timedCheck(pingR2),
  ]);

  const services: HealthServices = {
    supabase: supabase.status,
    github: github.status,
    r2: r2.status,
  };
  const latency_ms: HealthLatencies = {
    supabase: supabase.latency,
    github: github.latency,
    r2: r2.latency,
  };
  const ok = Object.values(services).every((status) => status === 'ok');

  return Response.json(
    {
      ok,
      services,
      latency_ms,
    },
    { status: ok ? 200 : 503 },
  );
}
