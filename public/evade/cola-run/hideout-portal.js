// Bobo's Hideout as a walk-in portal (Dapo, 2026-11-18).
//
// Opening the hideout in Cola Run no longer builds the two-storey can around Bobo on the board. A door opens on
// the floor instead, and through it is a life-size, one-storey Bobo's Hideout that you walk into: a big BOBO OS
// wall screen with the same apps, Bobo's desk and computer, an arcade zone with a machine for every EVADE
// experience, the Digital Collection wall and trophy shelf, and Bobo in his bed in the middle.
//
// Nothing of the hideout's logic is rewritten. The room model and everything in it (taps, hotspot dots, the
// collection holograms, the monitor's live alerts, the beam-out card, the wireframe build-in, BOBO OS, the unlock
// gate) stay HubCore's. This file only:
//  - moves HubCore's own room node into the portal's world, hides the old can shell and loft, and lays the
//    furniture out again on one big floor (rotated about the room's centre and pushed out to the new wall);
//  - adds the new shell (floor, wall, ceiling with the can's opening, string lights), the big screen and the
//    arcade machines;
//  - places the door with its own floor placement, like the portal app (round 3, Dapo 2026-11-18): after the code
//    (or whenever the hideout opens) you aim at the floor and tap Place; the door is a fixed walk-through size
//    and stays anchored in the world. Reset placement ("Move door") picks the door up again and keeps the room;
//    the Cola Run board is only re-placed when you're back on the board. The board is hidden meanwhile.
// The classic hideout is untouched: Cola Run with ?hideout=classic, and the lab /labs/collector-hub/.
//
// Portal technique: /labs/portal-kit/portal.js (depth-only wall with a door hole + crossing toggle).
//
// Phone safety (round 2, after Dapo's phone test: black camera, smearing, tracking lost when the hideout opened):
//  - NO clipping planes here. Clipping changes every room material's shader, which threw away the shaders
//    HubCore had already compiled (hub.warm) and recompiled ~60 materials at the moment the door opened: a
//    multi-second GPU stall on a phone, while the 8th Wall engine needs every frame. Instead every piece of the
//    world stays behind the door plane (z < 0), so the depth-only wall alone hides it from outside.
//  - NO new lights: the hub's own point lights are moved and resized, so the light count (part of every lit
//    shader) never changes.
//  - Laid out and compiled at load, right after hub.warm(), with textures uploaded one per frame.
//  - Small textures (no 2048 sky, no texture clones, no mipmaps on canvas screens).
import * as THREE from 'three';
import { Portal } from '/labs/portal-kit/portal.js?v=2';
import { drawStars, label, faceTowards, easeOutBack } from '/labs/portal-kit/toolkit.js?v=1';
import { buildCabinet } from './arcade-cabinet.js?v=2';

const R = 3.8; // floor radius (m): 7.6 m across
const H = 3.6; // wall height
const HOLE = 1.35; // the can's opening in the ceiling
const DOOR = { w: 1.1, h: 2.2 };
const GAP = Math.asin((DOOR.w / 2 + 0.14) / R); // the wall's gap round the door (half angle)
const CLASSIC_WALL = 1.72; // the old can's inner radius
const PUSH = R - CLASSIC_WALL; // wall-mounted pieces move out by this much
const D = Math.PI / 180;
const INK = '#15131a';
const YELLOW = '#f6c344';
const CYAN = '#4fd6e8';
const PINK = '#ff4f9a';

// BOBO OS apps on the big screen: same ids, names and tile colours as HubCore's APPS (flat, no gradients).
const APPS = [
  { id: 'arcade', name: "Bobo's Arcade", c: '#e3243a' },
  { id: 'alerts', name: 'Alerts', c: '#d81b78' },
  { id: 'globe', name: "Where's Bobo?", c: '#2a5bd7' },
  { id: 'leaderboard', name: 'Leaderboard', c: '#6a32e8' },
  { id: 'colarun', name: 'Cola Run', c: '#ff7a1a' },
  { id: 'collection', name: 'Digital Collection', c: '#4b3fb8' },
  { id: 'shop', name: 'Shop', c: '#078a61' },
  { id: 'me', name: 'Me', c: '#2d3fa8' },
];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

/** Rotate a room-local node about the room's centre to a new angle and push it out to a new radius. */
function relayout(node, { from, to, r, dy = 0 }) {
  if (!node) return;
  const ac = Math.atan2(from[0], from[1]);
  const rc = Math.hypot(from[0], from[1]);
  const d = to * D - ac;
  const p = node.position;
  const x = p.x * Math.cos(d) + p.z * Math.sin(d);
  const z = -p.x * Math.sin(d) + p.z * Math.cos(d);
  const push = (r ?? rc) - rc;
  p.set(x + Math.sin(to * D) * push, p.y + dy, z + Math.cos(to * D) * push);
  node.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d));
}

/** Flat tube along an arc of the wall (angles from +z towards +x, like CylinderGeometry). */
function arcTube(r, y, thick, mat, a0 = GAP, a1 = Math.PI * 2 - GAP) {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = a0 + ((a1 - a0) * i) / 96;
    pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, thick, 6, false), mat);
}

function onWall(obj, a, r, y) {
  obj.position.set(Math.sin(a * D) * r, y, Math.cos(a * D) * r);
  obj.rotation.set(0, a * D + Math.PI, 0); // +z faces the centre
  return obj;
}

/* ── the big BOBO OS screen ── */
function glyph(g, id, x, y, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineWidth = s * 0.09;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const k = s / 2;
  g.beginPath();
  switch (id) {
    case 'arcade': // joystick
      g.roundRect(-k * 0.9, k * 0.3, k * 1.8, k * 0.6, k * 0.15);
      g.fill();
      g.fillRect(-k * 0.06, -k * 0.35, k * 0.12, k * 0.7);
      g.beginPath();
      g.arc(0, -k * 0.5, k * 0.32, 0, 7);
      g.fill();
      break;
    case 'alerts': // bell
      g.moveTo(-k * 0.65, k * 0.45);
      g.quadraticCurveTo(-k * 0.6, -k * 0.75, 0, -k * 0.75);
      g.quadraticCurveTo(k * 0.6, -k * 0.75, k * 0.65, k * 0.45);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(0, k * 0.62, k * 0.17, 0, 7);
      g.fill();
      break;
    case 'globe':
      g.arc(0, 0, k * 0.78, 0, 7);
      g.stroke();
      g.beginPath();
      g.ellipse(0, 0, k * 0.34, k * 0.78, 0, 0, 7);
      g.stroke();
      g.beginPath();
      g.moveTo(-k * 0.78, 0);
      g.lineTo(k * 0.78, 0);
      g.stroke();
      break;
    case 'leaderboard': // podium
      g.fillRect(-k * 0.85, -k * 0.05, k * 0.5, k * 0.8);
      g.fillRect(-k * 0.25, -k * 0.7, k * 0.5, k * 1.45);
      g.fillRect(k * 0.35, k * 0.2, k * 0.5, k * 0.55);
      break;
    case 'colarun': // can
      g.roundRect(-k * 0.42, -k * 0.75, k * 0.84, k * 1.5, k * 0.18);
      g.fill();
      g.fillStyle = '#ff7a1a';
      g.beginPath();
      g.arc(0, 0, k * 0.24, 0, 7);
      g.fill();
      break;
    case 'collection': // gem
      g.moveTo(-k * 0.8, -k * 0.25);
      g.lineTo(-k * 0.45, -k * 0.7);
      g.lineTo(k * 0.45, -k * 0.7);
      g.lineTo(k * 0.8, -k * 0.25);
      g.lineTo(0, k * 0.8);
      g.closePath();
      g.fill();
      break;
    case 'shop': // bag
      g.roundRect(-k * 0.65, -k * 0.3, k * 1.3, k * 1.05, k * 0.12);
      g.fill();
      g.beginPath();
      g.arc(0, -k * 0.3, k * 0.32, Math.PI, 0);
      g.stroke();
      break;
    default: // me
      g.arc(0, -k * 0.32, k * 0.34, 0, 7);
      g.fill();
      g.beginPath();
      g.ellipse(0, k * 0.55, k * 0.65, k * 0.38, 0, Math.PI, 0);
      g.fill();
  }
  g.restore();
}

function makeBigScreen(hub) {
  // Drawn in 1600 x 900 "design" units onto a 1024 x 576 canvas (about 2.4 MB on the GPU, no mipmaps).
  const W = 1600;
  const Hh = 900;
  const PX = 1024 / W;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const g = c.getContext('2d');
  g.setTransform(PX, 0, 0, PX, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const SW = 3.6;
  const SH = SW * (Hh / W);
  const group = new THREE.Group();
  group.name = 'BigScreen';
  const frame = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.16, SH + 0.16, 0.1), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5, metalness: 0.3 }));
  frame.position.z = -0.05;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = 0.002;
  screen.name = 'BigScreenGlass';
  const trim = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.22, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: CYAN }));
  trim.position.set(0, -SH / 2 - 0.1, 0.01);
  group.add(frame, screen, trim);

  const tiles = [];
  const cols = 4;
  const gap = 36;
  const x0 = 64;
  const y0 = 150;
  const tw = (W - x0 * 2 - gap * (cols - 1)) / cols;
  const th = 270;
  APPS.forEach((a, i) => tiles.push({ ...a, x: x0 + (i % cols) * (tw + gap), y: y0 + Math.floor(i / cols) * (th + gap), w: tw, h: th }));

  let last = '';
  let hot = -1; // the tile last tapped (flashes)
  let hotT = 0;
  const draw = (dt = 0) => {
    hotT = Math.max(0, hotT - dt);
    const me = hub.me;
    const unread = typeof hub._unread === 'function' ? hub._unread() : 0;
    const alerts = hub._alerts || [];
    const now = new Date();
    const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const key = [clock, unread, alerts[0]?.id, me?.name, hot, hotT > 0].join('|');
    if (key === last) return;
    last = key;
    g.fillStyle = '#0a1430';
    g.fillRect(0, 0, W, Hh);
    // top bar
    g.fillStyle = '#121f4a';
    g.fillRect(0, 0, W, 104);
    g.fillStyle = YELLOW;
    g.font = 'italic 900 58px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText('BOBO OS', 52, 54);
    g.fillStyle = '#ffffff';
    g.font = '700 40px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(clock, W - 52, 54);
    g.textAlign = 'center';
    g.fillStyle = '#c9d6ff';
    g.font = '600 36px system-ui, sans-serif';
    g.fillText(me?.name ? `Welcome home, ${me.name}` : "Welcome to Bobo's Hideout", W / 2, 54);
    // tiles
    for (const [i, t] of tiles.entries()) {
      g.fillStyle = i === hot && hotT > 0 ? '#ffffff' : t.c;
      g.beginPath();
      g.roundRect(t.x, t.y, t.w, t.h, 30);
      g.fill();
      glyph(g, t.id, t.x + t.w / 2, t.y + t.h * 0.42, 110);
      g.fillStyle = '#ffffff';
      g.font = '800 38px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(t.name, t.x + t.w / 2, t.y + t.h - 44);
      if (t.id === 'alerts' && unread) {
        g.fillStyle = YELLOW;
        g.beginPath();
        g.arc(t.x + t.w - 40, t.y + 40, 30, 0, 7);
        g.fill();
        g.fillStyle = INK;
        g.font = '900 34px system-ui, sans-serif';
        g.fillText(String(Math.min(99, unread)), t.x + t.w - 40, t.y + 42);
      }
    }
    // ticker
    g.fillStyle = '#121f4a';
    g.fillRect(0, Hh - 100, W, 100);
    g.fillStyle = PINK;
    g.fillRect(0, Hh - 100, 14, 100);
    g.fillStyle = '#ffffff';
    g.font = '600 36px system-ui, sans-serif';
    g.textAlign = 'left';
    const line = alerts[0]?.title ? `Latest: ${alerts[0].title}` : 'Tap any app to open it';
    g.fillText(line.length > 64 ? line.slice(0, 63) + '…' : line, 48, Hh - 50);
    tex.needsUpdate = true;
  };
  draw();
  const tileAt = (uv) => {
    const x = uv.x * W;
    const y = (1 - uv.y) * Hh;
    const i = tiles.findIndex((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
    if (i >= 0) {
      hot = i;
      hotT = 0.35;
      last = '';
    }
    return i >= 0 ? tiles[i] : null;
  };
  return { group, screen, draw, tileAt };
}

/* ── arcade machines: one per EVADE experience in Bobo's Arcade ── */
function cabinetScreen(game) {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 288;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const paint = (img) => {
    g.fillStyle = '#0a1c2a';
    g.fillRect(0, 0, 384, 288);
    if (img) {
      const k = Math.max(384 / img.width, 220 / img.height);
      const w = img.width * k;
      const h = img.height * k;
      g.save();
      g.beginPath();
      g.rect(0, 0, 384, 220);
      g.clip();
      g.drawImage(img, (384 - w) / 2, (220 - h) / 2, w, h);
      g.restore();
    }
    g.fillStyle = INK;
    g.fillRect(0, 220, 384, 68);
    g.fillStyle = YELLOW;
    g.font = '900 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const name = game.name.length > 20 ? game.name.slice(0, 19) + '…' : game.name;
    g.fillText(name, 192, 255);
    if (game.soon) {
      g.fillStyle = PINK;
      g.fillRect(250, 14, 120, 44);
      g.fillStyle = '#ffffff';
      g.font = '900 26px system-ui, sans-serif';
      g.fillText('SOON', 310, 37);
    }
    tex.needsUpdate = true;
  };
  paint(null);
  if (game.img) {
    const im = new Image();
    im.onload = () => paint(im);
    im.src = game.img;
  }
  return tex;
}

export function setupHideoutPortal({ hub, camera, renderer, canvas, anchor, player, onActive, onAim, onCancel, busy = () => false, ready = () => true, maxTex = 2048, onEvent = () => {}, onDiag = () => {} }) {
  const portal = new Portal({ renderer, width: DOOR.w, height: DOOR.h, colors: [CYAN, PINK, '#ffffff'], frame: '#1b2552', trim: CYAN });
  portal.group.visible = false;
  const scene = anchor.parent;
  scene.add(portal.group);

  let laid = false;
  let prepping = null; // the load-time layout + shader warm-up (a promise once started)
  let cabinetsReady = Promise.resolve();
  let anchorWas = false; // the board's visibility before the door came out (restored on close)
  let active = false; // the door is out (opening, open, or closing)
  let closing = false;
  let wasLive = false;
  let welcomed = false;
  let told = false;
  let t = 0;
  let boboMixer = null;
  let boboSit = null;
  let boboOnce = null;
  let boboPop = -1;
  let screen = null;
  const mine = new Map(); // mesh -> action, for taps on the new pieces
  const cabinets = [];

  /* ── lay the room out once, the first time the hideout opens ── */
  function layout() {
    const room = hub._room;
    if (!room) return false;
    if (laid) return true;
    laid = true;
    portal.world.add(room); // out of the board's anchor, into the portal's world
    room.position.set(0, 0, -R);
    room.rotation.set(0, 0, 0);
    room.scale.setScalar(1);
    const N = (n) => room.getObjectByName(n);

    // the old two-storey can goes: walls, loft, ladder and its floor
    for (const n of ['Can_House', 'hub_ladder']) if (N(n)) N(n).visible = false;

    // borrow the hideout's own looks for the new shell
    const mats = {};
    room.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.name && !mats[m.name]) mats[m.name] = m;
    });
    const plain = (name, fallback) => {
      const src = mats[name];
      const m = src ? src.clone() : new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.85 });
      delete m.userData.mlhReveal; // clone() drops the build-in shader: the shell is there from the start
      return m;
    };
    // The big surfaces (floor, walls, ceiling) fill the screen once you're inside: lit per pixel with PBR, three
    // point lights and the env map, they cost the frame rate that world tracking needs (Samsung: 60 -> 25-45 fps
    // with the room live, then minutes of LIMITED tracking). Lambert keeps the look under the same lights for a
    // fraction of the cost; PBR stays on the hero pieces only.
    const cheap = (name, fallback) => {
      const src = plain(name, fallback);
      const m = new THREE.MeshLambertMaterial({
        name: src.name, color: src.color, map: src.map, emissive: src.emissive, emissiveMap: src.emissiveMap,
        emissiveIntensity: src.emissiveIntensity, normalMap: src.normalMap, normalScale: src.normalScale, aoMap: src.aoMap,
        transparent: src.transparent, opacity: src.opacity, side: src.side, alphaTest: src.alphaTest, vertexColors: src.vertexColors,
      });
      src.dispose();
      return m;
    };

    /* the furniture, on one floor (angles from the door, clockwise seen from above; the big screen is at 180) */
    // Bobo's desk + computer (from the loft) on the right
    relayout(N('Desk'), { from: [-0.92, -0.92], to: 118, r: 1.3 + PUSH - 0.15, dy: -1.85 });
    relayout(N('hub_computer'), { from: [-0.92, -0.92], to: 118, r: 1.3 + PUSH - 0.15, dy: -1.85 });
    relayout(N('Plant_Loft'), { from: [-1.31, 0.61], to: 93, r: R - 0.45, dy: -1.85 });
    // the Digital Collection wall and the trophy shelf, nearer the door on the right
    relayout(N('hub_collection'), { from: [-0.6, -1.45], to: 72, r: 1.57 + PUSH - 0.05 });
    relayout(N('hub_shelf'), { from: [0.78, -1.47], to: 40, r: 1.66 + PUSH - 0.04 });
    // posters high up, flanking the big screen; the porthole beside the door
    relayout(N('hub_poster_colarun'), { from: [0.25, -1.75], to: -150, r: 1.77 + PUSH - 0.04, dy: -0.35 });
    relayout(N('hub_poster_bobo'), { from: [-1.74, 0.31], to: 150, r: 1.77 + PUSH - 0.04, dy: -0.3 });
    relayout(N('hub_window'), { from: [-1.63, -0.72], to: -26, r: 1.78 + PUSH - 0.03, dy: 0.25 });
    // the lounge in the middle: rug, bed, Bobo, beanbag, lamp, plant
    for (const n of ['hub_rug', 'hub_cat_bed', 'hub_bobo', 'Beanbag', 'Side_Table', 'Plant_Lounge']) N(n)?.position.add(v1.set(-0.25, 0, -0.55));
    relayout(N('Plant_Lounge'), { from: [1.01, -1.28], to: 140, r: 1.9 });
    // EVADE sign over the big screen
    const sign = N('hub_sign_evade');
    if (sign) {
      sign.position.set(0, 3.12, -R + 0.1);
      sign.rotation.set(0, 0, 0);
      sign.scale.multiplyScalar(1.35);
    }
    // the pull tab hangs at the can's opening in the ceiling
    const tab = N('hub_pull_tab');
    if (tab) {
      relayout(tab, { from: [-1.6, -0.93], to: -120, r: HOLE + 0.25, dy: H - 3.52 + 0.04 });
      hub._pullRest = tab.rotation.z;
    }
    // fizz bubbles fill the bigger room (kept inside the wall: nothing of the world may reach the door plane)
    room.children.forEach((o) => {
      if (!/^Fizz_/.test(o.name)) return;
      o.position.set(o.position.x * 1.9, o.position.y, o.position.z * 1.9);
      const r = Math.hypot(o.position.x, o.position.z);
      if (r > R - 0.5) o.position.multiplyScalar((R - 0.5) / r);
    });

    /* the shell */
    const shell = new THREE.Group();
    shell.name = 'PortalShell';
    room.add(shell);
    // The floor shares the hideout's wood texture (no clone: a clone is a second GPU upload); the planks are
    // tiled by the UVs instead (glTF textures repeat by default).
    const floorMat = cheap('Wood_Floor', '#8a5a3b');
    floorMat.normalMap = null;
    floorMat.roughnessMap = null;
    const planar = (geo) => {
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const k = (2 * R) / 3.8; // the old floor was ~3.8 m across: same plank size
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) / (2 * R) + 0.5) * k, (pos.getY(i) / (2 * R) + 0.5) * k);
      uv.needsUpdate = true;
      return geo;
    };
    const floor = new THREE.Mesh(planar(new THREE.CircleGeometry(R, 96)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'PortalFloor';
    shell.add(floor);
    // the circle only touches the door plane at one point: fill the doorway's corners up to it
    const sill = new THREE.Mesh(planar(new THREE.PlaneGeometry(DOOR.w + 0.5, 0.5).translate(0, -(R - 0.255), 0)), floorMat.clone());
    sill.material.polygonOffset = true;
    sill.material.polygonOffsetFactor = -1;
    sill.rotation.x = -Math.PI / 2;
    shell.add(sill);
    const wallMat = cheap('Wall_Inside_Navy', '#1b2552');
    wallMat.normalMap = null;
    wallMat.roughnessMap = null;
    wallMat.side = THREE.BackSide;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true, GAP, Math.PI * 2 - 2 * GAP), wallMat);
    wall.position.y = H / 2;
    wall.name = 'PortalWall';
    shell.add(wall);
    const wainMat = cheap('Wall_Wainscot', '#0d1533');
    wainMat.normalMap = null;
    wainMat.roughnessMap = null;
    wainMat.side = THREE.BackSide;
    const wain = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.85, 96, 1, true, GAP, Math.PI * 2 - 2 * GAP), wainMat);
    wain.position.y = 0.425;
    shell.add(wain);
    // door jambs: the wall's cut edges, so the gap reads as a doorway in the can
    const jambMat = cheap('Wall_Wainscot', '#0d1533');
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, 0.14), jambMat);
      j.position.set(s * Math.sin(GAP) * R, H / 2, Math.cos(GAP) * R - 0.03);
      shell.add(j);
    }
    const cyan = plain('Neon_Cyan', CYAN);
    const pink = plain('Neon_Pink', PINK);
    shell.add(arcTube(R - 0.04, 0.86, 0.018, cyan), arcTube(R - 0.04, H - 0.06, 0.022, pink), arcTube(R - 0.05, 0.02, 0.02, cyan));
    // thin cyan uprights on the wall panels (as on the old can's walls), clear of the screen and the door
    for (let a = 20; a < 360; a += 24) {
      if (Math.abs(a - 180) < 34 || a < 16 || a > 344) continue;
      const u = new THREE.Mesh(new THREE.BoxGeometry(0.018, H - 1.0, 0.01), cyan);
      onWall(u, a, R - 0.03, 0.88 + (H - 1.0) / 2);
      shell.add(u);
    }
    // ceiling with the can's opening, and the night sky through it
    const ceil = new THREE.Mesh(new THREE.RingGeometry(HOLE, R, 96, 1), cheap('Diorama_Rim', '#0b1230'));
    ceil.material.side = THREE.DoubleSide;
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    shell.add(ceil);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(HOLE, 0.06, 10, 96), plain('Can_Aluminium', '#c0c8d6'));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = H;
    shell.add(lip);
    // A small dome over the opening only (a big sky sphere would reach past the door into the real room).
    const skyC = document.createElement('canvas');
    skyC.width = 512;
    skyC.height = 256;
    const sg = skyC.getContext('2d');
    sg.fillStyle = '#070b1f';
    sg.fillRect(0, 0, 512, 256);
    drawStars(sg, 512, 256, 160, ['#ffffff', '#ffe9a8', '#bfe6ff'], 0, 1);
    const skyT = new THREE.CanvasTexture(skyC);
    skyT.colorSpace = THREE.SRGBColorSpace;
    skyT.generateMipmaps = false;
    skyT.minFilter = THREE.LinearFilter;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(HOLE + 0.7, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide }));
    sky.position.y = H - 0.02;
    sky.name = 'PortalSky';
    shell.add(sky);
    // string lights under the ceiling, swagging between the uprights
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe2a6' }), 84);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 84; i++) {
      const a = GAP + 0.05 + ((Math.PI * 2 - 2 * GAP - 0.1) * i) / 83;
      const sag = 0.14 * Math.sin(((i % 7) / 7) * Math.PI);
      m4.makeTranslation(Math.sin(a) * (R - 0.12), H - 0.28 - sag, Math.cos(a) * (R - 0.12));
      bulbs.setMatrixAt(i, m4);
    }
    shell.add(bulbs);

    /* the big BOBO OS screen on the far wall */
    screen = makeBigScreen(hub);
    screen.group.position.set(0, 1.78, -R + 0.08);
    room.add(screen.group);
    mine.set(screen.screen, (hit) => {
      const tile = hit.uv && screen.tileAt(hit.uv);
      if (!tile) return;
      hub._sfx?.('click');
      onEvent('custom', { action: 'bigscreen_app', app: tile.id });
      if (tile.id === 'collection') hub.openCollection();
      else if (tile.id === 'arcade') hub.openArcade();
      else hub.openOS(tile.id);
    });

    /* the arcade zone: a machine for every experience in Bobo's Arcade, on the left */
    const arcadeUrl = '/evade/arcade/games.json';
    cabinetsReady = fetch(arcadeUrl, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cat) => {
        const games = (cat?.games || []).filter((g) => g.id !== cat.self).slice(0, 7);
        games.forEach((game, i) => {
          const { group, screen: scr } = buildCabinet();
          scr.material.map = cabinetScreen(game);
          scr.material.needsUpdate = true;
          group.scale.setScalar(1.6); // ~1.75 m tall
          onWall(group, -48 - i * 15.5, R - 0.62, 0);
          group.name = 'Arcade_' + game.id;
          room.add(group);
          group.traverse((o) => o.isMesh && mine.set(o, () => openGame(game)));
          cabinets.push(group);
        });
        const sign2 = label("BOBO'S ARCADE", { color: INK, bg: YELLOW, font: 'italic 900 64px system-ui, sans-serif', h: 0.34 });
        onWall(sign2, -48 - ((games.length - 1) * 15.5) / 2, R - 0.06, 2.42);
        sign2.material.depthWrite = true;
        room.add(sign2);
        hub._pickables?.push(...cabinets.flatMap((c) => c.children.filter((o) => o.isMesh)));
        addSpot("Bobo's Arcade", YELLOW, cabinets[Math.floor(cabinets.length / 2)], 1.25, 'hub_trophy_colarun', () => openGame(null));
      })
      .catch(() => undefined);

    /* light the bigger room with the hideout's OWN point lights, moved and resized. Adding lights instead would
       change the light count, which is part of every lit shader in the scene: all of them would recompile. */
    const LIT = [
      ['#ffd7b0', 7, 11, [0, 2.9, 0.2]],
      ['#9fe9ff', 4, 7, [0, 2.4, -2.4]],
      ['#ff6fb8', 3, 6, [-2.4, 2.2, -0.4]],
    ];
    (hub._lights || [])
      .filter((l) => l.isPointLight)
      .forEach((l, i) => {
        const [c, intensity, distance, p] = LIT[i % LIT.length];
        delete l.userData.mlhBase; // HubCore's room-size scaling leaves it alone (this room is life size)
        l.color.set(c);
        l.intensity = intensity;
        l.distance = distance;
        l.decay = 1.2;
        l.position.set(...p);
      });

    // Bobo is the room's own here (the game's Bobo stays on the board): his own mixer, sitting in his bed
    const bobo = hub._bobo;
    if (bobo) {
      boboMixer = new THREE.AnimationMixer(bobo);
      const clip = (n) => hub._actions?.[n]?.getClip();
      if (clip('Sit')) boboSit = boboMixer.clipAction(clip('Sit')).play();
      bobo.traverse((o) => o.isMesh && hub._pickables?.push(o));
      hub._tapBobo = () => {
        const lines = ['Mrrp!', 'Purrrr…', 'Bobo approves.', 'Bobo wants a cola.', 'Bobo is plotting his next run.'];
        hub.toast(lines[Math.floor(Math.random() * lines.length)]);
        hub._sfx?.('mrrp');
        boboMove(Math.random() < 0.5 ? 'Excited' : 'Spin');
      };
    }

    // what blocks taps and the hotspot dots: the new walls, the screen, and the portal's own walls outside
    hub._pickables?.push(floor, wall, wain, ceil, screen.screen, portal.wallOut, portal.wallIn);
    // the room's size for the build-in (the wireframe races from the door to the far wall)
    hub._box?.set(new THREE.Vector3(-R, 0, -R), new THREE.Vector3(R, H, R));
    hub._maxH = H + 0.2;
    room.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(room.matrixWorld).invert();
    const mon = N('Monitor_Screen');
    if (mon && hub._screenCenter) new THREE.Box3().setFromObject(mon).getCenter(hub._screenCenter).applyMatrix4(inv);
    const lamp = N('hub_cola_lamp');
    if (lamp && hub._lampPos) new THREE.Box3().setFromObject(lamp).getCenter(hub._lampPos).applyMatrix4(inv);
    // the hotspot dots follow their nodes; give the big screen one too
    addSpot('Big screen', CYAN, screen.group, 0.9, 'hub_computer', () => hub.openOS());
    return true;
  }

  /* ── at load (after hub.warm): lay out, compile every shader of the door and the room, upload textures one per
     frame. Opening the door is then just a visibility change: no compile, no upload, no stall. ── */
  function prep() {
    if (prepping) return prepping;
    if (!hub._room) return Promise.resolve();
    prepping = (async () => {
      const t0 = performance.now();
      layout();
      await cabinetsReady;
      const flipped = [];
      const keep = new Set([hub._room.getObjectByName('Can_House'), hub._room.getObjectByName('hub_ladder')]);
      portal.group.traverse((o) => {
        if (keep.has(o)) return;
        if (!o.visible) {
          flipped.push(o);
          o.visible = true;
        }
      });
      let done = null;
      // Compiled OUT of the scene, against the scene: three.js counts the lights of the target scene AND of the
      // object compiled, so an object that is also in the target has its lights counted twice, and every
      // shader comes out for the wrong light count (useless: recompiled when the door opens). Detached, the
      // lights are the scene's plus the hideout's, exactly as with the door open.
      const parent = portal.group.parent;
      parent?.remove(portal.group);
      portal.group.updateMatrixWorld(true);
      try {
        done = typeof renderer.compileAsync === 'function' ? renderer.compileAsync(portal.group, camera, scene) : (renderer.compile(portal.group, camera, scene), null);
      } catch (e) {
        console.warn('[hideout-portal] shader warm-up skipped', e);
      }
      parent?.add(portal.group);
      for (const o of flipped) o.visible = false;
      await done?.catch?.(() => undefined);
      if (typeof renderer.initTexture !== 'function') return;
      const seen = new Set();
      portal.group.traverse((o) => {
        for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
          for (const k of Object.keys(m)) if (m[k]?.isTexture && !m[k].isRenderTargetTexture) seen.add(m[k]);
      });
      for (const tx of seen) {
        try {
          renderer.initTexture(tx);
        } catch {
          /* uploads on first use instead */
        }
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
      onDiag('hideout_ready', { textures: seen.size, ms: Math.round(performance.now() - t0) });
    })();
    return prepping;
  }
  /* Texture memory: the room's textures are up to 4096 px (the can label alone is ~28 MB on the GPU). Phones with
     tight WebGL memory (iPhone Safari kills the tab) get them capped at maxTex px, drawn down once on a canvas. */
  let shrunk = false;
  function shrinkTextures() {
    if (shrunk || !hub._room) return;
    shrunk = true;
    const seen = new Set();
    let saved = 0;
    hub._room.traverse((o) => {
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
        for (const k of Object.keys(m)) {
          const tx = m[k];
          if (!tx?.isTexture || tx.isRenderTargetTexture || tx.isCanvasTexture || seen.has(tx)) continue;
          seen.add(tx);
          const im = tx.image;
          const w = im?.width || 0;
          const h = im?.height || 0;
          if (!w || !h || Math.max(w, h) <= maxTex) continue;
          const k2 = maxTex / Math.max(w, h);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k2));
          c.height = Math.max(1, Math.round(h * k2));
          try {
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          } catch {
            continue;
          }
          saved += (w * h - c.width * c.height) * 4 * 1.33;
          im.close?.(); // an ImageBitmap's memory goes now
          tx.image = c;
          tx.needsUpdate = true;
        }
    });
    onDiag('textures_capped', { max: maxTex, savedMB: Math.round(saved / 1e6) });
  }
  const origWarm = hub.warm.bind(hub);
  hub.warm = async (...a) => {
    shrinkTextures(); // before HubCore uploads them
    await origWarm(...a);
    // never mid-round: a compile can still hitch a frame on some phones, so it waits for a quiet moment
    while (busy()) await new Promise((r) => setTimeout(r, 500));
    await prep();
  };

  function addSpot(text, color, node, lift, iconFrom, onClick) {
    const box = hub._el?.spots;
    if (!box || !node || !Array.isArray(hub._spots)) return;
    const ref = hub._spots.find((s) => s.def?.id === iconFrom);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mlh-spot gone';
    el.style.setProperty('--c', color);
    el.setAttribute('aria-label', text);
    el.innerHTML = `${ref?.el.querySelector('svg')?.outerHTML || ''}<span>${text}</span>`;
    el.addEventListener('click', onClick);
    box.appendChild(el);
    hub._spots.push({ def: { id: 'hp_' + text, label: text, color }, node, local: new THREE.Vector3(0, lift / (node.scale.y || 1), 0), el, hidden: true });
  }

  function openGame(game) {
    hub._sfx?.('click');
    onEvent('custom', { action: 'arcade_open', from: 'portal_cabinet', game: game?.id });
    hub.openArcade();
  }

  function boboMove(name) {
    const clip = hub._actions?.[name]?.getClip();
    if (!boboMixer || !clip) return;
    const a = boboMixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.fadeIn(0.2).play();
    boboSit?.fadeOut(0.2);
    if (boboOnce && boboOnce !== a) boboOnce.fadeOut(0.2);
    boboOnce = a;
    const back = (ev) => {
      if (ev.action !== a) return;
      boboMixer.removeEventListener('finished', back);
      boboSit?.reset().fadeIn(0.4).play();
      a.fadeOut(0.4);
      boboOnce = null;
    };
    boboMixer.addEventListener('finished', back);
  }

  /* ── the door ── */
  /* ── placing the door: its own floor placement, like the portal app (aim at the floor, Place) ── */
  // The door is placed where you point, on the floor, facing you, at a fixed walk-through size, and then stays
  // put in the world (8th Wall's SLAM space), whatever the Cola Run board does.
  const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aimRay = new THREE.Raycaster();
  const aimHit = new THREE.Vector3();
  const CENTRE = new THREE.Vector2(0, 0);
  let aiming = false;
  let aimOk = false;
  let pendingEnter = null; // HubCore's enter() options, waiting for the door to be placed
  let testHit = null;

  const reticle = new THREE.Group();
  {
    const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 48), rm);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, 0.05), rm);
    const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 3), rm);
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.y = -0.34; // after the -90° tilt below, this points at the camera (the door's front)
    for (const m of [ring, bar, arrow]) reticle.add(m);
    reticle.rotation.order = 'YXZ';
    reticle.visible = false;
    scene.add(reticle);
  }

  // the placing UI: a note at the top, Place at the bottom centre (the shutter is bottom right), Back under it
  const ui = document.createElement('div');
  ui.className = 'hp-aim';
  ui.hidden = true;
  ui.innerHTML = `
    <div class="hp-note" role="status" aria-live="polite"><b>Place the door to Bobo’s Hideout</b><span>Make sure you’re in a large space you can walk around.</span></div>
    <div class="hp-bottom">
      <button type="button" class="hp-place" disabled>Point at the floor…</button>
      <button type="button" class="hp-back">Back to Cola Run</button>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
    .hp-aim{position:fixed;inset:0;pointer-events:none;z-index:60;font-family:system-ui,-apple-system,sans-serif}
    .hp-aim[hidden]{display:none!important}
    .hp-note{position:absolute;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 74px);width:min(340px,calc(100% - 32px));
      padding:12px 16px;border-radius:16px;background:#0d1533;border:1px solid #2a3a78;color:#fff;text-align:center;display:grid;gap:4px}
    .hp-note b{font-size:15px;font-weight:800}
    .hp-note span{font-size:13.5px;color:#c9d6ff}
    .hp-bottom{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 22px);display:grid;justify-items:center;gap:6px}
    .hp-place{pointer-events:auto;min-width:200px;min-height:52px;padding:0 24px;border:0;border-radius:999px;background:#f6c344;color:#15131a;font-family:inherit;font-weight:800;font-size:17px;line-height:1}
    .hp-place:disabled{background:#3a3f55;color:#c3c8da}
    .hp-back{pointer-events:auto;min-height:40px;padding:0 16px;border:1px solid #2a3a78;border-radius:999px;background:#0d1533;color:#fff;font-family:inherit;font-weight:700;font-size:14px;line-height:1}
    .hp-track{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 74px);width:min(340px,calc(100% - 32px));z-index:61;
      padding:12px 16px;border-radius:16px;background:#0d1533;border:1px solid #f6c344;color:#fff;text-align:center;display:grid;gap:4px;pointer-events:none;
      font-family:system-ui,-apple-system,sans-serif}
    .hp-track[hidden]{display:none!important}
    .hp-track b{font-size:15px;font-weight:800}
    .hp-track span{font-size:13.5px;color:#c9d6ff}
  `;
  document.head.appendChild(css);
  document.body.appendChild(ui);
  // Tracking lost: the phone only knows which way it points, not where it is, so the room travels with it.
  // Say so, and how to get it back, instead of leaving the fan to think the room is broken.
  const trackUi = document.createElement('div');
  trackUi.className = 'hp-track';
  trackUi.hidden = true;
  trackUi.setAttribute('role', 'status');
  trackUi.setAttribute('aria-live', 'polite');
  trackUi.innerHTML = '<b>Finding the room again…</b><span>Hold still for a moment, then move slowly and point at the floor and nearby things.</span>';
  document.body.appendChild(trackUi);
  let trackStatus = 'NORMAL';
  let limitedSince = 0;
  const placeBtn = ui.querySelector('.hp-place');
  const backBtn = ui.querySelector('.hp-back');
  placeBtn.addEventListener('click', () => placeHere());
  backBtn.addEventListener('click', () => {
    hub._sfx?.('click');
    onCancel?.();
  });

  function startAim() {
    aiming = true;
    aimOk = false;
    portal.setInside(false);
    portal.openTarget = 0;
    portal.open = 0; // the room hides at once: it doesn't slide along with the door
    portal.group.visible = false; // shows on the first floor hit
    placeBtn.disabled = true;
    placeBtn.textContent = 'Point at the floor…';
    ui.hidden = false;
    hub.prompt?.(null);
    if (hub._el?.spots) hub._el.spots.style.visibility = 'hidden'; // the room's dots, while the room is away
    onAim?.(true);
    onDiag('door_aim', {});
  }
  function endAim() {
    if (!aiming) return;
    aiming = false;
    reticle.visible = false;
    ui.hidden = true;
    if (hub._el?.spots) hub._el.spots.style.visibility = '';
    onAim?.(false);
  }
  function tickAim(dt) {
    aimRay.setFromCamera(CENTRE, camera);
    let ok = false;
    const cam = camera.getWorldPosition(v1);
    if (aimRay.ray.intersectPlane(FLOOR, aimHit)) {
      const d = Math.hypot(aimHit.x - cam.x, aimHit.z - cam.z);
      ok = d > 0.8 && d < 6;
    }
    if (testHit) {
      ok = true;
      aimHit.copy(testHit);
    }
    const g = portal.group;
    if (ok) {
      const first = !g.visible;
      g.position.lerp(aimHit, first ? 1 : 1 - Math.exp(-14 * dt));
      g.position.y = 0;
      g.rotation.set(0, Math.atan2(cam.x - g.position.x, cam.z - g.position.z), 0);
      g.visible = true;
      reticle.position.copy(g.position).setY(0.003);
      reticle.rotation.set(-Math.PI / 2, g.rotation.y, 0);
    }
    reticle.visible = ok;
    // Tracking must have settled (NORMAL, no recent stall) before the door goes down: a door placed while the
    // map is still forming slides with it. testHit (?test) skips the wait.
    const steady = !!testHit || ready();
    const can = ok && steady;
    const label = !ok ? 'Point at the floor…' : steady ? 'Place the door' : 'Hold still a moment…';
    if (can !== aimOk || placeBtn.textContent !== label) {
      aimOk = can;
      placeBtn.disabled = !can;
      placeBtn.textContent = label;
    }
  }
  function placeHere() {
    if (!aiming || !aimOk) return;
    endAim();
    testHit = null;
    portal.group.updateMatrixWorld(true);
    portal.group.visible = true;
    portal.setInside(false);
    portal.wasOutside = true;
    portal.openTarget = 1;
    hub._sfx?.('whoosh');
    onDiag('door_placed', {});
    onEvent('custom', { action: 'hideout_door_placed' });
    if (pendingEnter) {
      // first time in: the wireframe build-in races out from the doorway into the room
      const opts = pendingEnter;
      pendingEnter = null;
      portal.group.localToWorld(v1.set(0, 0, -0.4));
      origEnter({ ...opts, origin: v1.clone() });
    }
    if (!told) {
      told = true;
      setTimeout(() => active && !aiming && !portal.inside && hub.toast('Walk through the door into Bobo’s Hideout'), 1800);
    }
  }

  /** Bring the door out and start placing it. */
  function open() {
    if (!active) anchorWas = anchor.visible;
    active = true;
    closing = false;
    anchor.visible = false;
    onActive?.(true);
    onDiag('door_open', { prepped: !!prepping });
    startAim();
  }
  /** Reset placement / Move while the hideout is open: pick the door up, the room keeps its state. */
  function move() {
    if (!active || closing) return false;
    if (!aiming) startAim();
    return true;
  }

  function close(instant = false) {
    if (!active) return;
    endAim();
    pendingEnter = null;
    closing = true;
    portal.openTarget = 0;
    portal.setInside(false);
    if (instant || !portal.group.visible) finishClose();
  }
  function finishClose() {
    active = false;
    closing = false;
    portal.group.visible = false;
    portal.open = 0;
    // The board comes back as it was (a board still being placed stays with the reticle, which re-shows it).
    anchor.visible = anchorWas;
    onDiag('door_closed', {});
    if (hub._bobo) hub._bobo.visible = false;
    onActive?.(false);
  }

  portal.onCross = (inside) => {
    hub._sfx?.('whoosh');
    onEvent('custom', { action: inside ? 'hideout_portal_in' : 'hideout_portal_out' });
    onDiag(inside ? 'walked_in' : 'walked_out', {});
    if (inside && !welcomed) {
      welcomed = true;
      hub.toast('Welcome to Bobo’s Hideout');
    }
  };

  /* ── HubCore hooks: the same calls CollectorHubMode makes, routed through the door ── */
  const origEnter = hub.enter.bind(hub);
  hub.enter = (opts = {}) => {
    if (!layout()) return origEnter(opts);
    if (hub.state === 'building' || hub.state === 'live') return; // already in (HubCore ignores it too)
    // After the code (or any time the hideout opens): place the door first; the room builds once it's down.
    prep(); // normally done at load; if not, it runs while the door is being placed (the room is away)
    pendingEnter = opts;
    open();
  };
  const origLeave = hub.leave.bind(hub);
  hub.leave = (opts = {}) => {
    const p = origLeave({ ...opts, origin: active ? portal.group.localToWorld(new THREE.Vector3(0, 0, -0.4)) : opts.origin });
    p.then(() => close());
    return p;
  };
  const origPreview = hub.preview.bind(hub);
  hub.preview = () => {
    close(true);
    return origPreview();
  };
  // While the door is being placed the room is away: taps don't reach it.
  const origTap = hub.tap.bind(hub);
  hub.tap = (x, y) => (aiming ? true : origTap(x, y));
  const origHide = hub.hide.bind(hub);
  hub.hide = () => {
    close(true);
    return origHide();
  };

  // Bobo's moves (the paw button) play on the room's Bobo while you're in the portal hideout
  let homePatched = null;
  const MOVES = ['Excited', 'Spin', 'Chill', 'Sleep'];
  function patchHome() {
    const h = hub._home;
    if (!h || h === homePatched) return;
    homePatched = h;
    const orig = h.move.bind(h);
    h.move = (id) => {
      if (!active) return orig(id);
      const ids = (h.moves?.() || []).map((m) => m.id);
      boboMove(MOVES[Math.max(0, ids.indexOf(id)) % MOVES.length]);
    };
  }

  /* ── taps on the new pieces (the hideout's own pieces go through HubCore as before) ── */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || !active || aiming || hub.state !== 'live') return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 450) return;
    if (typeof hub._layerOpen === 'function' && hub._layerOpen()) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const list = hub._pickables || [];
    for (const hit of ray.intersectObjects(list, false)) {
      if (!hit.object.visible || (hit.object.material?.colorWrite === false && hit.object !== portal.wallOut)) continue;
      const act = mine.get(hit.object);
      if (act) act(hit);
      return; // the first solid thing wins (a wall, or a HubCore piece HubCore already handled)
    }
  });

  return {
    portal,
    get active() {
      return active;
    },
    get inside() {
      return portal.inside;
    },
    get aiming() {
      return aiming;
    },
    move,
    /** The engine's tracking status (NORMAL / LIMITED), for the "finding the room" note. */
    tracking(status) {
      if (status === trackStatus) return;
      trackStatus = status;
      limitedSince = status === 'LIMITED' ? performance.now() : 0;
    },
    update(dt) {
      t += dt;
      patchHome();
      if (!prepping && hub.loaded && t > 8 && !busy()) prep();
      if (aiming) tickAim(dt);
      const lost = active && trackStatus === 'LIMITED' && limitedSince && performance.now() - limitedSince > 1500;
      if (trackUi.hidden === !!lost) {
        trackUi.hidden = !lost;
        if (lost) onDiag('track_hint', { inside: portal.inside });
      }
      if (!portal.group.visible) return;
      portal.update(dt, camera, t);
      if (closing && portal.open < 0.02) finishClose();
      if (!active) return;
      anchor.visible = false; // the board stays away while the door is out
      const live = hub.state === 'live';
      const bobo = hub._bobo;
      if (bobo) {
        if (live && !wasLive) {
          bobo.visible = true;
          boboPop = 0;
          boboSit?.reset().play();
        }
        if (boboPop >= 0) {
          boboPop += dt;
          bobo.scale.setScalar(Math.max(0.01, easeOutBack(boboPop / 0.5)));
          if (boboPop > 0.5) boboPop = -1;
        }
        if (live && !boboOnce) faceTowards(bobo, camera.getWorldPosition(v1), dt, 1.5);
        boboMixer?.update(dt);
      }
      if (hub._bed && hub._bedScale) hub._bed.scale.setScalar(hub._bedScale);
      wasLive = live;
      screen?.draw(dt);
    },
    // test hooks (?test): walk through without walking
    test: {
      open,
      close,
      prep,
      /** place the door at (dx right, dz ahead) of the camera, on the floor */
      placeAt(dx = 0, dz = 2) {
        const v = new THREE.Vector3();
        camera.getWorldDirection(v);
        v.y = 0;
        v.normalize();
        const c = camera.getWorldPosition(new THREE.Vector3());
        testHit = new THREE.Vector3(c.x + v.x * dz - v.z * dx, 0, c.z + v.z * dz + v.x * dx);
        tickAim(1);
        placeHere();
      },
      stepIn(d = 1.2) {
        // move the door past the camera so the camera crosses the opening
        const cam = camera.getWorldPosition(v1);
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(portal.group.quaternion);
        portal.group.position.set(cam.x + dir.x * d, portal.group.position.y, cam.z + dir.z * d);
      },
    },
  };
}
