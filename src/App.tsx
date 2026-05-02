import { useState } from 'react';
import { useAuth } from './stores/use-auth';
import { LoginRoute } from './routes/LoginRoute';
import { HomeRoute } from './routes/HomeRoute';
import { IdeasRoute } from './routes/IdeasRoute';
import { SandboxRoute } from './routes/SandboxRoute';
import { TreeRoute } from './routes/TreeRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { PushReviewRoute } from './routes/PushReviewRoute';
import { api } from './lib/api';
import { TitleBar } from './components/chrome/TitleBar';
import { EpisodeWizard } from './components/wizards/EpisodeWizard';
import { NewIdeaDialog } from './components/ideas/NewIdeaDialog';
import type { IdeaSummary } from '../shared/types';

type AppRoute = 'home' | 'studio' | 'sandbox' | 'ideas' | 'settings' | 'push-review';

export default function App() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('home');
  const [pushReviewEpisode, setPushReviewEpisode] = useState<{ id: string; name: string } | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [episodeWizardOpen, setEpisodeWizardOpen] = useState(false);
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [treeReloadKey, setTreeReloadKey] = useState(0);
  const [ideasReloadKey, setIdeasReloadKey] = useState(0);

  const activeRoute = user ? route : 'studio';

  async function createEpisode(input: {
    series_name_cn: string;
    album_name_cn: string;
    content_name_cn: string;
    episode_name_cn: string;
  }) {
    const result = await api.createEpisode(input);
    if (!result.ok) {
      throw new Error(result.message);
    }
    return { id: result.data.episode.id };
  }

  function handleEpisodeCreated(episodeId: string) {
    if (!user) {
      return;
    }
    setEpisodeWizardOpen(false);
    setRoute('studio');
    setSelectedEpisodeId(episodeId);
    setTreeReloadKey((value) => value + 1);
  }

  function openPushReview(episode: { id: string; name: string }) {
    setPushReviewEpisode(episode);
    setRoute('push-review');
    window.history.pushState({}, '', `/episode/${episode.id}/push-review`);
  }

  function closePushReview() {
    setRoute('studio');
    window.history.pushState({}, '', '/');
  }

  function handleAssetsPushed(count: number) {
    setRoute('studio');
    setSuccessToast(`✓ ${count} 项资产已入库`);
    setTreeReloadKey((value) => value + 1);
    window.history.pushState({}, '', '/');
    window.setTimeout(() => setSuccessToast(null), 3_000);
  }

  function handleIdeaCreated(idea: IdeaSummary) {
    setIdeasReloadKey((value) => value + 1);
    setSuccessToast(`✓ 已发布想法：${idea.title}`);
    window.setTimeout(() => setSuccessToast(null), 3_000);
  }

  let content;
  const subtitle = user ? routeSubtitle(activeRoute) : undefined;

  if (loading) {
    content = (
      <div className="h-full flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading...
      </div>
    );
  } else if (!user) {
    content = <LoginRoute />;
  } else if (activeRoute === 'settings') {
    content = <SettingsRoute onBack={() => setRoute('home')} />;
  } else if (activeRoute === 'push-review' && pushReviewEpisode) {
    content = (
      <PushReviewRoute
        episodeId={pushReviewEpisode.id}
        episodeName={pushReviewEpisode.name}
        onBack={closePushReview}
        onOpenSettings={() => setRoute('settings')}
        onPushed={handleAssetsPushed}
      />
    );
  } else if (activeRoute === 'home') {
    content = (
      <HomeRoute
        user={user}
        onOpenTree={() => setRoute('studio')}
        onOpenSandbox={() => setRoute('sandbox')}
        onOpenIdeas={() => setRoute('ideas')}
        onOpenSettings={() => setRoute('settings')}
        onCreateEpisode={() => setEpisodeWizardOpen(true)}
      />
    );
  } else if (activeRoute === 'sandbox') {
    content = <SandboxRoute onBack={() => setRoute('home')} />;
  } else if (activeRoute === 'ideas') {
    content = (
      <IdeasRoute
        user={user}
        reloadKey={ideasReloadKey}
        onBack={() => setRoute('home')}
        onCreateIdea={() => setIdeaDialogOpen(true)}
      />
    );
  } else {
    content = (
      <TreeRoute
        selectedEpisodeId={selectedEpisodeId}
        reloadKey={treeReloadKey}
        onSelectEpisode={setSelectedEpisodeId}
        onCreateEpisode={() => setEpisodeWizardOpen(true)}
        onOpenSettings={() => setRoute('settings')}
        onOpenPushReview={openPushReview}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      <TitleBar subtitle={subtitle} onQuickIdea={user ? () => setIdeaDialogOpen(true) : undefined} />
      <div className="flex-1 min-h-0 overflow-hidden">{content}</div>
      {successToast && (
        <div
          role="status"
          className="fixed left-1/2 top-12 z-50 -translate-x-1/2 rounded-full bg-gradient-brand px-4 py-2 font-mono text-xs font-semibold text-white shadow-glow"
        >
          {successToast}
        </div>
      )}
      {user && (
        <EpisodeWizard
          open={episodeWizardOpen}
          onClose={() => setEpisodeWizardOpen(false)}
          onCreate={createEpisode}
          onCreated={handleEpisodeCreated}
        />
      )}
      {user && (
        <NewIdeaDialog
          open={ideaDialogOpen}
          user={user}
          onClose={() => setIdeaDialogOpen(false)}
          onCreated={handleIdeaCreated}
        />
      )}
    </div>
  );
}

function routeSubtitle(route: AppRoute) {
  switch (route) {
    case 'home':
      return '主页';
    case 'sandbox':
      return '个人沙盒';
    case 'ideas':
      return '芝兰点子王';
    case 'settings':
      return '设置';
    case 'push-review':
      return '入库确认';
    case 'studio':
      return '公司项目';
  }
}
