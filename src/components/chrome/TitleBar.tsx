import { useEffect, useState } from 'react';
import { useTheme, type Theme } from '../../lib/theme';

/**
 * macOS-style title bar for the Electron shell:
 *   [● ● ●]   FableGlitch Studio   [☀ Light | ☾ Dark]
 *
 * Traffic lights are on the LEFT (close / minimize / maximize toggle), brand text
 * is centered, and the theme switcher sits on the right. The whole bar acts as a
 * window drag region (-webkit-app-region:drag) except for the interactive areas
 * which opt out via [-webkit-app-region:no-drag].
 *
 * Window control IPC is already wired in electron/main.mjs + electron/preload.cjs;
 * we just consume window.fableglitch.window.{minimize,maximizeToggle,close,isMaximized}.
 */
export function TitleBar({ subtitle, onQuickIdea }: { subtitle?: string; onQuickIdea?: () => void } = {}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const controls = window.fableglitch?.window;
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!controls) return;
    void controls.isMaximized().then(setIsMaximized).catch(() => {});
  }, [controls]);

  // Browser preview / dev fallback: still render a slim drag-disabled bar so the
  // layout doesn't jump, but skip the controls.
  if (!controls) {
    return (
      <header className="h-10 flex-none border-b border-border/60 bg-bg flex items-center justify-center">
        <span className="text-2xs font-mono text-text-4 select-none">
          FableGlitch Studio · browser preview
        </span>
      </header>
    );
  }

  return (
    <header
      className="h-10 flex-none bg-bg/95 backdrop-blur border-b border-border/60 flex items-center select-none [-webkit-app-region:drag]"
    >
      {/* ─────────── traffic lights (left) ─────────── */}
      <div className="group/tl flex items-center gap-2 pl-3 pr-4 [-webkit-app-region:no-drag]">
        <TrafficLight color="close" onClick={() => void controls.close()} />
        <TrafficLight color="min" onClick={() => void controls.minimize()} />
        <TrafficLight
          color="max"
          maximized={isMaximized}
          onClick={() => void controls.maximizeToggle().then(setIsMaximized)}
        />
      </div>

      {/* ─────────── brand (center) ─────────── */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-4">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-tight text-text-2 truncate">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          <span>FableGlitch Studio</span>
          {subtitle && (
            <>
              <span className="text-text-4 font-normal">·</span>
              <span className="text-text-3 font-normal truncate max-w-xs">{subtitle}</span>
            </>
          )}
        </div>
      </div>

      {/* ─────────── theme switcher (right) ─────────── */}
      <div className="flex items-center gap-2 pr-3 [-webkit-app-region:no-drag]">
        {onQuickIdea && (
          <button
            type="button"
            aria-label="快速发布新想法"
            title="快速发布新想法"
            onClick={onQuickIdea}
            className="grid h-7 w-8 place-items-center rounded-md border border-border bg-surface-2 text-[14px] text-text transition hover:border-border-hi hover:bg-surface-3 active:translate-y-px"
          >
            <span aria-hidden="true">💡</span>
          </button>
        )}
        <ThemeSegmented theme={theme} onChange={setTheme} />
      </div>
    </header>
  );
}

/* ───────────────────────── traffic light ───────────────────────── */

const TRAFFIC_PALETTE = {
  close: { bg: '#ff5f57', glyph: '×' },     // ×
  min:   { bg: '#febc2e', glyph: '−' },     // −
  max:   { bg: '#28c840', glyph: '+' },
} as const;

function TrafficLight({
  color,
  maximized = false,
  onClick,
}: {
  color: keyof typeof TRAFFIC_PALETTE;
  maximized?: boolean;
  onClick: () => void;
}) {
  const palette = TRAFFIC_PALETTE[color];
  const label =
    color === 'close' ? 'Close' : color === 'min' ? 'Minimize' : maximized ? 'Restore' : 'Maximize';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ backgroundColor: palette.bg }}
      className="relative w-3 h-3 rounded-full grid place-items-center transition active:scale-95 hover:brightness-105"
    >
      <span
        className="text-[9px] leading-none font-bold text-black/55 opacity-0 group-hover/tl:opacity-100 transition-opacity"
        aria-hidden="true"
      >
        {palette.glyph}
      </span>
    </button>
  );
}

/* ───────────────────────── theme segmented ───────────────────────── */

function ThemeSegmented({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (next: Theme) => void;
}) {
  return (
    <div
      role="group"
      aria-label="主题"
      className="flex items-center gap-0.5 p-0.5 rounded-md bg-surface-2/80 border border-border/60"
    >
      <ThemeOption
        active={theme === 'light'}
        onClick={() => onChange('light')}
        glyph="☀"
        label="Light"
      />
      <ThemeOption
        active={theme === 'dark'}
        onClick={() => onChange('dark')}
        glyph="☾"
        label="Dark"
      />
    </div>
  );
}

function ThemeOption({
  active,
  onClick,
  glyph,
  label,
}: {
  active: boolean;
  onClick: () => void;
  glyph: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-medium tracking-tight transition-colors ${
        active
          ? 'bg-accent text-white shadow-sm'
          : 'text-text-3 hover:text-text-2'
      }`}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {glyph}
      </span>
      <span>{label}</span>
    </button>
  );
}
