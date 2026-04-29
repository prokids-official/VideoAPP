import { useEffect, useState } from 'react';
import { useAuth } from './stores/use-auth';
import { LoginRoute } from './routes/LoginRoute';
import { ShellEmptyRoute } from './routes/ShellEmptyRoute';
import { TreeRoute } from './routes/TreeRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { api } from './lib/api';
import { TitleBar } from './components/chrome/TitleBar';

export default function App() {
  const { user, loading } = useAuth();
  const [projectState, setProjectState] = useState<{ userId: string; hasProjects: boolean } | null>(null);
  const [route, setRoute] = useState<'studio' | 'settings'>('studio');

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    const userId = user.id;

    void (async () => {
      const result = await api.tree();
      if (!cancelled) {
        setProjectState({ userId, hasProjects: result.ok && result.data.series.length > 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasProjects = user && projectState?.userId === user.id ? projectState.hasProjects : null;
  const activeRoute = user ? route : 'studio';
  let content;

  if (loading) {
    content = (
      <div className="h-full flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading...
      </div>
    );
  } else if (!user) {
    content = <LoginRoute />;
  } else if (activeRoute === 'settings') {
    content = <SettingsRoute onBack={() => setRoute('studio')} />;
  } else if (hasProjects === null) {
    content = (
      <div className="h-full flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        fetching tree...
      </div>
    );
  } else if (!hasProjects) {
    content = (
      <ShellEmptyRoute
        onCreateEpisode={() => {
          window.alert('新建剧集 wizard - P0-D 实现');
        }}
        onBrowse={() => setProjectState({ userId: user.id, hasProjects: true })}
        onOpenSettings={() => setRoute('settings')}
      />
    );
  } else {
    content = <TreeRoute onOpenSettings={() => setRoute('settings')} />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      <TitleBar />
      <div className="flex-1 min-h-0 overflow-hidden">{content}</div>
    </div>
  );
}
