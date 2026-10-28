/**
 * The EVADE wardrobe: a focused take on the Creator Merch Shelf's cubby unit
 * (/merch-shelf/shelf.js) that stands on the floor and has one tall hero bay
 * in the middle (the current drop) between two stacks of smaller cubbies
 * (future drops). Same black-lacquer carcass, fluted back panel, LED strip
 * under every lip and a light wash on the back panel, but each bay carries its
 * own colour and level so the hero reads as live and the rest as "soon".
 *
 * Slots match the shape products.js expects from shelf.js
 * ({center, floorY, topY, backZ, frontZ, width, height, depth}).
 */
import * as THREE from "three";
import { flutedTexture, washCanvas, radialCanvas } from "/merch-shelf/art.js";

const ROW_H = 0.66;
const SIDE_W = 0.74;
const HERO_W = 0.98;
const BOARD = 0.034;
const FRAME = 0.05;
export const PLINTH = 0.085;
export const DEPTH = 0.42;

function tex(canvas, { repeat = [1, 1], srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}

/**
 * @param {{hero:string, soon:string, gold:string, quality:'high'|'low'}} o
 */
export function buildWardrobe({ hero = "#36e6ff", soon = "#2fb8c9", gold = "#f6c344", quality = "high" }) {
  const group = new THREE.Group();
  group.name = "wardrobe";
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  const W = SIDE_W * 2 + HERO_W + BOARD * 2 + FRAME * 2;
  const H = ROW_H * 2 + BOARD + FRAME * 2;
  const D = DEPTH;
  const y0 = PLINTH; // carcass bottom
  const yMid = y0 + H / 2;
  const x0 = -W / 2;

  const lacquer = keep(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0c0f13"),
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    }),
  );
  const backTex = keep(
    tex(flutedTexture("#0a0d11", "rgba(255,255,255,0.03)", { flutes: 24 }), {
      repeat: [W / 0.9, H / 0.9],
      aniso: 2,
    }),
  );
  const backMat = keep(
    new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.85, metalness: 0 }),
  );
  const toeMat = keep(new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.7 }));

  const box = (w, h, d, mat, x, y, z, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast && quality === "high";
    m.receiveShadow = receive && quality === "high";
    group.add(m);
    return m;
  };

  // ---- carcass -----------------------------------------------------------
  box(W, FRAME, D, lacquer, 0, y0 + H - FRAME / 2, 0); // top
  box(W, FRAME, D, lacquer, 0, y0 + FRAME / 2, 0); // bottom
  box(FRAME, H - FRAME * 2, D, lacquer, x0 + FRAME / 2, yMid, 0); // left
  box(FRAME, H - FRAME * 2, D, lacquer, -x0 - FRAME / 2, yMid, 0); // right
  box(W - FRAME, H - FRAME, 0.02, backMat, 0, yMid, -D / 2 + 0.01, { cast: false });
  // recessed toe kick
  box(W - 0.08, PLINTH, D - 0.08, toeMat, 0, PLINTH / 2, -0.02, { cast: false });
  // crown moulding: a thin lip proud of the top
  box(W + 0.03, 0.022, D + 0.03, lacquer, 0, y0 + H + 0.011, 0);

  // bay x-extents
  const leftX = x0 + FRAME + SIDE_W / 2;
  const heroX = 0;
  const rightX = -x0 - FRAME - SIDE_W / 2;
  // dividers between bays (full height)
  for (const sx of [-1, 1]) {
    const x = sx * (HERO_W / 2 + BOARD / 2);
    box(BOARD, H - FRAME * 2, D - 0.02, lacquer, x, yMid, 0.01);
  }
  // shelves in the side stacks
  const shelfY = y0 + FRAME + ROW_H + BOARD / 2;
  box(SIDE_W, BOARD, D - 0.02, lacquer, leftX, shelfY, 0.01);
  box(SIDE_W, BOARD, D - 0.02, lacquer, rightX, shelfY, 0.01);

  // ---- light: LEDs, washes, spills ------------------------------------------
  const washTex = keep(new THREE.CanvasTexture(washCanvas()));
  washTex.colorSpace = THREE.SRGBColorSpace;
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
  const add = (mat) =>
    keep(
      new THREE.MeshBasicMaterial({
        map: mat,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

  const slots = {};
  const bays = [];
  const makeBay = (id, cx, top, w, h, color, level) => {
    const col = new THREE.Color(color);
    const floor = top - h;
    const ledMat = keep(
      new THREE.MeshBasicMaterial({
        color: col.clone().multiplyScalar(2.6 * level),
        toneMapped: false,
      }),
    );
    const led = new THREE.Mesh(keep(new THREE.BoxGeometry(w - 0.05, 0.006, 0.012)), ledMat);
    led.position.set(cx, top - 0.004, D / 2 - 0.03);
    group.add(led);
    const washMat = add(washTex);
    washMat.color.copy(col).multiplyScalar(0.2 * level);
    const wash = new THREE.Mesh(keep(new THREE.PlaneGeometry(w * 0.98, h * 0.98)), washMat);
    wash.position.set(cx, (top + floor) / 2, -D / 2 + 0.022);
    wash.renderOrder = 1;
    group.add(wash);
    const spillMat = add(spillTex);
    spillMat.color.copy(col).multiplyScalar(0.3 * level);
    const spill = new THREE.Mesh(keep(new THREE.PlaneGeometry(w * 0.95, D * 0.9)), spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(cx, floor + 0.0015, 0.04);
    spill.renderOrder = 1;
    group.add(spill);
    const slot = {
      id,
      center: new THREE.Vector3(cx, (top + floor) / 2, 0),
      floorY: floor,
      topY: top,
      backZ: -D / 2 + 0.02,
      frontZ: D / 2,
      width: w,
      height: h,
      depth: D,
    };
    const bay = { slot, washMat, ledMat, spillMat, base: { wash: washMat.color.clone(), led: ledMat.color.clone(), spill: spillMat.color.clone() } };
    bays.push(bay);
    slots[id] = slot;
    return slot;
  };

  const topY = y0 + H - FRAME;
  makeBay("hero", heroX, topY, HERO_W, ROW_H * 2 + BOARD, hero, 1.25);
  makeBay("L0", leftX, topY, SIDE_W, ROW_H, soon, 0.62);
  makeBay("L1", leftX, topY - ROW_H - BOARD, SIDE_W, ROW_H, soon, 0.62);
  makeBay("R0", rightX, topY, SIDE_W, ROW_H, soon, 0.62);
  makeBay("R1", rightX, topY - ROW_H - BOARD, SIDE_W, ROW_H, soon, 0.62);

  // gold edge light along the crown and cyan uprights on the outer frame
  const goldMat = keep(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(gold).multiplyScalar(2.2), toneMapped: false }),
  );
  const crown = new THREE.Mesh(keep(new THREE.BoxGeometry(W - 0.06, 0.006, 0.006)), goldMat);
  crown.position.set(0, y0 + H + 0.004, D / 2 + 0.017);
  group.add(crown);
  const edgeMat = keep(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(hero).multiplyScalar(1.5), toneMapped: false }),
  );
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(keep(new THREE.BoxGeometry(0.006, H - 0.1, 0.006)), edgeMat);
    e.position.set(sx * (W / 2 - 0.012), yMid, D / 2 + 0.004);
    group.add(e);
    // hero bay edge strips: brighter, they frame the live drop
    const h = new THREE.Mesh(keep(new THREE.BoxGeometry(0.005, ROW_H * 2 - 0.06, 0.005)), goldMat);
    h.position.set(sx * (HERO_W / 2 + BOARD / 2), yMid, D / 2 + 0.003);
    group.add(h);
  }

  // accent lights: a strong one in front of the hero bay, a softer one per side
  const lights = [];
  const heroLight = new THREE.PointLight(new THREE.Color(hero), quality === "high" ? 0.95 : 0.8, 2.0, 1.4);
  heroLight.position.set(0, topY - 0.15, D / 2 + 0.35);
  group.add(heroLight);
  lights.push(heroLight);
  for (const sx of [-1, 1]) {
    const l = new THREE.PointLight(new THREE.Color(soon), 0.5, 1.8, 1.4);
    l.position.set(sx * (HERO_W / 2 + SIDE_W / 2), topY - 0.2, D / 2 + 0.35);
    group.add(l);
    lights.push(l);
  }

  // soft contact shadow on the floor under the unit
  const floorShadowTex = keep(
    new THREE.CanvasTexture(
      radialCanvas([
        [0, "rgba(0,0,0,0.85)"],
        [0.5, "rgba(0,0,0,0.5)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    ),
  );
  const fs = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(W * 1.25, D * 2.6)),
    keep(new THREE.MeshBasicMaterial({ map: floorShadowTex, transparent: true, depthWrite: false })),
  );
  fs.rotation.x = -Math.PI / 2;
  fs.position.set(0, 0.002, 0.02);
  fs.renderOrder = 2;
  group.add(fs);

  /** Dim / restore everything but one bay (focus mode), 0 = normal, 1 = dimmed. */
  function setFocus(id, k) {
    for (const b of bays) {
      const f = b.slot.id === id ? 1 + k * 0.6 : 1 - k * 0.75;
      b.washMat.color.copy(b.base.wash).multiplyScalar(f);
      b.spillMat.color.copy(b.base.spill).multiplyScalar(f);
      b.ledMat.color.copy(b.base.led).multiplyScalar(Math.max(0.35, f));
    }
    edgeMat.color.set(hero).multiplyScalar(1.5 * (1 - k * 0.6));
  }

  return {
    group,
    slots,
    size: { w: W, h: H + PLINTH, d: D },
    top: y0 + H + 0.022,
    lights,
    setFocus,
    dispose() {
      for (const d of disposables) d.dispose?.();
      group.removeFromParent();
    },
  };
}
