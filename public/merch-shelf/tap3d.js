/**
 * Step 1 of the experience walkthrough, in real 3D: the product's own model
 * (borrowed from the shelf, prints and all) and a modelled phone that glides
 * in and taps the NFC tag under the chest print. Rings ripple out of the tag
 * and the phone's screen lights up with the "open" sheet.
 *
 * It draws through the shelf's renderer (scene.renderView) into a 2D canvas,
 * so nothing is loaded twice and no second WebGL context is opened. The pose
 * is a pure function of time, so the walkthrough's clock can pause, resume
 * and scrub it.
 */
import * as THREE from "three";
import { makeCanvas, roundRect, FONT_SANS, FONT_MONO } from "./art.js";

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const seg = (t, a, b) => clamp01((t - a) / (b - a));

/** Timeline of the tap, seconds from the start of step 1. */
export const TAP = {
  enter: 0.5,
  hover: 2.0,
  touch: 2.55,
  back: 3.3,
  sheet: 2.75,
  press: 5.0,
  end: 6.6,
};

// a phone at real scale (metres), screen facing +Z
const PH = { w: 0.0745, h: 0.155, d: 0.0082, r: 0.0105 };

function screenCanvas({ name, accent, neon, state }) {
  const W = 360;
  const H = Math.round((W * PH.h) / PH.w);
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  // wallpaper
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0c1024");
  g.addColorStop(0.55, "#1a0f2c");
  g.addColorStop(1, "#05060c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.28, 0, W * 0.3, H * 0.28, W);
  glow.addColorStop(0, accent + "55");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // island + clock
  ctx.fillStyle = "#000";
  roundRect(ctx, W * 0.36, 16, W * 0.28, 30, 15);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `600 22px ${FONT_SANS}`;
  ctx.fillText("Tue 13", W / 2, 110);
  ctx.font = `700 96px ${FONT_SANS}`;
  ctx.fillText("9:41", W / 2, 200);
  if (state === "idle") return c;
  // the NFC sheet sliding up from the bottom
  const sy = H * 0.56;
  ctx.fillStyle = "rgba(245,245,250,0.96)";
  roundRect(ctx, 14, sy, W - 28, H - sy - 14, 34);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.font = `500 15px ${FONT_MONO}`;
  ctx.fillText("NFC TAG DETECTED", W / 2, sy + 42);
  // mark
  const mg = ctx.createLinearGradient(W / 2 - 34, 0, W / 2 + 34, 0);
  mg.addColorStop(0, accent);
  mg.addColorStop(1, neon);
  ctx.fillStyle = mg;
  roundRect(ctx, W / 2 - 34, sy + 62, 68, 68, 18);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 - 14, sy + 96, 10 + i * 9, -0.9, 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = "#111";
  ctx.font = `700 25px ${FONT_SANS}`;
  ctx.fillText(name, W / 2, sy + 168, W - 60);
  ctx.fillStyle = "#555";
  ctx.font = `500 18px ${FONT_SANS}`;
  ctx.fillText("Immersive experience", W / 2, sy + 196);
  // the Open button
  const by = sy + 222;
  ctx.fillStyle = state === "press" ? "#0b6fd0" : "#0a84ff";
  roundRect(ctx, 34, by, W - 68, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 24px ${FONT_SANS}`;
  ctx.fillText("Open", W / 2, by + 40);
  return c;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

/** A rounded slab, centred, `d` deep, with softly bevelled edges. */
function slab(w, h, d, r) {
  const bevel = Math.min(d * 0.35, r * 0.5);
  const g = new THREE.ExtrudeGeometry(
    roundedRect(w - bevel * 2, h - bevel * 2, Math.max(0.0005, r - bevel)),
    {
      depth: d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 8,
    },
  );
  g.translate(0, 0, -(d - bevel * 2) / 2);
  return g;
}

function buildPhone({ name, accent, neon, keep }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    keep(slab(PH.w, PH.h, PH.d, PH.r)),
    keep(
      new THREE.MeshPhysicalMaterial({
        color: 0x2a2c33,
        metalness: 0.85,
        roughness: 0.32,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
      }),
    ),
  );
  g.add(body);
  // glass + screen
  const states = {};
  for (const state of ["idle", "sheet", "press"]) {
    const t = keep(new THREE.CanvasTexture(screenCanvas({ name, accent, neon, state })));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    states[state] = t;
  }
  const screenMat = keep(
    new THREE.MeshBasicMaterial({ map: states.idle, toneMapped: false, color: 0xd8d8d8 }),
  );
  // the display: a rounded-rect plane with its UVs spread over the full rectangle
  const sw = PH.w - 0.004;
  const sh = PH.h - 0.004;
  const sr = PH.r - 0.002;
  const sg = keep(new THREE.ShapeGeometry(roundedRect(sw, sh, sr), 8));
  const pos = sg.attributes.position;
  const uv = sg.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + sw / 2) / sw, (pos.getY(i) + sh / 2) / sh);
  }
  const screen = new THREE.Mesh(sg, screenMat);
  screen.position.z = PH.d / 2 + 0.0002;
  g.add(screen);
  // camera bump on the back (top left, seen from the back)
  const bumpMat = keep(
    new THREE.MeshPhysicalMaterial({ color: 0x1b1c21, metalness: 0.6, roughness: 0.25 }),
  );
  const bump = new THREE.Mesh(keep(slab(0.032, 0.032, 0.002, 0.008)), bumpMat);
  bump.position.set(PH.w / 2 - 0.022, PH.h / 2 - 0.022, -PH.d / 2 - 0.001);
  g.add(bump);
  const lensMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0x050507,
      metalness: 0.2,
      roughness: 0.05,
      clearcoat: 1,
    }),
  );
  for (const [x, y] of [
    [-0.0075, 0.0075],
    [-0.0075, -0.0075],
    [0.0075, 0],
  ]) {
    const l = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0018, 24)), lensMat);
    l.rotation.x = Math.PI / 2;
    l.position.set(bump.position.x + x, bump.position.y + y, -PH.d / 2 - 0.0025);
    g.add(l);
  }
  return {
    group: g,
    setScreen(state) {
      if (screenMat.map !== states[state]) {
        screenMat.map = states[state];
        screenMat.needsUpdate = true;
      }
    },
  };
}

function ringTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 10;
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

/**
 * @param {object} app the shelf app (scene, products, config)
 * @param {HTMLCanvasElement} canvas where the step is drawn
 */
export function createTap3D(app, canvas) {
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const { accent, neon } = app.config.theme;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080f);
  scene.environment = app.scene.environment;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0x5a6aa8, 0x0a0a12, 0.7));
  const key = new THREE.DirectionalLight(0xfff1e2, 1.9);
  key.position.set(-1.2, 2.4, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.4);
  rim.position.set(2.2, 1.2, -2.0);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(new THREE.Color(neon), 0.8);
  rim2.position.set(-2.4, 0.4, -1.6);
  scene.add(rim2);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 30);

  // soft floor glow behind the product
  const haloTex = (() => {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.5, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return keep(new THREE.CanvasTexture(c));
  })();
  const halo = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1, 1)),
    keep(
      new THREE.MeshBasicMaterial({
        map: haloTex,
        color: new THREE.Color(accent),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  scene.add(halo);

  const phone = buildPhone({ name: app.config.creator.name, accent, neon, keep });
  scene.add(phone.group);

  // rings out of the tag + a pulsing tag dot
  const ringTex = keep(new THREE.CanvasTexture(ringTexture()));
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(1, 1)),
      keep(
        new THREE.MeshBasicMaterial({
          map: ringTex,
          color: new THREE.Color(accent),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    );
    m.renderOrder = 5;
    scene.add(m);
    return m;
  });
  const dot = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1, 1)),
    keep(
      new THREE.MeshBasicMaterial({
        map: haloTex,
        color: new THREE.Color(neon),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    ),
  );
  dot.renderOrder = 4;
  scene.add(dot);

  // ---- the product, borrowed from the shelf -----------------------------------
  let borrowed = null;
  const tag = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const size = new THREE.Vector3();
  function borrow(h) {
    give();
    const it = h.item;
    borrowed = {
      h,
      parent: it.parent,
      pos: it.position.clone(),
      quat: it.quaternion.clone(),
      scale: it.scale.clone(),
      spin: h.spin.rotation.y,
    };
    it.position.set(0, 0, 0);
    it.quaternion.identity();
    it.scale.setScalar(1);
    h.spin.rotation.set(0, 0, 0);
    h.setFace?.("front");
    scene.add(it);
    it.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(it);
    box.getCenter(centre);
    box.getSize(size);
    tag.copy(it.localToWorld(h.tagPoint()));
    halo.scale.setScalar(Math.max(size.x, size.y) * 2.2);
    halo.position.set(centre.x, centre.y, box.min.z - 0.05);
  }
  /** Put the product back on the shelf exactly as it was. */
  function give() {
    if (!borrowed) return;
    const { h, parent, pos, quat, scale, spin } = borrowed;
    scene.remove(h.item);
    h.item.position.copy(pos);
    h.item.quaternion.copy(quat);
    h.item.scale.copy(scale);
    h.spin.rotation.y = spin;
    parent?.add(h.item);
    h.item.updateMatrixWorld(true);
    borrowed = null;
  }

  // ---- the shot -----------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  function pose(t) {
    if (!borrowed) return;
    const big = Math.max(size.x, size.y * 0.95);
    // frame the product and the phone together, for the canvas's shape:
    // the whole product first, then a push-in on the tag as the phone arrives
    const k = ease(seg(t, 0.4, TAP.touch + 0.2));
    const aspect = canvas.width / Math.max(1, canvas.height);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fw = Math.max(size.x, PH.h * 1.5);
    const fh = Math.max(size.y, PH.h * 1.5);
    const fit = Math.max(fh / (2 * tanV), fw / (2 * tanV * aspect));
    // small pieces (charms, stickers) are already close: push in less
    const push = size.y < PH.h * 2 ? 0.25 : 0.6;
    const dist = fit * (1.2 - push * k);
    const yaw = 0.42 - 0.24 * k;
    look.lerpVectors(centre, tag, 0.2 + 0.65 * k);
    camera.position.set(
      look.x + Math.sin(yaw) * dist,
      look.y + dist * 0.06,
      look.z + Math.cos(yaw) * dist,
    );
    camera.lookAt(look);

    // the phone: tilted, back to the shirt, its top (where the antenna is) to the tag
    const touchY = tag.y - PH.h * 0.3;
    const contactZ = tag.z + PH.d / 2 + 0.006;
    const reach = Math.max(big, PH.h * 2);
    const start = tmp.set(tag.x + reach * 0.75, touchY - reach * 0.35, tag.z + reach * 0.5);
    const hover = new THREE.Vector3(tag.x + 0.01, touchY, contactZ + 0.07);
    const touch = new THREE.Vector3(tag.x, touchY, contactZ);
    const p = phone.group.position;
    if (t < TAP.hover) p.lerpVectors(start, hover, ease(seg(t, TAP.enter, TAP.hover)));
    else if (t < TAP.touch) p.lerpVectors(hover, touch, ease(seg(t, TAP.hover, TAP.touch)));
    else if (t < TAP.back) p.copy(touch);
    else p.lerpVectors(touch, hover, ease(seg(t, TAP.back, TAP.back + 0.7)));
    // a tiny buzz on contact
    const buzz = t > TAP.touch && t < TAP.touch + 0.28 ? Math.sin(t * 160) * 0.0012 : 0;
    p.x += buzz;
    const tilt = ease(seg(t, TAP.enter, TAP.touch));
    phone.group.rotation.set(-0.22 * tilt + 0.1, 0.35 * (1 - tilt) - 0.08, -0.38 + 0.2 * tilt);
    phone.group.visible = t > TAP.enter - 0.05;
    phone.setScreen(
      t < TAP.sheet ? "idle" : t > TAP.press && t < TAP.press + 0.4 ? "press" : "sheet",
    );

    // tag pulse before contact, rings after
    const pre = t < TAP.touch ? 0.35 + 0.35 * Math.sin(t * 6) : 0.85;
    dot.position.set(tag.x, tag.y, tag.z + 0.004);
    const mark = Math.max(big, PH.h * 1.5);
    dot.scale.setScalar(mark * 0.07 * (t < TAP.touch ? 1 : 1.3));
    dot.material.opacity = seg(t, 0.2, 0.8) * pre;
    rings.forEach((r, i) => {
      const rt = t - TAP.touch - i * 0.28;
      const on = rt > 0 && rt < 1.3;
      r.visible = on;
      if (!on) return;
      const q = rt / 1.3;
      r.position.set(tag.x, tag.y, tag.z + 0.006);
      r.lookAt(camera.position);
      r.scale.setScalar(mark * (0.05 + q * 0.5));
      r.material.opacity = (1 - q) * 0.9;
    });
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(1.75, devicePixelRatio || 1);
    const w = Math.max(64, Math.round(r.width * dpr));
    const h = Math.max(64, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  return {
    TAP,
    /** Start a run on this product (moves it off the shelf until `release`). */
    begin(h) {
      resize();
      borrow(h);
    },
    /** Draw the frame at t seconds into step 1. */
    draw(t) {
      if (!borrowed) return;
      resize();
      pose(t);
      app.scene.renderView(scene, camera, canvas);
    },
    /** The tag's position on screen (0..1), for captions that point at it. */
    tagOnScreen() {
      if (!borrowed) return null;
      const v = tag.clone().project(camera);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
    },
    release: give,
    dispose() {
      give();
      for (const d of disposables) d.dispose?.();
    },
  };
}
