export const runtime = 'edge';

import { err, ok } from '@/lib/api-response';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface AdminContactRow {
  display_name: string;
  email: string;
}

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseAdmin()
    .from('users')
    .select('display_name,email')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  return ok({ contacts: (data ?? []) as AdminContactRow[] });
}
