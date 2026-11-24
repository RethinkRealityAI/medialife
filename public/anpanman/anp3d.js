/* Anpanman, Activated: 3D activated-product stage (three.js, vendored).
   Products are generic code-built blanks (acrylic plates, a standee, a sticker sheet, a flat tee) with the
   OFFICIAL supplied art printed on them, composited as-is. No generative tools, no redrawn character.
   Flat colours only: no gradient textures, no gradient glows. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DecalGeometry } from "./vendor/DecalGeometry.js";

// Rounded box made from an extruded rounded rectangle (centred, depth along z).
class RoundedBoxGeometry extends THREE.ExtrudeGeometry {
  constructor(w, h, d, _seg = 4, r = 0.1) {
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    const bev = Math.min(d * 0.35, 0.04);
    const x = -w / 2 + bev, y = -h / 2 + bev, W = w - bev * 2, H = h - bev * 2, R = Math.max(0.001, r - bev);
    const s = new THREE.Shape();
    s.moveTo(x + R, y);
    s.lineTo(x + W - R, y);
    s.quadraticCurveTo(x + W, y, x + W, y + R);
    s.lineTo(x + W, y + H - R);
    s.quadraticCurveTo(x + W, y + H, x + W - R, y + H);
    s.lineTo(x + R, y + H);
    s.quadraticCurveTo(x, y + H, x, y + H - R);
    s.lineTo(x, y + R);
    s.quadraticCurveTo(x, y, x + R, y);
    super(s, { depth: d - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 10 });
    this.translate(0, 0, -(d - bev * 2) / 2);
  }
}

const stageEl = document.getElementById("stage3d");
const bubble = document.getElementById("bubble");
const hint = document.getElementById("stageHint");
const reduce = false; // the stage is interactive content: keep the idle spin even with reduced motion on

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

if (stageEl && webglOK()) start();

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  stageEl.prepend(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "3D activated product. Drag to spin.");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8FD3F4");
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.35, 9.6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfe6f7, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  // flat floor disc + contact shadow (solid colours)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshBasicMaterial({ color: "#7cc7ea" }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.62;
  scene.add(floor);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: "#5fb2d8" }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.61;
  shadow.scale.set(1.25, 0.7, 1);
  scene.add(shadow);

  // ── textures ──────────────────────────────────────────────────────────
  const loader = new THREE.TextureLoader();
  const loadTex = (url) =>
    new Promise((res) =>
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          res(t);
        },
        undefined,
        () => res(null),
      ),
    );
  const loadImg = (url) =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = url;
    });

  Promise.all([loadImg("assets/anp-cutout.webp"), loadTex("assets/anp-hubbg.webp"), loadImg("assets/qr-medialife.svg")]).then(([art, hubTex, qrImg]) => {
    if (!art) return;
    build(art, hubTex, qrImg);
    if (/[?&]export\b/.test(location.search)) window.__anp = { products: window.__anpProducts, art, THREE };
  });

  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // print the supplied art centred on a flat card colour (contain-fit)
  function artCard(art, w, h, bg, pad = 0.08) {
    return canvasTex(w, h, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const s = Math.min((w * (1 - pad * 2)) / art.width, (h * (1 - pad * 2)) / art.height);
      g.drawImage(art, (w - art.width * s) / 2, (h - art.height * s) / 2, art.width * s, art.height * s);
    });
  }
  // the supplied art with a white sticker border (stamped outline, flat colour)
  function stickerCanvas(art, scale) {
    const pad = 14;
    const w = Math.round(art.width * scale) + pad * 2,
      h = Math.round(art.height * scale) + pad * 2;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tg = tmp.getContext("2d");
    tg.drawImage(art, pad, pad, art.width * scale, art.height * scale);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = "#ffffff";
    tg.fillRect(0, 0, w, h);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) g.drawImage(tmp, Math.cos(a) * 9, Math.sin(a) * 9);
    g.drawImage(art, pad, pad, art.width * scale, art.height * scale);
    return c;
  }

  // ── materials ─────────────────────────────────────────────────────────
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25 });
  const red = new THREE.MeshStandardMaterial({ color: "#E3241B", roughness: 0.5 });
  const ink = new THREE.MeshStandardMaterial({ color: "#2B1A12", roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });

  const products = {};
  if (/[?&]export\b/.test(location.search)) window.__anpProducts = products;
  const root = new THREE.Group();
  scene.add(root);

  // phone + effects
  let phone, phoneScreen, ripples, scanLine, frame, popSprite;

  function build(art, hubTex, qrImg) {
    const aspect = art.width / art.height;
    const qrTex = qrImg
      ? canvasTex(256, 256, (g, w, h) => {
          g.fillStyle = "#fff";
          g.fillRect(0, 0, w, h);
          g.drawImage(qrImg, 10, 10, w - 20, h - 20);
        })
      : null;

    // ── keychain: rounded acrylic plate, art printed both sides, QR on the back
    {
      const g = new THREE.Group();
      const ph = 2.3,
        pw = ph * aspect + 0.3;
      const plate = new THREE.Mesh(new RoundedBoxGeometry(pw, ph + 0.15, 0.09, 4, 0.22), acrylic);
      g.add(plate);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.16, ph), new THREE.MeshBasicMaterial({ map: artCard(art, 512, Math.round(512 / ((pw - 0.16) / ph)), "#FFF6E5"), transparent: false }));
      front.position.z = 0.047;
      g.add(front);
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(pw - 0.16, ph),
        new THREE.MeshBasicMaterial({
          map: canvasTex(512, Math.round(512 / ((pw - 0.16) / ph)), (c, w, h) => {
            c.fillStyle = "#FFD23F";
            c.fillRect(0, 0, w, h);
            if (qrImg) {
              c.fillStyle = "#fff";
              c.fillRect(w * 0.18, h * 0.3, w * 0.64, w * 0.64);
              c.drawImage(qrImg, w * 0.21, h * 0.3 + w * 0.03, w * 0.58, w * 0.58);
            }
            c.fillStyle = "#2B1A12";
            c.font = `700 ${Math.round(w * 0.11)}px Fredoka, sans-serif`;
            c.textAlign = "center";
            c.fillText("SCAN ME", w / 2, h * 0.24);
            c.font = `600 ${Math.round(w * 0.07)}px Nunito, sans-serif`;
            c.fillText("Say hello", w / 2, h * 0.3 + w * 0.74);
          }),
        }),
      );
      back.position.z = -0.047;
      back.rotation.y = Math.PI;
      g.add(back);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 12, 40), metal);
      ring.position.y = ph / 2 + 0.55;
      g.add(ring);
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 10, 24), metal);
      link.position.y = ph / 2 + 0.2;
      link.rotation.y = Math.PI / 2;
      g.add(link);
      g.userData = { target: new THREE.Vector3(0, 0, 0.06), qr: new THREE.Vector3(0, 0.1, -0.06), artH: ph, y: 0.05, label: "Keychain" };
      products.keychain = g;
    }

    // ── standee: die-cut character standee (official art with a white cut border), card edge,
    //    fold-out easel at the back and a red foot with the QR, like a retail floor standee
    {
      const g = new THREE.Group();
      const fh = 3.1,
        pad = 0.1,
        fw = fh * aspect;
      const W = 512,
        H = Math.round(W / ((fw + pad * 2) / (fh + pad * 2)));
      const px = (W * pad) / (fw + pad * 2);
      // silhouette of the art grown by px pixels, filled with one colour
      const grown = (fill) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const x = c.getContext("2d");
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) x.drawImage(art, px + Math.cos(a) * px, px + Math.sin(a) * px, W - px * 2, H - px * 2);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = fill;
        x.fillRect(0, 0, W, H);
        return c;
      };
      const front = canvasTex(W, H, (x) => {
        x.drawImage(grown("#ffffff"), 0, 0);
        x.drawImage(art, px, px, W - px * 2, H - px * 2);
      });
      const backTex = canvasTex(W, H, (x) => x.drawImage(grown("#d9c3a0"), 0, 0));
      const edgeTex = canvasTex(W, H, (x) => x.drawImage(grown("#f1eadf"), 0, 0));
      const pw = fw + pad * 2,
        ph2 = fh + pad * 2,
        cy = 0.2;
      const layer = (map, z, side) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph2), new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, side: side || THREE.FrontSide }));
        m.position.set(0, cy, z);
        g.add(m);
        return m;
      };
      layer(front, 0.03);
      for (const z of [0.015, 0, -0.015]) layer(edgeTex, z, THREE.DoubleSide);
      layer(backTex, -0.03).rotation.y = Math.PI;
      // easel strut: a folded card leg behind the figure
      const card = new THREE.MeshStandardMaterial({ color: 0xd9c3a0, roughness: 0.9 });
      const easel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.03), card);
      easel.position.set(0, -0.35, -0.42);
      easel.rotation.x = 0.36;
      g.add(easel);
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.02), card);
      hinge.position.set(0, 0.72, -0.05);
      g.add(hinge);
      // red foot with the QR label, the figure slots into it
      const base = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.34, 0.5, 4, 0.06), red);
      base.position.set(0, -1.38, 0.1);
      g.add(base);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(1.76, 0.28),
        new THREE.MeshBasicMaterial({
          map: canvasTex(1024, 163, (c, w, h) => {
            c.fillStyle = "#E3241B";
            c.fillRect(0, 0, w, h);
            c.fillStyle = "#ffffff";
            c.font = "700 72px Fredoka, sans-serif";
            c.textBaseline = "middle";
            c.fillText("ANPANMAN", 30, h * 0.42);
            c.fillStyle = "#FFD23F";
            c.font = "700 30px JetBrains Mono, monospace";
            c.fillText("SCAN TO SAY HELLO", 34, h * 0.82);
            if (qrImg) {
              c.fillStyle = "#fff";
              c.fillRect(w - 168, 6, 152, 152);
              c.drawImage(qrImg, w - 160, 14, 136, 136);
            }
          }),
        }),
      );
      label.position.set(0, -1.38, 0.352);
      g.add(label);
      g.userData = { target: new THREE.Vector3(0, 0.3, 0.06), qr: new THREE.Vector3(0.66, -1.38, 0.38), artH: fh, y: 0.05, label: "Standee" };
      products.standee = g;
    }

    // ── sticker sheet: white card, several white-bordered stickers + a round SCAN ME sticker
    {
      const g = new THREE.Group();
      const sw = 2.2,
        sh = 3.0;
      const card = new THREE.Mesh(new RoundedBoxGeometry(sw, sh, 0.03, 3, 0.1), white);
      g.add(card);
      const tex = canvasTex(660, 900, (c, w, h) => {
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "#EAD6B8";
        c.lineWidth = 6;
        c.strokeRect(14, 14, w - 28, h - 28);
        // the official Anpanman art (as supplied) plus original bakery + slogan stickers (no other characters
        // until Nippon TV supplies official sticker art for them)
        c.drawImage(stickerCanvas(art, 0.4), 34, 34);
        const peel = (x, y, rot, draw) => {
          c.save();
          c.translate(x, y);
          c.rotate(rot);
          draw();
          c.restore();
        };
        const outlined = (path, fill) => {
          c.lineJoin = "round";
          c.strokeStyle = "#ffffff";
          c.lineWidth = 22;
          c.stroke(path);
          c.strokeStyle = "#2B1A12";
          c.lineWidth = 6;
          c.stroke(path);
          c.fillStyle = fill;
          c.fill(path);
        };
        // round bun with sesame seeds
        peel(330, 110, -0.1, () => {
          const p = new Path2D();
          p.ellipse(0, 0, 78, 58, 0, 0, Math.PI * 2);
          outlined(p, "#D98A3A");
          c.fillStyle = "#FFF6E5";
          [[-30, -18], [8, -28], [36, -8], [-8, 6], [24, 18]].forEach(([x, y]) => {
            c.beginPath();
            c.ellipse(x, y, 7, 4, 0.5, 0, Math.PI * 2);
            c.fill();
          });
        });
        // loaf of bread
        peel(530, 120, 0.16, () => {
          const p = new Path2D();
          p.moveTo(-70, 50);
          p.lineTo(-70, -10);
          p.arc(-35, -10, 35, Math.PI, 0);
          p.arc(35, -10, 35, Math.PI, 0);
          p.lineTo(70, 50);
          p.closePath();
          outlined(p, "#E3A35A");
          c.strokeStyle = "#B4672A";
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(-40, -20); c.lineTo(-25, 10);
          c.moveTo(0, -30); c.lineTo(15, 5);
          c.moveTo(38, -20); c.lineTo(52, 10);
          c.stroke();
        });
        // croissant
        peel(400, 300, -0.2, () => {
          const p = new Path2D();
          p.moveTo(-95, 20);
          p.quadraticCurveTo(-60, -60, 0, -62);
          p.quadraticCurveTo(60, -60, 95, 20);
          p.quadraticCurveTo(60, 0, 0, 10);
          p.quadraticCurveTo(-60, 0, -95, 20);
          p.closePath();
          outlined(p, "#E8A54B");
          c.strokeStyle = "#B4672A";
          c.lineWidth = 5;
          c.beginPath();
          [-50, -18, 18, 50].forEach((x) => { c.moveTo(x, -50 + Math.abs(x) * 0.3); c.lineTo(x * 0.8, 6); });
          c.stroke();
        });
        // "Hello, America!" slogan sticker
        peel(470, 470, 0.08, () => {
          const p = new Path2D();
          p.roundRect(-150, -46, 300, 92, 46);
          outlined(p, "#E3241B");
          c.fillStyle = "#ffffff";
          c.font = "700 40px Fredoka, sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("Hello, America!", 0, 3);
        });
        // star
        peel(560, 630, 0.2, () => {
          const p = new Path2D();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 26 : 62, a = -Math.PI / 2 + (i * Math.PI) / 5;
            i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          p.closePath();
          outlined(p, "#FFD23F");
        });
        // "fresh from the bakery" badge
        peel(390, 650, -0.12, () => {
          const p = new Path2D();
          p.arc(0, 0, 74, 0, Math.PI * 2);
          outlined(p, "#8FD3F4");
          c.fillStyle = "#0F5C86";
          c.font = "700 24px Fredoka, sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("FRESH", 0, -16);
          c.fillText("BAKED", 0, 14);
          c.font = "700 13px JetBrains Mono, monospace";
          c.fillText("DAILY", 0, 40);
        });
        // round SCAN ME sticker with QR
        c.fillStyle = "#FFD23F";
        c.beginPath();
        c.arc(170, 760, 100, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 8;
        c.strokeStyle = "#ffffff";
        c.stroke();
        if (qrImg) {
          c.fillStyle = "#fff";
          c.fillRect(120, 690, 100, 100);
          c.drawImage(qrImg, 124, 694, 92, 92);
        }
        c.fillStyle = "#2B1A12";
        c.font = "700 26px JetBrains Mono, monospace";
        c.textAlign = "center";
        c.fillText("SCAN ME", 170, 830);
        // NFC dot
        c.fillStyle = "#E3241B";
        c.beginPath();
        c.arc(560, 790, 52, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#fff";
        c.font = "700 30px JetBrains Mono, monospace";
        c.fillText("NFC", 560, 800);
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.04, sh - 0.04), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.z = 0.017;
      g.add(face);
      g.rotation.x = -0.12;
      g.userData = { target: new THREE.Vector3(-0.3, 0.35, 0.05), qr: new THREE.Vector3(-0.53, -1.0, 0.05), artH: 2.0, y: 0, label: "Sticker sheet" };
      products.sheet = g;
    }

    // ── shirt: the real Activated Merch tee mesh (/merch-shelf lineup blank) with a projected front
    //    print (official art composited as supplied + original flat graphics) and a back print.
    {
      const g = new THREE.Group();
      g.userData = { target: new THREE.Vector3(0, 0.35, 0.3), qr: new THREE.Vector3(0.28, 0.95, 0.3), artH: 1.6, y: 0, label: "Shirt" };
      products.shirt = g;
      buildShirt(g, art, qrImg);
    }
    Object.values(products).forEach((p) => {
      p.visible = false;
      root.add(p);
    });

    // ── phone (code-built)
    phone = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.05, 0.1, 4, 0.14), ink);
    phone.add(body);
    phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.92), new THREE.MeshBasicMaterial({ color: "#1a110c" }));
    phoneScreen.position.z = 0.052;
    phone.add(phoneScreen);
    phone.userData.hub = hubTex;
    phone.visible = false;
    scene.add(phone);

    // NFC ripples (flat rings)
    ripples = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 48), new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      scene.add(m);
      return m;
    });
    // QR scan line
    scanLine = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.04), new THREE.MeshBasicMaterial({ color: "#E3241B", transparent: true, opacity: 0 }));
    scene.add(scanLine);
    // point-at-art frame (4 corner brackets)
    frame = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    for (const [sx, sy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.06), fm);
      a.position.set(sx * 0.83, sy * 1.2, 0);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.34), fm);
      b.position.set(sx * 0.98, sy * 1.05, 0);
      frame.add(a, b);
    }
    frame.visible = false;
    scene.add(frame);
    // pop-out: the supplied art as a billboard (as-is)
    const popTex = new THREE.CanvasTexture(stickerCanvas(art, 0.6));
    popTex.colorSpace = THREE.SRGBColorSpace;
    popSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: popTex, transparent: true, depthWrite: false }));
    popSprite.visible = false;
    scene.add(popSprite);

    setProduct("keychain");
    stageEl.classList.add("ready");
    resize();
    renderer.setAnimationLoop(loop);
  }


  // ── shirt helpers ─────────────────────────────────────────────────────
  const CLOUD_PATH = new Path2D("M30 84c-16 0-28-10-28-24s12-24 27-24c3-17 18-30 37-30 16 0 30 9 35 23 5-4 12-6 19-6 19 0 34 14 34 31v1c14 2 24 13 24 25 0 2 0 3-1 4z");
  function cloudAt(c, x, y, s, col) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = col;
    c.fill(CLOUD_PATH);
    c.restore();
  }
  function star(c, x, y, r, col) {
    c.save();
    c.translate(x, y);
    c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        rr = i % 2 ? r * 0.38 : r;
      c.lineTo(Math.sin(a) * rr, -Math.cos(a) * rr);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
  // Front print: flat sun disc, clouds, sparkles, type, the official art as supplied, NFC disc behind the head.
  function frontPrint(art) {
    const W = 1024,
      H = 1200;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d");
    // sun disc + ring (flat)
    c.fillStyle = "#FFD23F";
    c.beginPath();
    c.arc(W / 2, 470, 360, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 18;
    c.strokeStyle = "#E3241B";
    c.beginPath();
    c.arc(W / 2, 470, 404, Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
    // rays
    c.fillStyle = "#E3241B";
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.1 + i * 0.1);
      c.save();
      c.translate(W / 2 + Math.cos(a) * 450, 470 + Math.sin(a) * 450);
      c.rotate(a + Math.PI / 2);
      c.fillRect(-9, -26, 18, 52);
      c.restore();
    }
    cloudAt(c, 80, 560, 1.5, "#FFFFFF");
    cloudAt(c, 700, 620, 1.3, "#FFFFFF");
    cloudAt(c, 640, 250, 0.9, "#8FD3F4");
    star(c, 180, 300, 34, "#E3241B");
    star(c, 860, 420, 26, "#3FA9E0");
    star(c, 250, 760, 22, "#FFD23F");
    // NFC disc, embedded in the design behind the head
    c.fillStyle = "#2B1A12";
    c.beginPath();
    c.arc(W / 2, 300, 82, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#FFD23F";
    c.lineWidth = 6;
    for (const r of [26, 44, 62]) {
      c.beginPath();
      c.arc(W / 2 + 4, 300, r, -0.7, 0.7);
      c.stroke();
    }
    // official art, as supplied
    const ah = 690,
      aw = (ah * art.width) / art.height;
    c.drawImage(art, (W - aw) / 2, 200, aw, ah);
    // type
    c.textAlign = "center";
    c.fillStyle = "#E3241B";
    c.font = "700 128px Fredoka, sans-serif";
    c.lineWidth = 22;
    c.strokeStyle = "#FFFFFF";
    c.lineJoin = "round";
    c.strokeText("HELLO,", W / 2, 1000);
    c.fillText("HELLO,", W / 2, 1000);
    c.fillStyle = "#2B1A12";
    c.font = "700 104px Fredoka, sans-serif";
    c.strokeText("AMERICA!", W / 2, 1110);
    c.fillText("AMERICA!", W / 2, 1110);
    c.fillStyle = "#2B1A12";
    c.font = "600 40px Nunito, sans-serif";
    c.fillText("アンパンマン · TAP TO SAY HELLO", W / 2, 1175);
    return cv;
  }
  // Back print: big stacked type + QR panel (no character).
  function backPrint(qrImg) {
    const W = 1024,
      H = 1200;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d");
    c.textAlign = "center";
    c.fillStyle = "#FFFFFF";
    c.font = "700 170px Fredoka, sans-serif";
    c.fillText("ANPANMAN", W / 2, 230);
    c.fillStyle = "#FFD23F";
    c.strokeStyle = "#2B1A12";
    c.lineWidth = 14;
    c.lineJoin = "round";
    c.font = "700 150px Fredoka, sans-serif";
    c.strokeText("ACTIVATED", W / 2, 400);
    c.fillText("ACTIVATED", W / 2, 400);
    cloudAt(c, 110, 470, 1.6, "#FFFFFF");
    cloudAt(c, 640, 520, 1.4, "#8FD3F4");
    if (qrImg) {
      c.fillStyle = "#FFFFFF";
      c.fillRect(W / 2 - 170, 640, 340, 340);
      c.drawImage(qrImg, W / 2 - 150, 660, 300, 300);
    }
    c.fillStyle = "#2B1A12";
    c.font = "700 44px JetBrains Mono, monospace";
    c.fillText("SCAN · TAP · PLAY", W / 2, 1060);
    star(c, 190, 860, 40, "#E3241B");
    star(c, 840, 820, 30, "#FFD23F");
    return cv;
  }
  function shirtDecal(meshes, canvas, pos, size, back) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.86, metalness: 0, polygonOffset: true, polygonOffsetFactor: -8 });
    const grp = new THREE.Group();
    const euler = new THREE.Euler(0, back ? Math.PI : 0, 0);
    for (const m of meshes) {
      try {
        grp.add(new THREE.Mesh(new DecalGeometry(m, pos, euler, size), mat));
      } catch {}
    }
    return grp;
  }
  function buildShirt(g, art, qrImg) {
    const gl = new GLTFLoader();
    gl.setMeshoptDecoder(MeshoptDecoder);
    gl.load(
      "assets/tee.glb",
      (gltf) => {
        const model = gltf.scene;
        // normalise: ~3.3 units wide, centred
        const box0 = new THREE.Box3().setFromObject(model);
        const s0 = box0.getSize(new THREE.Vector3());
        const k = 3.3 / s0.x;
        model.scale.multiplyScalar(k);
        const c0 = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
        model.position.sub(c0);
        const meshes = [];
        model.traverse((o) => {
          if (o.isMesh) {
            o.material = new THREE.MeshStandardMaterial({ color: "#E3241B", roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
            meshes.push(o);
          }
        });
        const savedRot = g.rotation.y,
          savedY = g.position.y;
        g.rotation.y = 0;
        g.position.y = 0;
        g.add(model);
        model.updateMatrixWorld(true);
        g.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const sz = box.getSize(new THREE.Vector3());
        // DecalGeometry projects in world space; the group sits at the origin unrotated while building
        const fw = sz.x * 0.48,
          fh = fw * 1.17;
        const front = shirtDecal(meshes, frontPrint(art), new THREE.Vector3(0, box.min.y + sz.y * 0.56, box.max.z), new THREE.Vector3(fw, fh, sz.z * 0.62), false);
        const back = shirtDecal(meshes, backPrint(qrImg), new THREE.Vector3(0, box.min.y + sz.y * 0.58, box.min.z), new THREE.Vector3(fw * 1.05, fh * 1.05, sz.z * 0.62), true);
        g.add(front, back);
        g.userData.target.set(0, box.min.y + sz.y * 0.6, box.max.z);
        g.userData.qr.set(0, box.min.y + sz.y * 0.5, box.min.z);
        g.userData.artH = fh;
        g.rotation.y = savedRot;
        g.position.y = savedY;
        g.userData.ready = true;
      },
      undefined,
      () => {},
    );
  }

  // ── interaction ───────────────────────────────────────────────────────
  let current = null;
  let rotY = -0.5,
    velY = reduce ? 0 : 0.35,
    dragging = false,
    lastX = 0,
    seq = null;
  const cv = renderer.domElement;
  cv.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    rotY += dx * 0.012;
    velY = dx * 0.6;
  });
  const end = () => (dragging = false);
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);

  function setProduct(name) {
    if (!products[name]) return;
    cancelSeq();
    Object.entries(products).forEach(([k, p]) => (p.visible = k === name));
    current = products[name];
    current.position.y = current.userData.y;
    rotY = -0.5;
    velY = reduce ? 0 : 0.35;
    document.querySelectorAll("#prodSeg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === name));
    hint.textContent = "Drag to spin · then tap, scan or point";
    hint.hidden = false;
    const ar = document.getElementById("arGo");
    if (ar) ar.href = "ar/?p=" + name;
  }
  document.getElementById("prodSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (b) setProduct(b.dataset.p);
  });
  document.querySelectorAll(".mode").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode").forEach((x) => x.setAttribute("aria-pressed", x === b));
      runSeq(b.dataset.m);
      stageEl.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    }),
  );

  function cancelSeq() {
    seq = null;
    if (!phone) return;
    phone.visible = false;
    frame.visible = false;
    popSprite.visible = false;
    scanLine.material.opacity = 0;
    ripples.forEach((r) => (r.material.opacity = 0));
    phoneScreen.material.map = null;
    phoneScreen.material.color.set("#1a110c");
    phoneScreen.material.needsUpdate = true;
    bubble.classList.remove("show");
  }
  function runSeq(mode) {
    if (!current) return;
    cancelSeq();
    // face the product forward (or show its back for a keychain QR scan)
    const wantBack = mode === "scan" && (current === products.keychain || current === products.shirt);
    seq = { mode, t: 0, from: rotY, to: wantBack ? Math.PI : 0 };
    velY = 0;
    hint.textContent = { tap: "Tap: the phone touches the NFC", scan: "Scan: the QR opens it", point: "Point: the art is the trigger" }[mode];
  }

  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  const v3 = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function worldOf(local) {
    return current.localToWorld(tmp.copy(local));
  }

  function loop(now) {
    const t = now / 1000;
    if (!current) return;
    if (!seq) {
      if (!dragging) {
        rotY += velY * 0.016;
        velY += ((reduce ? 0 : 0.35) - velY) * 0.03;
      }
      current.rotation.y = rotY;
      current.position.y = current.userData.y + (reduce ? 0 : Math.sin(t * 1.3) * 0.05);
    } else {
      seq.t += 1 / 60;
      const s = seq;
      // 0–0.7s turn to face
      const kTurn = ease(s.t / 0.7);
      rotY = s.from + (normAngle(s.to - s.from) * kTurn);
      current.rotation.y = rotY;
      current.position.y = current.userData.y;
      current.updateMatrixWorld(true);
      const target = worldOf(s.mode === "scan" ? current.userData.qr : current.userData.target).clone();
      const faceZ = s.mode === "scan" && (current === products.keychain || current === products.shirt) ? -1 : 1;
      if (s.mode === "scan" && (current === products.keychain || current === products.shirt)) target.z = -target.z;
      phone.visible = s.t > 0.35;
      // phone path
      let ph;
      if (s.mode === "tap") {
        const k1 = ease((s.t - 0.4) / 0.6);
        ph = new THREE.Vector3(2.6 - k1 * (2.6 - target.x - 0.05), -1.3 + k1 * (target.y + 1.3 - 0.4), 1.6 - k1 * (1.6 - target.z - 0.07));
        phone.rotation.set(-0.15 * (1 - k1), -0.5 * (1 - k1), 0.2 * (1 - k1));
        if (s.t > 1.0 && s.t < 2.0) {
          ripples.forEach((r, i) => {
            const kr = ((s.t - 1.0) * 1.6 - i * 0.25) % 1;
            r.position.copy(target).add(v3.set(0, 0, 0.02));
            r.scale.setScalar(0.4 + kr * 2.2);
            r.material.opacity = kr > 0 ? (1 - kr) * 0.9 : 0;
          });
        } else ripples.forEach((r) => (r.material.opacity = 0));
      } else if (s.mode === "scan") {
        const k1 = ease((s.t - 0.4) / 0.6);
        ph = new THREE.Vector3(2.4 - k1 * (2.4 - target.x), -1.2 + k1 * (target.y + 1.2), (1.4 + k1 * 0.2) * faceZ + target.z);
        phone.rotation.set(0, faceZ < 0 ? Math.PI : 0, 0.15 * (1 - k1));
        if (s.t > 1.0 && s.t < 1.9) {
          scanLine.material.opacity = 0.95;
          scanLine.position.set(target.x, target.y + 0.3 - ((s.t - 1.0) / 0.9) * 0.6, target.z + 0.03 * faceZ);
          scanLine.rotation.y = faceZ < 0 ? Math.PI : 0;
        } else scanLine.material.opacity = 0;
      } else {
        const k1 = ease((s.t - 0.4) / 0.7);
        ph = new THREE.Vector3(2.6 - k1 * 1.1, -1.9 + k1 * 0.5, 3.2);
        phone.rotation.set(0.05, 0, 0);
        frame.visible = s.t > 1.0 && s.t < 2.2;
        if (frame.visible) {
          const kf = ease((s.t - 1.0) / 0.4);
          frame.position.copy(worldOf(current.userData.target)).add(v3.set(0, 0, 0.1));
          frame.scale.setScalar((1.25 - kf * 0.25) * (current.userData.artH / 2.3));
        }
      }
      phone.position.copy(ph);
      phone.scale.setScalar(s.mode === "point" ? 0.85 : 0.7);
      // screen lights up with the hub
      const lit = s.t > (s.mode === "point" ? 1.6 : 1.4);
      if (lit && !phoneScreen.material.map && phone.userData.hub) {
        phoneScreen.material.map = phone.userData.hub;
        phoneScreen.material.color.set("#ffffff");
        phoneScreen.material.needsUpdate = true;
      }
      // the art pops out of the product and says hello
      if (s.t > 1.7) {
        if (!popSprite.visible) {
          popSprite.visible = true;
          bubble.classList.add("show");
        }
        const kp = ease((s.t - 1.7) / 0.8);
        const base = worldOf(current.userData.target).clone();
        const h = 1.55;
        popSprite.scale.set(h * 0.55 * (0.3 + kp * 0.7), h * (0.3 + kp * 0.7), 1);
        popSprite.position.set(base.x - 1.55 * kp, base.y + 0.1 + kp * 0.45 + (reduce ? 0 : Math.sin(t * 2.4) * 0.06 * kp), base.z + 0.9 * kp + 0.2);
        // place the speech bubble above the sprite in screen space
        const p = popSprite.position.clone().add(v3.set(0, h * 0.5 * (0.3 + kp * 0.7), 0)).project(camera);
        const r = stageEl.getBoundingClientRect();
        bubble.style.left = ((p.x + 1) / 2) * r.width + "px";
        bubble.style.top = ((1 - p.y) / 2) * r.height - 6 + "px";
      }
      if (s.t > 6.5) {
        // settle back to the idle spin
        cancelSeq();
        document.querySelectorAll(".mode").forEach((x) => x.setAttribute("aria-pressed", "false"));
        hint.textContent = "Try another product or mode";
      }
    }
    renderer.render(scene, camera);
  }
  function normAngle(a) {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  }

  function resize() {
    const r = stageEl.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.fov = camera.aspect < 0.9 ? 40 : 32;
    camera.position.z = camera.aspect < 0.9 ? 11.5 : 9.6;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl);

  // pause rendering when off screen
  new IntersectionObserver(([e]) => renderer.setAnimationLoop(e.isIntersecting && current ? loop : null)).observe(stageEl);
}
