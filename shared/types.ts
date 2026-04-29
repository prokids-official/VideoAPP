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

export type ErrorCode =
  | 'INVALID_EMAIL_DOMAIN'
  | 'WEAK_PASSWORD'
  | 'DISPLAY_NAME_REQUIRED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'PAYLOAD_MALFORMED';
