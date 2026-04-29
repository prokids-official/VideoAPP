import { useEffect, useState } from 'react';
import { useAuth } from './stores/use-auth';
import { LoginRoute } from './routes/LoginRoute';
import { ShellEmptyRoute } from './routes/ShellEmptyRoute';
import { TreeRoute } from './routes/TreeRoute';
import { api } from './lib/api';
import { TitleBar } from './components/chrome/TitleBar';

export default function App() {
  const { user, loading } = useAuth();
  const [hasProjects, setHasProjects] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await api.tree();
      if (!cancelled) {
        setHasProjects(result.ok && result.data.series.length > 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  let content;

  if (loading) {
    content = (
      <div className="h-full flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading...
      </div>
    );
  } else if (!user) {
    content = <LoginRoute />;
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
        onBrowse={() => setHasProjects(true)}
      />
    );
  } else {
    content = <TreeRoute />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      <TitleBar />
      <div className="flex-1 min-h-0 overflow-hidden">{content}</div>
    </div>
  );
}
