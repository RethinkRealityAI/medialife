// The experience page (route /). The experience fills the screen; the app's UI is a layer above it with
// pointer-events: none except its own controls. Happi has no talk / chat / voice UI (Dapo, 2026-11-19): everything
// you tap is in the experience's own HUD (bottom dock, Moves, Games). See docs/handoff/app-ui.md for the component map.
import { useEffect, useRef, useState } from 'react';
import './app.css';
import { AppContext, useApp } from './context';
import { AppController } from './controller';
import { createAppStore } from './state/appState';
import { ErrorBoundary } from './ErrorBoundary';
import { PlayBridge } from './components/GamesPanel'; // mini games pause while the sheet is open (games-3)
import { Toast } from './components/Toast';
import { Overlays } from './components/Overlays';
import { useShortcuts } from './hooks/useShortcuts';
import { useViewportVars } from './hooks/useViewportVars';
import type { ThemeToken } from './state/uiConfig';

// Admin colours are snapped to theme tokens; each token has a fill that keeps white (or ink) text readable.
const FILL: Record<ThemeToken, { fill: string; on: string }> = {
  pink: { fill: 'var(--cb-pink-deep)', on: 'var(--cb-white)' },
  purple: { fill: 'var(--cb-purple)', on: 'var(--cb-white)' },
  blue: { fill: 'var(--cb-blue)', on: 'var(--cb-ink)' },
  yellow: { fill: 'var(--cb-yellow)', on: 'var(--cb-ink)' },
  orange: { fill: 'var(--cb-orange)', on: 'var(--cb-ink)' },
  green: { fill: 'var(--cb-green)', on: 'var(--cb-ink)' },
  red: { fill: 'var(--cb-red)', on: 'var(--cb-ink)' },
};

export default function App() {
  const [controller] = useState(() => new AppController(createAppStore()));
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useViewportVars(rootRef);
  useShortcuts(controller);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    document.documentElement.classList.add('cb-app-page');
    if (import.meta.env.DEV) (window as unknown as { __cbApp?: AppController }).__cbApp = controller; // for tests
    void controller.boot(el); // safe to call again after dispose (StrictMode mounts twice in dev)
    return () => {
      document.documentElement.classList.remove('cb-app-page');
      controller.dispose();
    };
  }, [controller]);

  return (
    <AppContext.Provider value={controller}>
      <Shell rootRef={rootRef} stageRef={stageRef} />
    </AppContext.Provider>
  );
}

/**
 * Game chip + toasts, centred under the experience's top bar. It measures itself and tells the experience's hint
 * pill how far to slide down (--cb-top-reserve), so a toast and a hint never sit on top of each other.
 */
function TopSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    let last = -1;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h === last) return;
      last = h;
      if (h > 0) root.style.setProperty('--cb-top-reserve', `${h + 4}px`);
      else root.style.removeProperty('--cb-top-reserve');
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => { ro.disconnect(); root.style.removeProperty('--cb-top-reserve'); };
  }, []);
  return <div ref={ref} className="cb-top-slot"><Toast /></div>;
}

function Shell({ rootRef, stageRef }: { rootRef: React.RefObject<HTMLDivElement | null>; stageRef: React.RefObject<HTMLDivElement | null> }) {
  const started = useApp((s) => s.started);
  const isDesktop = useApp((s) => s.isDesktop);
  const sheetOpen = useApp((s) => s.sheetOpen);
  const colors = useApp((s) => s.ui.colors);
  const style = {
    '--app-primary': FILL[colors.primary].fill,
    '--app-on-primary': FILL[colors.primary].on,
    '--app-secondary': FILL[colors.secondary].fill,
    '--app-accent': FILL[colors.accent].fill,
    '--app-on-accent': FILL[colors.accent].on,
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className="cb-app"
      style={style}
      data-desktop={isDesktop}
      data-side-open={isDesktop && sheetOpen && started}
    >
      <div ref={stageRef} className="cb-stage" data-testid="stage" />
      <ErrorBoundary variant="layer">
        <div className="cb-layer" data-started={started}>
          <div className="cb-layer-stage">
            {started && (
              <>
                <TopSlot />
                <PlayBridge />
              </>
            )}
          </div>
        </div>
        <Overlays />
      </ErrorBoundary>
    </div>
  );
}
