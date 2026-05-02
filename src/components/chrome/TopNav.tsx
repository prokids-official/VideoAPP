import { useState } from 'react';
import { useAuth } from '../../stores/use-auth';

export function TopNav({
  onOpenSettings,
  onBackHome,
}: {
  onOpenSettings?: () => void;
  onBackHome?: () => void;
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return null;
  }

  const initial = (user.display_name?.charAt(0) || user.email.charAt(0)).toUpperCase();

  return (
    <nav className="h-14 flex-none border-b border-border bg-surface flex items-center px-6 gap-6">
      <div className="text-md font-bold tracking-tight bg-gradient-brand bg-clip-text text-transparent">
        FableGlitch
      </div>
      {onBackHome && (
        <button
          type="button"
          aria-label="返回主页"
          onClick={onBackHome}
          className="h-9 rounded-full border border-border bg-surface-2 px-4 text-sm font-semibold text-text-2 transition hover:border-border-hi hover:bg-surface-3 hover:text-text active:translate-y-px"
        >
          ← 主页
        </button>
      )}
      <div className="flex-1" />
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2.5 py-1.5 pr-2.5 pl-1.5 rounded-full hover:bg-surface-2 transition"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-semibold">
            {initial}
          </div>
          <div className="font-mono text-xs text-text-2">{user.display_name}</div>
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-48 bg-surface-2 border border-border rounded-lg overflow-hidden shadow-lg z-50"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="px-3 py-2 border-b border-border">
              <div className="text-sm">{user.display_name}</div>
              <div className="font-mono text-xs text-text-3 truncate">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings?.();
              }}
              className="block w-full text-left px-3 py-2 text-sm text-text-2 hover:bg-surface-3 hover:text-text transition"
            >
              设置
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void logout();
              }}
              className="block w-full text-left px-3 py-2 text-sm text-text-2 hover:bg-surface-3 hover:text-text transition"
            >
              退出登录
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
