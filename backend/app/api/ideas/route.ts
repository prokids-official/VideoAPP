export const runtime = 'edge';

import { z } from 'zod';
import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  tags: z.unknown().optional(),
});

const STATUSES = new Set(['pending', 'accepted', 'rejected', 'shipped']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
}

function tagsForActor(input: unknown, isAdmin: boolean): string[] {
  if (!isAdmin || !Array.isArray(input)) {
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

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function decodeCursor(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return atob(value);
  } catch {
    return null;
  }
}

function encodeCursor(value: string): string {
  return btoa(value);
}

function firstUser(user: RelatedUser | undefined): { display_name: string | null } | null {
  if (Array.isArray(user)) {
    return user[0] ?? null;
  }

  return user ?? null;
}

function mapIdea(row: IdeaRow, authUserId: string, isAdmin: boolean, authorName?: string | null) {
  const author = firstUser(row.author_user);

  return {
    id: row.id,
    author_id: row.author_id,
    author_name: authorName ?? author?.display_name ?? '',
    title: row.title,
    description: row.description,
    status: row.status,
    tags: row.tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_editable_by_me: row.author_id === authUserId || isAdmin,
  };
}

function mapCreatedIdea(row: IdeaRow, authorName: string | null) {
  return {
    id: row.id,
    author_id: row.author_id,
    author_name: authorName ?? '',
    title: row.title,
    description: row.description,
    status: row.status,
    tags: row.tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
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

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const { actor, error: actorError } = await getActor(auth.user_id);

  if (actorError || !actor) {
    return err('INTERNAL_ERROR', actorError?.message ?? 'actor lookup failed', undefined, 500);
  }

  const searchParams = new URL(req.url).searchParams;
  const limit = parseLimit(searchParams.get('limit'));
  const status = searchParams.get('status');
  const authorId = searchParams.get('author_id');
  const tag = searchParams.get('tag')?.trim();
  const cursor = decodeCursor(searchParams.get('cursor'));
  let query = supabaseAdmin()
    .from('ideas')
    .select(
      `
        id,author_id,title,description,status,tags,created_at,updated_at,
        author_user:users!ideas_author_id_fkey(display_name)
      `,
      { count: 'exact' },
    )
    .is('deleted_at', null);

  if (status && STATUSES.has(status)) {
    query = query.eq('status', status);
  }

  if (authorId) {
    query = query.eq('author_id', authorId === 'me' ? auth.user_id : authorId);
  }

  if (tag) {
    query = query.contains('tags', [tag]);
  }

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).limit(limit + 1);

  if (error) {
    return err('INTERNAL_ERROR', error.message, undefined, 500);
  }

  const rows = ((data ?? []) as IdeaRow[]).slice(0, limit);
  const extra = (data ?? [])[limit] as IdeaRow | undefined;

  return ok({
    ideas: rows.map((row) => mapIdea(row, auth.user_id, actor.role === 'admin')),
    total: count ?? rows.length,
    next_cursor: extra ? encodeCursor(extra.created_at) : null,
  });
}

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
    const field = parsed.error.issues[0]?.path[0];

    if (field === 'title') {
      return err('IDEA_INVALID_TITLE', 'Title must be 1-120 characters', undefined, 400);
    }

    if (field === 'description') {
      return err('IDEA_INVALID_DESCRIPTION', 'Description must be 1-4000 characters', undefined, 400);
    }

    return err('PAYLOAD_MALFORMED', parsed.error.issues[0]?.message ?? 'Invalid payload', undefined, 400);
  }

  const { actor, error: actorError } = await getActor(auth.user_id);

  if (actorError || !actor) {
    return err('INTERNAL_ERROR', actorError?.message ?? 'actor lookup failed', undefined, 500);
  }

  const admin = supabaseAdmin();
  const { data: idea, error: ideaError } = await admin
    .from('ideas')
    .insert({
      author_id: auth.user_id,
      title: parsed.data.title,
      description: parsed.data.description,
      tags: tagsForActor(parsed.data.tags, actor.role === 'admin'),
    })
    .select('id,author_id,title,description,status,tags,created_at,updated_at')
    .single<IdeaRow>();

  if (ideaError || !idea) {
    return err('INTERNAL_ERROR', ideaError?.message ?? 'idea insert failed', undefined, 500);
  }

  return ok({ idea: mapCreatedIdea(idea, actor.display_name) }, 201);
}
