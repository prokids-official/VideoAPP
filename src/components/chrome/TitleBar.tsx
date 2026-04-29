import { useEffect, useState } from 'react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const controls = window.fableglitch?.window;

  useEffect(() => {
    if (!controls) return;
    void controls.isMaximized().then(setIsMaximized).catch(() => {});
  }, [controls]);

  if (!controls) {
    return <div className="h-9 flex-none bg-bg border-b border-border/70" />;
  }

  return (
    <header className="h-9 flex-none bg-bg border-b border-border/70 flex items-center select-none [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 px-3 min-w-0">
        <div className="w-2.5 h-2.5 rounded-full bg-accent shadow-glow" />
        <div className="text-xs font-semibold tracking-tight text-text-2">FableGlitch Studio</div>
      </div>
      <div className="flex-1" />
      <div className="flex h-full [-webkit-app-region:no-drag]">
        <WindowButton label="Minimize" onClick={() => void controls.minimize()}>
          -
        </WindowButton>
        <WindowButton
          label={isMaximized ? 'Restore' : 'Maximize'}
          onClick={() => {
            void controls.maximizeToggle().then(setIsMaximized);
          }}
        >
          {isMaximized ? '❐' : '□'}
        </WindowButton>
        <WindowButton label="Close" danger onClick={() => void controls.close()}>
          ×
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`w-11 h-full grid place-items-center text-sm transition ${
        danger ? 'text-text-2 hover:bg-bad hover:text-white' : 'text-text-3 hover:bg-surface-2 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
