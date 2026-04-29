import { useEffect, useState } from 'react';
import { useAuth } from './stores/use-auth';
import { LoginRoute } from './routes/LoginRoute';
import { ShellEmptyRoute } from './routes/ShellEmptyRoute';
import { TreeRoute } from './routes/TreeRoute';
import { api } from './lib/api';

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading...
      </div>
    );
  }

  if (!user) {
    return <LoginRoute />;
  }

  if (hasProjects === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        fetching tree...
      </div>
    );
  }

  if (!hasProjects) {
    return (
      <ShellEmptyRoute
        onCreateEpisode={() => {
          window.alert('新建剧集 wizard - P0-D 实现');
        }}
        onBrowse={() => setHasProjects(true)}
      />
    );
  }

  return <TreeRoute />;
}
