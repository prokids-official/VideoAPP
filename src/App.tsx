import { useEffect, useState } from 'react';

export default function App() {
  const [sqlite, setSqlite] = useState<string>('(checking…)');
  const [api, setApi] = useState<string>('(idle)');

  useEffect(() => {
    void (async () => {
      try {
        const stamp = `hello-${Date.now()}`;
        await window.fableglitch.db.sessionSet('smoke', stamp);
        const v = await window.fableglitch.db.sessionGet('smoke');
        setSqlite(v ?? '(null)');
      } catch (e) {
        setSqlite(`error: ${(e as Error).message}`);
      }
    })();
  }, []);

  async function pingBackend() {
    setApi('(calling…)');
    const r = await window.fableglitch.net.request({
      method: 'GET',
      path: '/auth/me',
      requireAuth: false,
    });
    setApi(`status=${r.status} body=${JSON.stringify(r.body)}`);
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold tracking-tight">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">P0-C Task 4 · API client wired</p>

      <div className="mt-6 bg-surface-2 border border-border rounded-lg p-4 max-w-2xl">
        <div className="text-sm text-text-2 mb-1">SQLite session round-trip:</div>
        <div className="font-mono text-xs text-accent break-all">{sqlite}</div>
      </div>

      <div className="mt-3 bg-surface-2 border border-border rounded-lg p-4 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-sm text-text-2">Backend ping:</div>
          <button
            onClick={pingBackend}
            className="px-3 h-8 text-sm rounded bg-surface-3 border border-border hover:border-border-hi text-text-2 hover:text-text transition cursor-pointer"
          >
            GET /auth/me
          </button>
        </div>
        <div className="font-mono text-xs text-text-3 break-all">{api}</div>
        <div className="font-mono text-2xs text-text-4 mt-2">
          expected: status=401 (because no token)
        </div>
      </div>
    </div>
  );
}
