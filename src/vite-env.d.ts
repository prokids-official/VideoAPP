/// <reference types="vite/client" />

interface FableglitchDb {
  sessionGet: (key: string) => Promise<string | null>;
  sessionSet: (key: string, value: string) => Promise<void>;
  sessionDelete: (key: string) => Promise<void>;
  sessionClear: () => Promise<void>;
}

interface FableglitchBridge {
  db: FableglitchDb;
}

declare global {
  interface Window {
    fableglitch: FableglitchBridge;
  }
}

export {};
