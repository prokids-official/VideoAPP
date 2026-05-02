export const runtime = 'edge';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const STATUSES = new Set(['pending', 'accepted', 'rejected', 'shipped']);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  status: z.string().optional(),
  tags: z.unknown().optional(),
});

interface ActorRow {
  role: string;
  display_name: string | null;
}

type RelatedUser = { display_name: string | null } | Array<{ display_name: string | null }> | null;

interface IdeaRow {
  id: string;
  author_id: string;
  author_user?: RelatedUser;
  title: string;
  description: string;
  status: 'pending' | 'accepted' | 'rejected' | 'shipped';
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_changed_by_user?: RelatedUser;
}

interface ReferenceRow {
  id: string;
  source: 'douyin' | 'bilibili' | 'youtube' | 'article' | 'other';
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  added_by: 'user' | 'agent';
  added_at: string;
}

interface DeleteRow {
  id: string;
  deleted_at: string;
}

function firstUser(user: RelatedUser | undefined): { display_name: string | null } | null {
  if (Array.isArray(user)) {
    return user[0] ?? null;
  }

  return user ?? null;
}

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function mapIdea(row: IdeaRow, authUserId: string, isAdmin: boolean) {
  const author = firstUser(row.author_user);
  const statusChangedBy = firstUser(row.status_changed_by_user);

  return {
    id: row.id,
    author_id: row.author_id,
    author_name: author?.display_name ?? '',
    title: row.title,
    description: row.description,
    status: row.status,
    tags: row.tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status_changed_at: row.status_changed_at,
    status_changed_by: row.status_changed_by,
    status_changed_by_name: statusChangedBy?.display_name ?? null,
    is_editable_by_me: row.author_id === authUserId || isAdmin,
  };
}

async function getActor(userId: string): Promise<{ actor: ActorRow | null; error: { message?: string } | null }> {
  const { data, error } = await supabaseAdmin()
    .from('users')
    .select('role,display_name')
    .eq('id', userId)
    .single<ActorRow>();

  return { actor: data ?? null, error };
}

async function getIdea(id: string): Promise<{ idea: IdeaRow | null; error: { message?: string } | null }> {
  const { data, error } = await supabaseAdmin()
    .from('ideas')
    .select(
      `
        id,author_id,title,description,status,tags,created_at,updated_at,deleted_at,
        status_changed_at,status_changed_by,
        author_user:users!ideas_author_id_fkey(display_name),
        status_changed_by_user:users!ideas_status_changed_by_fkey(display_name)
      `,
    )
    .eq('id', id)
    .maybeSingle<IdeaRow>();

  return { idea: data ?? null, error };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await ctx.params;
  const { actor, error: actorError } = await getActor(auth.user_id);

  if (actorError || !actor) {
    return err('INTERNAL_ERROR', actorError?.message ?? 'actor lookup failed', undefined, 500);
  }

  const { idea, error: ideaError } = await getIdea(id);

  if (ideaError) {
    return err('INTERNAL_ERROR', ideaError.message ?? 'idea lookup failed', undefined, 500);
  }

  if (!idea) {
    return err('PAYLOAD_MALFORMED', 'idea not found', undefined, 404);
  }

  if (idea.deleted_at) {
    return err('PAYLOAD_MALFORMED', 'idea already deleted', undefined, 410);
  }

  const { data: references, error: refsError } = await supabaseAdmin()
    .from('idea_references')
    .select('id,source,url,title,thumbnail_url,added_by,added_at')
    .eq('idea_id', id)
    .order('added_at', { ascending: false });

  if (refsError) {
    return err('INTERNAL_ERROR', refsError.message, undefined, 500);
  }

  return ok({
    idea: mapIdea(idea, auth.user_id, actor.role === 'admin'),
    references: (references ?? []) as ReferenceRow[],
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
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

  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];

    if (field === 'title') {
      return err('IDEA_INVALID_TITLE', 'Title must be 1-120 characters', undefined, 400);
    }

    if (field === 'description') {
      return err('IDEA_INVALID_DESCRIPTION', 'Description must be 1-4000 characters', undefined, 400);
    }

    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const { id } = await ctx.params;
  const { actor, error: actorError } = await getActor(auth.user_id);

  if (actorError || !actor) {
    return err('INTERNAL_ERROR', actorError?.message ?? 'actor lookup failed', undefined, 500);
  }

  const { idea, error: ideaError } = await getIdea(id);

  if (ideaError) {
    return err('INTERNAL_ERROR', ideaError.message ?? 'idea lookup failed', undefined, 500);
  }

  if (!idea) {
    return err('PAYLOAD_MALFORMED', 'idea not found', undefined, 404);
  }

  if (idea.deleted_at) {
    return err('PAYLOAD_MALFORMED', 'idea already deleted', undefined, 410);
  }

  const isAdmin = actor.role === 'admin';
  const isAuthor = idea.author_id === auth.user_id;
  const wantsContentEdit = parsed.data.title !== undefined || parsed.data.description !== undefined;
  const wantsAdminEdit = parsed.data.status !== undefined || parsed.data.tags !== undefined;

  if ((wantsContentEdit && !isAuthor && !isAdmin) || (wantsAdminEdit && !isAdmin)) {
    return err('IDEA_NOT_PERMITTED', 'idea update not permitted', undefined, 403);
  }

  if (parsed.data.status !== undefined && !STATUSES.has(parsed.data.status)) {
    return err('PAYLOAD_MALFORMED', 'Invalid idea status', undefined, 400);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (parsed.data.title !== undefined) {
    update.title = parsed.data.title;
  }

  if (parsed.data.description !== undefined) {
    update.description = parsed.data.description;
  }

  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    update.status_changed_at = update.updated_at;
    update.status_changed_by = auth.user_id;
  }

  if (parsed.data.tags !== undefined) {
    update.tags = sanitizeTags(parsed.data.tags);
  }

  const { data: updated, error: updateError } = await supabaseAdmin()
    .from('ideas')
    .update(update)
    .eq('id', id)
    .select(
      `
        id,author_id,title,description,status,tags,created_at,updated_at,deleted_at,
        status_changed_at,status_changed_by,
        author_user:users!ideas_author_id_fkey(display_name),
        status_changed_by_user:users!ideas_status_changed_by_fkey(display_name)
      `,
    )
    .single<IdeaRow>();

  if (updateError || !updated) {
    return err('INTERNAL_ERROR', updateError?.message ?? 'idea update failed', undefined, 500);
  }

  return ok({ idea: mapIdea(updated, auth.user_id, isAdmin) });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await ctx.params;
  const { actor, error: actorError } = await getActor(auth.user_id);

  if (actorError || !actor) {
    return err('INTERNAL_ERROR', actorError?.message ?? 'actor lookup failed', undefined, 500);
  }

  const { idea, error: ideaError } = await getIdea(id);

  if (ideaError) {
    return err('INTERNAL_ERROR', ideaError.message ?? 'idea lookup failed', undefined, 500);
  }

  if (!idea) {
    return err('PAYLOAD_MALFORMED', 'idea not found', undefined, 404);
  }

  if (idea.deleted_at) {
    return err('PAYLOAD_MALFORMED', 'idea already deleted', undefined, 410);
  }

  if (idea.author_id !== auth.user_id && actor.role !== 'admin') {
    return err('IDEA_NOT_PERMITTED', 'idea delete not permitted', undefined, 403);
  }

  const deletedAt = new Date().toISOString();
  const { data: deleted, error: deleteError } = await supabaseAdmin()
    .from('ideas')
    .update({
      deleted_at: deletedAt,
      deleted_by: auth.user_id,
      updated_at: deletedAt,
    })
    .eq('id', id)
    .select('id,deleted_at')
    .maybeSingle<DeleteRow>();

  if (deleteError) {
    return err('INTERNAL_ERROR', deleteError.message, undefined, 500);
  }

  if (!deleted) {
    return err('PAYLOAD_MALFORMED', 'idea already deleted', undefined, 410);
  }

  return ok({ id: deleted.id, deleted_at: deleted.deleted_at });
}
