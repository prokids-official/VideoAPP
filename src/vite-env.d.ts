/// <reference types="vite/client" />

import type {
  ApiResponse,
  AssetContentResult,
  AssetPushItem,
  AssetPushPayload,
  AssetPushResult,
  CreateLocalDraftInput,
  LocalDraft,
  SandboxDraft,
  StudioAsset,
  StudioProject,
  StudioProjectBundle,
  StudioSizeKind,
  StudioStage,
  StorageBackend,
  ViewCacheEntry,
} from '../shared/types';

interface FileDialogFilter {
  name: string;
  extensions: string[];
}

interface FableglitchDb {
  sessionGet: (key: string) => Promise<string | null>;
  sessionSet: (key: string, value: string) => Promise<void>;
  sessionDelete: (key: string) => Promise<void>;
  sessionClear: () => Promise<void>;
  draftCreate: (draft: CreateLocalDraftInput) => Promise<LocalDraft>;
  draftsList: (episodeId: string) => Promise<LocalDraft[]>;
  draftDelete: (id: string) => Promise<void>;
  sandboxDraftCreate: (input?: { title?: string; body?: string; kind?: string }) => Promise<SandboxDraft>;
  sandboxDraftsList: () => Promise<SandboxDraft[]>;
  sandboxDraftUpdate: (id: string, input: { title?: string; body?: string }) => Promise<SandboxDraft>;
  sandboxDraftDelete: (id: string) => Promise<void>;
  sandboxDraftsClear: () => Promise<void>;
  viewCacheGet: (assetId: string) => Promise<ViewCacheEntry | null>;
  viewCacheSet: (entry: ViewCacheEntry) => Promise<void>;
}

interface FableglitchFs {
  saveDraftFile: (payload: {
    localDraftId: string;
    extension: string;
    content: string | ArrayBuffer | Uint8Array | number[];
  }) => Promise<{ path: string; size_bytes: number }>;
  readDraftFile: (path: string) => Promise<Uint8Array>;
  deleteDraftFile: (localDraftId: string) => Promise<void>;
  openFileDialog: (filters?: FileDialogFilter[]) => Promise<{
    path: string;
    name: string;
    size_bytes: number;
    content: Uint8Array;
  } | null>;
  saveAssetFile: (payload: {
    defaultFilename: string;
    content?: string | ArrayBuffer | Uint8Array | number[];
    url?: string;
  }) => Promise<{ path: string; size_bytes: number } | null>;
  saveViewCacheFile: (payload: {
    assetId: string;
    extension: string;
    content: string | ArrayBuffer | Uint8Array | number[];
  }) => Promise<{ path: string; size_bytes: number }>;
}

interface FableglitchClipboard {
  copyImageFromUrl: (payload: { url: string }) => Promise<{ ok: true }>;
}

interface LiblibBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FableglitchCanvas {
  liblibShow: (input: { url: string; bounds: LiblibBounds }) => Promise<{ ok: true; url: string }>;
  liblibSetBounds: (bounds: LiblibBounds) => Promise<{ ok: true }>;
  liblibHide: () => Promise<{ ok: true }>;
  liblibOpenExternal: (url: string) => Promise<{ ok: true; url: string }>;
}

interface FableglitchStudio {
  projectCreate: (input: {
    name: string;
    size_kind: StudioSizeKind;
    inspiration_text?: string | null;
    current_stage?: StudioStage;
  }) => Promise<StudioProject>;
  projectList: () => Promise<StudioProject[]>;
  projectGet: (id: string) => Promise<StudioProjectBundle | null>;
  projectUpdate: (
    id: string,
    patch: Partial<Pick<StudioProject, 'name' | 'size_kind' | 'inspiration_text' | 'current_stage'>>,
  ) => Promise<StudioProject>;
  projectDelete: (id: string) => Promise<void>;
  assetSave: (input: Partial<StudioAsset> & Pick<StudioAsset, 'project_id' | 'type_code' | 'name'>) => Promise<StudioAsset>;
  assetList: (projectId: string, typeCode?: string | null) => Promise<StudioAsset[]>;
  assetDelete: (id: string) => Promise<void>;
  assetWriteFile: (id: string, content: string | ArrayBuffer | Uint8Array | number[]) => Promise<{
    path: string;
    size_bytes: number;
  }>;
  assetReadFile: (id: string) => Promise<Uint8Array>;
  stageSave: (projectId: string, stage: StudioStage, stateJson: string) => Promise<void>;
  stageGet: (projectId: string, stage: StudioStage) => Promise<string | null>;
}

interface FableglitchNet {
  request: (payload: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    requireAuth?: boolean;
  }) => Promise<{ status: number; body: ApiResponse<unknown> | null }>;
  assetContent: (payload: {
    assetId: string;
    storageBackend: StorageBackend;
  }) => Promise<{ status: number; body: ApiResponse<AssetContentResult> | null }>;
  assetPush: (payload: {
    payload: AssetPushPayload;
    items: AssetPushItem[];
    files: Record<string, ArrayBuffer>;
  }) => Promise<{ status: number; body: ApiResponse<AssetPushResult> | null; retryAfter?: number | null }>;
}

interface FableglitchSession {
  has: () => Promise<boolean>;
  clear: () => Promise<void>;
}

interface FableglitchWindow {
  minimize: () => Promise<void>;
  maximizeToggle: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

interface FableglitchBridge {
  db: FableglitchDb;
  fs: FableglitchFs;
  clipboard: FableglitchClipboard;
  canvas: FableglitchCanvas;
  studio: FableglitchStudio;
  net: FableglitchNet;
  session: FableglitchSession;
  window: FableglitchWindow;
}

declare global {
  interface Window {
    fableglitch: FableglitchBridge;
  }
}

export {};
