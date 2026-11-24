// Desktop keyboard: Esc closes the Arcade sheet (the native dialog handles it too); Q opens Bobo's Arcade.
// Moving and throwing are handled by the experience itself.
import { useEffect } from 'react';
import type { AppController } from '../controller';

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function useShortcuts(c: AppController) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = c.store.get();
      if (!s.started || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && s.sheetOpen && !e.defaultPrevented) { e.preventDefault(); c.closeSheet(); return; }
      if (e.key.toLowerCase() === 'q' && !s.sheetOpen) { e.preventDefault(); c.openArcade(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c]);
}
