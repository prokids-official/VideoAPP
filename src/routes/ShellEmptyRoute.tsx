import { useState } from 'react';
import { TopNav } from '../components/chrome/TopNav';
import { ProjectTree } from '../components/chrome/ProjectTree';
import { FirstRunModal } from '../components/modals/FirstRunModal';
import { Button } from '../components/ui/Button';

export function ShellEmptyRoute({
  onCreateEpisode,
  onBrowse,
  onOpenSettings,
}: {
  onCreateEpisode: () => void;
  onBrowse: () => void;
  onOpenSettings: () => void;
}) {
  const [showFirstRun, setShowFirstRun] = useState(true);

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopNav onOpenSettings={onOpenSettings} />
      <div className="flex-1 flex overflow-hidden">
        <ProjectTree series={[]} selectedEpisodeId={null} onSelectEpisode={() => {}} />
        <main className="flex-1 flex items-center justify-center px-6 relative">
          <div className="fixed inset-x-0 bottom-0 h-60 pointer-events-none bg-[radial-gradient(ellipse_at_50%_100%,rgba(155,124,255,0.08),transparent_60%)]" />
          <div className="max-w-[640px] text-center relative">
            <div className="text-4xl font-bold tracking-tight mb-4">欢迎来到 FableGlitch</div>
            <p className="font-mono text-sm text-text-3 mb-12">looks like it's your first time here · 看起来是你第一次使用</p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" size="lg" onClick={onBrowse}>
                浏览全公司项目树
              </Button>
              <Button variant="gradient" size="lg" onClick={onCreateEpisode}>
                + 新建我的第一个剧集
              </Button>
            </div>
          </div>
        </main>
      </div>
      <FirstRunModal
        open={showFirstRun}
        onClose={() => setShowFirstRun(false)}
        onCreate={() => {
          setShowFirstRun(false);
          onCreateEpisode();
        }}
        onBrowse={() => {
          setShowFirstRun(false);
          onBrowse();
        }}
      />
    </div>
  );
}
