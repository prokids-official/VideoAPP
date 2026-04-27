import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? '';

function admin() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestUser(
  opts: { email?: string; displayName?: string } = {},
): Promise<{
  id: string;
  email: string;
  access_token: string;
}> {
  const email =
    opts.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@beva.com`;
  const password = 'TestPass123';
  const { data: created, error: createError } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? 'create test user failed');
  }

  await admin().from('users').insert({
    id: created.user.id,
    email,
    display_name: opts.displayName ?? 'Test User',
    team: 'FableGlitch',
    role: 'member',
  });

  const { data: signIn } = await admin().auth.signInWithPassword({ email, password });

  if (!signIn.session) {
    throw new Error('signin failed in factory');
  }

  return { id: created.user.id, email, access_token: signIn.session.access_token };
}

export async function createTestEpisode(opts: {
  authorId: string;
  episodeName?: string;
}): Promise<{
  episode_id: string;
  episode_path: string;
}> {
  const series = await admin()
    .from('series')
    .insert({ name_cn: '测试系列', created_by: opts.authorId })
    .select()
    .single();
  const album = await admin()
    .from('albums')
    .insert({ series_id: series.data!.id, name_cn: 'NA', created_by: opts.authorId })
    .select()
    .single();
  const content = await admin()
    .from('contents')
    .insert({ album_id: album.data!.id, name_cn: '测试内容', created_by: opts.authorId })
    .select()
    .single();
  const episodeName = opts.episodeName ?? `测试剧集_${Date.now()}`;
  const episodePath = `测试系列_NA_${episodeName}`;
  const episode = await admin()
    .from('episodes')
    .insert({
      content_id: content.data!.id,
      name_cn: episodeName,
      episode_path: episodePath,
      created_by: opts.authorId,
    })
    .select()
    .single();

  return { episode_id: episode.data!.id, episode_path: episodePath };
}

export async function cleanupTestData(): Promise<void> {
  await admin().from('assets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('episodes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('contents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('albums').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('series').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin().from('usage_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin()
    .from('push_idempotency')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  const { data: testUsers } = await admin()
    .from('users')
    .select('id')
    .like('email', 'test-%@beva.com');

  for (const user of testUsers ?? []) {
    await admin().auth.admin.deleteUser(user.id).catch(() => {});
  }
}
