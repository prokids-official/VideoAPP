export const runtime = 'nodejs';

import { err, ok } from '@/lib/api-response';
import { requireUser } from '@/lib/auth-guard';
import { loadSkillCatalog } from '@/lib/skill-loader';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser(_req);

  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const skills = await loadSkillCatalog();
  const skill = skills.find((item) => item.id === id);
  if (!skill) {
    return err('PAYLOAD_MALFORMED', `Unknown skill: ${id}`, undefined, 404);
  }

  return ok({
    skill: {
      id: skill.id,
      name_cn: skill.name_cn,
      category: skill.category,
      default_model: skill.default_model,
      version: skill.version,
      description: skill.description,
      body: skill.body,
      filename: 'SKILL.md',
    },
  });
}
