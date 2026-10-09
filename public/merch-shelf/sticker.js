/**
 * The holographic sticker 3-pack. There is no sticker model, so each sticker
 * is built from its art: a die-cut white border following the art's alpha,
 * a little thickness (a grey edge layer behind), and a holographic material —
 * MeshPhysical iridescence plus a view-dependent rainbow on the white vinyl.
 * Displayed fanned on a clear stand in front of the pack's backer card.
 */
import * as THREE from "three";
import { makeDieCut, makeCanvas, roundRect, FONT_SANS, FONT_MONO } from "./art.js";

export function holoMaterial(tex) {
  const m = new THREE.MeshPhysicalMaterial({
    map: tex,
    color: 0xe0e0e0,
    alphaTest: 0.5,
    roughness: 0.3,
    metalness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 820],
    side: THREE.FrontSide,
  });
  const uniforms = { time: { value: 0 } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.mlTime = uniforms.time;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float mlTime;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         {
           // holographic foil: strongest on the white vinyl, weaker over the inks
           float white = smoothstep( 0.62, 0.95, min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) ) );
           float facing = dot( normal, normalize( vViewPosition ) );
           vec2 uvh = vMapUv;
           vec3 rainbow = 0.5 + 0.5 * cos( 6.28318 * ( vec3( 0.0, 0.33, 0.67 ) + facing * 2.4 + uvh.x * 1.6 + uvh.y * 0.9 + mlTime * 0.05 ) );
           totalEmissiveRadiance += rainbow * ( 0.02 + 0.07 * white );
           diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * rainbow * 1.2, 0.35 * white );
         }`,
      );
  };
  m.customProgramCacheKey = () => "ml-holo-v1";
  return { material: m, uniforms };
}

function packCard({ name, accent, neon }) {
  const W = 512;
  const H = 440;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  roundRect(ctx, 0, 0, W, H, 26);
  ctx.fillStyle = "#121318";
  ctx.fill();
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 26);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, accent);
  g.addColorStop(1, neon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 120);
  ctx.restore();
  ctx.fillStyle = "#121318";
  ctx.beginPath();
  ctx.arc(W / 2, 38, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `700 38px ${FONT_SANS}`;
  ctx.fillText(name.toUpperCase().slice(0, 18), W / 2, 100, W - 60);
  ctx.font = `500 26px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("HOLO STICKER PACK · 3", W / 2, H - 70);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `500 20px ${FONT_MONO}`;
  ctx.fillText("TAP WITH YOUR PHONE · NFC", W / 2, H - 36);
  return c;
}

export function buildStickerPack({ kit, quality }) {
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const group = new THREE.Group();
  const materials = [];
  const holoUniforms = [];

  // backer card leaning against the back of the cubby
  const ct = keep(
    new THREE.CanvasTexture(packCard({ name: kit.name, accent: kit.accent, neon: kit.neon })),
  );
  ct.colorSpace = THREE.SRGBColorSpace;
  const cardMat = keep(new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }));
  materials.push(cardMat);
  const card = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.3, 0.258)), cardMat);
  card.position.set(0, 0.129 * Math.cos(0.18) + 0.002, -0.1);
  card.rotation.x = -0.18;
  card.castShadow = quality === "high";
  group.add(card);

  // clear stand
  const standMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xeef6ff,
      transparent: true,
      opacity: 0.14,
      roughness: 0.1,
      clearcoat: 0.6,
      envMapIntensity: 0.6,
      depthWrite: false,
    }),
  );
  const stand = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.012, 0.09)), standMat);
  stand.position.set(0, 0.006, 0.03);
  group.add(stand);

  const arts = [kit.logo(kit.isWordmark ? "dark" : "light"), kit.badge(), kit.neonPlate()];
  const fan = [
    { x: -0.085, z: 0.0, rz: 0.2, h: 0.15 },
    { x: 0.088, z: 0.008, rz: -0.18, h: 0.14 },
    { x: 0.0, z: 0.018, rz: 0.0, h: 0.16 },
  ];
  arts.forEach((art, i) => {
    const cut = makeDieCut(art, { size: 512 });
    const h = fan[i].h;
    const w = h * cut.aspect;
    const sw = Math.min(w, 0.2);
    const sh = (sw / w) * h;
    const faceTex = keep(new THREE.CanvasTexture(cut.face));
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 8;
    const { material, uniforms } = holoMaterial(faceTex);
    keep(material);
    materials.push(material);
    holoUniforms.push(uniforms);
    const edgeTex = keep(new THREE.CanvasTexture(cut.edge));
    edgeTex.colorSpace = THREE.SRGBColorSpace;
    const edgeMat = keep(
      new THREE.MeshStandardMaterial({
        map: edgeTex,
        alphaTest: 0.5,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    const geo = keep(new THREE.PlaneGeometry(sw, sh));
    const s = new THREE.Group();
    const f = new THREE.Mesh(geo, material);
    f.position.z = 0.0012;
    const e1 = new THREE.Mesh(geo, edgeMat);
    const e2 = new THREE.Mesh(geo, edgeMat);
    e2.position.z = -0.0012;
    f.castShadow = quality === "high";
    s.add(f, e1, e2);
    // lean back on the stand, fanned around the bottom centre
    const pivot = new THREE.Group();
    pivot.position.set(fan[i].x * 0.6, 0.012, 0.03 + fan[i].z);
    pivot.rotation.set(-0.22, 0, fan[i].rz);
    s.position.y = sh / 2;
    pivot.add(s);
    group.add(pivot);
  });

  let t = 0;
  return {
    group,
    materials,
    size: new THREE.Vector3(0.32, 0.27, 0.15),
    idle: (dt) => {
      t += dt;
      for (const u of holoUniforms) u.time.value = t;
      return false; // the shimmer follows the camera; no need to force frames
    },
    dispose: () => disposables.forEach((d) => d.dispose?.()),
  };
}
