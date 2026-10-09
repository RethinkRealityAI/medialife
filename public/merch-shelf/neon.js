/**
 * The neon sign: the creator's name in glass tubes above the shelf.
 *
 * Each letter is its own plane cut from one canvas (so the glyphs keep their
 * kerning) and has its own brightness, which is what makes the ignition
 * flicker and the occasional hum read as a real sign rather than a fade.
 * Lit tubes are drawn with colour values above 1 and no tone mapping, so the
 * bloom pass picks them up and nothing else.
 */
import * as THREE from "three";
import { FONT_NEON, makeCanvas, roundRect, radialCanvas } from "./art.js";

const LIT_BASE = 2.0; // HDR multiplier of a lit tube (for a mid-luminance colour like #ff37ae)
const OFF = 0.1; // an unlit tube is pale glass

function tubeText(text, { size, color, glow, core = "#ffffff" }) {
  const probe = makeCanvas(8, 8).getContext("2d");
  probe.font = `400 ${size}px ${FONT_NEON}`;
  const pad = Math.round(size * 0.32);
  const tw = Math.ceil(probe.measureText(text).width);
  const W = tw + pad * 2;
  const H = Math.round(size * 1.5);
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.font = probe.font;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const y = H / 2 + size * 0.04;
  // halo baked into the texture (bloom adds the rest)
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.16;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.075;
  ctx.strokeText(text, pad, y);
  ctx.shadowBlur = size * 0.08;
  ctx.strokeText(text, pad, y);
  ctx.shadowBlur = 0;
  // the hot core of the tube
  ctx.fillStyle = core;
  ctx.fillText(text, pad, y);
  // letter boundaries, so each letter can be a separate plane
  const edges = [0];
  for (let i = 1; i < [...text].length; i++) {
    edges.push(pad + probe.measureText([...text].slice(0, i).join("")).width);
  }
  edges.push(W);
  return { canvas: c, edges, W, H };
}

function mix(hexA, hexB, t) {
  return "#" + new THREE.Color(hexA).lerp(new THREE.Color(hexB), t).getHexString();
}

/**
 * @param {{name:string, handle:string, neon:string, accent:string, maxWidth:number, reduced:boolean}} o
 */
export function buildSign({ name, handle, neon, accent, maxWidth, reduced = false }) {
  const group = new THREE.Group();
  group.name = "neon";
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  const text = name.trim() || "YOUR NAME";
  const chars = [...text];
  const t = tubeText(text, {
    size: 180,
    color: neon,
    glow: neon,
    core: mix(neon, "#ffffff", 0.32),
  });
  const tex = keep(new THREE.CanvasTexture(t.canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  // fit: letters ~0.3 tall, but never wider than the shelf
  let height = 0.34;
  let width = (height * t.W) / t.H;
  if (width > maxWidth) {
    width = maxWidth;
    height = (width * t.H) / t.W;
  }
  const letters = [];
  const neonCol = new THREE.Color(neon);
  // Pale tubes (cyan, lime, white) clip to white under bloom at the same drive,
  // so drive them down by luminance to keep the colour.
  const lum = 0.2126 * neonCol.r + 0.7152 * neonCol.g + 0.0722 * neonCol.b;
  const LIT = Math.max(1.25, LIT_BASE * Math.min(1, Math.sqrt(0.27 / Math.max(0.05, lum))));
  for (let i = 0; i < chars.length; i++) {
    const u0 = t.edges[i] / t.W;
    const u1 = t.edges[i + 1] / t.W;
    const w = (u1 - u0) * width;
    if (w <= 0) continue;
    const geo = keep(new THREE.PlaneGeometry(w, height));
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) < 0.5 ? u0 : u1);
    const mat = keep(
      new THREE.MeshBasicMaterial({
        map: tex,
        color: new THREE.Color(1, 1, 1).multiplyScalar(OFF),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const m = new THREE.Mesh(geo, mat);
    m.position.set(-width / 2 + ((u0 + u1) / 2) * width, 0, 0.012);
    m.renderOrder = 4;
    group.add(m);
    letters.push({ mesh: m, mat, start: 0, level: OFF, space: /\s/.test(chars[i]) });
  }

  // handle, smaller, in a cool white tube
  let handleMesh = null;
  let handleH = 0;
  if (handle && handle.trim()) {
    const ht = tubeText(handle.trim(), {
      size: 110,
      color: mix(accent, "#ffffff", 0.45),
      glow: accent,
      core: "#ffffff",
    });
    const htex = keep(new THREE.CanvasTexture(ht.canvas));
    htex.colorSpace = THREE.SRGBColorSpace;
    handleH = Math.min(0.14, height * 0.42);
    let hw = (handleH * ht.W) / ht.H;
    if (hw > maxWidth * 0.8) {
      hw = maxWidth * 0.8;
      handleH = (hw * ht.H) / ht.W;
    }
    handleMesh = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(hw, handleH)),
      keep(
        new THREE.MeshBasicMaterial({
          map: htex,
          color: new THREE.Color(1, 1, 1).multiplyScalar(OFF),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    handleMesh.position.set(0, -height * 0.5 - handleH * 0.32, 0.012);
    handleMesh.renderOrder = 4;
    group.add(handleMesh);
  }

  // clear acrylic backer with standoffs and hanging wires
  const backW = width * 1.04;
  const top = height * 0.42;
  const bottom = handleMesh ? -height * 0.5 - handleH * 1.05 : -height * 0.42;
  const backH = top - bottom;
  const bc = makeCanvas(512, Math.max(64, Math.round((512 * backH) / backW)));
  {
    const ctx = bc.getContext("2d");
    roundRect(ctx, 3, 3, bc.width - 6, bc.height - 6, 22);
    ctx.fillStyle = "rgba(200,220,255,0.018)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(220,235,255,0.1)";
    ctx.stroke();
  }
  const backTex = keep(new THREE.CanvasTexture(bc));
  backTex.colorSpace = THREE.SRGBColorSpace;
  const backer = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(backW, backH)),
    keep(new THREE.MeshBasicMaterial({ map: backTex, transparent: true, depthWrite: false })),
  );
  backer.position.set(0, (top + bottom) / 2, -0.01);
  group.add(backer);

  const metal = keep(
    new THREE.MeshStandardMaterial({ color: 0xb8bcc6, metalness: 1, roughness: 0.3 }),
  );
  const standGeo = keep(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 12));
  const capGeo = keep(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16));
  for (const sx of [-1, 1]) {
    for (const sy of [top - 0.035, bottom + 0.035]) {
      const s = new THREE.Mesh(standGeo, metal);
      s.rotation.x = Math.PI / 2;
      s.position.set(sx * (backW / 2 - 0.035), sy, -0.035);
      group.add(s);
      const cap = new THREE.Mesh(capGeo, metal);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(sx * (backW / 2 - 0.035), sy, 0.0);
      group.add(cap);
    }
  }
  const wireMat = keep(new THREE.MeshBasicMaterial({ color: 0x2a2c33 }));
  const wireGeo = keep(new THREE.CylinderGeometry(0.0025, 0.0025, 3, 6));
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(wireGeo, wireMat);
    w.position.set(sx * (backW / 2 - 0.035), top - 0.035 + 1.5, -0.04);
    group.add(w);
  }

  // halo on the wall behind
  const haloTex = keep(
    new THREE.CanvasTexture(
      radialCanvas([
        [0, "rgba(255,255,255,0.55)"],
        [0.35, "rgba(255,255,255,0.18)"],
        [1, "rgba(255,255,255,0)"],
      ]),
    ),
  );
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(width * 1.7, height * 3.2)),
    keep(
      new THREE.MeshBasicMaterial({
        map: haloTex,
        color: neonCol.clone().multiplyScalar(0),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  halo.position.set(0, 0, -0.08);
  group.add(halo);

  // ---- animation --------------------------------------------------------
  let clock = 0;
  let ignitedAt = null;
  let nextHum = 6 + Math.random() * 6;
  let hum = null; // { i, until }
  let lit = false;

  /** Start the ignition sequence (letters stutter on in a random order). */
  function ignite() {
    ignitedAt = clock;
    lit = true;
    letters.forEach((l) => (l.start = reduced ? 0 : 0.12 + Math.random() * 0.85));
  }
  function setLit(on) {
    lit = on;
    ignitedAt = on ? clock - 10 : null;
  }

  const flicker = (age) => {
    // a short stutter: on/off a few times inside the first 0.32 s
    if (age < 0) return OFF;
    if (age > 0.32) return 1;
    const k = Math.floor(age * 28);
    return [1, 0, 0, 1, 0, 1, 1, 0, 1][k % 9] ? 0.85 : OFF;
  };

  /** Advance; returns true while something visibly changed. */
  function update(dt) {
    clock += dt;
    let changed = false;
    let sum = 0;
    let n = 0;
    if (!reduced && lit && ignitedAt !== null && clock - ignitedAt > 2) {
      if (!hum && clock > nextHum && letters.length) {
        hum = {
          i: Math.floor(Math.random() * letters.length),
          until: clock + 0.18 + Math.random() * 0.3,
        };
        nextHum = clock + 6 + Math.random() * 9;
      }
      if (hum && clock > hum.until) hum = null;
    }
    for (let i = 0; i < letters.length; i++) {
      const l = letters[i];
      let target;
      if (!lit || ignitedAt === null) target = OFF;
      else if (reduced) target = Math.min(1, (clock - ignitedAt) / 0.6);
      else target = flicker(clock - ignitedAt - l.start);
      if (hum && hum.i === i) target = Math.random() > 0.45 ? 0.45 : 1;
      const level = target <= OFF ? OFF : OFF + (LIT - OFF) * target;
      if (Math.abs(level - l.level) > 1e-3) {
        l.level = level;
        l.mat.color.setScalar(level);
        changed = true;
      }
      if (!l.space) {
        sum += (level - OFF) / (LIT - OFF);
        n++;
      }
    }
    const avg = n ? sum / n : 0;
    if (handleMesh) {
      const age = lit && ignitedAt !== null ? clock - ignitedAt - 1.05 : -1;
      const hv =
        age < 0
          ? OFF
          : OFF +
            (LIT * 0.8 - OFF) *
              Math.min(1, reduced ? age / 0.5 : flicker(age) * Math.min(1, age * 4));
      if (Math.abs(handleMesh.material.color.r - hv) > 1e-3) {
        handleMesh.material.color.setScalar(hv);
        changed = true;
      }
    }
    halo.material.color.copy(neonCol).multiplyScalar(0.22 * avg);
    const animating = (lit && ignitedAt !== null && clock - ignitedAt < 2.2) || !!hum;
    return changed || animating;
  }

  function dispose() {
    for (const d of disposables) d.dispose?.();
    group.removeFromParent();
  }

  const bounds = { width: backW, top, bottom, height: backH };
  return {
    group,
    bounds,
    ignite,
    setLit,
    update,
    dispose,
    get lit() {
      return lit;
    },
  };
}
