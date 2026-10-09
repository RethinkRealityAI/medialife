/**
 * The acrylic charm set (the lineup's keychain): two clear die-cut acrylic
 * charms with the art UV-printed inside, polished bevelled edges, hanging from
 * a silver lobster clasp. Built procedurally so the art is the creator's own.
 *
 * The acrylic outline follows the art: rays are cast from the art's centre to
 * find its silhouette, padded and smoothed into a THREE.Shape, then extruded
 * with a bevel so the edges catch the light like a polished cut.
 */
import * as THREE from "three";
import { makeDieCut, makeCanvas, drawQR } from "./art.js";

function outline(canvas, { rays = 120, padPx = 14 } = {}) {
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
  // smooth: a die-cut has no spikes
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
    roughness: 0.04,
    transparent: true,
    opacity: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 1.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** One charm: extruded acrylic + the printed art inside. Origin = its hanging hole. */
function charm(art, height, { qrUrl, keep }) {
  const cut = makeDieCut(art, { size: 512 });
  const face = cut.face;
  const o = outline(face, { padPx: 18 });
  const scale = height / o.H;
  // find the top of the outline (the hole goes there)
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
  const depth = 0.006;
  const geo = keep(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.0016,
      bevelSize: 0.0016,
      bevelSegments: 2,
      curveSegments: 2,
    }),
  );
  geo.translate(0, 0, -depth / 2);
  const g = new THREE.Group();
  const acrylic = keep(acrylicMaterial());
  const body = new THREE.Mesh(geo, acrylic);
  body.renderOrder = 5;

  const tex = keep(new THREE.CanvasTexture(face));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const artMat = keep(
    new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xcccccc,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: 0x000000,
    }),
  );
  const artMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(o.W * scale, o.H * scale)), artMat);
  artMesh.castShadow = true;
  g.add(artMesh, body);

  const tagMats = [];
  if (qrUrl) {
    const q = makeCanvas(160, 160);
    drawQR(q.getContext("2d"), qrUrl, 0, 0, 160, { dark: "#111216", light: "#ffffff", margin: 2 });
    const qt = keep(new THREE.CanvasTexture(q));
    qt.colorSpace = THREE.SRGBColorSpace;
    const qm = keep(
      new THREE.MeshStandardMaterial({
        map: qt,
        emissive: 0xffffff,
        emissiveMap: qt,
        emissiveIntensity: 0.12,
        roughness: 0.6,
      }),
    );
    const qr = new THREE.Mesh(keep(new THREE.PlaneGeometry(height * 0.28, height * 0.28)), qm);
    qr.rotation.y = Math.PI;
    qr.position.set(0, -height * 0.05, -0.0007);
    g.add(qr);
    tagMats.push(qm);
  }
  // shift so the hole (just under the top edge) is the origin
  const holeY = topY - 0.008;
  g.children.forEach((c) => (c.position.y -= holeY));
  return { group: g, materials: [artMat], tagMats, height };
}

export function buildCharmSet({ kit, activateUrl, quality }) {
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const group = new THREE.Group();
  const silver = keep(
    new THREE.MeshStandardMaterial({
      color: 0xb9bec8,
      metalness: 1,
      roughness: 0.28,
      envMapIntensity: 0.8,
    }),
  );

  // split ring on the peg (origin = where it touches the peg)
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.016, 0.0022, 8, 40)), silver);
  ring.position.y = -0.016;
  ring.rotation.y = Math.PI / 2.4;
  group.add(ring);

  // swivel + lobster clasp
  const swivel = new THREE.Mesh(keep(new THREE.TorusGeometry(0.005, 0.0016, 6, 20)), silver);
  swivel.position.y = -0.036;
  group.add(swivel);
  const lobster = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0062, 0.02, 4, 12)), silver);
  lobster.position.y = -0.056;
  lobster.scale.set(1, 1, 0.7);
  group.add(lobster);
  const gate = new THREE.Mesh(
    keep(new THREE.TorusGeometry(0.0075, 0.0014, 6, 20, Math.PI)),
    silver,
  );
  gate.position.set(0, -0.07, 0);
  gate.rotation.z = Math.PI;
  group.add(gate);
  // a few chain links down to the charm ring
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

  // two charms: the logo, and the round badge
  const swing = new THREE.Group();
  swing.position.y = -0.12;
  group.add(swing);
  const a = charm(kit.logo(kit.isWordmark ? "dark" : "light"), 0.19, { qrUrl: activateUrl, keep });
  const b = charm(kit.badge(), 0.13, { qrUrl: null, keep });
  const pa = new THREE.Group();
  pa.add(a.group);
  pa.position.set(-0.04, -0.004, -0.006);
  const pb = new THREE.Group();
  pb.add(b.group);
  pb.position.set(0.055, -0.01, 0.012);
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
  const idle = (dt) => {
    t += dt;
    group.rotation.z = Math.sin(t * 1.1) * 0.035;
    pa.rotation.z = Math.sin(t * 1.7 + 1) * 0.04;
    pb.rotation.z = -0.12 + Math.sin(t * 1.4) * 0.05;
    pa.rotation.y = Math.sin(t * 0.6) * 0.25;
    pb.rotation.y = Math.sin(t * 0.5 + 2) * 0.3;
    return true;
  };

  return {
    group,
    materials: [...a.materials, ...b.materials],
    tagMats: [...a.tagMats],
    size: new THREE.Vector3(0.16, 0.32, 0.03),
    idle,
    dispose: () => disposables.forEach((d) => d.dispose?.()),
  };
}
