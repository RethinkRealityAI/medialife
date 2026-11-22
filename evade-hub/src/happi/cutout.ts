// The 3D Photo's other board: a life-size Happi standee with a face hole, like a festival photo cutout. You place it
// in the room, a friend stands behind and puts their face through the oval, and you take the photo: they become
// Happi. Cardboard on the back, a strut behind. Model units: 1 tall (default 2.3 units, about 2.3 m with the phone held at 1.3 m; Happi's big head puts the
// hole near face height), feet on y = 0, facing +z.
import * as THREE from 'three';

// The art is a render of the real Happi model (waving), with a white die-cut edge and the hole cut into Happi's white
// face panel: /home/user/happi-work/tools/render_pose.py + build_cutout.py -> public/img/happi/cutout.webp.
const W = 0.78889; // board width (units) = the art's aspect; height 1
/** The face hole in board units (centre x from the middle, y from the feet; radii). At the default 2.3 m it is a
 *  30 x 38 cm vertical oval with its centre about 1.39 m up. */
export const CUTOUT_HOLE = { x: 0.0040, y: 0.6122 - 16 / 1440, rx: 0.0652, ry: 0.0826 };
/** The art has 16 px of clear margin under the shoes (of 1440): the board is lowered by that much so the shoes stand
 *  on the floor, not 1 % of the height above it (Dapo, 2026-11-20: "floating slightly above the reticle"). */
const FOOT_PAD = 16 / 1440;
const ART = '/evade/hub/img/happi/cutout.webp';

export function happiCutout(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'happi-cutout';
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(W, 1);
  geo.translate(0, 0.5 - FOOT_PAD, 0);
  const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.75, side: THREE.FrontSide }));
  front.name = 'cutout-front';
  // the back: plain cardboard in the same shape (alphaMap reads green, so a white-on-black copy of the silhouette)
  const m = document.createElement('canvas');
  m.width = 4; m.height = 4;
  const mask = new THREE.CanvasTexture(m);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    tex.needsUpdate = true;
    m.width = 256; m.height = Math.round(256 / W);
    const mx = m.getContext('2d')!;
    mx.drawImage(img, 0, 0, m.width, m.height);
    mx.globalCompositeOperation = 'source-in';
    mx.fillStyle = '#ffffff'; mx.fillRect(0, 0, m.width, m.height);
    mx.globalCompositeOperation = 'destination-over';
    mx.fillStyle = '#000000'; mx.fillRect(0, 0, m.width, m.height);
    mask.needsUpdate = true;
  };
  img.src = ART;
  const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc9b393, alphaMap: mask, alphaTest: 0.5, roughness: 0.9, side: THREE.BackSide }));
  back.position.z = -0.004;
  back.name = 'cutout-back';
  // a strut behind so it stands up
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.008), new THREE.MeshStandardMaterial({ color: 0xb39d7d, roughness: 0.9 }));
  strut.position.set(0, 0.3, -0.11);
  strut.rotation.x = -0.36;
  // a soft contact shadow under the shoes: without it a standee on a camera feed reads as hovering
  const sc = document.createElement('canvas');
  sc.width = 256; sc.height = 64;
  const sx = sc.getContext('2d')!;
  sx.filter = 'blur(9px)';
  sx.fillStyle = 'rgba(0,0,0,0.55)';
  sx.beginPath(); sx.ellipse(128, 32, 100, 14, 0, 0, Math.PI * 2); sx.fill();
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.05, W * 0.26),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.002, -0.03);
  shadow.renderOrder = -1;
  shadow.name = 'cutout-shadow';
  g.add(shadow, front, back, strut);
  return g;
}
