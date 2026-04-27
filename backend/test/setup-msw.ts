import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const mswServer = setupServer(
  http.get('https://api.github.com/repos/:owner/:repo/git/refs/heads/main', () =>
    HttpResponse.json({ object: { sha: 'mock-head-sha' } }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
