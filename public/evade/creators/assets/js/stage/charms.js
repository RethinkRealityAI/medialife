/**
 * The current drop: the Bobo × Eclipse acrylic charm set.
 *
 * A focused copy of /merch-shelf/keychain.js (same die-cut outline, extruded
 * bevelled acrylic, silver lobster clasp), changed for a real double-sided
 * print: each charm has a front face and a back face (the art reads the right
 * way round from both sides), and the back of the Bobo charm carries the
 * activation panel: a QR and "SCAN TO ACTIVATE".
 */
import * as THREE from "three";
import { makeDieCut, makeCanvas, drawQR, roundRect, FONT_SANS, FONT_MONO } from "/merch-shelf/art.js";

function outline(canvas, { rays = 140, padPx = 14 } = {}) {
  const { width: W, height: H } = canvas;
  const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 128) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  const cx = n ? sx / n : W / 2;
  const cy = n ? sy / n : H / 2;
  const maxR = Math.hypot(W, H);
  const radii = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let found = 0;
    for (let r = maxR; r > 0; r -= 2) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (data[(y * W + x) * 4 + 3] > 128) {
        found = r;
        break;
      }
    }
    radii.push(found + padPx);
  }
  const sm = radii.map((_, i) => {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += radii[(i + k + rays) % rays];
    return s / 7;
  });
  return { cx, cy, radii: sm, W, H };
}

function acrylicMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf4fbff,
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    opacity: 0.16,
    clearcoat: 0.7,
    clearcoatRoughness: 0.06,
    ior: 1.5,
    specularIntensity: 0.55,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** The back print of the Bobo charm: the art, with the activation panel over its belly. */
function activationBack(face, url) {
  const W = face.width;
  const H = face.height;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.drawImage(face, 0, 0);
  const pw = W * 0.5;
  const ph = pw * 1.36;
  const px = (W - pw) / 2;
  const py = H * 0.43;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  roundRect(ctx, px, py, pw, ph, pw * 0.1);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, px, py, pw, ph, pw * 0.1);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#f6c344";
  ctx.stroke();
  const q = pw * 0.8;
  drawQR(ctx, url, px + (pw - q) / 2, py + pw * 0.1, q, { dark: "#0e1116", margin: 0 });
  ctx.fillStyle = "#0e1116";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = Math.round(pw * 0.105);
  ctx.font = `700 ${fs}px ${FONT_SANS}`;
  while (ctx.measureText("SCAN TO ACTIVATE").width > pw * 0.9 && fs > 8) {
    fs--;
    ctx.font = `700 ${fs}px ${FONT_SANS}`;
  }
  ctx.fillText("SCAN TO ACTIVATE", W / 2, py + pw * 0.1 + q + fs * 1.0);
  ctx.font = `500 ${Math.round(fs * 0.72)}px ${FONT_MONO}`;
  ctx.fillStyle = "#4b5260";
  ctx.fillText("PLAY COLA RUN", W / 2, py + pw * 0.1 + q + fs * 2.15);
  return c;
}

/**
 * Stand tilted art upright: the rotation (within ±50°) that gives the
 * narrowest bounding box, so the can charm is cut like the proof (31 × 55 mm).
 */
export function uprightArt(art) {
  const W = art.width;
  const H = art.height;
  const probe = makeCanvas(W, H);
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(art, 0, 0);
  const d = pctx.getImageData(0, 0, W, H).data;
  const pts = [];
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) if (d[(y * W + x) * 4 + 3] > 128) pts.push([x - W / 2, y - H / 2]);
  let best = { a: 0, r: Infinity, w: W, h: H };
  for (let deg = -50; deg <= 50; deg += 1) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      if (rx < x0) x0 = rx;
      if (rx > x1) x1 = rx;
      if (ry < y0) y0 = ry;
      if (ry > y1) y1 = ry;
    }
    const r = (x1 - x0) / (y1 - y0);
    if (r < best.r) best = { a, r, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  if (Math.abs(best.a) < 0.02) return art;
  const out = makeCanvas(best.w + 8, best.h + 8);
  const ctx = out.getContext("2d");
  ctx.translate(out.width / 2 - best.cx, out.height / 2 - best.cy);
  ctx.rotate(best.a);
  ctx.drawImage(art, -W / 2, -H / 2);
  return out;
}

/** One charm. Origin = its hanging hole. */
function charm(art, height, { backUrl, keep }) {
  const cut = makeDieCut(art, { size: 640 });
  const face = cut.face;
  const o = outline(face, { padPx: 20 });
  const scale = height / o.H;
  const shape = new THREE.Shape();
  let topY = -Infinity;
  o.radii.forEach((r, i) => {
    const a = (i / o.radii.length) * Math.PI * 2;
    const x = (o.cx + Math.cos(a) * r - o.W / 2) * scale;
    const y = -(o.cy + Math.sin(a) * r - o.H / 2) * scale;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
    topY = Math.max(topY, y);
  });
  shape.closePath();
  // 3 mm acrylic on a 65 mm charm, to scale with the charm's height
  const thick = height * (3 / 65);
  const bevel = thick * 0.22;
  const depth = thick - bevel * 2;
  const geo = keep(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.9,
      bevelSegments: 3,
      curveSegments: 2,
    }),
  );
  geo.translate(0, 0, -depth / 2);
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, keep(acrylicMaterial()));
  body.renderOrder = 5;

  const mats = [];
  const plane = keep(new THREE.PlaneGeometry(o.W * scale, o.H * scale));
  const mkFace = (canvas, back) => {
    const t = keep(new THREE.CanvasTexture(canvas));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const m = keep(
      new THREE.MeshStandardMaterial({
        map: t,
        color: 0xd8d8d8,
        alphaTest: 0.5,
        roughness: 0.42,
        metalness: 0,
        emissive: 0xffffff,
        emissiveMap: t,
        emissiveIntensity: 0.05,
      }),
    );
    mats.push(m);
    const mesh = new THREE.Mesh(plane, m);
    // printed on the faces of the block (UV print sits on the surface)
    mesh.position.z = back ? -(thick / 2 - bevel * 0.5) : thick / 2 - bevel * 0.5;
    if (back) mesh.rotation.y = Math.PI;
    mesh.castShadow = true;
    return mesh;
  };
  g.add(mkFace(face, false));
  g.add(mkFace(backUrl ? activationBack(face, backUrl) : face, true));
  g.add(body);

  const holeY = topY - 0.009;
  g.children.forEach((c) => (c.position.y -= holeY));
  return { group: g, materials: mats, height };
}

/**
 * @param {{bobo:HTMLCanvasElement|HTMLImageElement, can:HTMLCanvasElement|HTMLImageElement, activateUrl:string, quality:string, reduced:boolean}} o
 */
export function buildDropCharms({ bobo, can, activateUrl, quality = "high", reduced = false }) {
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const group = new THREE.Group();
  group.name = "charms";
  const silver = keep(
    new THREE.MeshStandardMaterial({ color: 0xc3c8d2, metalness: 1, roughness: 0.22, envMapIntensity: 1 }),
  );

  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.016, 0.0022, 8, 40)), silver);
  ring.position.y = -0.016;
  ring.rotation.y = Math.PI / 2.4;
  group.add(ring);
  const swivel = new THREE.Mesh(keep(new THREE.TorusGeometry(0.005, 0.0016, 6, 20)), silver);
  swivel.position.y = -0.036;
  group.add(swivel);
  const lobster = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0062, 0.02, 4, 12)), silver);
  lobster.position.y = -0.056;
  lobster.scale.set(1, 1, 0.7);
  group.add(lobster);
  const gate = new THREE.Mesh(keep(new THREE.TorusGeometry(0.0075, 0.0014, 6, 20, Math.PI)), silver);
  gate.position.set(0, -0.07, 0);
  gate.rotation.z = Math.PI;
  group.add(gate);
  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(keep(new THREE.TorusGeometry(0.0045, 0.0012, 6, 16)), silver);
    link.position.y = -0.08 - i * 0.0075;
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    link.scale.set(1, 1.35, 1);
    group.add(link);
  }
  const lower = new THREE.Mesh(keep(new THREE.TorusGeometry(0.011, 0.0018, 8, 32)), silver);
  lower.position.y = -0.112;
  group.add(lower);

  const swing = new THREE.Group();
  swing.position.y = -0.12;
  group.add(swing);
  // production proof: Bobo 58.75 × 65 mm, can 31 × 55 mm
  const a = charm(bobo, 0.2, { backUrl: activateUrl, keep });
  const b = charm(uprightArt(can), 0.2 * (55 / 65), { backUrl: null, keep });
  const pa = new THREE.Group();
  pa.add(a.group);
  pa.position.set(-0.042, -0.004, -0.006);
  const pb = new THREE.Group();
  pb.add(b.group);
  pb.position.set(0.052, -0.008, 0.014);
  pb.rotation.z = -0.12;
  swing.add(pa, pb);
  for (const p of [pa, pb]) {
    const jr = new THREE.Mesh(keep(new THREE.TorusGeometry(0.006, 0.0014, 6, 18)), silver);
    jr.rotation.y = Math.PI / 2;
    jr.position.copy(p.position).add(new THREE.Vector3(0, 0.002, 0));
    swing.add(jr);
  }
  group.traverse((o) => {
    if (o.isMesh && quality === "high") o.castShadow = true;
  });

  let t = Math.random() * 10;
  const amp = reduced ? 0.35 : 1;
  const idle = (dt) => {
    t += dt;
    group.rotation.z = Math.sin(t * 1.1) * 0.035 * amp;
    pa.rotation.z = Math.sin(t * 1.7 + 1) * 0.04 * amp;
    pb.rotation.z = -0.12 + Math.sin(t * 1.4) * 0.05 * amp;
    pa.rotation.y = Math.sin(t * 0.6) * 0.3 * amp;
    pb.rotation.y = Math.sin(t * 0.5 + 2) * 0.35 * amp;
  };
  const materials = [...a.materials, ...b.materials];
  return {
    group,
    materials,
    size: new THREE.Vector3(0.17, 0.33, 0.03),
    idle,
    highlight(k) {
      for (const m of materials) m.emissiveIntensity = 0.05 + k * 0.12;
    },
    dispose: () => disposables.forEach((d) => d.dispose?.()),
  };
}
