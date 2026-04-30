/// <reference types="vite/client" />

import type {
  ApiResponse,
  AssetContentResult,
  AssetPushItem,
  AssetPushPayload,
  AssetPushResult,
  CreateLocalDraftInput,
  LocalDraft,
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
  saveViewCacheFile: (payload: {
    assetId: string;
    extension: string;
    content: string | ArrayBuffer | Uint8Array | number[];
  }) => Promise<{ path: string; size_bytes: number }>;
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
