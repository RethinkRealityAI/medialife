import { useEffect, useState } from 'react';
import { Info, Sparkles, TriangleAlert } from 'lucide-react';
import { useApp } from '../context';
import type { Toast as ToastData } from '../state/appState';

const LEAVE_MS = 260;

/**
 * One toast at a time: a compact chip under the top bar (and under the game chip). It springs in and shrinks
 * away; a found word gets the celebration look (a burst of flat rainbow dots). The top slot measures itself so the
 * experience's hint pill slides down out of the way (see TopSlot in App.tsx).
 */
export function Toast() {
  const toast = useApp((s) => s.toast);
  const [shown, setShown] = useState<ToastData | null>(toast);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (toast) { setShown(toast); setLeaving(false); return; }
    setLeaving(true);
    const t = window.setTimeout(() => { setShown(null); setLeaving(false); }, LEAVE_MS);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="cb-toast-slot" role="status" aria-live="polite" aria-atomic="true">
      {shown && (
        <div key={shown.id} className={`cb-toast is-${shown.kind}${leaving ? ' is-leaving' : ''}`}>
          {shown.kind === 'found' && (
            <span className="cb-toast-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
          )}
          <span className="cb-toast-icon" aria-hidden="true">
            {shown.kind === 'found' ? <Sparkles size={18} strokeWidth={2.4} />
              : shown.kind === 'error' ? <TriangleAlert size={18} strokeWidth={2.4} /> : <Info size={18} strokeWidth={2.4} />}
          </span>
          <span className="cb-toast-text">{shown.text}</span>
        </div>
      )}
    </div>
  );
}
