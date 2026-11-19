// Moon Shop: a doorway in your room onto a showroom on the moon; walk through it (from the 8th Wall "shop"
// world-tracking portal sample, A-Frame -> plain three.js).
//
// Kept from the sample (src/body.html, components/portal-components.js): a round portal (portal.glb rim) that grows
// open with an elastic ease (1.5 s) when placed; the moon ground (moon-ground.glb at half size), the platform, the
// star skybox behind it; the camera test that flips "inside" when you cross the portal plane within its bounds;
// outside, the moon is only seen through the hole; inside, the moon is all round you and the doorway behind you
// shows your room. Changed: the 8th Wall GL context has NO stencil buffer, so every hiding job is depth-only
// (colorWrite false, drawn first): outside = a 400 m wall with a round hole in the portal plane, plus a clipping
// plane that cuts every moon material at the portal plane so nothing pokes out into the room; inside = a disc in
// the doorway (your room through it). Real sizes: the door is 1.6 m across. The sample's flag (20 MB) and
// satellite are left out; three "products" stand on the moon (the car, the shades and the sand castle from the
// other demos); tap one for its card. Move picks the doorway up, open, with you outside.
import { createDemo, THREE, MEDIA, loadGLB, fitTo, texture, clamp } from '../shared/shell.js';

const R = 0.8, PY = 1.0; // the opening: radius and centre height (metres)
let assets = {}, portal, rim, iris, wall, door, moon, sky, inside = false, wasOutside = true, openT = -1;
const clip = new THREE.Plane(), noClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
const products = [];
const camL = new THREE.Vector3();

const demo = createDemo({
  slug: 'moon-shop', mode: 'world', tag: 'Portal',
  title: 'Moon Shop', titleHtml: 'Moon <span>Shop</span>',
  lead: 'Open a doorway in your room onto a showroom on the moon, then walk through it.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><circle cx="150" cy="150" r="90" fill="#0b0d12" stroke="#4fd6e8" stroke-width="12"/><circle cx="190" cy="110" r="16" fill="#fff"/><rect x="70" y="180" width="160" height="30" fill="#8b8f96"/></svg>`,
  how: [
    '<b>Find the floor</b> with a couple of metres of space, then tap <b>Place the door</b>.',
    '<b>Look through it</b>: the moon is on the other side. Tap a product to see what it is.',
    '<b>Walk through</b> the doorway to stand on the moon. Turn round: your room is behind you.',
    '<b>Move</b> (bottom right) puts the doorway somewhere else.',
  ],
  placeLabel: 'Place the door', placeHint: 'Point at the floor where the door should stand', reticleSize: 0.5,
  async load(d) {
    let n = 0; const step = () => d.progress(0.2 + 0.14 * ++n);
    const [g, p, r, sk, car, gl, sc] = await Promise.all([
      loadGLB(MEDIA + 'moon/moon-ground.glb').then((x) => (step(), x)), loadGLB(MEDIA + 'moon/platform.glb').then((x) => (step(), x)),
      loadGLB(MEDIA + 'moon/portal.glb').then((x) => (step(), x)), texture(MEDIA + 'moon/skybox.jpg'),
      loadGLB(MEDIA + 'car.glb').then((x) => (step(), x)), loadGLB(MEDIA + 'stereo-glasses.glb'), loadGLB(MEDIA + 'sand-castle.glb'),
    ]);
    assets = { ground: g.scene, platform: p.scene, rim: r.scene, sky: sk, car: car.scene, glasses: gl.scene, castle: sc.scene };
  },
  hero() {
    const g = new THREE.Group(); const r = assets.rim.clone(true); r.rotation.x = Math.PI / 2; r.scale.setScalar(1); g.add(r);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 48), new THREE.MeshBasicMaterial({ map: assets.sky })); disc.position.z = -0.02; g.add(disc);
    return g;
  },
  build(d) {
    d.renderer.localClippingEnabled = true;
    portal = new THREE.Group(); d.stage.add(portal);
    // the rim, standing up in the portal plane (x/y), grows open on placement
    rim = assets.rim; rim.rotation.x = Math.PI / 2; rim.scale.setScalar((R * 1.06) / 1.02); rim.position.set(0, PY, 0);
    rim.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    portal.add(rim);
    const hide = () => new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    // OUTSIDE: a huge wall in the portal plane with a round hole, depth only, drawn before anything else
    const shape = new THREE.Shape(); shape.moveTo(-200, -200); shape.lineTo(200, -200); shape.lineTo(200, 200); shape.lineTo(-200, 200); shape.lineTo(-200, -200);
    const hole = new THREE.Path(); hole.absarc(0, PY, R, 0, Math.PI * 2, true); shape.holes.push(hole);
    wall = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), hide()); wall.renderOrder = -2; wall.position.z = -0.005; portal.add(wall);
    // the iris: closes the hole while it opens (and stays closed until placed)
    iris = new THREE.Mesh(new THREE.CircleGeometry(R, 64), hide()); iris.renderOrder = -2; iris.position.set(0, PY, -0.004); portal.add(iris);
    // INSIDE: the doorway shows your room (depth-only disc in the doorway)
    door = new THREE.Mesh(new THREE.CircleGeometry(R, 64), hide()); door.renderOrder = -2; door.position.set(0, PY, 0.004); door.visible = false; portal.add(door);
    // the moon, all behind the portal plane (-z); every material is clipped at the plane while you are outside
    moon = new THREE.Group(); portal.add(moon);
    sky = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.MeshBasicMaterial({ map: assets.sky, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.rotation.y = THREE.MathUtils.degToRad(7); sky.renderOrder = -1; moon.add(sky);
    const ground = assets.ground; ground.scale.setScalar(0.5); ground.rotation.y = Math.PI / 2; ground.position.set(4, -0.32, -6); moon.add(ground);
    const plat = assets.platform; fitTo(plat, 0.08); plat.scale.multiplyScalar(1.1); plat.position.set(0, 0, -3.2); moon.add(plat);
    // products on the moon
    const car = assets.car; fitLen(car, 1.7); const carG = new THREE.Group(); carG.add(car); carG.position.set(0, 0.09, -3.2); moon.add(carG);
    const gl = assets.glasses; gl.scale.setScalar(0.9); const glG = new THREE.Group(); glG.add(gl); glG.position.set(-1.7, 1.25, -2.6); glG.rotation.y = Math.PI; moon.add(glG);
    const cs = assets.castle; fitTo(cs, 0.7); const csG = new THREE.Group(); csG.add(cs); csG.position.set(1.8, 0, -3.0); moon.add(csG);
    products.push({ g: carG, name: 'Moon Rover', line: 'A car you can also park in your room in the Product Viewer demo.', spin: 0.25 },
      { g: glG, name: '3D Shades', line: 'Try them on in the Face FX demo.', spin: 0.6, bob: true },
      { g: csG, name: 'Sand Castle', line: 'Find it from a picture in the Image to World demo.', spin: 0 });
    moon.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.clippingPlanes = [clip]; }); } });
    portal.scale.setScalar(1);
    setOpen(0);
  },
  onPlaced(d, first) { if (openT < 0) openT = performance.now(); else setOpen(openK); },
  onTap(ndc, d) {
    if (d.state !== 'placed') return false;
    d.rayFrom(ndc);
    const hit = d.raycaster.intersectObjects(products.map((p) => p.g), true)[0];
    if (hit) { let o = hit.object; const p = products.find((x) => { let q = o; while (q) { if (q === x.g) return true; q = q.parent; } return false; }); if (p) showCard(p); }
    return true;
  },
  update(dt, d, now) {
    if (!portal) return;
    // opening animation (the sample's easeOutElastic over 1.5 s)
    if (openT > 0) { const t = clamp((now - openT) / 1500, 0, 1); setOpen(elastic(t)); if (t >= 1) openT = 0; }
    // where is the camera, in the portal's frame?
    d.stage.updateMatrixWorld(true);
    camL.copy(d.camera.position); d.stage.worldToLocal(camL);
    const isOutside = camL.z > 0;
    const within = camL.y < PY + R + 0.6 && Math.abs(camL.x) < R + 0.2;
    if (wasOutside !== isOutside && within && d.state === 'placed') inside = !isOutside;
    if (isOutside && !within) inside = false; // walked round the side: you're back in the room
    wasOutside = isOutside;
    // while placing (or moving) only the rim shows, at full size, so the reticle under it isn't hidden
    const placed = d.state === 'placed';
    if (!placed) { inside = false; rim.scale.setScalar((R * 1.06) / 1.02); }
    moon.visible = placed; wall.visible = placed && !inside; iris.visible = placed && !inside && openK < 0.999; door.visible = placed && inside;
    // clip the moon at the portal plane (keep z < 0 in portal space) unless you are inside
    if (inside) clip.copy(noClip);
    else { clip.normal.set(0, 0, -1); clip.constant = 0; clip.applyMatrix4(portal.matrixWorld); }
    // products turn slowly
    for (const p of products) { p.g.rotation.y += p.spin * dt; if (p.bob) p.g.position.y = 1.25 + 0.05 * Math.sin(now / 600); }
    if (d.state === 'placed' && openK > 0.9 && !inside && !hinted) { hinted = true; d.hint('Walk through the door, or tap a product'); setTimeout(() => d.hint(''), 4000); }
  },
});
let openK = 0, hinted = false;
const elastic = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1);
function setOpen(k) {
  openK = k;
  rim.scale.setScalar(Math.max(1e-3, k) * (R * 1.06) / 1.02);
  iris.scale.setScalar(Math.max(1e-3, 1 - clamp(k, 0, 1))); // the hole opens as the iris shrinks
}
function fitLen(o, len) { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()); return fitTo(o, len * s.y / Math.max(s.x, s.z)); }
function showCard(p) {
  let c = document.getElementById('pcard');
  if (!c) { c = document.createElement('div'); c.id = 'pcard'; c.className = 'pcard card-panel'; c.setAttribute('role', 'status'); document.getElementById('hud').appendChild(c); }
  c.innerHTML = `<b>${p.name}</b><span>${p.line}</span>`; c.hidden = false;
  clearTimeout(showCard.t); showCard.t = setTimeout(() => { c.hidden = true; }, 3500);
}

window.__moon = {
  get inside() { return inside; }, get open() { return +openK.toFixed(2); }, get camL() { return camL.toArray().map((v) => +v.toFixed(2)); },
  // test hook: slide the portal so the camera ends up just inside (the simulator can't walk)
  stepThrough() {
    const s = demo.stage; s.updateMatrixWorld(true);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quaternion); // portal +z (toward the viewer) in world
    const cam = demo.camera.position;
    // put the portal plane 0.4 m in front of where the camera is, then move it behind (the camera crosses it)
    s.position.set(cam.x, 0, cam.z).addScaledVector(back, -0.4);
    setTimeout(() => s.position.addScaledVector(back, 0.8), 400);
  },
  productScreen(i) { const v = products[i].g.getWorldPosition(new THREE.Vector3()); v.y += 0.3; v.project(demo.camera); const r = demo.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
};
