export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold tracking-tight">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">tailwind verified · P0-C Task 2</p>
      <div className="mt-6 flex gap-3">
        <div className="w-12 h-12 rounded-lg bg-surface border border-border" />
        <div className="w-12 h-12 rounded-lg bg-surface-2 border border-border" />
        <div className="w-12 h-12 rounded-lg bg-surface-3 border border-border-hi" />
        <div className="w-12 h-12 rounded-lg bg-gradient-brand shadow-glow" />
      </div>
      <div className="mt-4 flex gap-2 items-center">
        <span className="w-2 h-2 rounded-full bg-good" />
        <span className="text-sm text-text-2">已入库</span>
        <span className="w-2 h-2 rounded-full bg-warn ml-4" />
        <span className="text-sm text-text-2">草稿</span>
        <span className="w-2 h-2 rounded-full bg-bad ml-4" />
        <span className="text-sm text-text-2">错误</span>
      </div>
    </div>
  );
}
