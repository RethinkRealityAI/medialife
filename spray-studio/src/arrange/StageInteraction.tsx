/**
 * What a press on the stage does in Arrange and Decals mode (painting is off in both).
 *
 * Lives inside the R3F canvas to reach the camera; publishes the camera and canvas for the panels outside
 * (./stage.ts). Listens on the window in the capture phase, so that when a press lands on a scene item or
 * a decal the orbit controls are switched off before they see it: the item moves and the camera stays.
 * A press on nothing still orbits; a tap on nothing lets go of the selection.
 *
 * Arrange: Move slides the item on a plane parallel to the print through it (a camera-facing plane when
 * the print is seen edge-on), Rotate turns it (sideways: Turn, up and down: Tip forward), Resize scales it
 * (right or up: bigger). Snap: 1 mm and 5 degrees. The stage follows live; one drag is one undo step.
 *
 * Decals: drag moves the decal in the picture; two fingers on it size and turn it. The corner handle (a
 * DOM button, see `DecalHandle`) does the same with one pointer.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getSceneLayer, type SceneItem } from '../paint/sceneItems';
import { getDecalLayer, type Decal } from './decals';
import { stage } from './stage';
import { clamp, POS_LIMIT, round, SIZE_MAX, SIZE_MIN } from './sceneMath';
import type { ArrangeApi } from './useArrange';
import type { DecalsApi } from './useDecals';

export type StageCtl = {
  mode: string;
  arrange: ArrangeApi;
  decals: DecalsApi;
  orbit: () => { enabled: boolean } | null;
};

const TAP = 6;
/** Decal numbers: 4 decimals, as the AR page keeps them. */
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Picture uv -> units of a 3:4 picture (so angles and lengths are true). */
const pic = (uv: [number, number]) => [uv[0] * 3, uv[1] * 4] as const;

type ArrangeDrag = {
  kind: 'arrange';
  id: number;
  x0: number;
  y0: number;
  item: SceneItem;
  plane: THREE.Plane;
  mm0: THREE.Vector3;
  last: SceneItem;
};
type DecalDrag = {
  kind: 'decal';
  index: number;
  d0: Decal;
  last: Decal;
  pointers: Map<number, [number, number]>;
  start: Map<number, [number, number]>;
  pinch: { dist: number; ang: number; mid: [number, number]; d: Decal } | null;
};
type Press = { id: number; x0: number; y0: number; moved: boolean };

export function StageInteraction({ ctl }: { ctl: React.MutableRefObject<StageCtl | null> }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    stage.camera = camera;
    stage.canvas = gl.domElement;
  }, [camera, gl]);
  useFrame(() => {
    for (const f of stage.frame) f();
  });

  const drag = useRef<ArrangeDrag | DecalDrag | null>(null);
  const press = useRef<Press | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const ray = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      return rc.ray;
    };
    const setOrbit = (on: boolean) => {
      const o = ctl.current?.orbit();
      if (o) o.enabled = on;
    };

    const down = (e: PointerEvent) => {
      const c = ctl.current;
      if (!c || e.target !== canvas) return;
      if (c.mode !== 'arrange' && c.mode !== 'decal') return;
      // a second finger on a decal being dragged: pinch
      const d = drag.current;
      if (d?.kind === 'decal') {
        const layer = getDecalLayer(c.decals.pid ?? '');
        const uv = layer?.uvAt(ray(e.clientX, e.clientY));
        if (uv && d.pointers.size < 2) {
          d.pointers.set(e.pointerId, uv);
          d.start.set(e.pointerId, uv);
          startPinch(d);
        }
        return;
      }
      if (d) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = ray(e.clientX, e.clientY);
      if (c.mode === 'arrange') {
        const layer = getSceneLayer(c.arrange.pid ?? '');
        const id = layer?.pick(r, c.arrange.selected);
        const item = id ? c.arrange.items.find((it) => it.id === id) : undefined;
        if (!layer || !item) {
          press.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
          return;
        }
        c.arrange.select(item.id);
        setOrbit(false);
        // the plane parallel to the print through the item; edge-on: one facing the camera
        let plane = layer.planeAt(item.pos[2]);
        if (Math.abs(plane.normal.dot(r.direction)) < 0.18) {
          const p = layer.group.localToWorld(new THREE.Vector3(...item.pos));
          plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), p);
        }
        const hit = r.intersectPlane(plane, new THREE.Vector3());
        drag.current = {
          kind: 'arrange',
          id: e.pointerId,
          x0: e.clientX,
          y0: e.clientY,
          item,
          plane,
          mm0: hit ? layer.toMm(hit) : new THREE.Vector3(...item.pos),
          last: item,
        };
        e.preventDefault();
        return;
      }
      const layer = getDecalLayer(c.decals.pid ?? '');
      const i = layer?.pick(r);
      const uv = layer?.uvAt(r);
      if (!layer || i == null || !uv) {
        press.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
        return;
      }
      c.decals.select(i);
      setOrbit(false);
      const d0 = c.decals.list[i];
      drag.current = {
        kind: 'decal',
        index: i,
        d0,
        last: d0,
        pointers: new Map([[e.pointerId, uv]]),
        start: new Map([[e.pointerId, uv]]),
        pinch: null,
      };
      e.preventDefault();
    };

    const startPinch = (d: DecalDrag) => {
      const pts = [...d.pointers.values()];
      if (pts.length < 2) return;
      const [a, b] = [pic(pts[0]), pic(pts[1])];
      d.pinch = {
        dist: Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-3),
        ang: Math.atan2(b[1] - a[1], b[0] - a[0]),
        mid: [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2],
        d: d.last,
      };
    };

    const move = (e: PointerEvent) => {
      const c = ctl.current;
      const p = press.current;
      if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > TAP) p.moved = true;
      const d = drag.current;
      if (!c || !d) return;
      if (d.kind === 'arrange') {
        if (e.pointerId !== d.id) return;
        const layer = getSceneLayer(c.arrange.pid ?? '');
        if (!layer) return;
        const it = d.item;
        const snap = c.arrange.snap;
        let next: SceneItem = it;
        const dx = e.clientX - d.x0,
          dy = e.clientY - d.y0;
        if (c.arrange.tool === 'move') {
          const hit = ray(e.clientX, e.clientY).intersectPlane(d.plane, new THREE.Vector3());
          if (!hit) return;
          const mm = layer.toMm(hit).sub(d.mm0);
          const step = snap ? 1 : 0.1;
          const pos = it.pos.map((v, k) => clamp(round(v + mm.getComponent(k), step), -POS_LIMIT, POS_LIMIT)) as SceneItem['pos'];
          next = { ...it, pos };
        } else if (c.arrange.tool === 'rotate') {
          const step = snap ? 5 : 1;
          const rot: SceneItem['rot'] = [
            wrapDeg(round(it.rot[0] + dy * 0.5, step)),
            wrapDeg(round(it.rot[1] + dx * 0.5, step)),
            it.rot[2],
          ];
          next = { ...it, rot };
        } else {
          const size = clamp(round(it.size * Math.exp((dx - dy) * 0.006), snap ? 1 : 0.1), SIZE_MIN, SIZE_MAX);
          next = { ...it, size };
        }
        d.last = next;
        c.arrange.preview(c.arrange.items.map((x) => (x.id === it.id ? next : x)));
        return;
      }
      if (!d.pointers.has(e.pointerId)) return;
      const layer = getDecalLayer(c.decals.pid ?? '');
      const uv = layer?.uvAt(ray(e.clientX, e.clientY));
      if (!uv) return;
      d.pointers.set(e.pointerId, uv);
      let next: Decal;
      if (d.pinch && d.pointers.size >= 2) {
        const pts = [...d.pointers.values()];
        const [a, b] = [pic(pts[0]), pic(pts[1])];
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const mid: [number, number] = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
        const s = d.pinch;
        next = {
          ...s.d,
          w: r4(clamp(s.d.w * (dist / s.dist), 0.05, 1.5)),
          r: r4(Math.atan2(Math.sin(s.d.r - (ang - s.ang)), Math.cos(s.d.r - (ang - s.ang)))),
          u: r4(clamp(s.d.u + mid[0] - s.mid[0], -0.1, 1.1)),
          v: r4(clamp(s.d.v + mid[1] - s.mid[1], -0.1, 1.1)),
        };
      } else {
        const s = d.start.get(e.pointerId)!;
        const base = d.pinch ? d.last : d.d0;
        if (d.pinch) {
          // one finger left after a pinch: carry on moving from here
          d.d0 = d.last;
          d.start.set(e.pointerId, uv);
          d.pinch = null;
          return;
        }
        next = {
          ...base,
          u: r4(clamp(base.u + uv[0] - s[0], -0.1, 1.1)),
          v: r4(clamp(base.v + uv[1] - s[1], -0.1, 1.1)),
        };
      }
      d.last = next;
      c.decals.preview(c.decals.list.map((x, j) => (j === d.index ? next : x)));
    };

    const up = (e: PointerEvent) => {
      const c = ctl.current;
      const p = press.current;
      if (p && p.id === e.pointerId) {
        press.current = null;
        if (!p.moved && c && e.type === 'pointerup') {
          if (c.mode === 'arrange') c.arrange.select(null);
          if (c.mode === 'decal') c.decals.select(null);
        }
      }
      const d = drag.current;
      if (!c || !d) return;
      if (d.kind === 'arrange') {
        if (e.pointerId !== d.id) return;
        drag.current = null;
        setOrbit(true);
        if (d.last !== d.item) c.arrange.commit(c.arrange.items.map((x) => (x.id === d.item.id ? d.last : x)));
        else c.arrange.preview(c.arrange.items);
        return;
      }
      if (!d.pointers.has(e.pointerId)) return;
      d.pointers.delete(e.pointerId);
      d.start.delete(e.pointerId);
      if (d.pointers.size > 0) {
        // a finger lifted mid-pinch: the other one moves it on from where it is
        d.d0 = d.last;
        for (const [id, uv] of d.pointers) d.start.set(id, uv);
        d.pinch = null;
        return;
      }
      drag.current = null;
      setOrbit(true);
      if (d.last !== d.d0 || d.last !== c.decals.list[d.index]) {
        const list = c.decals.list.map((x, j) => (j === d.index ? d.last : x));
        if (list[d.index] !== c.decals.list[d.index]) c.decals.commit(list);
      }
    };

    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (drag.current) setOrbit(true);
      drag.current = null;
    };
  }, [gl, camera, ctl]);

  return null;
}
