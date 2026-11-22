// What the built-in modes (showcase, AR) share beyond the public ModeContext: the full HUD, the videos, the bear and
// a way to report a tap-triggered action. Face/photo modes use ModeContext only (src/experience/types.ts).
import type { BearCharacter } from '../../shared/contracts';
import type { Hud } from '../hud/hud';
import type { Media } from '../scene/media';
import type { ModeContext } from '../types';

export interface Shared {
  ctx: ModeContext;
  hud: Hud;
  media: Media;
  reduced: boolean;
  container: HTMLElement;
  bear(): BearCharacter | null;
  /** A moment started from a tap on the scene (emits `action` with source 'tap'). */
  tapAction(name: string): void;
}

/** Pointer helper: taps (short, still), one-finger drags and two-finger pinches on an element. */
export interface Gestures {
  onTap?(x: number, y: number): void;
  onDrag?(dx: number, dy: number): void;
  /** Pinch ratio since the last call (> 1 = fingers apart). */
  onPinch?(ratio: number): void;
  onWheel?(deltaY: number): void;
  /**
   * A quick upward swipe (throw a heart). When set, fast upward drags are reported here instead of onDrag:
   * `power` 0..1 from the swipe's length and speed, `side` the lean in radians (+ = to the right).
   */
  onFlick?(power: number, side: number, x: number, y: number): void;
  /** Finger held still for ~0.55 s (a hug). Canvas-relative CSS pixels. Suppresses the tap. */
  onLongPress?(x: number, y: number): void;
}

/** Fast-upward test for a drag that just started (px per ms, measured over its first few pixels). */
const FLICK_SPEED = 0.28;
const LONG_PRESS_MS = 550;

export function bindGestures(el: HTMLElement, g: Gestures): () => void {
  const pts = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; tl: number; xl: number; yl: number; vy: number }>();
  let pinchD = 0;
  let moved = false;
  let flick = false;
  let longTimer = 0;
  let longFired = false;
  const clearLong = () => { if (longTimer) { window.clearTimeout(longTimer); longTimer = 0; } };
  const dist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // a new gesture's first finger: drop any pointer whose up / cancel never arrived (ar-4: one stale pointer left
    // the map at 2 and a real two-finger pinch at 3, so the pinch never fired again)
    if (e.isPrimary && pts.size) { pts.clear(); pinchD = 0; }
    const t = performance.now();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: t, tl: t, xl: e.clientX, yl: e.clientY, vy: 0 });
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    if (pts.size === 1) {
      moved = false;
      flick = false;
      longFired = false;
      clearLong();
      if (g.onLongPress) {
        const r = el.getBoundingClientRect(), lx = e.clientX - r.left, ly = e.clientY - r.top;
        longTimer = window.setTimeout(() => { longTimer = 0; if (!moved && pts.size === 1) { longFired = true; g.onLongPress?.(lx, ly); } }, LONG_PRESS_MS);
      }
    }
    if (pts.size === 2) { pinchD = dist(); moved = true; flick = false; clearLong(); }
  };
  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const d = dist();
      if (pinchD > 0 && d > 0) g.onPinch?.(d / pinchD);
      pinchD = d;
      return;
    }
    // release speed (smoothed over the last few moves) for the flick's power
    const t = performance.now(), ddt = Math.max(1, t - p.tl);
    p.vy = p.vy * 0.5 + ((p.yl - e.clientY) / ddt) * 0.5;
    p.tl = t; p.xl = e.clientX; p.yl = e.clientY;
    if (!moved && Math.hypot(p.x - p.x0, p.y - p.y0) > 8) {
      moved = true;
      clearLong();
      const up = p.y0 - p.y, side = Math.abs(p.x - p.x0);
      if (g.onFlick && up > side * 1.2 && up / Math.max(1, t - p.t0) > FLICK_SPEED) flick = true;
    }
    if (moved && !flick) g.onDrag?.(dx, dy);
  };
  const up = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    pts.delete(e.pointerId);
    clearLong();
    const r = el.getBoundingClientRect();
    if (pts.size === 0 && flick) {
      flick = false;
      const up = p.y0 - e.clientY, dx = e.clientX - p.x0;
      if (up > 30) {
        const h = Math.max(320, r.height);
        // length (how far your finger went) and speed (how hard you flicked) both count
        const power = THREE_clamp(0.7 * (up / (h * 0.4)) + 0.3 * Math.min(1, Math.max(0, p.vy) / 2.5), 0, 1);
        g.onFlick?.(power, THREE_clamp(Math.atan2(dx, Math.max(up, 40)), -0.6, 0.6), e.clientX - r.left, e.clientY - r.top);
      }
    } else if (pts.size === 0 && !moved && !longFired && performance.now() - p.t0 < 450) {
      g.onTap?.(e.clientX - r.left, e.clientY - r.top);
    }
    if (pts.size < 2) pinchD = 0;
  };
  const cancel = (e: PointerEvent) => { pts.delete(e.pointerId); moved = true; flick = false; clearLong(); if (pts.size < 2) pinchD = 0; };
  // capture lost without an up (the element was hidden, the browser took the touch): forget that pointer
  const lost = (e: PointerEvent) => { if (pts.has(e.pointerId)) cancel(e); };
  const wheel = (e: WheelEvent) => { e.preventDefault(); g.onWheel?.(e.deltaY); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', lost);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    clearLong();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('lostpointercapture', lost);
    el.removeEventListener('wheel', wheel);
  };
}

const THREE_clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Arrow keys / WASD as a joystick on computers (x right, y down). */
export function keyStick(): { vector: { x: number; y: number }; dispose(): void } {
  const held = new Set<string>();
  const v = { x: 0, y: 0 };
  const upd = () => {
    v.x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    v.y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    const l = Math.hypot(v.x, v.y);
    if (l > 1) { v.x /= l; v.y /= l; }
  };
  const map: Record<string, string> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const kd = (e: KeyboardEvent) => {
    const k = map[e.code];
    if (!k || (e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable]')) return;
    held.add(k); upd();
  };
  const ku = (e: KeyboardEvent) => { const k = map[e.code]; if (k) { held.delete(k); upd(); } };
  const blur = () => { held.clear(); upd(); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  return {
    vector: v,
    dispose: () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); },
  };
}
