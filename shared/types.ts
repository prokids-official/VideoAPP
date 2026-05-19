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

export interface SkillCatalogItem {
  id: string;
  name_cn: string;
  category: string;
  default_model: string;
  version: number;
  description: string;
}

export interface SkillsListResult {
  skills: SkillCatalogItem[];
}

export interface SkillDetailItem extends SkillCatalogItem {
  body: string;
  filename: 'SKILL.md';
}

export interface SkillDetailResult {
  skill: SkillDetailItem;
}

export interface SkillCreatePayload {
  id?: string;
  name_cn: string;
  category: string;
  description: string;
  body: string;
  default_model?: string;
}

export interface SkillCreateResult {
  skill: SkillCatalogItem;
}

export type OfficialDeepSeekModel = 'deepseek-v4-flash' | 'deepseek-v4-pro';
export type OfficialCodingPlanVisionModel = 'qwen3.6-plus' | 'qwen3.5-plus';
export type AIProviderMode = 'official-deepseek' | 'custom-openai-compatible';

export interface AIProviderConfigInput {
  mode: AIProviderMode;
  model: OfficialDeepSeekModel | string;
  base_url?: string;
  api_key?: string;
}

export interface AIProviderTestPayload {
  provider_config: AIProviderConfigInput;
}

export interface AIProviderTestResult {
  provider: 'deepseek' | 'custom-openai-compatible';
  model: string;
  ok: true;
  content: string;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

export type AgentMessageRole = 'system' | 'user' | 'assistant';

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

export type ScriptWriterMode = 'from-scratch' | 'optimize-existing' | 'import-existing';

export interface ScriptWriterRunInput {
  project_name: string;
  mode: ScriptWriterMode;
  duration_sec: number;
  style_hint: string;
  revision_instruction?: string;
  inspiration_text: string;
  existing_script: string;
}

export interface ScriptWriterRunPayload {
  skill_id: string;
  dry_run: boolean;
  provider_config?: AIProviderConfigInput;
  input: ScriptWriterRunInput;
}

export interface ScriptWriterRunResult {
  run: {
    status: 'dry-run' | 'completed';
    provider: string;
    model: string;
    skill: Pick<SkillCatalogItem, 'id' | 'name_cn' | 'category' | 'version'>;
    messages: AgentMessage[];
    content?: string;
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    };
  };
}

export interface StoryboardRunInput {
  project_name: string;
  duration_sec: number;
  style_hint: string;
  script_markdown: string;
}

export interface StoryboardRunPayload {
  skill_id: string;
  provider_config?: AIProviderConfigInput;
  input: StoryboardRunInput;
}

export interface StoryboardUnitOutput {
  number: number;
  summary: string;
  duration_s: number;
}

export interface StoryboardRunResult {
  run: {
    status: 'completed';
    provider: string;
    model: string;
    skill: Pick<SkillCatalogItem, 'id' | 'name_cn' | 'category' | 'version'>;
    messages: AgentMessage[];
    units: StoryboardUnitOutput[];
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    };
  };
}

export interface PromptImageStoryboardUnitInput {
  asset_id: string;
  number: number;
  summary: string;
  duration_s: number;
}

export interface PromptImageRunInput {
  project_name: string;
  style_hint: string;
  storyboard_units: PromptImageStoryboardUnitInput[];
}

export interface PromptImageRunPayload {
  skill_id: string;
  provider_config?: AIProviderConfigInput;
  input: PromptImageRunInput;
}

export interface PromptImageOutput {
  storyboard_asset_id: string;
  storyboard_number: number;
  prompt_text: string;
}

export interface PromptImageRunResult {
  run: {
    status: 'completed';
    provider: string;
    model: string;
    skill: Pick<SkillCatalogItem, 'id' | 'name_cn' | 'category' | 'version'>;
    messages: AgentMessage[];
    prompts: PromptImageOutput[];
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    };
  };
}

export interface PromptVideoStoryboardUnitInput {
  asset_id: string;
  number: number;
  summary: string;
  duration_s: number;
  image_prompt: string;
}

export interface PromptVideoRunInput {
  project_name: string;
  style_hint: string;
  storyboard_units: PromptVideoStoryboardUnitInput[];
}

export interface PromptVideoRunPayload {
  skill_id: string;
  provider_config?: AIProviderConfigInput;
  input: PromptVideoRunInput;
}

export interface PromptVideoOutput {
  storyboard_asset_id: string;
  storyboard_number: number;
  prompt_text: string;
}

export interface PromptVideoRunResult {
  run: {
    status: 'completed';
    provider: string;
    model: string;
    skill: Pick<SkillCatalogItem, 'id' | 'name_cn' | 'category' | 'version'>;
    messages: AgentMessage[];
    prompts: PromptVideoOutput[];
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    };
  };
}

export interface VisionBriefImageInput {
  url: string;
  label?: string;
}

export interface VisionBriefRunInput {
  prompt?: string;
  images: VisionBriefImageInput[];
}

export interface VisionBriefRunPayload {
  skill_id: string;
  input: VisionBriefRunInput;
}

export interface VisionBriefRunResult {
  run: {
    status: 'completed';
    provider: 'codingplan';
    model: OfficialCodingPlanVisionModel;
    skill: Pick<SkillCatalogItem, 'id' | 'name_cn' | 'category' | 'version'>;
    brief: string;
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    };
  };
}

export interface AssetLibraryCharacterOutput {
  name: string;
  variant?: string | null;
  appearance?: string;
  clothing?: string;
  personality?: string;
  palette?: string;
  visual_anchor?: string;
  ai_prompt?: string;
}

export interface AssetLibrarySceneOutput {
  name: string;
  variant?: string | null;
  atmosphere?: string;
  materials?: string;
  landmarks?: string;
  color_temperature?: string;
  visual_anchor?: string;
  ai_prompt?: string;
}

export interface AssetLibraryPropOutput {
  name: string;
  variant?: string | null;
  description?: string;
  visual_anchor?: string;
  ai_prompt?: string;
}

export interface AssetLibraryOutputs {
  characters: AssetLibraryCharacterOutput[];
  scenes: AssetLibrarySceneOutput[];
  props: AssetLibraryPropOutput[];
}

export interface AssetLibraryStoryboardUnitInput {
  number: number;
  summary: string;
  duration_s: number;
}

export interface AssetLibraryRunInput {
  project_name: string;
  style_hint: string;
  inspiration_text: string;
  script_markdown: string;
  storyboard_units: AssetLibraryStoryboardUnitInput[];
}

export interface AssetLibraryRunPayload {
  skill_id: string;
  provider_config?: AIProviderConfigInput;
  input: AssetLibraryRunInput;
}

export interface AssetLibraryRunResult {
  run: {
    status: 'completed';
    provider: string;
    model: string;
    skill: Pick<SkillCatalogItem, 'id' | 'name_cn' | 'category' | 'version'>;
    messages: AgentMessage[];
    assets: AssetLibraryOutputs;
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    };
  };
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
export type AssetSource = 'imported' | 'pasted' | 'ai-generated' | 'studio-export';
export type AssetRelationType = 'generated_from_prompt' | 'derived_from_storyboard';

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
  metadata_json?: string | null;
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

export type StudioSizeKind = 'short' | 'shorts' | 'feature' | 'unknown';

export type StudioStage =
  | 'inspiration'
  | 'script'
  | 'character'
  | 'scene'
  | 'prop'
  | 'storyboard'
  | 'prompt-img'
  | 'prompt-vid'
  | 'canvas'
  | 'export';

export interface StudioAgentRunSummary {
  id: string;
  stage: StudioStage;
  skill_id: string;
  skill_name_cn: string;
  provider: string;
  model: string;
  status: 'completed';
  output_count: number;
  created_at: number;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

export interface StudioProject {
  id: string;
  name: string;
  size_kind: StudioSizeKind;
  inspiration_text: string | null;
  current_stage: StudioStage;
  owner_id: string;
  created_at: number;
  updated_at: number;
}

export interface StudioAsset {
  id: string;
  project_id: string;
  type_code: string;
  name: string;
  variant: string | null;
  version: number;
  meta_json: string;
  content_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  pushed_to_episode_id: string | null;
  pushed_at: number | null;
  created_at: number;
  updated_at: number;
}

export type StudioGeneratedKind = 'image' | 'video';

export interface StudioPromptAssetMeta {
  storyboard_asset_id: string;
  storyboard_number: number;
  storyboard_summary: string;
  prompt_text: string;
}

export interface StudioGeneratedAssetMeta {
  source_prompt_asset_id?: string;
  storyboard_asset_id?: string;
  storyboard_number?: number;
  prompt_text?: string;
  generation_kind?: StudioGeneratedKind;
  provider?: string;
  model?: string;
}

export interface StudioProjectBundle {
  project: StudioProject;
  assets: StudioAsset[];
  stage_state: Partial<Record<StudioStage, string>>;
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
  storage_metadata?: Record<string, unknown> | null;
  pushed_at: string;
  status: 'draft' | 'pushed' | 'superseded';
}

export interface AssetsListResult {
  assets: AssetRow[];
  total: number;
}

export interface AssetMetadataUpdatePayload {
  storage_metadata: {
    ai_prompt?: string | null;
  };
}

export interface AssetMetadataUpdateResult {
  asset: AssetRow;
}

export interface AssetRelationAsset {
  id: string;
  type_code: string;
  name: string;
  final_filename: string;
  storage_backend: StorageBackend;
  storage_ref: string;
  mime_type: string | null;
}

export interface AssetRelationDetail {
  id: string;
  relation_type: AssetRelationType;
  metadata: Record<string, unknown>;
  created_at: string;
  asset: AssetRelationAsset;
}

export interface AssetRelationsResult {
  asset_id: string;
  outgoing: AssetRelationDetail[];
  incoming: AssetRelationDetail[];
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
  metadata?: Record<string, unknown>;
  relations?: Array<{
    relation_type: AssetRelationType;
    target_local_draft_id: string;
    metadata?: Record<string, unknown>;
  }>;
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
