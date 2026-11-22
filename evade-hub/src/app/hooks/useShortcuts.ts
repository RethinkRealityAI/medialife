// Desktop keyboard shortcuts. Happi has no conversation panel (talk was removed), so only the shortcuts list and Esc
// stay here; moving and throwing are handled by the experience itself.
import { useEffect } from 'react';
import type { AppController } from '../controller';

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function useShortcuts(c: AppController) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = c.store.get();
      if (!s.started) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (s.overlay) return; // a modal is open: the browser owns the keyboard
      if ((mod && e.shiftKey && (key === '?' || e.code === 'Slash')) || (key === '?' && !mod && !typing(e.target))) {
        e.preventDefault();
        c.openOverlay('keys');
        return;
      }
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (s.micAsk) { c.dismissMic(); return; }
        if (s.sheetOpen) { e.preventDefault(); c.closeSheet(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c]);
}
