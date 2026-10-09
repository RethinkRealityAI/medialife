/**
 * The shelf unit: a floating cubby grid sized to the number of products, in a
 * walnut / maple / black lacquer / white finish, with an LED strip under every
 * shelf lip washing the back panel in the accent colour.
 *
 * Everything is procedural (boxes + canvas textures), so a finish change is a
 * rebuild of a few dozen draw calls and no downloads.
 */
import * as THREE from "three";
import { woodTexture, flutedTexture, washCanvas, radialCanvas, makeCanvas } from "./art.js";

export const CELL = { w: 0.74, h: 0.66, d: 0.42 };
const BOARD = 0.034; // inner shelves and dividers
const FRAME = 0.05; // outer frame
export const SIGN_SPACE = 0.62; // vertical room reserved above the unit for the neon sign

/**
 * Choose a grid for `n` products that best fills a viewport of `aspect`
 * (width / height of the usable area). Empty cubbies are penalised, but a
 * portrait phone still gets two columns rather than a postage-stamp 4×2.
 */
export function computeLayout(n, aspect) {
  let best = null;
  for (let cols = 1; cols <= Math.min(4, n); cols++) {
    const rows = Math.ceil(n / cols);
    if (rows > 4) continue;
    const w = cols * CELL.w + (cols - 1) * BOARD + FRAME * 2;
    const h = rows * CELL.h + (rows - 1) * BOARD + FRAME * 2 + SIGN_SPACE;
    const empty = rows * cols - n;
    const score = Math.abs(Math.log(w / h / aspect)) + empty * 0.22 + (rows === 4 ? 0.12 : 0);
    if (!best || score < best.score) best = { cols, rows, score, empty };
  }
  return best || { cols: 1, rows: 1, empty: 0 };
}

const FINISH = {
  walnut: {
    wood: [["#563823", "#6a4630"], "#25150b"],
    back: ["#17110d", "rgba(0,0,0,0.6)"],
    phys: { roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.35 },
  },
  maple: {
    wood: [["#d6b78c", "#e3c8a0"], "#a37a4a"],
    back: ["#2a2420", "rgba(0,0,0,0.55)"],
    phys: { roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 },
  },
  black: {
    color: "#0c0c0f",
    back: ["#0b0b0e", "rgba(255,255,255,0.03)"],
    phys: { roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 },
  },
  white: {
    color: "#e9e8e4",
    back: ["#c9c8c5", "rgba(0,0,0,0.25)"],
    phys: { roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3 },
  },
};

function tex(canvas, { repeat = [1, 1], rotate = false, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (rotate) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  t.anisotropy = aniso;
  return t;
}

/**
 * Build the shelf.
 * @param {{count:number, cols:number, rows:number, finish:string, accent:string, quality:'high'|'low'}} o
 */
export function buildShelf({ count, cols, rows, finish, accent, quality = "high" }) {
  const f = FINISH[finish] || FINISH.walnut;
  const group = new THREE.Group();
  group.name = "shelf";
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  const W = cols * CELL.w + (cols - 1) * BOARD + FRAME * 2;
  const H = rows * CELL.h + (rows - 1) * BOARD + FRAME * 2;
  const D = CELL.d;

  // ---- materials ---------------------------------------------------------
  const mkBoardMat = (vertical) => {
    const params = { ...f.phys, metalness: 0 };
    if (f.wood) {
      const c = woodTexture(f.wood[0], f.wood[1], { seed: vertical ? 11 : 7 });
      params.map = keep(
        tex(c, { repeat: vertical ? [1, 0.6] : [Math.max(1, W / 1.6), 1], rotate: vertical }),
      );
      params.color = new THREE.Color("#ffffff");
    } else {
      params.color = new THREE.Color(f.color);
    }
    return keep(new THREE.MeshPhysicalMaterial(params));
  };
  const hMat = mkBoardMat(false);
  const vMat = mkBoardMat(true);
  const backTex = keep(
    tex(flutedTexture(f.back[0], f.back[1], { flutes: 24 }), {
      repeat: [W / 0.9, H / 0.9],
      aniso: 2,
    }),
  );
  const backMat = keep(
    new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.85,
      metalness: 0,
      color: new THREE.Color("#ffffff"),
    }),
  );

  const box = (w, h, d, mat, x, y, z, { cast = true, receive = true } = {}) => {
    const g = keep(new THREE.BoxGeometry(w, h, d));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = cast && quality === "high";
    m.receiveShadow = receive && quality === "high";
    group.add(m);
    return m;
  };

  // ---- carcass -------------------------------------------------------------
  const x0 = -W / 2;
  const y0 = -H / 2;
  box(W, FRAME, D, hMat, 0, H / 2 - FRAME / 2, 0); // top
  box(W, FRAME, D, hMat, 0, -H / 2 + FRAME / 2, 0); // bottom
  box(FRAME, H - FRAME * 2, D, vMat, x0 + FRAME / 2, 0, 0); // left
  box(FRAME, H - FRAME * 2, D, vMat, -x0 - FRAME / 2, 0, 0); // right
  // back panel, slightly inset
  const back = box(W - FRAME, H - FRAME, 0.02, backMat, 0, 0, -D / 2 + 0.01, { cast: false });
  back.name = "back";

  // inner shelves (between rows)
  for (let r = 1; r < rows; r++) {
    const y = H / 2 - FRAME - r * CELL.h - (r - 1) * BOARD - BOARD / 2;
    box(W - FRAME * 2, BOARD, D - 0.02, hMat, 0, y, 0.01);
  }
  // dividers (between columns, per row so they butt into the shelves)
  for (let c = 1; c < cols; c++) {
    const x = x0 + FRAME + c * CELL.w + (c - 1) * BOARD + BOARD / 2;
    box(BOARD, H - FRAME * 2, D - 0.02, vMat, x, 0, 0.01);
  }

  // ---- slots, LEDs, washes --------------------------------------------------
  const accentCol = new THREE.Color(accent);
  const ledMat = keep(
    new THREE.MeshBasicMaterial({
      color: accentCol.clone().multiplyScalar(3.2),
      toneMapped: false,
    }),
  );
  const washTex = keep(new THREE.CanvasTexture(washCanvas()));
  washTex.colorSpace = THREE.SRGBColorSpace;
  const washMat = keep(
    new THREE.MeshBasicMaterial({
      map: washTex,
      color: accentCol.clone().multiplyScalar(0.19),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const spillTex = keep(
    new THREE.CanvasTexture(
      radialCanvas([
        [0, "rgba(255,255,255,0.8)"],
        [0.45, "rgba(255,255,255,0.25)"],
        [1, "rgba(255,255,255,0)"],
      ]),
    ),
  );
  spillTex.colorSpace = THREE.SRGBColorSpace;
  const spillMat = keep(
    new THREE.MeshBasicMaterial({
      map: spillTex,
      color: accentCol.clone().multiplyScalar(0.32),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const ledGeo = keep(new THREE.BoxGeometry(CELL.w - 0.05, 0.006, 0.012));
  const washGeo = keep(new THREE.PlaneGeometry(CELL.w * 0.98, CELL.h * 0.98));
  const spillGeo = keep(new THREE.PlaneGeometry(CELL.w * 0.95, D * 0.9));

  const slots = [];
  const washes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const cx = x0 + FRAME + c * (CELL.w + BOARD) + CELL.w / 2;
      const top = H / 2 - FRAME - r * (CELL.h + BOARD);
      const floor = top - CELL.h;
      const cy = (top + floor) / 2;

      // LED under the lip above this cubby
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(cx, top - 0.004, D / 2 - 0.03);
      group.add(led);

      const wash = new THREE.Mesh(washGeo, washMat);
      wash.position.set(cx, cy, -D / 2 + 0.022);
      wash.renderOrder = 1;
      group.add(wash);
      washes.push(wash);

      const spill = new THREE.Mesh(spillGeo, spillMat);
      spill.rotation.x = -Math.PI / 2;
      spill.position.set(cx, floor + 0.0015, 0.04);
      spill.renderOrder = 1;
      group.add(spill);

      slots.push({
        index,
        row: r,
        col: c,
        filled: index < count,
        center: new THREE.Vector3(cx, cy, 0),
        floorY: floor,
        topY: top,
        backZ: -D / 2 + 0.02,
        frontZ: D / 2,
        width: CELL.w,
        height: CELL.h,
        depth: D,
        wash,
      });
    }
  }

  // ---- one accent light per row, under the lip ------------------------------
  const lights = [];
  for (let r = 0; r < rows; r++) {
    const top = H / 2 - FRAME - r * (CELL.h + BOARD);
    const l = new THREE.PointLight(
      accentCol,
      quality === "high" ? 0.9 : 0.75,
      Math.max(2.2, W),
      1.2,
    );
    l.position.set(0, top - 0.08, D / 2 + 0.45);
    group.add(l);
    lights.push(l);
  }

  // ---- soft drop shadow on the (implied) wall + bottom underglow -----------
  const sh = makeCanvas(256, 256);
  {
    const ctx = sh.getContext("2d");
    ctx.filter = "blur(18px)";
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(40, 40, 176, 176);
  }
  const shadowTex = keep(new THREE.CanvasTexture(sh));
  const shadow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(W * 1.32, H * 1.32)),
    keep(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
      }),
    ),
  );
  shadow.position.set(0.03, -0.07, -D / 2 - 0.09);
  group.add(shadow);

  const under = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(W * 1.1, 0.5)),
    keep(
      new THREE.MeshBasicMaterial({
        map: spillTex,
        color: accentCol.clone().multiplyScalar(0.25),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  under.position.set(0, -H / 2 - 0.12, -D / 2 - 0.08);
  group.add(under);

  function setAccent(hex) {
    const c = new THREE.Color(hex);
    ledMat.color.copy(c).multiplyScalar(3.2);
    washMat.color.copy(c).multiplyScalar(0.19);
    spillMat.color.copy(c).multiplyScalar(0.32);
    under.material.color.copy(c).multiplyScalar(0.25);
    for (const l of lights) l.color.copy(c);
  }

  /** Brighten one cubby's wash (hover / focus), 0..1. */
  function glow(index, amount) {
    const s = slots[index];
    if (!s) return;
    s.wash.material = amount > 0 ? glowMatFor(amount) : washMat;
  }
  const glowMats = new Map();
  function glowMatFor(amount) {
    const k = Math.round(amount * 10);
    if (!glowMats.has(k)) {
      const m = washMat.clone();
      m.color.multiplyScalar(1 + k * 0.1);
      glowMats.set(k, keep(m));
    }
    const m = glowMats.get(k);
    m.color.copy(washMat.color).multiplyScalar(1 + k * 0.1);
    return m;
  }

  function dispose() {
    for (const d of disposables) d.dispose?.();
    group.removeFromParent();
  }

  return {
    group,
    slots,
    size: { w: W, h: H, d: D },
    lights,
    setAccent,
    glow,
    dispose,
  };
}
