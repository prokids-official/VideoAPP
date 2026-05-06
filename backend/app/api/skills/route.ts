export const runtime = 'nodejs';

import { ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { loadSkillCatalog } from '@/lib/skill-loader';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);

  if (auth instanceof Response) {
    return auth;
  }

  const category = new URL(req.url).searchParams.get('category');
  const skills = await loadSkillCatalog(undefined, { category });

  return ok({
    skills: skills.map((skill) => ({
      id: skill.id,
      name_cn: skill.name_cn,
      category: skill.category,
      default_model: skill.default_model,
      version: skill.version,
      description: skill.description,
    })),
  });
}
