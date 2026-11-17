// Bobo's Arcade cabinet in Bobo's Hideout (Dapo, 2026-11-17): a real arcade machine standing in the room.
// Walk Bobo up to it and a "Play" prompt appears; or tap the machine. Either opens Bobo's Arcade in BOBO OS,
// where every EVADE experience lives. Built from three.js primitives in flat EVADE colours (no gradients),
// parented to the hub's room root so it builds, folds, resizes and turns with the room.
import * as THREE from "three";

const YELLOW = 0xf6c344;
const INK = 0x15131a;
const BODY = 0x1d2a3a;
const TRIM = 0x4fd6e8;
const RED = 0xe3243a;

function screenTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 200;
  const g = c.getContext("2d");
  g.fillStyle = "#0a1c2a";
  g.fillRect(0, 0, 256, 200);
  // a few flat "cans" and a cat-ear silhouette: reads as a game screen from a distance
  g.fillStyle = "#4fd6e8";
  g.font = "900 34px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("BOBO'S", 128, 62);
  g.fillStyle = "#f6c344";
  g.font = "900 40px system-ui, sans-serif";
  g.fillText("ARCADE", 128, 108);
  g.fillStyle = "#ffffff";
  g.font = "800 20px system-ui, sans-serif";
  g.fillText("PRESS PLAY", 128, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function marqueeTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#f6c344";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#15131a";
  g.font = "italic 900 40px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("EVADE", 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A cabinet ~1.1 units tall, front facing +z, standing on y = 0. */
function buildCabinet() {
  const g = new THREE.Group();
  g.name = "BobosArcadeCabinet";
  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });
  const box = (w, h, d, m, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const body = mat(BODY);
  box(0.46, 0.52, 0.36, body, 0, 0.26, 0); // base
  box(0.46, 0.42, 0.26, body, 0, 0.8, -0.05); // head
  box(0.5, 0.04, 0.4, mat(TRIM, { emissive: TRIM, emissiveIntensity: 0.6 }), 0, 0.52, 0.01); // control-deck lip
  // side trims
  for (const x of [-0.235, 0.235])
    box(0.012, 1.0, 0.3, mat(TRIM, { emissive: TRIM, emissiveIntensity: 0.8 }), x, 0.5, 0);
  // screen, flush on the head's front
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), screenMat);
  screen.position.set(0, 0.8, 0.082);
  screen.name = "ArcadeScreen";
  g.add(screen);
  // marquee
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.28), [
    body,
    body,
    body,
    body,
    new THREE.MeshBasicMaterial({ map: marqueeTexture(), toneMapped: false }),
    body,
  ]);
  marquee.position.set(0, 1.06, -0.04);
  g.add(marquee);
  // control deck: stick + two buttons
  box(0.42, 0.03, 0.14, mat(INK), 0, 0.555, 0.12);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06), mat(INK));
  stick.position.set(-0.1, 0.6, 0.12);
  g.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), mat(RED));
  knob.position.set(-0.1, 0.635, 0.12);
  g.add(knob);
  for (const [x, c] of [
    [0.05, YELLOW],
    [0.12, TRIM],
  ]) {
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20),
      mat(c, { emissive: c, emissiveIntensity: 0.4 }),
    );
    b.position.set(x, 0.575, 0.12);
    g.add(b);
  }
  // coin door
  box(0.12, 0.16, 0.01, mat(INK), 0, 0.27, 0.181);
  const slot = box(
    0.03,
    0.05,
    0.012,
    mat(RED, { emissive: RED, emissiveIntensity: 0.9 }),
    0,
    0.3,
    0.186,
  );
  slot.name = "CoinGlow";
  // a flat glow disc on the floor so it reads as "something to walk to"
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.4, 48),
    new THREE.MeshBasicMaterial({
      color: YELLOW,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.004, 0.32);
  ring.name = "ArcadeRing";
  g.add(ring);
  return { group: g, screen, ring, slot };
}

/**
 * opts: { hub, player, camera, canvas, open: () => void }
 * Call update(dt) every frame. Returns { update, dispose, object }.
 */
export function addArcadeCabinet({ hub, player, camera, canvas, open }) {
  const { group, screen, ring, slot } = buildCabinet();
  group.visible = false;
  let attached = false;
  let near = false;
  let t = 0;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // The free floor on the right of the room (room.glb, radius ~1.72): clear of the plant (1.26, -0.73),
  // the cat bed (0.25, 0.30) and the line of sight to the shelf and globe; facing the room's centre.
  const SPOT = { x: 1.1, z: -0.15, r: 1.72 };
  const place = () => {
    const s = hub.root.scale.x || 1;
    const k0 = hub.floorRadius() / s / SPOT.r; // a differently sized room model keeps the spot in proportion
    const bobo = hub.boboHeight(); // room units
    group.scale.setScalar(bobo * 1.25); // cabinet ~1.25 Bobos tall
    group.position.set(SPOT.x * k0, 0, SPOT.z * k0);
    group.rotation.set(0, Math.atan2(-group.position.x, -group.position.z), 0); // face the room's centre
  };

  const live = () => hub.state === "live" && hub.root.visible;
  const layerOpen = () => (typeof hub._layerOpen === "function" ? hub._layerOpen() : false);

  const promptEl = () => document.querySelector(".mlh-prompt");
  let ours = false;
  let again = 0;
  const setNear = (on) => {
    if (on) {
      // The hub clears its prompt on its own timers (room hints): put ours back while Bobo is still here.
      const el = promptEl();
      const showing = ours && el?.classList.contains("on");
      if (near && showing) return;
      if (near && performance.now() < again) return;
      again = performance.now() + 500;
      near = true;
      ours = true;
      hub.prompt("Bobo's Arcade: every EVADE game", { label: "Play", onClick: () => open() });
    } else if (near) {
      near = false;
      if (ours) hub.prompt(null);
      ours = false;
    }
  };

  // Tap the machine (a quick tap, not a drag or a pinch).
  let down = null;
  const pd = (e) => {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  };
  const pu = (e) => {
    if (!down || !live() || layerOpen() || !group.visible) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 10 || !quick) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(group, true).length) open();
  };
  canvas.addEventListener("pointerdown", pd);
  canvas.addEventListener("pointerup", pu);

  const update = (dt) => {
    t += dt;
    if (!hub.root) return;
    if (!attached) {
      hub.root.add(group);
      attached = true;
    }
    const show = hub.state === "live" || hub.state === "building";
    if (show && !group.visible) place();
    group.visible = show;
    if (!show) return setNear(false);
    // gentle pulse on the ring and the coin slot
    const p = 0.5 + 0.5 * Math.sin(t * 3);
    ring.material.opacity = 0.35 + 0.35 * p;
    slot.material.emissiveIntensity = 0.5 + 0.6 * p;
    screen.material.color.setScalar(0.85 + 0.15 * p);
    if (!live() || !player.visible) return setNear(false);
    // Bobo within about one Bobo height of the front of the machine
    group.localToWorld(w.set(0, 0, 0.32));
    player.getWorldPosition(v);
    const bobo = hub.boboHeight() * (hub.root.getWorldScale(v2).y || 1); // room units -> world
    const touring = typeof hub._tourI === "number" && hub._tourI >= 0;
    setNear(!layerOpen() && !touring && Math.hypot(v.x - w.x, v.z - w.z) < bobo * 0.9);
  };

  const dispose = () => {
    canvas.removeEventListener("pointerdown", pd);
    canvas.removeEventListener("pointerup", pu);
    setNear(false);
    group.removeFromParent();
  };
  return { update, dispose, object: group };
}
