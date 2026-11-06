/**
 * Procedural textures: knit fabric (colour + normal), the NFC inlay, the
 * woven label, the backdrop's dry-brush strokes. All canvas-drawn so the page
 * ships no extra image weight for them.
 */
import * as THREE from "three";

const canvas = (w, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Height map of a jersey knit: rows of little V stitches. */
function knitHeight(size = 256, stitch = 16) {
  const c = canvas(size);
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const r = rand(7);
  for (let y = 0; y < size; y += stitch) {
    for (let x = 0; x < size; x += stitch) {
      const j = (r() - 0.5) * 1.4;
      for (const side of [-1, 1]) {
        const grad = g.createLinearGradient(x, y, x + stitch, y + stitch);
        grad.addColorStop(0, "#333");
        grad.addColorStop(0.5, "#fff");
        grad.addColorStop(1, "#333");
        g.fillStyle = grad;
        g.beginPath();
        const cx = x + stitch / 2 + side * stitch * 0.22 + j;
        g.ellipse(cx, y + stitch / 2, stitch * 0.2, stitch * 0.55, side * 0.42, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

function heightToNormal(src, strength = 2.2) {
  const w = src.width;
  const h = src.height;
  const s = src.getContext("2d").getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const og = out.getContext("2d");
  const img = og.createImageData(w, h);
  const H = (x, y) => s[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  og.putImageData(img, 0, 0);
  return out;
}

export function knitNormal(repeat = 26) {
  const t = new THREE.CanvasTexture(heightToNormal(knitHeight()));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function roundedMask(g, w, h, r) {
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.closePath();
}

/** Heavyweight cotton swatch (colour). */
export function cottonTexture(color = "#141a2e") {
  const c = canvas(512);
  const g = c.getContext("2d");
  roundedMask(g, 512, 512, 40);
  g.clip();
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  const k = knitHeight(256, 10);
  g.globalAlpha = 0.18;
  g.globalCompositeOperation = "screen";
  for (let y = 0; y < 512; y += 256) for (let x = 0; x < 512; x += 256) g.drawImage(k, x, y);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The NFC inlay: a clear PET film with a copper coil antenna and a chip. */
export function nfcTexture() {
  const c = canvas(512);
  const g = c.getContext("2d");
  roundedMask(g, 512, 512, 40);
  g.clip();
  g.fillStyle = "rgba(160,190,255,0.16)";
  g.fillRect(0, 0, 512, 512);
  // Coil: a rectangular spiral.
  g.strokeStyle = "#e39a52";
  g.lineWidth = 7;
  g.shadowColor = "#ffb066";
  g.shadowBlur = 12;
  for (let i = 0; i < 6; i++) {
    const m = 70 + i * 17;
    g.beginPath();
    g.roundRect(m, m, 512 - m * 2, 512 - m * 2, 36 - i * 4);
    g.stroke();
  }
  g.shadowBlur = 0;
  // Bridge from coil to chip.
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(256, 70);
  g.lineTo(256, 230);
  g.stroke();
  // Chip.
  g.fillStyle = "#0b0d14";
  g.fillRect(226, 226, 60, 60);
  g.strokeStyle = "#8fd3ff";
  g.lineWidth = 2;
  g.strokeRect(226, 226, 60, 60);
  g.fillStyle = "#8fd3ff";
  g.font = "bold 13px JetBrains Mono, monospace";
  g.textAlign = "center";
  g.fillText("NFC", 256, 261);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.font = "11px JetBrains Mono, monospace";
  g.fillText("ACTIVATED BY MEDIALIFE", 256, 486);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Inner layer: soft backing with the woven "tap here" label. */
export function labelTexture() {
  const c = canvas(512);
  const g = c.getContext("2d");
  roundedMask(g, 512, 512, 40);
  g.clip();
  g.fillStyle = "#0d0f17";
  g.fillRect(0, 0, 512, 512);
  const k = knitHeight(256, 8);
  g.globalAlpha = 0.12;
  g.globalCompositeOperation = "screen";
  for (let y = 0; y < 512; y += 256) for (let x = 0; x < 512; x += 256) g.drawImage(k, x, y);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  // Woven label.
  g.fillStyle = "#e9e6dc";
  g.fillRect(156, 196, 200, 120);
  g.strokeStyle = "rgba(0,0,0,0.25)";
  for (let y = 198; y < 316; y += 3) {
    g.beginPath();
    g.moveTo(156, y);
    g.lineTo(356, y);
    g.stroke();
  }
  g.fillStyle = "#111";
  g.textAlign = "center";
  g.font = "bold 20px JetBrains Mono, monospace";
  g.fillText("TAP HERE", 256, 246);
  g.font = "12px JetBrains Mono, monospace";
  g.fillText("ACTIVATED BY MEDIALIFE", 256, 270);
  // )) waves
  g.strokeStyle = "#111";
  g.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(256, 300, 6 + i * 6, -Math.PI * 0.8, -Math.PI * 0.2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Round the corners of an image texture (the print swatch). */
export function roundedImage(img, crop) {
  const c = canvas(512);
  const g = c.getContext("2d");
  roundedMask(g, 512, 512, 40);
  g.clip();
  const { x, y, w, h } = crop;
  g.drawImage(img, x * img.width, y * img.height, w * img.width, h * img.height, 0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Dry-brush strokes behind the hero garment (white, transparent). */
export function strokesTexture() {
  const W = 1024;
  const c = canvas(W, W);
  const g = c.getContext("2d");
  const r = rand(42);
  g.lineCap = "round";
  const stroke = (x0, y0, x1, y1, width) => {
    const bristles = 40;
    for (let b = 0; b < bristles; b++) {
      const o = (b / bristles - 0.5) * width;
      g.globalAlpha = 0.08 + r() * 0.35;
      g.lineWidth = 0.6 + r() * 2.2;
      g.strokeStyle = "#dfe6ff";
      g.beginPath();
      const steps = 30;
      let started = false;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        if (r() < 0.08) {
          started = false;
          continue;
        }
        const x = x0 + (x1 - x0) * t + o * 0.6 + Math.sin(t * 6 + b) * 3;
        const y = y0 + (y1 - y0) * t + o + Math.cos(t * 5 + b) * 3;
        if (!started) g.moveTo(x, y), (started = true);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  // Two sweeping slashes either side of the garment.
  stroke(120, 900, 330, 180, 90);
  stroke(200, 960, 380, 420, 50);
  stroke(900, 860, 700, 160, 90);
  stroke(820, 980, 640, 480, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
