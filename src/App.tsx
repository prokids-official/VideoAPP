import { useAuth } from './stores/auth-context';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold tracking-tight">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">P0-C Task 5 · AuthContext</p>

      <div className="mt-6 bg-surface-2 border border-border rounded-lg p-4 max-w-2xl">
        <div className="text-sm text-text-2 mb-2">Auth state:</div>
        {user ? (
          <div>
            <div className="text-md mb-1">{user.display_name}</div>
            <div className="font-mono text-xs text-text-3 mb-3">
              {user.email} · role={user.role} · team={user.team ?? '(none)'}
            </div>
            <button
              onClick={logout}
              className="px-3 h-8 text-sm rounded bg-surface-3 border border-border hover:border-border-hi text-text-2 hover:text-text transition cursor-pointer"
            >
              退出登录
            </button>
          </div>
        ) : (
          <div className="font-mono text-xs text-text-3">
            (no user — LoginRoute will mount here in Task 7)
          </div>
        )}
      </div>
    </div>
  );
}
