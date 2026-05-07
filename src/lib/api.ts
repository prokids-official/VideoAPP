import type {
  ApiResponse,
  AIProviderTestPayload,
  AIProviderTestResult,
  AssetsListResult,
  AuthResult,
  AssetStage,
  AssetContentResult,
  AssetRelationsResult,
  IdeaCreateResult,
  IdeaDetailResult,
  IdeasListResult,
  IdeaStatus,
  IdeaUpdateResult,
  PreviewFilenameResult,
  RecentEpisode,
  ScriptWriterRunPayload,
  ScriptWriterRunResult,
  SkillCreatePayload,
  SkillCreateResult,
  SkillsListResult,
  StorageBackend,
  StoryboardRunPayload,
  StoryboardRunResult,
  SignupPendingResult,
  TreeResponse,
  UsageMeResponse,
  User,
} from '../../shared/types';

interface NetRequestPayload {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  requireAuth?: boolean;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; status: number; code: string; message: string };
export type ApiCallResult<T> = ApiOk<T> | ApiErr;

function bridgeMissing<T>(): ApiCallResult<T> {
  return {
    ok: false,
    status: 0,
    code: 'DESKTOP_BRIDGE_MISSING',
    message: '桌面桥接未加载。请在 Electron 桌面端登录，不要直接用浏览器打开 127.0.0.1:5173；如果已经在桌面端，请完全退出后重新运行 npm run dev。',
  };
}

async function call<T>(opts: NetRequestPayload): Promise<ApiCallResult<T>> {
  if (!window.fableglitch?.net?.request) {
    return bridgeMissing<T>();
  }

  let status: number;
  let body: ApiResponse<unknown> | null;

  try {
    const result = await Promise.race([
      window.fableglitch.net.request(opts),
      new Promise<{ status: 0; body: ApiResponse<unknown> }>((resolve) =>
        setTimeout(
          () => resolve({
            status: 0,
            body: { ok: false, error: { code: 'TIMEOUT', message: '请求超时，请稍后再试。' } },
          }),
          18_000,
        ),
      ),
    ]);
    status = result.status;
    body = result.body;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK',
      message: error instanceof Error ? error.message : '网络请求失败',
    };
  }

  if (status >= 200 && status < 300 && body && body.ok) {
    return { ok: true, data: (body as ApiResponse<T> & { ok: true }).data };
  }

  if (body && !body.ok) {
    return { ok: false, status, code: body.error.code, message: body.error.message };
  }

  return { ok: false, status, code: 'NETWORK', message: `HTTP ${status}` };
}

async function assetContent(assetId: string, storageBackend: StorageBackend): Promise<ApiCallResult<AssetContentResult>> {
  if (!window.fableglitch?.net?.assetContent) {
    return bridgeMissing<AssetContentResult>();
  }

  try {
    const result = await window.fableglitch.net.assetContent({ assetId, storageBackend });
    if (result.status >= 200 && result.status < 400 && result.body?.ok) {
      return { ok: true, data: result.body.data };
    }
    if (result.body && !result.body.ok) {
      return { ok: false, status: result.status, code: result.body.error.code, message: result.body.error.message };
    }
    return { ok: false, status: result.status, code: 'NETWORK', message: `HTTP ${result.status}` };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK',
      message: error instanceof Error ? error.message : '网络请求失败',
    };
  }
}

export const api = {
  signup: (input: { email: string; password: string; display_name: string }) =>
    call<AuthResult | SignupPendingResult>({ method: 'POST', path: '/auth/signup', body: input }),

  login: (input: { email: string; password: string }) =>
    call<AuthResult>({ method: 'POST', path: '/auth/login', body: input }),

  resendVerification: (input: { email: string }) =>
    call<{ sent: true }>({ method: 'POST', path: '/auth/resend-verification', body: input }),

  resetPassword: (input: { email: string }) =>
    call<{ sent: true }>({ method: 'POST', path: '/auth/reset-password', body: input }),

  me: () =>
    call<{ user: User }>({ method: 'GET', path: '/auth/me', requireAuth: true }),

  logout: async () => {
    if (!window.fableglitch?.db || !window.fableglitch?.session) {
      return;
    }

    const rt = await window.fableglitch.db.sessionGet('refresh_token');
    if (rt) {
      await call({ method: 'POST', path: '/auth/logout', body: { refresh_token: rt } });
    }
    await window.fableglitch.session.clear();
  },

  tree: () =>
    call<TreeResponse>({ method: 'GET', path: '/tree', requireAuth: true }),

  skills: (category?: string) => {
    const qs = new URLSearchParams();
    if (category) {
      qs.set('category', category);
    }
    const suffix = qs.toString();
    return call<SkillsListResult>({ method: 'GET', path: `/skills${suffix ? `?${suffix}` : ''}`, requireAuth: true });
  },

  createSkill: (input: SkillCreatePayload) =>
    call<SkillCreateResult>({ method: 'POST', path: '/skills', body: input, requireAuth: true }),

  scriptWriterRun: (input: ScriptWriterRunPayload) =>
    call<ScriptWriterRunResult>({
      method: 'POST',
      path: '/agents/script-writer/run',
      body: input,
      requireAuth: true,
    }),

  storyboardRun: (input: StoryboardRunPayload) =>
    call<StoryboardRunResult>({
      method: 'POST',
      path: '/agents/storyboard/run',
      body: input,
      requireAuth: true,
    }),

  aiProviderTest: (input: AIProviderTestPayload) =>
    call<AIProviderTestResult>({
      method: 'POST',
      path: '/ai/provider/test',
      body: input,
      requireAuth: true,
    }),

  recentEpisodes: (limit = 5) =>
    call<{ episodes: RecentEpisode[] }>({ method: 'GET', path: `/episodes/recent?limit=${limit}`, requireAuth: true }),

  createEpisode: (input: {
    series_name_cn: string;
    album_name_cn: string;
    content_name_cn: string;
    episode_name_cn: string;
  }) =>
    call<{ episode: { id: string; name_cn: string; episode_path: string } }>({
      method: 'POST',
      path: '/episodes',
      body: input,
      requireAuth: true,
    }),

  episodeDetail: (id: string) =>
    call<unknown>({ method: 'GET', path: `/episodes/${id}`, requireAuth: true }),

  assets: (input: { episode_id: string; type_code?: string }) => {
    const qs = new URLSearchParams({ episode_id: input.episode_id });
    if (input.type_code) {
      qs.set('type_code', input.type_code);
    }
    return call<AssetsListResult>({ method: 'GET', path: `/assets?${qs.toString()}`, requireAuth: true });
  },

  previewFilename: (input: {
    episode_id: string;
    type_code: string;
    name?: string;
    variant?: string;
    number?: number;
    version?: number;
    stage?: AssetStage;
    language?: string;
    original_filename?: string;
  }) =>
    call<PreviewFilenameResult>({
      method: 'POST',
      path: '/assets/preview-filename',
      body: input,
      requireAuth: true,
    }),

  usageMe: () =>
    call<UsageMeResponse>({ method: 'GET', path: '/usage/me', requireAuth: true }),

  assetContent,

  assetRelations: (assetId: string) =>
    call<AssetRelationsResult>({ method: 'GET', path: `/assets/${assetId}/relations`, requireAuth: true }),

  ideas: (input: {
    status?: IdeaStatus | 'all';
    authorId?: string;
    tag?: string;
    limit?: number;
    cursor?: string | null;
  } = {}) => {
    const qs = new URLSearchParams();
    if (input.status && input.status !== 'all') {
      qs.set('status', input.status);
    }
    if (input.authorId) {
      qs.set('author_id', input.authorId);
    }
    if (input.tag) {
      qs.set('tag', input.tag);
    }
    if (input.limit) {
      qs.set('limit', String(input.limit));
    }
    if (input.cursor) {
      qs.set('cursor', input.cursor);
    }
    const suffix = qs.toString();
    return call<IdeasListResult>({ method: 'GET', path: `/ideas${suffix ? `?${suffix}` : ''}`, requireAuth: true });
  },

  createIdea: (input: { title: string; description: string; tags?: string[] }) =>
    call<IdeaCreateResult>({ method: 'POST', path: '/ideas', body: input, requireAuth: true }),

  ideaDetail: (id: string) =>
    call<IdeaDetailResult>({ method: 'GET', path: `/ideas/${id}`, requireAuth: true }),

  updateIdea: (id: string, input: {
    title?: string;
    description?: string;
    status?: IdeaStatus;
    tags?: string[];
  }) =>
    call<IdeaUpdateResult>({ method: 'PATCH', path: `/ideas/${id}`, body: input, requireAuth: true }),

  deleteIdea: (id: string) =>
    call<{ id: string; deleted_at: string }>({ method: 'DELETE', path: `/ideas/${id}`, requireAuth: true }),
};
