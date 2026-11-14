/**
 * Dragging a card (an asset, a decal) from a panel onto the stage, with a finger or a mouse.
 *
 * A press that barely moves is a tap (`onTap`). Past a few pixels it becomes a drag: a small picture of the
 * thing follows the pointer, and `onOver` hears where it is whenever it is over the stage (null when it is
 * not), `onDrop` where it was let go over the stage. The panel says which way a finger may drag (rail
 * cards scroll up and down, so they drag sideways: `touch-action: pan-y`; the decal tray scrolls sideways,
 * so its tiles drag upwards: `pan-x`); a finger moving the other way scrolls and the browser cancels the drag.
 */
export type DragHandlers = {
  /** The little picture under the pointer (a URL), or null for a plain chip. */
  thumb: string | null;
  label: string;
  /** Is (x, y) over the stage? */
  overStage: (x: number, y: number) => boolean;
  onOver?: (at: { x: number; y: number } | null) => void;
  onDrop: (at: { x: number; y: number }) => void;
  onTap: () => void;
};

const SLOP = 7;

let ghost: HTMLDivElement | null = null;
function showGhost(thumb: string | null, label: string) {
  ghost?.remove();
  const g = document.createElement('div');
  g.setAttribute('aria-hidden', 'true');
  g.style.cssText =
    'position:fixed;left:0;top:0;z-index:200;pointer-events:none;width:72px;height:72px;border-radius:18px;' +
    'background:#2b2d33;border:2px solid #f6c344;box-shadow:0 14px 30px -10px rgba(0,0,0,.6);overflow:hidden;' +
    'display:grid;place-items:center;color:#fff;font:600 10px/1.2 system-ui,sans-serif;text-align:center;padding:4px;' +
    'opacity:.95;will-change:transform;';
  if (thumb) {
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    g.appendChild(img);
  } else g.textContent = label;
  document.body.appendChild(g);
  ghost = g;
  return g;
}
function moveGhost(x: number, y: number, over: boolean) {
  if (!ghost) return;
  ghost.style.transform = `translate(${x - 36}px, ${y - 36}px) scale(${over ? 0.85 : 1})`;
  ghost.style.borderColor = over ? '#ffffff' : '#f6c344';
}
function hideGhost() {
  ghost?.remove();
  ghost = null;
}

/** Call from a card's onPointerDown. */
export function startCardDrag(e: React.PointerEvent, h: DragHandlers) {
  if (e.button !== 0) return;
  const id = e.pointerId;
  const x0 = e.clientX,
    y0 = e.clientY;
  let dragging = false;
  let over = false;
  const target = e.currentTarget as HTMLElement;

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (!dragging) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < SLOP) return;
      dragging = true;
      try {
        target.releasePointerCapture?.(id);
      } catch {
        /* not captured */
      }
      showGhost(h.thumb, h.label);
      document.body.style.cursor = 'grabbing';
    }
    ev.preventDefault();
    over = h.overStage(ev.clientX, ev.clientY);
    moveGhost(ev.clientX, ev.clientY, over);
    h.onOver?.(over ? { x: ev.clientX, y: ev.clientY } : null);
  };
  const end = (ev: PointerEvent, cancelled: boolean) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    document.body.style.cursor = '';
    hideGhost();
    if (!dragging) {
      if (!cancelled) h.onTap();
      return;
    }
    h.onOver?.(null);
    if (!cancelled && h.overStage(ev.clientX, ev.clientY)) h.onDrop({ x: ev.clientX, y: ev.clientY });
  };
  const up = (ev: PointerEvent) => end(ev, false);
  const cancel = (ev: PointerEvent) => end(ev, true);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
