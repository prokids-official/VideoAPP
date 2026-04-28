/// <reference types="vite/client" />

import type { ApiResponse } from '../shared/types';

interface FableglitchDb {
  sessionGet: (key: string) => Promise<string | null>;
  sessionSet: (key: string, value: string) => Promise<void>;
  sessionDelete: (key: string) => Promise<void>;
  sessionClear: () => Promise<void>;
}

interface FableglitchNet {
  request: (payload: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    requireAuth?: boolean;
  }) => Promise<{ status: number; body: ApiResponse<unknown> | null }>;
}

interface FableglitchSession {
  has: () => Promise<boolean>;
  clear: () => Promise<void>;
}

interface FableglitchBridge {
  db: FableglitchDb;
  net: FableglitchNet;
  session: FableglitchSession;
}

declare global {
  interface Window {
    fableglitch: FableglitchBridge;
  }
}

export {};
