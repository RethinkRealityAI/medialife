// Picture to Room: point at a picture and a sand castle appears on the floor in front of it, then stays in the
// room after you look away (from the 8th Wall "image-slam" sample, A-Frame -> plain three.js).
//
// Kept from the sample (src/components.js): the image target (its glyph picture) and world tracking run in the same
// session; on the first `imagefound` the sand castle is put on the floor (y = 0) right under the picture's x/z,
// turned to face the camera, and it stays in the world from then on; the castle can be resized and turned.
// Changed: the engine binary takes the target JSON in XrController.configure next to SLAM (Bobo Hoops pattern), the
// castle grows in with a bounce, two fingers pinch/turn it (xrextras gestures in the sample), a ring marks the found
// picture while it is tracked, "Find again" spawns it under the picture again, and Move picks it up and puts it
// down at the floor reticle. Target pose units are SLAM units, so only its x/z on the floor is used.
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow, backOut, clamp } from '../shared/shell.js';

const H = 0.32; // castle height in metres at scale 1
let target = null, castleProto, castle = null, born = 0, frame, tracked = false, carry = false, waitFind = true;
const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
let pinch = null; const pts = new Map();

const demo = createDemo({
  slug: 'image-to-world', mode: 'world', tag: 'Image + world',
  title: 'Picture to Room', titleHtml: 'Picture to <span>Room</span>',
  lead: 'Point your phone at the glyph picture and a sand castle appears on the floor in front of it.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="100" y="40" width="100" height="136" fill="#222" stroke="#fff" stroke-width="4"/><path d="M110 250h80l-8-40h-64z" fill="#e4c48a"/><rect x="118" y="196" width="16" height="16" fill="#e4c48a"/><rect x="166" y="196" width="16" height="16" fill="#e4c48a"/></svg>`,
  how: [
    '<b>Point at the picture</b> (open it on another screen: <a href="/labs/demos/media/target/glyphs.jpg" target="_blank" rel="noopener" style="color:#4fd6e8">the glyph picture</a>, or print it).',
    'A <b>sand castle</b> appears on the floor in front of it. Look away: it stays in your room.',
    '<b>Two fingers</b> pinch to size it and twist to turn it.',
    '<b>Find again</b> puts it back under the picture. <b>Move</b> puts it anywhere on the floor.',
  ],
  placement: 'custom',
  async load(d) {
    const [t, c] = await Promise.all([fetch(MEDIA + 'target/glyphs.json').then((r) => r.json()), loadGLB(MEDIA + 'sand-castle.glb')]);
    target = t; castleProto = fitTo(c.scene, H);
    demo.cfg.xrConfig = { imageTargetData: [target] };
    d.progress(0.9);
  },
  hero() { return castleProto.clone(true); },
  build(d) {
    // a flat frame drawn on the found picture while it is tracked
    frame = new THREE.Group(); frame.visible = false; d.scene.add(frame);
    const m = new THREE.MeshBasicMaterial({ color: 0x4fd6e8, side: THREE.DoubleSide, depthTest: false, transparent: true });
    const w = 1, h = target.properties.height / target.properties.width, t = 0.03;
    for (const [x, y, sw, sh] of [[0, h / 2, w, t], [0, -h / 2, w, t], [w / 2, 0, t, h], [-w / 2, 0, t, h]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), m); b.position.set(x, y, 0); frame.add(b); }
    const again = document.createElement('button'); again.type = 'button'; again.id = 'b-again'; again.className = 'tool'; again.hidden = true;
    again.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="1"/><path d="M9 9h6M9 13h6"/></svg><span>Find again</span>';
    again.setAttribute('aria-label', 'Find the picture again'); again.onclick = () => { waitFind = true; d.hint('Point at the picture'); };
    d.left.appendChild(again); d.againBtn = again;
  },
  onLive(d) { d.hint('Point your phone at the picture'); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onImage(detail, true) },
    { event: 'reality.imageupdated', process: ({ detail }) => onImage(detail, false) },
    { event: 'reality.imagelost', process: () => { tracked = false; if (frame) frame.visible = false; } },
  ],
  onMove(d) {
    if (!castle) return;
    carry = !carry;
    d.reticle.visible = false;
    d.moveBtn.querySelector('span').textContent = carry ? 'Drop' : 'Move';
    d.hint(carry ? 'Point at the floor and tap Drop' : '');
    if (!carry && d.reticle.position.lengthSq()) { castle.position.copy(d.reticle.position).setY(0); faceCamera(castle, d); }
  },
  onPointerDown(e, d) { pts.set(e.pointerId, e); if (pts.size === 2 && castle) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), a: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX), s: castle.scale.x, r: castle.rotation.y }; } },
  onPointerMove(e, d) {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      castle.scale.setScalar(clamp(pinch.s * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(20, pinch.d), 0.3, 4));
      castle.rotation.y = pinch.r - (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) - pinch.a);
    }
  },
  onPointerUp(e) { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; },
  update(dt, d, now) {
    if (castle && born) { const t = (now - born) / 700; castle.children[0].scale.setScalar(Math.max(1e-3, backOut(t))); if (t >= 1) born = 0; }
    if (carry) {
      // reticle under the aim; the castle hovers over it
      const h = d.floorHit(d.aimNdc, tp);
      d.reticle.visible = !!h;
      if (h) { d.reticle.position.copy(h).setY(0.004); d.reticle.scale.setScalar(0.18); castle.position.lerp(h, 1 - Math.exp(-14 * dt)); castle.position.y = 0.03; }
    }
  },
});

function faceCamera(o, d) { o.rotation.y = Math.atan2(d.camera.position.x - o.position.x, d.camera.position.z - o.position.z); }
function onImage(detail, found) {
  const d = demo; if (!d.scene || detail.name !== 'glyphs') return;
  tracked = true;
  tp.set(detail.position.x, detail.position.y, detail.position.z); tq.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w);
  frame.position.copy(tp); frame.quaternion.copy(tq); frame.scale.setScalar(detail.scaledWidth * (detail.scale || 1) || 1); frame.visible = true;
  if (!waitFind) return;
  waitFind = false; d.hint('');
  // the sample: on the floor right under the picture, facing the camera
  if (!castle) {
    castle = new THREE.Group(); const inner = new THREE.Group(); inner.add(castleProto); inner.add(contactShadow(0.2, 0.4)); castle.add(inner);
    d.scene.add(castle);
  }
  castle.position.set(tp.x, 0, tp.z); faceCamera(castle, d);
  born = performance.now(); castle.children[0].scale.setScalar(1e-3);
  d.moveBtn.hidden = false; d.againBtn.hidden = false;
  d.toast('Found it! Look down at the floor', 1600);
}

window.__itw = {
  get tracked() { return tracked; }, get castle() { return castle ? castle.position.toArray().map((v) => +v.toFixed(2)) : null; },
  get frame() { return frame && frame.visible ? frame.position.toArray().map((v) => +v.toFixed(2)) : null; },
};
