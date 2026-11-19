// Bobo's Portal: the world behind the door. "Eclipse Plaza", Bobo's world at night.
// A giant Eclipse can stands in the middle of a rooftop plaza under the eclipse, Bobo runs laps round it (Cola Run's
// Bobo), the city glows all round, and the EVADE keychain charms float overhead as giant acrylic pieces.
// Eight Eclipse cans float around the plaza: tap one to crack it open (fizz + pop), find all eight and the eclipse
// flares, the giant can jumps, confetti, and Bobo's Arcade gets the unlock. Everything is a toy: tap Bobo (he stops,
// looks, purrs), the giant can (it fizzes), the charms (they spin), the floor (a ripple).
// EVADE rules: only EVADE's real assets (Bobo, the Eclipse can, the keychain charms), no generative AI anywhere.
import * as THREE from 'three';
import { toonRamp, toon, flatSky, drawStars, Confetti, Ripples, Shards, fitHeight, easeOutBack, faceTowards, label } from '/labs/portal-kit/toolkit.js';

const Y = '#f6c344', INK = '#15131a', NIGHT = '#151034', MAG = '#e85bd8', CAP = '#3f9be6', WHITE = '#ffffff', ORANGE = '#ff8a3d';
const C = new THREE.Vector3(0, 0, -5);
const NCANS = 8;
const NOTES = [349.2, 392, 440, 523.3, 587.3, 698.5, 784, 880];

export function preload(loader) {
  return Promise.all([
    loader.loadAsync('/roblox/activated-retail/models/catrun.glb?v=2'),
    loader.loadAsync('/evade/keychain/ar/eclipse-can.glb'),
    loader.loadAsync('/activated-merch/models/evade-charms.glb'),
  ]).then(([bobo, can, charms]) => ({ bobo, can, charms }));
}

function cleanCan(scene) {
  const s = scene.getObjectByName('Silhouette'); if (s) s.removeFromParent();
  scene.traverse((o) => { if (/^Can_Fizz/.test(o.name)) o.visible = false; if (o.isMesh) { o.frustumCulled = false; if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
  return scene;
}

export function makeWorld(data) {
  return async (ctx) => {
    const { world, sound, tappables } = ctx;
    const ramp = toonRamp(3);
    world.add(new THREE.HemisphereLight('#c9c2ff', '#2a1430', 1.7));
    const key = new THREE.DirectionalLight('#fff3d6', 2.0); key.position.set(-2, 6, 1); world.add(key); key.target.position.copy(C); world.add(key.target);

    // ---- sky: night, stars, the eclipse (black disc, stepped flat corona rings), a crescent moon
    let eclipseX = 0, eclipseY = 0;
    const sky = flatSky((g, w, h) => {
      g.fillStyle = NIGHT; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d1645'; g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = '#251a52'; g.fillRect(0, h * 0.5, w, h * 0.5);
      drawStars(g, w, h, 600, [WHITE, WHITE, '#ffe9a8', '#c8b8ff'], 0.02, 0.5);
      // the eclipse sits straight ahead from the door (u = 0.75 on three's sphere is -z)
      eclipseX = w * 0.75; eclipseY = h * 0.27;
      const sx = 1 / Math.cos((0.5 - 0.27) * Math.PI);   // equirect: widen so it reads round at this height
      for (const [r, c] of [[58, ORANGE], [50, Y], [44, '#fff2c4'], [40, '#0a0812']]) { g.fillStyle = c; g.beginPath(); g.ellipse(eclipseX, eclipseY, r * sx, r, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#efe6ff'; g.beginPath(); g.arc(w * 0.3, h * 0.2, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = NIGHT; g.beginPath(); g.arc(w * 0.3 + 14, h * 0.2 - 6, 30, 0, Math.PI * 2); g.fill();
    }, { radius: 30 });
    sky.position.copy(C); world.add(sky);
    // a separate corona ring in 3D that flares in the finale (in front of the painted eclipse)
    const corona = new THREE.Group(); world.add(corona);
    const coronaRings = [[1.0, 1.25, Y], [1.25, 1.42, ORANGE], [1.42, 1.5, MAG]].map(([a, b, c]) => { const m = new THREE.Mesh(new THREE.RingGeometry(a, b, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); corona.add(m); return m; });

    // ---- the plaza: a dark rooftop disc, yellow painted track round the can, flat tiles
    const plaza = new THREE.Group(); plaza.position.copy(C); world.add(plaza);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 96), new THREE.MeshBasicMaterial({ color: '#1d1a26' })); disc.rotation.x = -Math.PI / 2; plaza.add(disc);
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.5, 96, 1, true), new THREE.MeshBasicMaterial({ color: '#2a2338', side: THREE.DoubleSide })); edge.position.y = -0.25; plaza.add(edge);
    const ring = (r0, r1, c, y = 0.004) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 128), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = y; plaza.add(m); return m; };
    ring(1.5, 2.9, '#26212f'); ring(1.5, 1.56, Y, 0.006); ring(2.84, 2.9, Y, 0.006);
    // dashed centre line of the track
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.2), new THREE.MeshBasicMaterial({ color: WHITE })); d.rotation.set(-Math.PI / 2, 0, -a); d.position.set(Math.sin(a) * 2.2, 0.007, Math.cos(a) * 2.2); plaza.add(d); }
    ring(7.9, 8, Y, 0.006);
    // the path from the door
    const path = [];
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.14), new THREE.MeshBasicMaterial({ color: Y, transparent: true, opacity: 0.3 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.008, -0.5 - i * 0.42); world.add(m); path.push(m); }

    // ---- the skyline: flat toon blocks with lit windows, all round
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    const cols = ['#221b3a', '#2b2147', '#1b1630', '#33285a'];
    const winGeo = new THREE.PlaneGeometry(0.35, 0.5);
    const winM = new THREE.MeshBasicMaterial({ color: WHITE });
    const wins = [];
    const tmpM = new THREE.Matrix4();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + Math.random() * 0.05, r = 13 + Math.random() * 6;
      const w = 1.4 + Math.random() * 2.2, h = 2 + Math.random() * 9, d = 1.4 + Math.random() * 2;
      const b = new THREE.Mesh(bGeo, toon(cols[i % cols.length], ramp)); b.scale.set(w, h, d);
      b.position.set(C.x + Math.sin(a) * r, h / 2 - 1.2, C.z + Math.cos(a) * r); b.rotation.y = a; world.add(b);
      // windows on the face that looks at the plaza
      for (let k = 0; k < 14; k++) if (Math.random() < 0.5) {
        const wx = (Math.random() - 0.5) * (w - 0.5), wy = -1.2 + 0.6 + Math.random() * (h - 1.2);
        const p = new THREE.Vector3(wx, wy, -d / 2 - 0.01).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(new THREE.Vector3(b.position.x, 0, b.position.z));
        wins.push(tmpM.clone().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI), new THREE.Vector3(1, 1, 1)));
      }
    }
    const winMesh = new THREE.InstancedMesh(winGeo, winM, wins.length); wins.forEach((m, i) => winMesh.setMatrixAt(i, m)); world.add(winMesh);
    const winCols = [Y, '#ffe9a8', MAG, CAP]; const _c = new THREE.Color();
    for (let i = 0; i < wins.length; i++) winMesh.setColorAt(i, _c.set(winCols[i % 7 === 0 ? 2 : i % 11 === 0 ? 3 : i % 3 === 0 ? 1 : 0]));

    // ---- the giant Eclipse can, centre of the plaza
    const giant = new THREE.Group(); giant.name = 'giant-can'; giant.position.copy(C); world.add(giant);
    const gc = cleanCan(data.can.scene.clone(true)); fitHeight(gc, 2.0); giant.add(gc);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.14, 48), toon('#3a2f52', ramp)); pad.position.y = 0.07; giant.add(pad);
    gc.position.y += 0.14;
    let giantKick = 0;
    giant.userData.tap = () => { giantKick = 1; fizz(C.clone().setY(2.2), 18); sound.noise(0.9, 4000, 0.18, 0, 0.6, 0.4); sound.tone(220, 0.3, 'triangle', 0.08); ctx.buzz(20); };
    tappables.push(giant);

    // ---- Bobo, running laps (Cola Run's Bobo)
    const bobo = new THREE.Group(); bobo.name = 'bobo'; world.add(bobo);
    const bm = data.bobo.scene; bm.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
    fitHeight(bm, 0.95); bobo.add(bm);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; bobo.add(shadow);
    const mixer = new THREE.AnimationMixer(bm);
    const clip = (n) => data.bobo.animations.find((a) => a.name === n);
    const acts = {}; for (const n of ['Idle', 'Run', 'Alert', 'Purr', 'Sleep']) if (clip(n)) acts[n] = mixer.clipAction(clip(n));
    let cur = acts.Run; cur && cur.play();
    function boboDo(n, fade = 0.25) { const a = acts[n]; if (!a || a === cur) return; a.reset().fadeIn(fade).play(); cur && cur.fadeOut(fade); cur = a; }
    const lap = { a: 0, speed: 0.55, stop: 0, mood: 'run' };
    bobo.userData.tap = () => {
      if (lap.stop > 0) { hearts(bobo.position.clone().setY(0.9)); sound.chord([523, 659], 0.3, 'sine', 0.06); return; }
      lap.stop = 3.2; boboDo('Alert', 0.15); setTimeout(() => lap.stop > 0 && boboDo('Purr'), 700);
      hearts(bobo.position.clone().setY(0.9)); sound.tone(660, 0.12, 'square', 0.05); sound.tone(990, 0.2, 'square', 0.04, 0.1); ctx.buzz([15, 30, 15]);
    };
    tappables.push(bobo);

    // ---- the keychain charms, giant, floating over the plaza
    const charms = [];
    for (const [nm, x, z, ph] of [['Charm_Bobo', -2.6, -1.6, 0], ['Charm_Eclipse', 2.6, -1.8, 2]]) {
      const src = data.charms.scene.getObjectByName(nm); if (!src) continue;
      const g = new THREE.Group(); g.name = nm; const m = src.clone(true); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
      m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
      g.add(m); fitHeight(m, nm === 'Charm_Bobo' ? 1.1 : 1.0); m.position.y -= nm === 'Charm_Bobo' ? 0.55 : 0.5;
      g.position.set(C.x + x, 2.3, C.z + z); world.add(g);
      const it = { g, spin: 0, ph, base: g.position.y };
      g.userData.tap = () => { it.spin = 14; sound.chord([NOTES[2], NOTES[4], NOTES[6]], 0.5, 'triangle', 0.07, 0.04); ctx.buzz(12); };
      tappables.push(g); charms.push(it);
    }

    // ---- the eight floating cans to find
    const fx = { ripples: new Ripples(world, 14), shards: new Shards(world, 160), confetti: new Confetti(world, [Y, WHITE, MAG, CAP, ORANGE], 240) };
    const spots = [[-1.2, -1.6, 1.1], [1.6, -2.4, 1.5], [-3.4, -3.6, 0.9], [3.6, -4.6, 1.9], [-2.2, -6.6, 1.6], [0.6, -8.0, 1.2], [3.4, -7.2, 0.8], [-2.6, 1.2, 1.5]];   // the last one hides behind you, on the room side of the door
    const cans = spots.map(([x, z, y], i) => {
      const g = new THREE.Group(); g.name = 'can-' + i; g.position.set(x, y, z); world.add(g);
      const m = cleanCan(data.can.scene.clone(true)); fitHeight(m, 0.32); m.position.y -= 0.16; g.add(m);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 40), new THREE.MeshBasicMaterial({ color: Y, side: THREE.DoubleSide, transparent: true, depthWrite: false })); halo.position.y = -0.24; halo.rotation.x = -Math.PI / 2; g.add(halo);
      const it = { g, m, halo, got: false, t: 0, ph: i * 0.9, base: y, note: NOTES[i % NOTES.length] };
      g.userData.tap = () => grab(it);
      tappables.push(g);
      return it;
    });
    let found = 0, finaleDone = false;
    function grab(it) {
      if (it.got) return;
      it.got = true; it.t = 0; found++;
      fizz(it.g.position.clone(), 22);
      fx.shards.pop(it.g.position.clone(), [Y, WHITE, ORANGE], 18, 2.4);
      fx.ripples.ripple(it.g.position.clone().setY(0.01), Y, 1.6, 0.9);
      sound.noise(0.25, 5000, 0.25, 0, 1.2); sound.noise(0.7, 2500, 0.12, 0.08, 0.6, 0.3); sound.tone(it.note, 0.35, 'triangle', 0.13, 0.05); sound.tone(it.note * 1.5, 0.3, 'sine', 0.06, 0.12);
      ctx.buzz([18, 25, 18]);
      ctx.setCounter('Cans', found, NCANS);
      ctx.toast(found < NCANS ? `+1 can` : 'All 8 cans!', found < NCANS ? `${found} of ${NCANS} found` : 'Look up!');
      ctx.post('reward', { what: 'can', n: found });
      if (lap.stop <= 0) { lap.stop = 1.2; boboDo('Alert', 0.15); }
      if (found === NCANS && !finaleDone) setTimeout(finale, 900);
      else if (found < NCANS) ctx.hint(`Find the floating cans · ${NCANS - found} left`);
    }

    // ---- fizz: little bubbles rising
    const bubbleGeo = new THREE.CircleGeometry(0.025, 12);
    const bubbles = new THREE.InstancedMesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: WHITE, side: THREE.DoubleSide }), 260); bubbles.frustumCulled = false; world.add(bubbles);
    const bub = Array.from({ length: 260 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, s: 1 })); let bi = 0;
    for (let i = 0; i < 260; i++) bubbles.setColorAt(i, _c.set(i % 3 ? WHITE : Y));
    function fizz(at, n = 16) { for (let k = 0; k < n; k++) { const b = bub[bi++ % bub.length]; b.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2)); b.v.set((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.5); b.life = 1 + Math.random() * 1.2; b.s = 0.6 + Math.random() * 1.2; } }
    // ambient fizz in the air
    let ambT = 0;
    // hearts over Bobo
    const heartTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = MAG; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 6, 8, 32, 20); g.bezierCurveTo(58, 8, 60, 36, 32, 56); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const heartsArr = [];
    for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: heartTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })); s.visible = false; world.add(s); heartsArr.push({ s, t: 1 }); }
    let hi = 0;
    function hearts(at) { for (let k = 0; k < 3; k++) { const h = heartsArr[hi++ % heartsArr.length]; h.s.position.copy(at).add(new THREE.Vector3((k - 1) * 0.15, 0, 0)); h.t = -k * 0.12; h.s.visible = true; } }

    // ---- floor taps: a yellow ripple
    const floorPlane = new THREE.Plane(), hit = new THREE.Vector3();
    const onTapNothing = (ray) => {
      if (!ctx.inside) return;
      world.updateMatrixWorld(true);
      floorPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3().setFromMatrixPosition(world.matrixWorld));
      if (!ray.ray.intersectPlane(floorPlane, hit)) return;
      const local = world.worldToLocal(hit.clone());
      fx.ripples.ripple(local, Math.random() < 0.6 ? Y : MAG, 1.1, 0.8); sound.tone(NOTES[(Math.random() * 4) | 0] / 2, 0.25, 'sine', 0.09);
    };

    // ---- finale: the eclipse flares, the giant can jumps, confetti, Bobo purrs at the front
    let finT = -1;
    function finale() {
      finaleDone = true; finT = 0;
      fx.confetti.burst(C.clone().setY(2.9), 3.4, 2.4);
      for (let i = 0; i < 5; i++) setTimeout(() => fx.ripples.ripple(C.clone().setY(0.01), i % 2 ? Y : MAG, 7.5, 1.5), i * 240);
      giantKick = 2; fizz(C.clone().setY(2.2), 60);
      lap.stop = 6; boboDo('Purr');
      sound.chord([262, 330, 392, 523, 659, 784], 1.8, 'triangle', 0.08, 0.1); sound.noise(1.6, 800, 0.15, 0, 0.5, 6);
      ctx.buzz([40, 60, 40, 60, 90]);
      ctx.hint('Tap anything');
      ctx.post('reward', { what: 'eclipse', cans: NCANS });
      try { localStorage.setItem('evade-done-bobo-portal-eclipse', '1'); } catch (e) { /* none */ }
      setTimeout(() => ctx.finale(`
        <img class="fin-art" src="/brand/evade-logo.webp" alt="EVADE" style="width:150px;height:auto">
        <h2>Eclipse!</h2>
        <p>You found all 8 cans in Bobo's world. Bobo's Arcade has more: run for cans in Cola Run, or paint Bobo in Spray Bobo.</p>
        <div class="row"><a class="btn primary" href="/evade/cola-run/?mode=arcade" target="_blank" rel="noopener">Open Bobo's Arcade</a><button data-close>Keep exploring</button></div>`), 2800);
    }

    // ---- sound: a night-time pad, more audible inside
    sound.pad([98, 146.8, 196, 293.7], 'triangle', 0.025);
    sound.musicLevel(0.15);
    ctx.register();
    ctx.register(fx.confetti.mesh);

    const camW = new THREE.Vector3(), tmp = new THREE.Vector3();
    return {
      onPlaced() {},
      onEnter(n) {
        if (n === 1) { ctx.toast("Welcome to Bobo's world", 'Find the 8 floating cans'); ctx.setCounter('Cans', found, NCANS); boboDo('Alert', 0.2); lap.stop = 1.4; }
        ctx.hint(found < NCANS ? `Find the floating cans · ${NCANS - found} left` : 'Tap anything');
      },
      onExit() {},
      onTapNothing,
      stats: () => ({ found, bobo: cur ? cur.getClip().name : '-' }),
      tick(dt, t) {
        mixer.update(dt);
        ctx.camera.getWorldPosition(camW);
        // Bobo's laps (counter-clockwise round the can), stops when tapped
        if (lap.stop > 0) {
          lap.stop -= dt; faceTowards(bobo, camW, dt, 5);
          if (lap.stop <= 0) boboDo('Run');
        } else {
          lap.a += lap.speed * dt;
          bobo.position.set(C.x + Math.sin(lap.a) * 2.2, 0, C.z + Math.cos(lap.a) * 2.2);
          bobo.rotation.y = lap.a + Math.PI / 2;
        }
        // giant can: a slow turn, a kick when tapped
        giantKick = Math.max(0, giantKick - dt * 1.6);
        const kick = Math.sin(giantKick * 12) * giantKick;
        gc.rotation.y += dt * 0.25; gc.rotation.z = kick * 0.05;
        giant.position.y = finT >= 0 && finT < 1.2 ? Math.max(0, Math.sin(finT / 1.2 * Math.PI) * 0.9) : 0;
        // charms
        for (const c of charms) { c.spin *= Math.exp(-1.5 * dt); c.g.rotation.y += (0.35 + c.spin) * dt; c.g.position.y = c.base + Math.sin(t * 0.8 + c.ph) * 0.12; }
        // cans: bob and spin; got ones shoot up and vanish
        for (const it of cans) {
          if (it.got) {
            if (it.g.visible) { it.t += dt; it.g.position.y += dt * (1 + it.t * 6); it.m.rotation.y += dt * 20; const s = Math.max(0, 1 - it.t / 0.6); it.g.scale.setScalar(s); if (s <= 0) it.g.visible = false; }
            continue;
          }
          it.g.position.y = it.base + Math.sin(t * 1.2 + it.ph) * 0.1; it.m.rotation.y += dt * 0.9;
          it.halo.material.opacity = Math.floor(t * 2 + it.ph) % 2 ? 1 : 0.35;
          if (Math.random() < dt * 1.5) fizz(tmp.copy(it.g.position).setY(it.g.position.y + 0.17), 1);
        }
        // corona flare in the finale (a flat ring stack in front of the painted eclipse)
        if (finT >= 0) {
          finT += dt;
          // the painted eclipse is at sky u = 0.75, v = 0.27: straight ahead and up
          const el = (0.5 - 0.27) * Math.PI;
          corona.position.set(C.x, C.y + Math.sin(el) * 26, C.z - Math.cos(el) * 26);
          corona.lookAt(world.localToWorld(tmp.copy(C).setY(1.5)));
          const k = easeOutBack(Math.min(1, finT / 1.4));
          coronaRings.forEach((r, i) => { r.material.opacity = Math.min(1, finT * 2) * (Math.floor(t * 6 + i) % 3 ? 1 : 0.6); r.scale.setScalar(3.4 * k * (1 + 0.05 * Math.sin(t * 3 + i))); });
        }
        // bubbles
        ambT += dt; if (ambT > 0.08) { ambT = 0; const b = bub[bi++ % bub.length]; b.p.set(C.x + (Math.random() - 0.5) * 12, 0.05, C.z + (Math.random() - 0.5) * 12); b.v.set(0, 0.3 + Math.random() * 0.4, 0); b.life = 4; b.s = 0.5 + Math.random(); }
        for (let i = 0; i < bub.length; i++) {
          const b = bub[i]; if (b.life > 0) { b.life -= dt; b.p.addScaledVector(b.v, dt); b.v.y += 0.2 * dt; b.p.x += Math.sin(t * 3 + i) * 0.002; }
          tmpM.makeScale(b.life > 0 ? b.s : 0, b.life > 0 ? b.s : 0, 1); tmpM.setPosition(b.p);
          bubbles.setMatrixAt(i, tmpM);
        }
        bubbles.instanceMatrix.needsUpdate = true;
        for (const h of heartsArr) { if (!h.s.visible) continue; h.t += dt; if (h.t < 0) { h.s.scale.setScalar(0.01); continue; } h.s.position.y += dt * 0.5; h.s.scale.setScalar(Math.min(1, h.t * 4)); faceTowards(h.s, camW, 1, 100); if (h.t > 1.2) h.s.visible = false; }
        path.forEach((r, i) => { r.material.opacity = ((Math.floor(t * 5) - i) % 5 + 5) % 5 === 0 ? 0.95 : 0.25; });
        fx.ripples.tick(dt); fx.shards.tick(dt); fx.confetti.tick(dt);
      },
    };
  };
}
