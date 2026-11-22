// Happi's plaza (the 3D mode's world): a round stone square on a New York street on parade day. Cherry trees and
// stone lanterns round the edge, a big vermilion torii far behind (his house pops up in front of it), strings of
// paper lanterns, bonsai in pots and cherry petals drifting down. All code-built (src/happi/kit3d.ts), flat colours.
// Everything stands outside the walking area (radius 3.4) and clear of the house's spot (z = -3.6, about 3 wide).
import * as THREE from 'three';
import { Builder, M, box, cyl } from '../experience/scene/house/geo';
import { HP, bonsai, chochin, kitMat, sakura, torii, toro } from './kit3d';

function floor(): THREE.Mesh {
  const n = 512, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const R = n / 2;
  g.fillStyle = '#ece6da';
  g.beginPath(); g.arc(R, R, R, 0, 7); g.fill();
  // paving rings and joints
  g.strokeStyle = '#d6cfc1';
  g.lineWidth = 3;
  for (let r = 40; r < R; r += 38) {
    g.beginPath(); g.arc(R, R, r, 0, 7); g.stroke();
    const k = Math.round((2 * Math.PI * r) / 46);
    for (let i = 0; i < k; i++) {
      const a = (i + (r / 38) * 0.5) * (2 * Math.PI / k);
      g.beginPath(); g.moveTo(R + Math.cos(a) * r, R + Math.sin(a) * r); g.lineTo(R + Math.cos(a) * (r + 38), R + Math.sin(a) * (r + 38)); g.stroke();
    }
  }
  // a navy ring with a white checker band (the parade's trim), and a blossom in the middle
  g.fillStyle = '#283a8f';
  g.beginPath(); g.arc(R, R, 34, 0, 7); g.fill();
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    g.beginPath(); g.ellipse(R + Math.cos(a) * 13, R + Math.sin(a) * 13, 12, 8, a, 0, 7); g.fill();
  }
  g.fillStyle = '#f37321';
  g.beginPath(); g.arc(R, R, 6, 0, 7); g.fill();
  const ring = R - 22;
  for (let i = 0; i < 96; i++) {
    const a0 = (i / 96) * Math.PI * 2, a1 = ((i + 1) / 96) * Math.PI * 2;
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#283a8f' : '#ffffff';
      g.beginPath(); g.arc(R, R, ring + 8 + j * 8, a0, a1); g.arc(R, R, ring + j * 8, a1, a0, true); g.fill();
    }
  }
  // fallen petals
  g.fillStyle = '#ffb7c9';
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * (R - 70);
    g.beginPath(); g.ellipse(R + Math.cos(a) * r, R + Math.sin(a) * r, 4, 2.5, Math.random() * 3, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.CircleGeometry(5.6, 96), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -3;
  m.name = 'happi-plaza-floor';
  return m;
}

/** Cherry petals drifting down over the square (one Points draw, animated in its own onBeforeRender). */
function petals(): THREE.Points {
  const N = 90, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 4.5;
    pos.set([Math.cos(a) * r, Math.random() * 4, Math.sin(a) * r - 0.5], i * 3);
    seed[i] = Math.random() * 10;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffb7c9';
  x.beginPath(); x.ellipse(16, 16, 13, 8, 0.6, 0, 7); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 0.07, transparent: true, alphaTest: 0.4, depthWrite: false }));
  p.name = 'happi-petals';
  p.frustumCulled = false;
  let last = performance.now();
  p.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    for (let i = 0; i < N; i++) {
      let y = pos[i * 3 + 1] - dt * (0.22 + (seed[i] % 1) * 0.12);
      if (y < 0.02) y = 3.6 + Math.random() * 0.5;
      pos[i * 3 + 1] = y;
      pos[i * 3] += Math.sin(t * 0.9 + seed[i]) * dt * 0.18;
      pos[i * 3 + 2] += Math.cos(t * 0.7 + seed[i]) * dt * 0.1;
    }
    g.attributes.position.needsUpdate = true;
  };
  return p;
}

export function happiPlaza(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'happi-plaza';
  root.add(floor());
  const b = new Builder();
  // the big torii far behind (the house pops up in front of it)
  torii(b, M(0, 0, -6.4), 4.2, 4.4);
  // cherry trees and stone lanterns round the square
  sakura(b, M(-4.3, 0, -2.6, 0, 0.4), 3.0, 1);
  sakura(b, M(4.4, 0, -2.3, 0, -0.6), 2.8, 2);
  sakura(b, M(-4.9, 0, 1.4, 0, 1.1), 2.6, 3);
  sakura(b, M(5.0, 0, 1.1, 0, 2.0), 2.7, 4);
  toro(b, M(-3.7, 0, -0.6), 1.0);
  toro(b, M(3.8, 0, -0.4), 1.0);
  bonsai(b, M(-2.7, 0, -3.9), 0.6);
  bonsai(b, M(2.8, 0, -3.8), 0.6);
  // two lantern poles with a string of paper lanterns between them, behind the square
  const poles: Array<[number, number]> = [[-3.0, -4.6], [3.0, -4.6]];
  for (const [x, z] of poles) {
    b.add(cyl(0.05, 0.06, 2.8, 8), HP.woodDark, M(x, 1.4, z));
    b.add(cyl(0.08, 0.08, 0.06, 8), HP.ink, M(x, 2.83, z));
  }
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = -3.0 + 6.0 * u, sag = Math.sin(Math.PI * u) * 0.45, y = 2.72 - sag;
    if (i < n) {
      const x2 = -3.0 + 6.0 * ((i + 1) / n), y2 = 2.72 - Math.sin(Math.PI * ((i + 1) / n)) * 0.45;
      const len = Math.hypot(x2 - x, y2 - y);
      b.add(box(len, 0.012, 0.012), HP.ink, M((x + x2) / 2, (y + y2) / 2, -4.6, 0, 0, Math.atan2(y2 - y, x2 - x)));
    }
    if (i > 0 && i < n) chochin(b, M(x, y, -4.6), 0.32, i % 2 ? HP.red : HP.white);
  }
  const props = new THREE.Mesh(b.build(), kitMat());
  props.name = 'happi-plaza-props';
  root.add(props, petals());
  return root;
}
