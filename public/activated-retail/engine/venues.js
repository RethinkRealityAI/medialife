/* Venues for the activated-retail engine: the same fixture on a store aisle (built in engine.js),
 * in a pop-up shop, or on a convention floor. Loaded on first use, so projects that only use the
 * store never download it.
 *
 *   const V = await import("/activated-retail/engine/venues.js");
 *   const popup = await V.build("popup", ctx);   // → { group, light(night), bounds, blockers, floor }
 *
 * Everything is plain geometry and canvas textures: no downloads, a handful of draw calls, and no
 * real lights (the fixture stays the brightest thing in the scene). Nothing here casts shadows.
 * The fixture sits at the origin (about x -1.95…1.95, z -0.6…1.5) with the totem at x 3, z 1.1:
 * props keep clear of that footprint so every camera view still frames the display.
 */

const FONT_DISPLAY = 'Unbounded, "Arial Black", system-ui, sans-serif';

export async function build(kind, ctx) {
  if (kind === "popup") return buildPopup(ctx);
  if (kind === "convention") return buildConvention(ctx);
  throw new Error("Unknown venue: " + kind);
}

/* ---------- shared helpers ---------- */
function std(THREE, o) {
  return new THREE.MeshStandardMaterial(o);
}
function place(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}
// one InstancedMesh for many copies of a geometry: [x, y, z, ry, sx, sy, sz, color?][]
function instances(THREE, geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    c = new THREE.Color();
  list.forEach((it, i) => {
    const [x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, col] = it;
    e.set(0, ry, 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    m.setMatrixAt(i, m4);
    if (col != null) m.setColorAt(i, c.set(col));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  return m;
}
function noise(g, w, h, r, n, base, spread, alpha) {
  for (let i = 0; i < n; i++) {
    const v = (base + r() * spread) | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha[0] + r() * alpha[1]})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
}
function blotches(g, w, h, r, n, rgb, a) {
  for (let i = 0; i < n; i++) {
    const x = r() * w,
      y = r() * h,
      rad = 40 + r() * 220;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${rgb},${a * (0.4 + r() * 0.6)})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
// the brand name, fitted to a box, with an optional glow (neon, lightbox faces)
function brandText(g, text, cx, cy, maxW, size, fill, glow) {
  let s = size;
  g.font = `700 ${s}px ${FONT_DISPLAY}`;
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    g.font = `700 ${s}px ${FONT_DISPLAY}`;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (glow) {
    g.save();
    g.shadowColor = glow;
    for (const b of [s * 0.9, s * 0.45, s * 0.18]) {
      g.shadowBlur = b;
      g.fillStyle = glow;
      g.fillText(text, cx, cy);
    }
    g.restore();
  }
  g.fillStyle = fill;
  g.fillText(text, cx, cy);
}
// soft light cone (night beams): additive, no depth write, fades to nothing at the far end
function beamTexture(canvasTex) {
  return canvasTex(
    64,
    256,
    (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(0.35, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );
}

/* =========================================================
   Pop-up shop: a raw retail unit — polished concrete, limewashed brick, black ceiling with track
   spots, garment rails and display plinths, a neon sign and a street window.
   ========================================================= */
async function buildPopup({ THREE, canvasTex, rand, brand, fonts }) {
  await fonts?.().catch?.(() => {});
  const group = new THREE.Group();
  group.name = "VENUE_popup";
  const X0 = -8,
    X1 = 8,
    Z0 = -3.4,
    Z1 = 12,
    H = 3.9;

  // floor: polished concrete with saw-cut joints every 3 m (texture repeat = 3 m)
  const floorTex = canvasTex(
    1024,
    1024,
    (g, w, h) => {
      g.fillStyle = "#9a9590";
      g.fillRect(0, 0, w, h);
      const r = rand(21);
      blotches(g, w, h, r, 26, "70,66,62", 0.14);
      blotches(g, w, h, r, 18, "190,186,180", 0.1);
      noise(g, w, h, r, 14000, 120, 70, [0.04, 0.06]);
      g.strokeStyle = "rgba(60,56,52,.55)";
      g.lineWidth = 3;
      g.strokeRect(1, 1, w - 2, h - 2);
    },
    { repeat: [20, 20] },
  );

  // walls: limewashed brick, running bond (texture = 2 m × 2 m)
  const brick = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#c9c2b8";
    g.fillRect(0, 0, w, h);
    const r = rand(33);
    const bw = 110,
      bh = 34,
      m = 6;
    for (let row = 0, y = 0; y < h; row++, y += bh + m) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw + m) {
        const v = 200 + r() * 40;
        const warm = r() * 18;
        g.fillStyle = `rgb(${v | 0},${(v - 8 - warm * 0.4) | 0},${(v - 16 - warm) | 0})`;
        g.fillRect(x, y, bw, bh);
        // limewash: some bricks show the red clay through
        if (r() < 0.18) {
          g.fillStyle = `rgba(150,78,58,${0.12 + r() * 0.2})`;
          g.fillRect(x + r() * bw * 0.5, y + r() * bh * 0.4, bw * (0.3 + r() * 0.5), bh * 0.6);
        }
      }
    }
    noise(g, w, h, r, 9000, 150, 90, [0.03, 0.05]);
  });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const brickMat = (wm, hm) => {
    const t = brick.clone();
    t.needsUpdate = true;
    t.repeat.set(wm / 2, hm / 2);
    return std(THREE, { map: t, roughness: 0.92 });
  };
  const wall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), brickMat(w, H));
    return (group.add(place(m, x, H / 2, z, ry)), m);
  };
  wall(X1 - X0, 0, Z0, 0);
  wall(Z1 - Z0, X0, (Z0 + Z1) / 2, Math.PI / 2);
  // right wall: brick piers around a street window
  const winW = 7.2,
    winZ = 2.2;
  wall(winZ - winW / 2 - Z0, X1, (Z0 + winZ - winW / 2) / 2, -Math.PI / 2);
  wall(Z1 - (winZ + winW / 2), X1, (winZ + winW / 2 + Z1) / 2, -Math.PI / 2);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(winW, 0.6), brickMat(winW, 0.6));
  group.add(place(sill, X1, 0.3, winZ, -Math.PI / 2));
  const head = new THREE.Mesh(new THREE.PlaneGeometry(winW, 0.5), brickMat(winW, 0.5));
  group.add(place(head, X1, H - 0.25, winZ, -Math.PI / 2));
  // the street through the glass: day (bright, soft) and night (bokeh) versions
  const street = (night) =>
    canvasTex(1024, 512, (g, w, h) => {
      const r = rand(night ? 5 : 6);
      const sky = g.createLinearGradient(0, 0, 0, h);
      if (night) {
        sky.addColorStop(0, "#0b1022");
        sky.addColorStop(0.6, "#1a1733");
        sky.addColorStop(1, "#2a1d2a");
      } else {
        sky.addColorStop(0, "#dfe7ee");
        sky.addColorStop(0.6, "#c9d2d8");
        sky.addColorStop(1, "#a9a39b");
      }
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // buildings across the street, out of focus
      for (let i = 0; i < 14; i++) {
        const bx = r() * w,
          bwid = 60 + r() * 160,
          bh = h * (0.35 + r() * 0.45);
        g.fillStyle = night
          ? `rgba(${20 + r() * 20},${18 + r() * 20},${36 + r() * 30},0.9)`
          : `rgba(${150 + r() * 50},${150 + r() * 45},${150 + r() * 40},0.55)`;
        g.fillRect(bx, h - bh, bwid, bh);
      }
      // bokeh
      const n = night ? 90 : 30;
      for (let i = 0; i < n; i++) {
        const x = r() * w,
          y = h * (0.3 + r() * 0.7),
          rad = 6 + r() * 26;
        const cols = night
          ? ["255,196,120", "255,90,160", "90,190,255", "255,236,200"]
          : ["255,255,255", "255,240,220"];
        const c = cols[(r() * cols.length) | 0];
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${c},${night ? 0.85 : 0.35})`);
        gr.addColorStop(0.7, `rgba(${c},${night ? 0.35 : 0.12})`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    });
  const streetDay = street(false),
    streetNight = street(true);
  const glassMat = new THREE.MeshBasicMaterial({ map: streetDay, fog: false });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, H - 1.1), glassMat);
  group.add(place(glass, X1 + 0.02, 0.6 + (H - 1.1) / 2, winZ, -Math.PI / 2));
  // black steel mullions
  const steel = std(THREE, { color: 0x121214, roughness: 0.45, metalness: 0.6 });
  const mull = [];
  for (let i = 0; i <= 4; i++)
    mull.push([
      X1 - 0.03,
      0.6 + (H - 1.1) / 2,
      winZ - winW / 2 + (i * winW) / 4,
      0,
      0.06,
      H - 1.1,
      0.06,
    ]);
  for (const y of [0.6, H - 0.5, 0.6 + (H - 1.1) * 0.62])
    mull.push([X1 - 0.03, y, winZ, 0, 0.06, 0.05, winW]);
  group.add(instances(THREE, new THREE.BoxGeometry(1, 1, 1), steel, mull));

  // front wall behind the camera (dark, so nothing reads as a hole)
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(X1 - X0, H),
    std(THREE, { color: 0x201e1c, roughness: 0.9 }),
  );
  group.add(place(front, 0, H / 2, Z1, Math.PI));

  // ceiling: black, exposed, with three track runs of spot cans
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(X1 - X0, Z1 - Z0),
    std(THREE, { color: 0x0e0e10, roughness: 0.95 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, (Z0 + Z1) / 2);
  group.add(ceil);
  const tracks = [];
  const cans = [];
  const lamps = [];
  for (const x of [-4.2, -0.2, 3.8]) {
    tracks.push([x, H - 0.03, 3.2, 0, 0.05, 0.04, 12]);
    for (const z of [-1.8, 0.4, 2.6, 4.8, 7.0, 9.2]) {
      cans.push([x, H - 0.17, z, 0, 1, 1, 1]);
      lamps.push([x, H - 0.3, z, 0, 1, 1, 1]);
    }
  }
  group.add(instances(THREE, new THREE.BoxGeometry(1, 1, 1), steel, tracks));
  const canGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.24, 14);
  group.add(instances(THREE, canGeo, steel, cans));
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffe6c4,
    emissiveIntensity: 2.4,
  });
  const lampGeo = new THREE.CircleGeometry(0.062, 16).rotateX(Math.PI / 2);
  group.add(instances(THREE, lampGeo, lampMat, lamps));
  // warm pools of light on the floor under the spots (additive decals)
  const pool = canvasTex(
    256,
    256,
    (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(255,255,255,.8)");
      gr.addColorStop(0.5, "rgba(255,255,255,.25)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );
  const poolMat = new THREE.MeshBasicMaterial({
    map: pool,
    color: 0xffd9a8,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const pools = [];
  for (const x of [-4.2, 3.8])
    for (const z of [2.6, 4.8, 7.0]) pools.push([x, 0.005, z, 0, 1, 1, 1]);
  const poolMesh = instances(
    THREE,
    new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
    poolMat,
    pools,
  );
  poolMesh.renderOrder = 2;
  group.add(poolMesh);

  // neon sign on the back wall, right of the display
  const name = (brand || "POP-UP").toUpperCase();
  const neonTex = canvasTex(1024, 320, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    brandText(g, name, w / 2, h * 0.44, w * 0.86, 150, "#fff4fb", "#ff3d9a");
    g.font = `700 44px ${FONT_DISPLAY}`;
    g.textAlign = "center";
    g.save();
    g.shadowColor = "#3aa8ff";
    g.shadowBlur = 24;
    g.fillStyle = "#e6f6ff";
    g.fillText("POP-UP · NOW OPEN", w / 2, h * 0.84);
    g.restore();
  });
  const neonMat = new THREE.MeshBasicMaterial({
    map: neonTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.81), neonMat);
  group.add(place(neon, 5.25, 2.45, Z0 + 0.03, 0));
  const neonBack = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.0),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, fog: false }),
  );
  group.add(place(neonBack, 5.25, 2.45, Z0 + 0.02, 0));

  // garment rails with hanging hoodies and tees
  const railSteel = std(THREE, { color: 0x18181b, roughness: 0.35, metalness: 0.75 });
  const rails = [];
  const hanging = [];
  const r = rand(44);
  const garmentCols = [0x151517, 0x1f1f23, 0xe9e5dc, 0x3a3a40, 0x2b2b30, 0xd8d2c6];
  const rail = (x0, x1, z) => {
    rails.push([(x0 + x1) / 2, 1.62, z, 0, x1 - x0, 0.035, 0.035]);
    rails.push([x0, 0.82, z, 0, 0.035, 1.64, 0.035]);
    rails.push([x1, 0.82, z, 0, 0.035, 1.64, 0.035]);
    rails.push([x0, 0.02, z, 0, 0.04, 0.04, 0.5]);
    rails.push([x1, 0.02, z, 0, 0.04, 0.04, 0.5]);
    const n = Math.floor((x1 - x0) / 0.19);
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.14 + i * ((x1 - x0 - 0.28) / Math.max(1, n - 1));
      const long = r() < 0.55;
      hanging.push([
        x,
        long ? 1.18 : 1.27,
        z + (r() - 0.5) * 0.02,
        Math.PI / 2 + (r() - 0.5) * 0.12,
        0.56 + r() * 0.06,
        long ? 0.78 : 0.6,
        0.05,
        garmentCols[(r() * garmentCols.length) | 0],
      ]);
    }
  };
  rail(-6.4, -3.6, -1.1);
  rail(4.7, 7.1, -2.3);
  group.add(instances(THREE, new THREE.BoxGeometry(1, 1, 1), railSteel, rails));
  const garmentGeo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const garmentMat = std(THREE, { color: 0xffffff, roughness: 0.95 });
  group.add(instances(THREE, garmentGeo, garmentMat, hanging));

  // display plinths with folded stacks
  const plinthMat = std(THREE, { color: 0xf1ede6, roughness: 0.6 });
  const plinths = [
    [-4.9, 0.3, 2.3, 0.2, 1.1, 0.6, 0.8],
    [-3.7, 0.2, 3.1, -0.15, 0.8, 0.4, 0.8],
    [5.6, 0.3, 3.2, -0.25, 1.1, 0.6, 0.8],
  ];
  group.add(instances(THREE, new THREE.BoxGeometry(1, 1, 1), plinthMat, plinths));
  const stacks = [];
  for (const [x, y, z, ry, , sy] of plinths)
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 4; j++)
        stacks.push([
          x + (k - 0.5) * 0.44 * Math.cos(ry),
          y + sy / 2 + 0.028 + j * 0.052,
          z - (k - 0.5) * 0.44 * Math.sin(ry),
          ry + (r() - 0.5) * 0.06,
          0.34,
          0.048,
          0.3,
          garmentCols[(r() * garmentCols.length) | 0],
        ]);
  group.add(instances(THREE, new THREE.BoxGeometry(1, 1, 1), garmentMat, stacks));

  // plants in the back corners
  const potMat = std(THREE, { color: 0x1a1a1c, roughness: 0.7 });
  const leafMat = std(THREE, { color: 0x2f5a35, roughness: 0.85 });
  for (const [x, z] of [
    [-7.2, -2.6],
    [7.2, -2.6],
    [-7.2, 10.8],
  ]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 18), potMat);
    group.add(place(pot, x, 0.275, z));
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), leafMat);
    leaves.scale.set(1, 1.5, 1);
    group.add(place(leaves, x, 1.35, z));
  }

  // framed prints on the left wall (abstract colour fields, no text)
  const printTex = canvasTex(512, 640, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "#3aa8ff");
    gr.addColorStop(1, "#ff3d9a");
    g.fillStyle = "#101014";
    g.fillRect(0, 0, w, h);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(w / 2, h * 0.46, w * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#101014";
    g.beginPath();
    g.arc(w / 2, h * 0.46, w * 0.17, 0, Math.PI * 2);
    g.fill();
  });
  const frameMat = std(THREE, { color: 0x0f0f11, roughness: 0.5 });
  for (const z of [3.2, 5.6]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 1.04), frameMat);
    group.add(place(f, X0 + 0.03, 1.9, z));
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.18),
      std(THREE, { map: printTex, roughness: 0.4 }),
    );
    group.add(place(p, X0 + 0.06, 1.9, z, Math.PI / 2));
  }

  return {
    group,
    floor: { map: floorTex, roughness: 0.34, metalness: 0.05 },
    bounds: { x: [X0 + 0.4, X1 - 0.4], z: [Z0 + 0.5, Z1 - 0.4], y: H - 0.3 },
    walk: { x: [X0 + 0.6, X1 - 0.6], z: [Z0 + 0.8, Z1 - 0.6] },
    blockers: [
      [-6.6, -1.5, -3.4, -0.7],
      [4.5, -2.7, 7.3, -1.9],
      [-5.6, 1.7, -3.1, 3.7],
      [5.0, 2.6, 6.2, 3.8],
    ],
    light(night) {
      lampMat.emissiveIntensity = night ? 3.2 : 2.4;
      poolMat.opacity = night ? 0.3 : 0.14;
      glassMat.map = night ? streetNight : streetDay;
      glassMat.color.setScalar(night ? 1 : 0.92);
      glassMat.needsUpdate = true;
      neonMat.color.setScalar(night ? 1.25 : 0.9);
    },
  };
}

/* =========================================================
   Convention floor: an inline booth — carpet, pipe-and-drape, a flown truss with PAR cans and a
   hanging sign — in a big exhibition hall with neighbouring booths and aisle signs.
   ========================================================= */
async function buildConvention({ THREE, canvasTex, rand, brand, fonts }) {
  await fonts?.().catch?.(() => {});
  const group = new THREE.Group();
  group.name = "VENUE_convention";
  const r = rand(77);
  const HALL_H = 11;

  // hall floor: sealed concrete, expansion joints every 6 m (texture repeat = 6 m)
  const floorTex = canvasTex(
    1024,
    1024,
    (g, w, h) => {
      g.fillStyle = "#8f9297";
      g.fillRect(0, 0, w, h);
      const rr = rand(12);
      blotches(g, w, h, rr, 30, "70,72,78", 0.12);
      blotches(g, w, h, rr, 20, "175,178,184", 0.1);
      noise(g, w, h, rr, 16000, 110, 80, [0.03, 0.05]);
      g.strokeStyle = "rgba(55,57,62,.6)";
      g.lineWidth = 4;
      g.strokeRect(2, 2, w - 4, h - 4);
    },
    { repeat: [10, 10] },
  );

  // our booth: carpet with an aluminium edge
  const carpetTex = (hex, seed) =>
    canvasTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = hex;
        g.fillRect(0, 0, w, h);
        noise(g, w, h, rand(seed), 26000, 0, 255, [0.03, 0.04]);
      },
      { repeat: [3, 3] },
    );
  const B = { x0: -3.7, x1: 4.7, z0: -2.3, z1: 3.3 };
  const booth = new THREE.Mesh(
    new THREE.BoxGeometry(B.x1 - B.x0, 0.02, B.z1 - B.z0),
    std(THREE, { map: carpetTex("#1c1c22", 3), roughness: 1 }),
  );
  booth.position.set((B.x0 + B.x1) / 2, 0.01, (B.z0 + B.z1) / 2);
  group.add(booth);
  const trimMat = std(THREE, { color: 0xb9bcc2, roughness: 0.3, metalness: 0.9 });
  group.add(
    instances(THREE, new THREE.BoxGeometry(1, 1, 1), trimMat, [
      [(B.x0 + B.x1) / 2, 0.012, B.z1, 0, B.x1 - B.x0 + 0.04, 0.026, 0.04],
      [B.x0, 0.012, (B.z0 + B.z1) / 2, 0, 0.04, 0.026, B.z1 - B.z0],
      [B.x1, 0.012, (B.z0 + B.z1) / 2, 0, 0.04, 0.026, B.z1 - B.z0],
    ]),
  );

  // pipe and drape: 2.44 m back drape, 0.9 m side rails
  const drapeTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#0c0c0f";
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.5, "rgba(255,255,255,0.07)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x, 0, 16, h);
    }
  });
  drapeTex.wrapS = THREE.RepeatWrapping;
  const drape = (w, hgt, x, z, ry) => {
    const t = drapeTex.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 1.2, 1);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, hgt),
      std(THREE, { map: t, roughness: 0.95, side: THREE.DoubleSide }),
    );
    group.add(place(m, x, hgt / 2, z, ry));
  };
  drape(B.x1 - B.x0, 2.44, (B.x0 + B.x1) / 2, B.z0, 0);
  drape(2.8, 0.9, B.x0, B.z0 + 1.4, Math.PI / 2);
  drape(2.8, 0.9, B.x1, B.z0 + 1.4, -Math.PI / 2);
  const pipeMat = std(THREE, { color: 0x9da0a6, roughness: 0.35, metalness: 0.85 });
  const pipes = [];
  for (const x of [B.x0, (B.x0 + B.x1) / 2, B.x1])
    pipes.push([x, 1.22, B.z0, 0, 0.035, 2.44, 0.035]);
  pipes.push([(B.x0 + B.x1) / 2, 2.44, B.z0, 0, B.x1 - B.x0, 0.03, 0.03]);
  for (const x of [B.x0, B.x1]) {
    pipes.push([x, 0.9, B.z0 + 1.4, 0, 0.03, 0.03, 2.8]);
    pipes.push([x, 0.45, B.z0 + 2.8, 0, 0.035, 0.9, 0.035]);
  }
  group.add(instances(THREE, new THREE.CylinderGeometry(0.5, 0.5, 1, 10), pipeMat, pipes));

  // flown box truss over the booth, with PAR cans and night beams
  const trussTex = canvasTex(
    512,
    64,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "#fff";
      g.lineWidth = 7;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.lineWidth = 5;
      g.beginPath();
      for (let x = 0; x < w; x += 64) {
        g.moveTo(x, h - 4);
        g.lineTo(x + 32, 4);
        g.lineTo(x + 64, h - 4);
      }
      g.stroke();
    },
    { srgb: false },
  );
  trussTex.wrapS = THREE.RepeatWrapping;
  const trussMat = (len) => {
    const t = trussTex.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.6, 1);
    return std(THREE, {
      color: 0xc9ccd2,
      alphaMap: t,
      alphaTest: 0.5,
      transparent: false,
      metalness: 0.85,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
  };
  const TY = 4.55,
    TX0 = B.x0 + 0.3,
    TX1 = B.x1 - 0.3,
    TZ0 = B.z0 + 0.4,
    TZ1 = B.z1 - 0.2;
  const beam = (len, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.29, 0.29), trussMat(len));
    group.add(place(m, x, TY, z, ry));
  };
  beam(TX1 - TX0, (TX0 + TX1) / 2, TZ0, 0);
  beam(TX1 - TX0, (TX0 + TX1) / 2, TZ1, 0);
  beam(TZ1 - TZ0, TX0, (TZ0 + TZ1) / 2, Math.PI / 2);
  beam(TZ1 - TZ0, TX1, (TZ0 + TZ1) / 2, Math.PI / 2);
  // rigging cables up to the roof
  const cables = [];
  for (const [x, z] of [
    [TX0, TZ0],
    [TX1, TZ0],
    [TX0, TZ1],
    [TX1, TZ1],
  ])
    cables.push([x, (TY + HALL_H) / 2, z, 0, 0.012, HALL_H - TY, 0.012]);
  group.add(
    instances(
      THREE,
      new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
      std(THREE, { color: 0x3a3c40, roughness: 0.6, metalness: 0.6 }),
      cables,
    ),
  );
  // PAR cans along the front truss, aimed at the display
  const parBody = std(THREE, { color: 0x111114, roughness: 0.45, metalness: 0.5 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff1dd,
    emissiveIntensity: 2,
  });
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTexture(canvasTex),
    color: 0xfff0dc,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const cones = [];
  const aim = new THREE.Vector3(0.4, 1.2, 0);
  for (const x of [-2.6, -0.9, 0.9, 2.6, 4.0]) {
    const p = new THREE.Vector3(x, TY - 0.28, TZ1);
    const par = new THREE.Group();
    par.position.copy(p);
    par.lookAt(aim.x + (x - 0.4) * 0.35, aim.y, aim.z);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.3, 14).rotateX(Math.PI / 2),
      parBody,
    );
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lensMat);
    lens.position.z = 0.151;
    par.add(body, lens);
    const len = p.distanceTo(aim) * 0.95;
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.95, len, 20, 1, true)
        .rotateX(-Math.PI / 2)
        .translate(0, 0, len / 2 + 0.15),
      beamMat,
    );
    cone.renderOrder = 3;
    par.add(cone);
    cones.push(cone);
    group.add(par);
  }

  // four-sided hanging sign above the booth
  const name = (brand || "BOOTH").toUpperCase();
  const signTex = canvasTex(1024, 400, (g, w, h) => {
    g.fillStyle = "#0b0a12";
    g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#3aa8ff");
    gr.addColorStop(1, "#ff3d9a");
    g.fillStyle = gr;
    g.fillRect(0, h - 34, w, 34);
    g.fillRect(0, 0, w, 10);
    brandText(g, name, w / 2, h * 0.47, w * 0.84, 170, "#ffffff", null);
  });
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: 0xffffff,
    emissiveMap: signTex,
    emissiveIntensity: 0.55,
    roughness: 0.7,
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 3.4), [
    signMat,
    signMat,
    std(THREE, { color: 0x0b0a12 }),
    std(THREE, { color: 0x0b0a12 }),
    signMat,
    signMat,
  ]);
  group.add(place(sign, 0.5, 7.3, 0.6, Math.PI / 4));
  for (const [dx, dz] of [
    [-1.2, -1.2],
    [1.2, 1.2],
  ])
    group.add(
      place(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, HALL_H - 7.95, 6),
          std(THREE, { color: 0x3a3c40 }),
        ),
        0.5 + dx,
        (HALL_H + 7.95) / 2,
        0.6 + dz,
      ),
    );

  // neighbouring booths: carpets, back walls with abstract graphics, counters, banner stands
  const boothCols = ["#2d6cdf", "#e2552c", "#6a3fd8", "#1aa38c", "#e7b42a", "#d6336c", "#3b3f4a"];
  const wallGfx = boothCols.map((c, i) =>
    canvasTex(512, 256, (g, w, h) => {
      const rr = rand(100 + i);
      g.fillStyle = "#15161b";
      g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, c);
      gr.addColorStop(1, "#15161b");
      g.fillStyle = gr;
      g.fillRect(0, 0, w * (0.5 + rr() * 0.3), h);
      g.globalAlpha = 0.9;
      g.fillStyle = "#ffffff";
      for (let k = 0; k < 3; k++) {
        g.globalAlpha = 0.08 + rr() * 0.12;
        g.beginPath();
        g.arc(w * (0.55 + rr() * 0.4), h * rr(), 30 + rr() * 90, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.fillStyle = "rgba(255,255,255,.85)";
      g.fillRect(w * 0.08, h * 0.62, w * 0.28, 10);
      g.fillRect(w * 0.08, h * 0.7, w * 0.18, 8);
    }),
  );
  const neighbours = [
    // x, z, facing (ry), width
    [-9.2, 0.4, 0, 7],
    [11.2, 0.4, 0, 8],
    [-8.7, 11.8, Math.PI, 7],
    [1.3, 11.8, Math.PI, 8.4],
    [11.2, 11.8, Math.PI, 7],
    [-4.8, -9.6, 0, 9],
    [6.4, -9.6, 0, 9],
  ];
  const carpets = [],
    counters = [],
    stands = [];
  neighbours.forEach(([x, z, ry, w], i) => {
    const d = 5.2,
      col = boothCols[i % boothCols.length];
    const back = ry === 0 ? z - d / 2 : z + d / 2;
    carpets.push([x, 0.008, z, ry, w, 0.016, d, col]);
    const wm = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 3, 0.12),
      std(THREE, { map: wallGfx[i % wallGfx.length], roughness: 0.8 }),
    );
    group.add(place(wm, x, 1.5, back, ry));
    const s = ry === 0 ? 1 : -1;
    counters.push([x - w * 0.18, 0.5, z + s * 0.9, ry, 1.8, 1.0, 0.6, "#e9e9ee"]);
    stands.push([x + w * 0.32, 1.0, z + s * 1.3, ry, 0.8, 2.0, 0.04, col]);
  });
  group.add(
    instances(
      THREE,
      new THREE.BoxGeometry(1, 1, 1),
      std(THREE, { color: 0xffffff, roughness: 1 }),
      carpets,
    ),
  );
  group.add(
    instances(
      THREE,
      new THREE.BoxGeometry(1, 1, 1),
      std(THREE, { color: 0xffffff, roughness: 0.55 }),
      [...counters, ...stands],
    ),
  );

  // hall: roof with high-bay lights and trusses, aisle signs, columns for scale
  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    std(THREE, { color: 0x2a2c31, roughness: 0.95 }),
  );
  roof.rotation.x = Math.PI / 2;
  roof.position.y = HALL_H;
  group.add(roof);
  const bays = [];
  for (let x = -24; x <= 24; x += 6)
    for (let z = -24; z <= 24; z += 6) bays.push([x, HALL_H - 0.6, z]);
  const bayMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xf4f7ff,
    emissiveIntensity: 1.6,
  });
  group.add(instances(THREE, new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18), bayMat, bays));
  const roofTruss = [];
  for (let x = -27; x <= 27; x += 9) roofTruss.push([x, HALL_H - 0.35, 0, 0, 0.25, 0.6, 90]);
  group.add(
    instances(
      THREE,
      new THREE.BoxGeometry(1, 1, 1),
      std(THREE, { color: 0x44474e, roughness: 0.8, metalness: 0.4 }),
      roofTruss,
    ),
  );
  const colMat = std(THREE, { color: 0xb8b9bd, roughness: 0.9 });
  group.add(
    instances(THREE, new THREE.BoxGeometry(1.1, HALL_H, 1.1), colMat, [
      [-16, HALL_H / 2, -6],
      [18, HALL_H / 2, -6],
      [-16, HALL_H / 2, 16],
      [18, HALL_H / 2, 16],
    ]),
  );
  const aisleSign = (txt) =>
    canvasTex(512, 192, (g, w, h) => {
      g.fillStyle = "#1b4fb8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.font = `700 96px ${FONT_DISPLAY}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(txt, w / 2, h / 2 + 4);
    });
  for (const [txt, x, z] of [
    ["1200", -6.5, 6.2],
    ["1300", 8.6, 6.2],
  ]) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 0.06),
      std(THREE, { map: aisleSign(txt), roughness: 0.6 }),
    );
    group.add(place(s, x, 5.6, z));
  }

  return {
    group,
    floor: { map: floorTex, roughness: 0.62, metalness: 0.0 },
    bounds: null,
    walk: { x: [-12, 12], z: [-3.4, 9.5] },
    blockers: [
      [-12.7, -2.4, -5.7, 3.2],
      [7.2, -2.4, 15.2, 3.2],
    ],
    light(night) {
      bayMat.emissiveIntensity = night ? 0.12 : 1.6;
      lensMat.emissiveIntensity = night ? 3.4 : 1.6;
      beamMat.opacity = night ? 0.13 : 0.0;
      cones.forEach((c) => (c.visible = night));
      signMat.emissiveIntensity = night ? 0.9 : 0.55;
    },
  };
}
