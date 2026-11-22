// Happi's sky, drawn in code (no third-party art): a flat equirectangular backdrop in the Happi palette. Sky blue,
// flat white clouds, a navy city skyline on the horizon with a row of festival lanterns. Flat colours only.
import * as THREE from 'three';
import { HAPPI } from './faceArt';

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function happiSky(): THREE.CanvasTexture {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const r = rand(7);
  const horizon = H * 0.5;
  g.fillStyle = HAPPI.sky; g.fillRect(0, 0, W, H);
  // clouds: a few flat puffs above the horizon
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 14; i++) {
    const x = r() * W, y = H * (0.14 + r() * 0.26), s = 26 + r() * 38;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x + (k - 1.5) * s * 0.9, y - (k === 1 || k === 2 ? s * 0.45 : 0), s * (k === 1 || k === 2 ? 1 : 0.75), 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(x - s * 2, y - s * 0.2, s * 4, s * 0.9);
  }
  // skyline: soft far row, navy near row (wraps around the whole horizon)
  const row = (col: string, minH: number, maxH: number, seed: number) => {
    const rr = rand(seed);
    g.fillStyle = col;
    let x = 0;
    while (x < W) {
      const w = 24 + rr() * 60, h = minH + rr() * (maxH - minH);
      g.fillRect(x, horizon - h, w + 1, h + 2);
      if (rr() < 0.18) g.fillRect(x + w / 2 - 2, horizon - h - 26, 4, 26); // spire
      x += w;
    }
  };
  row('#8cc9e6', 30, 110, 3);
  row(HAPPI.navy, 14, 64, 11);
  // ground under the horizon (the stage has its own floor; this only shows at the far edge)
  g.fillStyle = '#d9eef7'; g.fillRect(0, horizon, W, H - horizon);
  // a string of lanterns across the sky, alternating red and white
  g.strokeStyle = HAPPI.ink; g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x <= W; x += 8) g.lineTo(x, H * 0.3 + Math.sin((x / W) * Math.PI * 8) * 18);
  g.stroke();
  for (let i = 0, x = 20; x < W; x += 64, i++) {
    const y = H * 0.3 + Math.sin((x / W) * Math.PI * 8) * 18 + 4;
    g.fillStyle = i % 2 ? '#ffffff' : HAPPI.red;
    g.beginPath(); g.ellipse(x, y + 14, 11, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = HAPPI.ink; g.fillRect(x - 7, y - 2, 14, 4); g.fillRect(x - 7, y + 27, 14, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
