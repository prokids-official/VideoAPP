export const runtime = 'nodejs';

import { ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { loadSkillCatalog } from '@/lib/skill-loader';
import { createLocalSkill } from '@/lib/skill-writer';
import { z } from 'zod';

const createSkillSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name_cn: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
  body: z.string().trim().min(1).max(50000),
  default_model: z.string().trim().min(1).max(120).optional(),
});

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const category = new URL(req.url).searchParams.get('category');
  const skills = await loadSkillCatalog(undefined, { category });

  return ok({
    skills: skills.map(publicSkill),
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
    return Response.json({ ok: false, error: { code: 'PAYLOAD_MALFORMED', message: 'Body must be JSON' } }, { status: 400 });
  }

  const parsed = createSkillSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { code: 'PAYLOAD_MALFORMED', message: parsed.error.issues[0]?.message ?? 'Invalid payload' } },
      { status: 400 },
    );
  }

  const skill = await createLocalSkill(undefined, {
    id: parsed.data.id,
    name_cn: parsed.data.name_cn,
    category: parsed.data.category,
    description: parsed.data.description,
    body: parsed.data.body,
    default_model: parsed.data.default_model,
  });

  return ok({ skill: publicSkill(skill) });
}

function publicSkill(skill: {
  id: string;
  name_cn: string;
  category: string;
  default_model: string;
  version: number;
  description: string;
}) {
  return {
    id: skill.id,
    name_cn: skill.name_cn,
    category: skill.category,
    default_model: skill.default_model,
    version: skill.version,
    description: skill.description,
  };
}
