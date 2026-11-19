/**
 * The stage as the panels outside the 3D canvas need it: the camera and the canvas element (set by
 * `StageBridge` inside the canvas), a ray through a point on the screen, and per-frame callbacks (the
 * decal handle follows its decal).
 */
import * as THREE from 'three';

export const stage = {
  camera: null as THREE.Camera | null,
  canvas: null as HTMLCanvasElement | null,
  frame: new Set<() => void>(),
};

/** The world ray through a point on the screen (client pixels), or null before the stage exists. */
export function rayAt(x: number, y: number): THREE.Ray | null {
  const { camera, canvas } = stage;
  if (!camera || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  return rc.ray.clone();
}

/** Is (x, y) over the open stage (not over a panel)? */
export function overStage(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  return !!el && el === stage.canvas;
}

/** World point -> client pixels. */
export function toScreen(p: THREE.Vector3): { x: number; y: number; behind: boolean } | null {
  const { camera, canvas } = stage;
  if (!camera || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const v = p.clone().project(camera);
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, behind: v.z > 1 };
}
