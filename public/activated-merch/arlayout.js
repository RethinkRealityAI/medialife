/**
 * Layout and timing of the "How it works" phone, shared by the 3D stage
 * (ar.js, scene.js) and the DOM (main.js). No three.js here, so the page can
 * use it even when 3D can't start.
 */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (v, a, b) => clamp01((v - a) / (b - a));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Screen aspect of the phone (w / h), shared by the 3D and DOM phones. */
export const SCREEN_ASPECT = 0.38 / 0.82;

/** On wide screens the section lays out inside a centred column this wide (px). */
export const AR_MAX_W = 1320;
const column = (W) => {
  const w = Math.min(W, AR_MAX_W);
  return { left: (W - w) / 2, w };
};

/**
 * Where the phone's screen sits when the tech section hands over to this one
 * (viewport px). The 3D phone flies to exactly this rect, the DOM phone starts
 * from it.
 */
export function handoffRect(W, H) {
  const mobile = W < 760;
  const col = column(W);
  const h = Math.min(H * (mobile ? 0.56 : 0.62), (col.w * (mobile ? 0.62 : 0.4)) / SCREEN_ASPECT);
  const w = h * SCREEN_ASPECT;
  const cx = mobile ? W * 0.5 : col.left + col.w * 0.64;
  const cy = H * (mobile ? 0.5 : 0.52);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The phone's screen once it fills the view. On phones it becomes the viewport. */
export function fullRect(W, H) {
  if (W < 760) return { x: 0, y: 0, w: W, h: H };
  const col = column(W);
  const h = Math.min(H * 0.9, (col.w * 0.5) / SCREEN_ASPECT);
  const w = h * SCREEN_ASPECT;
  const cx = col.left + col.w * 0.64;
  return { x: cx - w / 2, y: (H - h) / 2, w, h };
}

/** Phases of the section's scroll progress p (0..1). */
export function arPhases(p) {
  return {
    grow: ease(seg(p, 0.0, 0.16)), // the phone grows to fill the view
    cam: seg(p, 0.13, 0.22), // splash hands over to the camera
    find: ease(seg(p, 0.22, 0.44)), // the camera finds the print, brackets close in
    lock: seg(p, 0.44, 0.47), // target found
    reveal: seg(p, 0.46, 0.56), // the animation scans on over the print
    alive: seg(p, 0.5, 0.9), // it plays
    out: ease(seg(p, 0.9, 1.0)),
  };
}

