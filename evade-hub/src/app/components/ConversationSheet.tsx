// The conversation panel. Phones: a bottom sheet with a drag handle and two snap points (half, so the bear stays
// visible above it, and full). Wider than 900px: a right sidebar, and the scene fills the rest.
// Non-modal on purpose: the scene stays live and tappable while you talk.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Gamepad2, Keyboard, MessageCircle, Settings, Sparkles, X, ChevronDown } from 'lucide-react';
import { useApp, useController } from '../context';
import type { TabId } from '../state/appState';
import { TalkPanel } from './TalkPanel';
import { ActionsPanel } from './ActionsPanel';
import { GamesPanel } from './GamesPanel';
import { SettingsPanel } from './SettingsPanel';
import { callStatusText } from './callText';

const TABS: { id: TabId; label: string; icon: typeof MessageCircle }[] = [
  { id: 'talk', label: 'Talk', icon: MessageCircle },
  { id: 'actions', label: 'Actions', icon: Sparkles },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function snapHeights() {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  return { half: Math.round(Math.min(vh * 0.52, 520)), full: Math.round(vh - 56) };
}

export function ConversationSheet() {
  const c = useController();
  const open = useApp((s) => s.sheetOpen);
  const snap = useApp((s) => s.sheetSnap);
  const tab = useApp((s) => s.tab);
  const uiMode = useApp((s) => s.uiMode);
  const isDesktop = useApp((s) => s.isDesktop);
  const ui = useApp((s) => s.ui);
  const status = useApp((s) => callStatusText(s.call, s.callStartedAt) + (s.callDemo && s.call !== 'idle' && s.call !== 'error' ? ' (demo call)' : ''));
  const ref = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const drag = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null);

  const tabs = TABS.filter((t) =>
    t.id === 'actions' ? ui.show.quickActions
      : t.id === 'games' ? true // the mini games (Heart Run, Heart Hoops) are always there (games-3)
        : t.id === 'settings' ? ui.show.settings : true);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'talk';

  // focus in on open, back to the talk button on close
  const wasOpen = useRef(open);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.removeAttribute('inert'); else el.setAttribute('inert', '');
    if (open && !wasOpen.current) {
      requestAnimationFrame(() => tabRefs.current[activeTab]?.focus({ preventScroll: true }));
    }
    if (!open && wasOpen.current && el.contains(document.activeElement)) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.cb-orb')?.focus({ preventScroll: true }));
    }
    wasOpen.current = open;
  }, [open, activeTab]);

  // the scene resizes when the desktop sidebar opens / closes
  useEffect(() => {
    if (!isDesktop) return;
    const t = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
    return () => clearTimeout(t);
  }, [open, isDesktop]);

  const onTabKey = (e: ReactKeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === activeTab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    c.setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  // ---- drag handle (phones)
  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (isDesktop || !ref.current) return;
    if ((e.target as HTMLElement).closest('button:not(.cb-sheet-handle), a, input')) return;
    drag.current = { y: e.clientY, h: ref.current.getBoundingClientRect().height, t: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const { full } = snapHeights();
    el.style.height = `${Math.max(80, Math.min(full, d.h - dy))}px`;
    el.classList.add('is-dragging');
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove('is-dragging');
    if (!d.moved) return;
    const h = el.getBoundingClientRect().height;
    el.style.height = '';
    const v = (e.clientY - d.y) / Math.max(1, performance.now() - d.t); // px/ms, + = down
    const { half, full } = snapHeights();
    if (v > 0.8 || h < half * 0.6) { c.closeSheet(); return; }
    if (v < -0.8) { c.setSnap('full'); return; }
    c.setSnap(Math.abs(h - full) < Math.abs(h - half) ? 'full' : 'half');
  };

  return (
    <section
      ref={ref}
      className={`cb-sheet ${isDesktop ? 'is-side' : 'is-bottom'} snap-${snap}`}
      data-open={open}
      aria-label={`Conversation with ${ui.name}`}
      data-testid="sheet"
    >
      <div className="cb-sheet-top" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {!isDesktop && (
          <button
            type="button"
            className="cb-sheet-handle"
            aria-label={snap === 'full' ? 'Make the panel smaller' : 'Make the panel bigger'}
            onClick={() => { if (!drag.current?.moved) c.setSnap(snap === 'full' ? 'half' : 'full'); }}
          ><span aria-hidden="true" /></button>
        )}
        <header className="cb-sheet-head">
          <div className="cb-sheet-title">
            <h2>{ui.title}</h2>
            <p className="cb-sheet-status">{status}</p>
          </div>
          {isDesktop && ui.show.keyboardHelp && (
            <button type="button" className="cb-icon-btn" onClick={() => c.openOverlay('keys')} aria-label="Keyboard shortcuts">
              <Keyboard aria-hidden="true" size={20} />
            </button>
          )}
          <button type="button" className="cb-icon-btn" onClick={() => c.closeSheet()} aria-label="Close the conversation panel">
            {isDesktop ? <X aria-hidden="true" size={22} /> : <ChevronDown aria-hidden="true" size={24} />}
          </button>
        </header>
        {tabs.length > 1 && (
          <div
            className="cb-tabs"
            role="tablist"
            aria-label="Conversation"
            onKeyDown={onTabKey}
            style={{ '--n': tabs.length, '--i': Math.max(0, tabs.findIndex((t) => t.id === activeTab)) } as React.CSSProperties}
          >
            <span className="cb-tabs-pill" aria-hidden="true" />
            {tabs.map((t) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                type="button"
                role="tab"
                id={`cb-tab-${t.id}`}
                aria-selected={activeTab === t.id}
                aria-controls={`cb-panel-${t.id}`}
                tabIndex={activeTab === t.id ? 0 : -1}
                className="cb-tab"
                onClick={() => c.setTab(t.id)}
              >
                <t.icon aria-hidden="true" size={18} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`cb-panel is-${activeTab}${activeTab === 'talk' && uiMode !== 'calm' ? ' is-chat' : ''}`} role="tabpanel" id={`cb-panel-${activeTab}`} aria-labelledby={`cb-tab-${activeTab}`}>
        {activeTab === 'talk' && <TalkPanel />}
        {activeTab === 'actions' && <ActionsPanel />}
        {activeTab === 'games' && <GamesPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </section>
  );
}
