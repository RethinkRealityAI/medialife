/**
 * The round handle on the selected decal's corner (the one nearest the bottom right of the screen):
 * drag it to size and turn the decal, as two fingers would. It follows the decal every frame.
 */
import React, { useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { getDecalLayer, type Decal } from './decals';
import { rayAt, stage, toScreen } from './stage';
import type { DecalsApi } from './useDecals';

const pic = (uv: [number, number]) => [uv[0] * 3, uv[1] * 4] as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function DecalHandle({ decals, active }: { decals: DecalsApi; active: boolean }) {
  const el = useRef<HTMLButtonElement>(null);
  const api = useRef(decals);
  api.current = decals;
  const sel = active ? decals.selected : null;

  useEffect(() => {
    if (sel == null) return;
    const f = () => {
      const b = el.current;
      const d = api.current;
      if (!b || d.selected == null) return;
      const corners = getDecalLayer(d.pid ?? '')?.corners(d.selected);
      const pts = corners?.map((c) => toScreen(c)).filter((p): p is NonNullable<typeof p> => !!p && !p.behind);
      if (!pts || pts.length < 4) {
        b.style.visibility = 'hidden';
        return;
      }
      const best = pts.reduce((a, p) => (p.x + p.y > a.x + a.y ? p : a));
      // under a panel (the tray, a rail): no handle there, two fingers still work
      const under = document.elementsFromPoint(best.x, best.y).find((el) => el !== b && !b.contains(el));
      if (under !== stage.canvas) {
        b.style.visibility = 'hidden';
        return;
      }
      b.style.visibility = 'visible';
      b.style.transform = `translate(${best.x - 22}px, ${best.y - 22}px)`;
    };
    stage.frame.add(f);
    return () => {
      stage.frame.delete(f);
    };
  }, [sel]);

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = api.current;
    const i = d.selected;
    const layer = getDecalLayer(d.pid ?? '');
    const r = rayAt(e.clientX, e.clientY);
    const uv0 = r && layer?.uvAt(r);
    if (i == null || !layer || !uv0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const d0 = d.list[i];
    const c = pic([d0.u, d0.v]);
    const p0 = pic(uv0);
    const dist0 = Math.max(Math.hypot(p0[0] - c[0], p0[1] - c[1]), 1e-3);
    const ang0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
    let last: Decal = d0;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const rr = rayAt(ev.clientX, ev.clientY);
      const uv = rr && layer.uvAt(rr);
      if (!uv) return;
      const p = pic(uv);
      const dist = Math.hypot(p[0] - c[0], p[1] - c[1]);
      const ang = Math.atan2(p[1] - c[1], p[0] - c[0]);
      last = { ...d0, w: r4(clamp(d0.w * (dist / dist0), 0.05, 1.5)), r: r4(Math.atan2(Math.sin(d0.r - (ang - ang0)), Math.cos(d0.r - (ang - ang0)))) };
      api.current.preview(api.current.list.map((x, j) => (j === i ? last : x)));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (last !== d0) api.current.commit(api.current.list.map((x, j) => (j === i ? last : x)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  if (sel == null) return null;
  return (
    <button
      ref={el}
      type="button"
      aria-label="Drag to size and turn the decal"
      title="Drag to size and turn"
      onPointerDown={onDown}
      className="fixed left-0 top-0 z-40 grid h-11 w-11 place-items-center rounded-full border-2 border-[#15131a] bg-[#f6c344] text-[#15131a] shadow-[0_6px_16px_-6px_rgba(0,0,0,.6)]"
      style={{ visibility: 'hidden', touchAction: 'none' }}
    >
      <Maximize2 size={16} />
    </button>
  );
}
