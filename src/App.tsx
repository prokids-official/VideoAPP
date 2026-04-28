import { useEffect, useState } from 'react';

export default function App() {
  const [echo, setEcho] = useState<string>('(checking…)');

  useEffect(() => {
    void (async () => {
      try {
        const stamp = `hello-${Date.now()}`;
        await window.fableglitch.db.sessionSet('smoke', stamp);
        const v = await window.fableglitch.db.sessionGet('smoke');
        setEcho(v ?? '(null)');
      } catch (e) {
        setEcho(`error: ${(e as Error).message}`);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold tracking-tight">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">P0-C Task 3 · SQLite IPC</p>
      <div className="mt-6 bg-surface-2 border border-border rounded-lg p-4 max-w-md">
        <div className="text-sm text-text-2 mb-1">SQLite session round-trip:</div>
        <div className="font-mono text-xs text-accent">{echo}</div>
      </div>
    </div>
  );
}
