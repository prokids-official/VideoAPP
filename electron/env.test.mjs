import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './env.mjs';

describe('Electron API environment', () => {
  it('defaults packaged app builds to the production API when no env file is bundled', () => {
    expect(resolveApiBaseUrl({}, { isDevServer: false })).toBe('https://video-app-kappa-murex.vercel.app/api');
  });

  it('keeps local API default for Vite/Electron dev sessions', () => {
    expect(resolveApiBaseUrl({}, { isDevServer: true })).toBe('http://localhost:3001/api');
  });

  it('lets FG_API_BASE_URL override the default API target', () => {
    expect(resolveApiBaseUrl({ FG_API_BASE_URL: 'https://example.test/api' }, { isDevServer: false }))
      .toBe('https://example.test/api');
  });
});
