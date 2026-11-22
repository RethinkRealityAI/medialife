// Happi's face, drawn live on a canvas in the official flat cartoon style (white oval, thick black line, navy fringe,
// the hood squirrel's buck tooth, tall oval eyes with a square highlight, a dot nose). The 3D model has a face panel
// mesh (planar UVs over the face oval) that shows this canvas, so his eyes blink and look, his mouth talks (visemes),
// and he wears the four official expression heads: happy, surprised, grumpy and sleepy.
//
// Canvas space: 1024 x 720, y down. The panel's UV box is the face ellipse +7 % (tools/blender/build_happi.py:
// CX 0, CZ 0.705, AX 0.236, AZ 0.166 m on the 1.2 m model), so the oval is drawn a little inside the edges and
// everything outside it is transparent (alphaTest on the material).

export type FaceLook = 'neutral' | 'happy' | 'surprised' | 'grumpy' | 'sleepy' | 'wink' | 'asleep' | 'love' | 'excited';

export interface FaceState {
  look: FaceLook;
  /** 0 open .. 1 shut (both eyes; the wink keeps one shut). */
  blink: number;
  /** Mouth openness 0..1 from speech, and roundness 0..1 (O / U). */
  open: number;
  round: number;
  /** Pupil offset -1..1 (right / down in the picture). */
  lookX: number;
  lookY: number;
}

export const FACE_W = 1024;
export const FACE_H = 720;

export const HAPPI = {
  orange: '#F37321',
  navy: '#283A8F',
  ink: '#1B1B1F',
  red: '#E8222A',
  white: '#FFFFFF',
  sky: '#A9E0F5',
  tongue: '#E8222A',
} as const;

const CX = 512;
const CY = 360;
const RX = 482;
const RY = 334;
const LINE = 15;

function oval(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
}

function fringe(g: CanvasRenderingContext2D): void {
  // navy cap inside the top of the oval with a scalloped lower edge (four soft bumps around the tooth)
  g.save();
  oval(g, CX, CY, RX - LINE / 2, RY - LINE / 2);
  g.clip();
  g.fillStyle = HAPPI.navy;
  g.strokeStyle = HAPPI.ink;
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(FACE_W, 0);
  g.lineTo(FACE_W, 185);
  const base = 185;
  const bumps = [880, 760, 640, 384, 264, 144];
  let x0 = FACE_W;
  g.lineTo(x0, base);
  for (const bx of bumps) {
    const w = Math.abs(x0 - bx);
    g.quadraticCurveTo((x0 + bx) / 2, base + (w > 200 ? 30 : 46), bx, base - 6);
    x0 = bx;
  }
  g.quadraticCurveTo(x0 / 2, base + 40, 0, base);
  g.closePath();
  g.fill();
  g.stroke();
  // little curls at the ends of the fringe (as in the art)
  g.lineWidth = 8;
  g.beginPath();
  g.arc(176, 204, 16, Math.PI * 0.9, Math.PI * 1.9);
  g.moveTo(864, 204);
  g.arc(848, 204, 16, 0, Math.PI * 0.9, true);
  g.stroke();
  g.restore();
}

function tooth(g: CanvasRenderingContext2D): void {
  const w = 90, h = 150, x = CX - w / 2, y = CY - RY - 4, r = 18;
  g.fillStyle = HAPPI.white;
  g.strokeStyle = HAPPI.ink;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(CX, y + 20);
  g.lineTo(CX, y + h - 4);
  g.stroke();
}

interface EyeOpts { lidTop: number; pupil: number; lookX: number; lookY: number; closed: boolean; grumpy: boolean; sleepy: boolean; side: 1 | -1 }

function eye(g: CanvasRenderingContext2D, x: number, y: number, o: EyeOpts): void {
  const rx = 76, ry = 104;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (o.closed) {
    // a happy closed eye: a soft upward arc
    g.strokeStyle = HAPPI.ink;
    g.lineWidth = 14;
    g.beginPath();
    g.ellipse(x, y + 18, rx * 0.78, 40, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    return;
  }
  g.fillStyle = HAPPI.white;
  g.strokeStyle = HAPPI.ink;
  g.lineWidth = 13;
  oval(g, x, y, rx, ry);
  g.fill();
  if (!o.sleepy) {
    // pupil: tall black oval with the square highlight
    g.save();
    oval(g, x, y, rx - 6, ry - 6);
    g.clip();
    const px = x + o.lookX * 20, py = y + 6 + o.lookY * 14;
    g.fillStyle = HAPPI.ink;
    oval(g, px, py, 42 * o.pupil, 70 * o.pupil);
    g.fill();
    g.fillStyle = HAPPI.white;
    const hw = 15 * o.pupil, hh = 30 * o.pupil;
    g.fillRect(px + 6 * o.pupil - hw / 2, py - 34 * o.pupil, hw, hh);
    g.restore();
  }
  // upper lid (blink, grumpy, sleepy): fill the top of the eye with face white, then the lid line
  if (o.lidTop > 0.01) {
    const ly = y - ry + o.lidTop * ry * 2;
    g.save();
    oval(g, x, y, rx + 8, ry + 8);
    g.clip();
    g.fillStyle = HAPPI.white;
    g.fillRect(x - rx - 10, y - ry - 12, rx * 2 + 20, ly - (y - ry - 12));
    g.restore();
    g.strokeStyle = HAPPI.ink;
    g.lineWidth = 13;
    const half = Math.sqrt(Math.max(0, 1 - ((ly - y) / ry) ** 2)) * rx;
    g.beginPath();
    g.moveTo(x - half - 6, ly);
    g.lineTo(x + half + 6, ly);
    g.stroke();
    // the outline below the lid only
    g.save();
    g.beginPath();
    g.rect(x - rx - 20, ly, rx * 2 + 40, ry * 2 + 40);
    g.clip();
    g.lineWidth = 13;
    oval(g, x, y, rx, ry);
    g.stroke();
    g.restore();
  } else {
    g.strokeStyle = HAPPI.ink;
    g.lineWidth = 13;
    oval(g, x, y, rx, ry);
    g.stroke();
  }
  if (o.grumpy) {
    // slanted brow over the eye, lower towards the nose
    g.strokeStyle = HAPPI.ink;
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(x - o.side * 70, y - ry - 2);
    g.quadraticCurveTo(x, y - ry - 34, x + o.side * 78, y - ry - 20);
    g.stroke();
  }
}

/** Heart eyes (love) and star eyes (excited): extra looks for the hub's reactions. */
function heartEye(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  g.fillStyle = HAPPI.red;
  g.strokeStyle = HAPPI.ink;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(x, y + 70 * k);
  g.bezierCurveTo(x - 20 * k, y + 50 * k, x - 92 * k, y + 10 * k, x - 88 * k, y - 34 * k);
  g.bezierCurveTo(x - 84 * k, y - 82 * k, x - 22 * k, y - 92 * k, x, y - 44 * k);
  g.bezierCurveTo(x + 22 * k, y - 92 * k, x + 84 * k, y - 82 * k, x + 88 * k, y - 34 * k);
  g.bezierCurveTo(x + 92 * k, y + 10 * k, x + 20 * k, y + 50 * k, x, y + 70 * k);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = HAPPI.white;
  g.fillRect(x - 52 * k, y - 50 * k, 16 * k, 26 * k);
}

function starEye(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  g.fillStyle = '#ffc93c';
  g.strokeStyle = HAPPI.ink;
  g.lineWidth = 12;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 40 : 92) * k;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  g.fill();
  g.stroke();
}

function mouth(g: CanvasRenderingContext2D, s: FaceState): void {
  const y = 586;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = HAPPI.ink;
  const talking = s.open > 0.06;
  if (talking && s.look !== 'surprised') {
    const w = 150 - s.round * 70;
    const h = 22 + s.open * 92;
    g.fillStyle = HAPPI.ink;
    g.lineWidth = 11;
    g.beginPath();
    if (s.round > 0.5) {
      g.ellipse(CX, y + h / 2 - 8, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      g.moveTo(CX - w / 2, y - 6);
      g.quadraticCurveTo(CX, y + 4, CX + w / 2, y - 6);
      g.quadraticCurveTo(CX + w / 2 - 6, y + h, CX, y + h);
      g.quadraticCurveTo(CX - w / 2 + 6, y + h, CX - w / 2, y - 6);
    }
    g.fill();
    g.stroke();
    if (s.open > 0.28) {
      g.save();
      g.clip();
      g.fillStyle = HAPPI.tongue;
      oval(g, CX, y + h - 4, w * 0.3, h * 0.32);
      g.fill();
      g.restore();
    }
    return;
  }
  switch (s.look) {
    case 'love':
    case 'excited':
    case 'happy': {
      // open grin with the red tongue (head 1)
      g.fillStyle = HAPPI.ink;
      g.lineWidth = 11;
      g.beginPath();
      g.moveTo(CX - 82, y - 12);
      g.quadraticCurveTo(CX, y - 2, CX + 82, y - 12);
      g.quadraticCurveTo(CX + 64, y + 62, CX, y + 64);
      g.quadraticCurveTo(CX - 64, y + 62, CX - 82, y - 12);
      g.fill();
      g.stroke();
      g.save();
      g.clip();
      g.fillStyle = HAPPI.tongue;
      oval(g, CX, y + 58, 40, 26);
      g.fill();
      g.restore();
      break;
    }
    case 'surprised': {
      // the little "O" (head 2): light inside, black ring
      g.fillStyle = HAPPI.white;
      g.lineWidth = 12;
      oval(g, CX, y + 20, 30 + s.open * 12, 38 + s.open * 18);
      g.fill();
      g.stroke();
      break;
    }
    case 'grumpy': {
      // small frown (head 3)
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(CX - 40, y + 26);
      g.quadraticCurveTo(CX, y - 4, CX + 40, y + 26);
      g.stroke();
      break;
    }
    case 'sleepy':
    case 'asleep': {
      // wide content smile (head 4)
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(CX - 92, y - 6);
      g.quadraticCurveTo(CX, y + 52, CX + 92, y - 6);
      g.stroke();
      break;
    }
    default: {
      // the default: a friendly smile line
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(CX - 78, y - 10);
      g.quadraticCurveTo(CX, y + 36, CX + 78, y - 10);
      g.stroke();
    }
  }
}

/** Draw the whole face for `s` (clears the canvas first; transparent outside the oval). */
export function drawFace(g: CanvasRenderingContext2D, s: FaceState): void {
  g.clearRect(0, 0, FACE_W, FACE_H);
  g.fillStyle = HAPPI.white;
  oval(g, CX, CY, RX, RY);
  g.fill();
  fringe(g);
  tooth(g);
  const l = s.look;
  const grumpy = l === 'grumpy';
  const sleepy = l === 'sleepy' || l === 'asleep';
  const blink = Math.max(s.blink, l === 'asleep' ? 1 : 0);
  const pupil = l === 'surprised' ? 0.62 : 1;
  const base = grumpy ? 0.36 : sleepy ? 0.48 : 0;
  for (const side of [-1, 1] as const) {
    const x = CX + side * 156;
    const wink = l === 'wink' && side === 1;
    const lid = Math.max(base, blink);
    if ((l === 'love' || l === 'excited') && blink < 0.92) {
      // a little pulse comes from the redraw on blink changes; the shape itself is static
      if (l === 'love') heartEye(g, x, 382, 1); else starEye(g, x, 382, 1);
      continue;
    }
    eye(g, x, 382, {
      lidTop: Math.min(1, lid),
      pupil,
      lookX: s.lookX,
      lookY: s.lookY,
      closed: wink || lid > 0.92,
      grumpy,
      sleepy,
      side,
    });
  }
  // nose
  g.fillStyle = HAPPI.ink;
  oval(g, CX, 520, 10, 9);
  g.fill();
  mouth(g, s);
  // outline last, over everything that touches the edge
  g.strokeStyle = HAPPI.ink;
  g.lineWidth = LINE;
  oval(g, CX, CY, RX - LINE / 2, RY - LINE / 2);
  g.stroke();
}

/** A stable key for a state (redraw only when it changes visibly). */
export function faceKey(s: FaceState): string {
  const q = (v: number, n = 12) => Math.round(v * n);
  return `${s.look}|${q(s.blink, 8)}|${q(s.open, 14)}|${q(s.round, 4)}|${q(s.lookX, 6)}|${q(s.lookY, 6)}`;
}
