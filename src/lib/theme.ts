import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'fableglitch.theme';
const ATTR = 'data-theme';

function readStored(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(ATTR, theme);
}

/**
 * Apply the persisted theme to <html> as early as possible, ideally before the React
 * tree mounts so users never see a wrong-theme flash on first paint.
 *
 * Call this once from src/main.tsx before ReactDOM.render — or, if you forget,
 * useTheme() will apply it on its first effect.
 */
export function bootstrapTheme(): Theme {
  const theme = readStored();
  applyToDocument(theme);
  return theme;
}

/**
 * React hook providing the current theme + setters. Reads / writes localStorage
 * and reflects to <html data-theme="...">.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    applyToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage might be unavailable in some sandbox contexts; ignore */
    }
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
