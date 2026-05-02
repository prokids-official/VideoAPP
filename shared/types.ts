// Shared between backend (Next.js) and frontend (Electron + React).
// Must stay zero-runtime: pure types only.

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface User {
  id: string;
  email: string;
  display_name: string;
  team: string | null;
  role: 'member' | 'admin';
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AuthResult {
  user: User;
  session: Session;
}

// Returned by /api/auth/signup when email confirmation is enabled.
// Session is null because the user must click the verification link first.
export interface SignupPendingResult {
  user: User;
  email_verification_required: true;
}

export type StorageBackend = 'github' | 'r2';

export interface AssetType {
  code: string;
  name_cn: string;
  icon: string | null;
  folder_path: string;
  filename_tpl: string;
  file_exts: string[];
  storage_ext: string;
  storage_backend: StorageBackend;
  parent_panel: string | null;
  needs_before: string[] | null;
  supports_paste: boolean;
  allow_ai_generate: boolean;
  sort_order: number;
  enabled: boolean;
}

export interface EpisodeSummary {
  id: string;
  name_cn: string;
  status: 'drafting' | 'review' | 'published' | 'archived';
  updated_at: string;
  episode_path: string;
  asset_count_pushed: number;
}

export interface RecentEpisode {
  id: string;
  name_cn: string;
  episode_path: string;
  status: 'drafting' | 'review' | 'published' | 'archived';
  updated_at: string;
  series_name_cn: string;
  album_name_cn: string;
  content_name_cn: string;
  asset_count_pushed: number;
}

export type ErrorCode =
  | 'INVALID_EMAIL_DOMAIN'
  | 'EMAIL_DOMAIN_NOT_ALLOWED'
  | 'WEAK_PASSWORD'
  | 'DISPLAY_NAME_REQUIRED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'SUPABASE_EMAIL_ERROR'
  | 'INTERNAL_ERROR'
  | 'PAYLOAD_MALFORMED'
  | 'DOMAIN_ALREADY_WHITELISTED'
  | 'ALREADY_REVOKED'
  | 'WITHDRAW_NOT_PERMITTED'
  | 'ALREADY_WITHDRAWN'
  | 'ASSET_WITHDRAWN'
  | 'IDEA_INVALID_TITLE'
  | 'IDEA_INVALID_DESCRIPTION'
  | 'IDEA_NOT_PERMITTED';

export interface TreeEpisode {
  id: string;
  name_cn: string;
  status: 'drafting' | 'review' | 'published' | 'archived';
  updated_at: string;
  episode_path: string;
  asset_count_pushed: number;
}

export interface TreeContent {
  id: string;
  name_cn: string;
  episodes: TreeEpisode[];
}

export interface TreeAlbum {
  id: string;
  name_cn: string;
  contents: TreeContent[];
}

export interface TreeSeries {
  id: string;
  name_cn: string;
  albums: TreeAlbum[];
}

export interface TreeResponse {
  series: TreeSeries[];
}

export interface UsageLogSummary {
  provider: string;
  action: string;
  bytes_transferred?: number | string | null;
  cost_usd?: number | string | null;
  model?: string | null;
  at: string;
}

export interface UsageMeResponse {
  total_usd: number;
  total_bytes: number;
  by_provider: Record<string, { usd: number; bytes: number; count: number }>;
  recent: UsageLogSummary[];
}

export type IdeaStatus = 'pending' | 'accepted' | 'rejected' | 'shipped';

export interface IdeaSummary {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  description: string;
  status: IdeaStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  status_changed_by_name?: string | null;
  is_editable_by_me?: boolean;
}

export interface IdeaReference {
  id: string;
  source: 'douyin' | 'bilibili' | 'youtube' | 'article' | 'other';
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  added_by: 'user' | 'agent';
  added_at: string;
}

export interface IdeasListResult {
  ideas: IdeaSummary[];
  total: number;
  next_cursor: string | null;
}

export interface IdeaDetailResult {
  idea: IdeaSummary;
  references: IdeaReference[];
}

export interface IdeaCreateResult {
  idea: IdeaSummary;
}

export interface IdeaUpdateResult {
  idea: IdeaSummary;
}

export type AssetStage = 'ROUGH' | 'REVIEW' | 'FINAL';
export type AssetSource = 'imported' | 'pasted' | 'ai-generated';

export interface LocalDraft {
  id: string;
  episode_id: string;
  type_code: string;
  name: string;
  variant: string | null;
  number: number | null;
  version: number;
  stage: AssetStage;
  language: string;
  original_filename: string | null;
  final_filename: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  local_file_path: string;
  size_bytes: number;
  mime_type: string;
  source: AssetSource;
  created_at: string;
}

export type CreateLocalDraftInput = Omit<LocalDraft, 'created_at'>;

export interface SandboxDraft {
  id: string;
  title: string;
  body: string;
  kind: string;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  type_code: string;
  name: string;
  variant: string | null;
  version: number;
  stage: AssetStage;
  language: string;
  final_filename: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  pushed_at: string;
  status: 'draft' | 'pushed' | 'superseded';
}

export interface AssetsListResult {
  assets: AssetRow[];
  total: number;
}

export interface PreviewFilenameResult {
  final_filename: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  collision?: unknown;
}

export interface ViewCacheEntry {
  asset_id: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  local_cache_path: string | null;
  last_fetched_at: string | null;
  size_bytes: number | null;
  presigned_url: string | null;
  presigned_expires_at: string | null;
}

export type AssetContentResult =
  | { kind: 'markdown'; content: string; content_type: string | null }
  | { kind: 'url'; url: string; expires_at: string };

export interface AssetPushItem {
  local_draft_id: string;
  episode_id: string;
  type_code: string;
  name?: string;
  variant?: string;
  number?: number;
  version: number;
  stage: AssetStage;
  language: string;
  source: AssetSource;
  original_filename?: string;
  mime_type: string;
  size_bytes: number;
}

export interface AssetPushPayload {
  idempotency_key: string;
  commit_message: string;
  items: AssetPushItem[];
}

export interface AssetPushResult {
  commit_sha?: string;
  assets: Array<{
    local_draft_id: string;
    id?: string;
    storage_backend?: StorageBackend;
    storage_ref?: string;
    final_filename?: string;
    status: 'pushed';
  }>;
}
