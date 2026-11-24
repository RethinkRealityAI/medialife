// Native <dialog> opened with showModal(): the browser gives us the inert page, focus containment, the top layer,
// Esc / back-gesture dismissal and focus return to the invoker. We only add light dismiss where `closedby` is
// missing (Safari).
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  /** Tap outside closes it (true) or only Esc / buttons (false). */
  lightDismiss?: boolean;
  children: ReactNode;
}

const hasClosedBy = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

export function Dialog({ open, onClose, labelledBy, describedBy, className, lightDismiss = true, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.setAttribute('closedby', lightDismiss ? 'any' : 'closerequest');
    if (open && !d.open) {
      try { d.showModal(); } catch { d.setAttribute('open', ''); }
      // React's autoFocus runs before showModal(), which then moves focus to the first control; pick ours instead
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, lightDismiss]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => { if (openRef.current) onCloseRef.current(); };
    d.addEventListener('close', onDialogClose);
    let cleanupLight = () => {};
    if (lightDismiss && !hasClosedBy) {
      const outside = (e: PointerEvent) => {
        const r = d.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const down = (e: PointerEvent) => { pressedOutside = outside(e); };
      const up = (e: PointerEvent) => { if (pressedOutside && outside(e)) d.close(); };
      d.addEventListener('pointerdown', down);
      d.addEventListener('pointerup', up);
      cleanupLight = () => { d.removeEventListener('pointerdown', down); d.removeEventListener('pointerup', up); };
    }
    return () => { d.removeEventListener('close', onDialogClose); cleanupLight(); };
  }, [lightDismiss]);

  return (
    <dialog ref={ref} className={`cb-dialog ${className ?? ''}`} aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {open ? children : null}
    </dialog>
  );
}
