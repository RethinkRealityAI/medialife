// The photo wall in Happi's bedroom: eight pinned polaroids on a pink board. Until you take pictures it shows
// little flat drawings (a rainbow, a heart, a star...); every photo or selfie you take this session replaces one,
// newest first. Kept in memory only (never stored or sent anywhere). One shared canvas texture for both stages.
import * as THREE from 'three';
import { PAL, RAINBOW } from '../fx';
import { canvasHeart, canvasStar, hex } from './geo';

const W = 1024, H = 576;
const SLOTS = [
  { x: 120, y: 150, r: -0.07 }, { x: 330, y: 135, r: 0.05 }, { x: 540, y: 152, r: -0.03 },
  { x: 750, y: 138, r: 0.06 }, { x: 225, y: 380, r: 0.04 }, { x: 435, y: 392, r: -0.06 },
  { x: 645, y: 380, r: 0.03 }, { x: 860, y: 388, r: -0.05 },
];
const PW = 168, PH = 196; // polaroid size (px), photo window inset

let shared: PhotoWall | null = null;
/** The one photo wall (lazy). */
export function photoWall(): PhotoWall {
  return (shared ??= new PhotoWall());
}
/** A photo was taken (the experience's `photo` event): pin it on the wall. Memory only. */
export function addHousePhoto(blob: Blob): void {
  photoWall().add(blob);
}

type Pic = ImageBitmap | HTMLImageElement | null;

export class PhotoWall {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private pics: Pic[] = [];
  /** Photos pinned this session. */
  count = 0;
  /** Bumped when a new photo lands (the room flashes a little sparkle there). */
  version = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.anisotropy = 4;
    this.draw();
  }

  async add(blob: Blob): Promise<void> {
    let pic: Pic = null;
    try {
      pic = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await loadImage(blob);
    } catch {
      return;
    }
    this.pics.unshift(pic);
    while (this.pics.length > SLOTS.length) {
      const old = this.pics.pop();
      if (old && 'close' in old) old.close();
    }
    this.count++;
    this.version++;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    // the board: flat pink with a white stitched border and a bunting string
    g.fillStyle = '#ffb3d4';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff9cc7';
    for (let y = 0; y < H; y += 48) for (let x = (y / 48) % 2 ? 24 : 0; x < W; x += 48) g.fillRect(x + 20, y + 20, 8, 8);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.setLineDash([22, 14]);
    g.strokeRect(18, 18, W - 36, H - 36);
    g.setLineDash([]);
    // bunting across the top
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 34);
    g.quadraticCurveTo(W / 2, 92, W - 30, 34);
    g.stroke();
    for (let i = 0; i < 13; i++) {
      const t = (i + 0.5) / 13;
      const x = 30 + (W - 60) * t;
      const y = 34 + 4 * (92 - 34) * t * (1 - t) * 0.5 * 2;
      g.fillStyle = hex(RAINBOW[i % RAINBOW.length]);
      g.beginPath();
      g.moveTo(x - 22, y - 2);
      g.lineTo(x + 22, y - 2);
      g.lineTo(x, y + 34);
      g.closePath();
      g.fill();
    }
    SLOTS.forEach((s, i) => this.polaroid(s.x, s.y, s.r, i));
    this.texture.needsUpdate = true;
  }

  private polaroid(cx: number, cy: number, rot: number, i: number): void {
    const g = this.g, pic = this.pics[i] ?? null;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    // soft shadow (one flat colour, offset)
    g.fillStyle = '#e57fae';
    g.fillRect(-PW / 2 + 6, -PH / 2 + 8, PW, PH);
    g.fillStyle = '#ffffff';
    g.fillRect(-PW / 2, -PH / 2, PW, PH);
    const ix = -PW / 2 + 12, iy = -PH / 2 + 12, iw = PW - 24, ih = PH - 54;
    if (pic) {
      // cover-crop the photo into the window
      const pw = (pic as ImageBitmap).width, ph = (pic as ImageBitmap).height;
      const k = Math.max(iw / pw, ih / ph);
      const sw = iw / k, sh = ih / k;
      g.drawImage(pic as CanvasImageSource, (pw - sw) / 2, (ph - sh) / 2, sw, sh, ix, iy, iw, ih);
    } else this.doodle(i, ix, iy, iw, ih);
    // a heart pin
    g.fillStyle = hex(i % 2 ? PAL.red : PAL.pink);
    canvasHeart(g, 0, -PH / 2 + 4, 26);
    g.fill();
    g.restore();
  }

  /** Little flat drawings for the empty slots. */
  private doodle(i: number, x: number, y: number, w: number, h: number): void {
    const g = this.g, cx = x + w / 2, cy = y + h / 2;
    const bgs = ['#d4edff', '#ffe9a8', '#e6dcff', '#c9f2d6', '#ffd6ea', '#d4edff', '#fff1c2', '#e6dcff'];
    g.fillStyle = bgs[i % bgs.length];
    g.fillRect(x, y, w, h);
    switch (i % 8) {
      case 0: // rainbow
      case 5:
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = hex(RAINBOW[k]);
          g.lineWidth = 9;
          g.beginPath();
          g.arc(cx, y + h - 18, 62 - k * 9, Math.PI, 0);
          g.stroke();
        }
        g.fillStyle = '#ffffff';
        for (const sx of [-44, 44]) { g.beginPath(); g.arc(cx + sx, y + h - 20, 16, 0, 7); g.arc(cx + sx + (sx > 0 ? 14 : -14), y + h - 16, 12, 0, 7); g.fill(); }
        break;
      case 1: // big heart
      case 6:
        g.fillStyle = hex(PAL.pink);
        canvasHeart(g, cx, cy + 4, 92);
        g.fill();
        g.fillStyle = '#ffffff';
        canvasHeart(g, cx - 18, cy - 14, 18);
        g.fill();
        break;
      case 2: // star
      case 7:
        g.fillStyle = hex(PAL.yellow);
        canvasStar(g, cx, cy + 4, 50);
        g.fill();
        break;
      case 3: // sun over hills
        g.fillStyle = hex(PAL.yellow);
        g.beginPath(); g.arc(cx + 24, cy - 14, 24, 0, 7); g.fill();
        g.fillStyle = hex(PAL.green);
        g.beginPath(); g.ellipse(cx - 20, y + h, 70, 44, 0, Math.PI, 0); g.fill();
        g.fillStyle = '#4bbf74';
        g.beginPath(); g.ellipse(cx + 40, y + h, 60, 32, 0, Math.PI, 0); g.fill();
        break;
      default: // cloud
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(cx - 26, cy + 10, 22, 0, 7);
        g.arc(cx, cy - 6, 30, 0, 7);
        g.arc(cx + 28, cy + 10, 22, 0, 7);
        g.fill();
        g.fillRect(cx - 26, cy + 10, 54, 22);
    }
  }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
