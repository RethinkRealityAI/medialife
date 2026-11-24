// The experience page. The experience fills the screen and owns the splash, top bar, mode tabs and in-camera HUD;
// the app layer above it (pointer-events: none except its own controls) adds toasts and Bobo's Arcade, the sheet
// with every EVADE game and experience. Bobo has no talk / chat / voice UI (EVADE: no voice, no AI).
import { useEffect, useRef, useState } from 'react';
import './app.css';
import { AppContext, useApp } from './context';
import { AppController } from './controller';
import { createAppStore } from './state/appState';
import { ErrorBoundary } from './ErrorBoundary';
import { PlayBridge } from './components/PlayBridge';
import { ArcadeSheet } from './components/ArcadeSheet';
import { Toast } from './components/Toast';
import { useShortcuts } from './hooks/useShortcuts';
import { useViewportVars } from './hooks/useViewportVars';

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
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) (window as unknown as { __evApp?: AppController }).__evApp = controller; // tests
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
 * Toasts, centred under the experience's top bar. It measures itself and tells the experience's hint pill how far to
 * slide down (--cb-top-reserve), so a toast and a hint never sit on top of each other.
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
  return (
    <div ref={rootRef} className="cb-app" data-desktop={isDesktop}>
      <div ref={stageRef} className="cb-stage" data-testid="stage" />
      <ErrorBoundary variant="layer">
        <div className="cb-layer" data-started={started}>
          {started && (
            <>
              <TopSlot />
              <PlayBridge />
            </>
          )}
        </div>
        <ArcadeSheet />
      </ErrorBoundary>
    </div>
  );
}
