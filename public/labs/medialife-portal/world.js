// MEDIALIFE Portal: the world behind the door.
// "The Activation Floor": a floating MEDIALIFE stage in deep space. Spark (the MEDIALIFE mascot) hosts. Five pieces
// of real activated merch float on plinths, each with its NFC disc glowing. Tap a piece to activate it: it spins up,
// a shockwave runs across the floor and a screen opens above it playing a real fan's AR activation clip.
// Activate all five and the collection lights up (confetti, the MEDIALIFE wordmark in the sky, Spark cheers) and a
// sheet points to Activated Merch. Everything else is a toy: floating shapes pop into shards with a note, tapping the
// floor sends out a ripple, tapping Spark makes it dance.
import * as THREE from 'three';
import { toonRamp, toon, flatSky, drawStars, Confetti, Ripples, Shards, videoScreen, pinClips, fitHeight, label, easeOutBack, faceTowards } from '../portal-kit/toolkit.js';

const BLUE = '#19affe', MAG = '#ff2fae', INK = '#070812', WHITE = '#ffffff';
const C = new THREE.Vector3(0, 0, -4);           // the stage centre, 4 m in through the door
const PIECES = [
  { url: '/medialife/activated-retail/models/ml_hoodie.glb', name: 'MEDIALIFE hoodie', clip: '/activated-merch/media/fan-01.mp4', h: 0.62, ang: 55, flat: true },
  { url: '/activated-merch/models/sukeban-hoodie.glb', name: 'Sukeban hoodie', clip: '/activated-merch/media/fan-02.mp4', h: 0.62, ang: 115 },
  { url: '/medialife/activated-retail/models/ml_figure.glb', name: 'MEDIALIFE figure', clip: '/activated-merch/media/fan-03.mp4', h: 0.55, ang: 180 },
  { url: '/activated-merch/models/syndicate-tee.glb', name: 'Syndicate tee', clip: '/activated-merch/media/fan-04.mp4', h: 0.6, ang: 245 },
  { url: '/medialife/activated-retail/models/ml_tee.glb', name: 'MEDIALIFE tee', clip: '/activated-merch/media/fan-05.mp4', h: 0.6, ang: 305, flat: true },
];
const NOTES = [392, 440, 523.25, 587.33, 659.25, 783.99, 880];   // pentatonic-ish: every pop sounds good together

export function preload(loader) {
  return Promise.all([
    loader.loadAsync('/labs/wake-the-print/spark.glb'),
    ...PIECES.map((p) => loader.loadAsync(p.url)),
    new THREE.TextureLoader().loadAsync('/brand/medialife-wordmark.webp'),
  ]).then(([spark, ...rest]) => ({ spark, pieces: rest.slice(0, PIECES.length), wordmark: rest[PIECES.length] }));
}

export function makeWorld(data) {
  return async (ctx) => {
    const { world, sound, tappables } = ctx;
    const ramp = toonRamp(3);
    const stage = new THREE.Group(); stage.position.copy(C); world.add(stage);

    // ---- light (the toon ramp turns it into flat bands)
    const hemi = new THREE.HemisphereLight('#cfe9ff', '#2a1030', 1.6); world.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 5, 2); key.target = stage; world.add(key);

    // ---- sky: deep ink, stars, two flat planets, a ring of blue/magenta dashes round the horizon
    const sky = flatSky((g, w, h) => {
      g.fillStyle = INK; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0d1022'; g.fillRect(0, h * 0.56, w, h * 0.44);
      drawStars(g, w, h, 650, [WHITE, WHITE, '#9fdcff', '#ffb3e1'], 0.02, 0.55);
      const planet = (x, y, r, col, ring) => {
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(x + r * 0.35, y + r * 0.1, r * 0.92, 0, Math.PI * 2); g.fill();
        if (ring) { g.strokeStyle = ring; g.lineWidth = r * 0.12; g.beginPath(); g.ellipse(x, y, r * 1.7, r * 0.35, -0.25, 0, Math.PI * 2); g.stroke(); }
      };
      planet(w * 0.2, h * 0.3, 60, BLUE, WHITE); planet(w * 0.68, h * 0.22, 34, MAG, null); planet(w * 0.86, h * 0.4, 18, '#ffd34d', null);
      for (let i = 0; i < 90; i++) { g.fillStyle = i % 2 ? BLUE : MAG; g.fillRect((i / 90) * w, h * 0.555, w / 90 * 0.6, 6); }
    }, { radius: 28 });
    sky.position.copy(C); world.add(sky);

    // ---- the floor: a floating disc, flat grid, rings
    const floorG = new THREE.Group(); floorG.position.copy(C); world.add(floorG);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.5, 96), new THREE.MeshBasicMaterial({ color: '#0b0e1a' }));
    disc.rotation.x = -Math.PI / 2; disc.name = 'floor'; floorG.add(disc);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6.6, 0.6, 96, 1, true), new THREE.MeshBasicMaterial({ color: '#141a33', side: THREE.DoubleSide }));
    rim.position.y = -0.3; floorG.add(rim);
    const gridPts = [];
    for (let i = -7; i <= 7; i++) { const s = Math.sqrt(Math.max(0, 7.4 * 7.4 - i * i)); gridPts.push(i, 0.004, -s, i, 0.004, s, -s, 0.004, i, s, 0.004, i); }
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3)), new THREE.LineBasicMaterial({ color: '#1d2c52' }));
    floorG.add(grid);
    for (const [r, col] of [[1.2, BLUE], [3.6, '#26335e'], [7.45, BLUE]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r, 128), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006; floorG.add(ring);
    }
    // a lit runway from the door to the stage
    const runway = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.12), new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.3 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.008, -0.6 - i * 0.5); world.add(m); runway.push(m);
    }

    // ---- Spark, centre stage
    const spark = new THREE.Group(); spark.name = 'spark'; stage.add(spark);
    const sm = data.spark.scene; pinClips(data.spark.animations);
    sm.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; o.material.emissive && o.material.emissive.setHex(0); o.material.roughness = 0.6; o.material.metalness = 0; } });
    fitHeight(sm, 1.15); spark.add(sm);
    const mixer = new THREE.AnimationMixer(sm);
    const clip = (n) => data.spark.animations.find((a) => a.name === n);
    const idle = mixer.clipAction(clip('Idle')); idle.play();
    let acting = null;
    function act(name) {
      const c = clip(name); if (!c) return;
      const a = mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      if (acting && acting !== a) acting.fadeOut(0.25);
      idle.fadeOut(0.25); a.fadeIn(0.25).play(); acting = a;
    }
    mixer.addEventListener('finished', (e) => { if (e.action === acting) { acting.fadeOut(0.35); idle.reset().fadeIn(0.35).play(); acting = null; } });
    const shadowM = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false });
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), shadowM); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; stage.add(sh);
    const dances = ['FunnyDancing_01', '360_Power_Spin_Jump', 'Regular_Jump', 'Cheer_with_Both_Hands_Up'];
    let danceI = 0;
    spark.userData.tap = () => { act(dances[danceI++ % dances.length]); sound.chord([523, 659, 784], 0.4, 'square', 0.04, 0.05); ctx.buzz(15); fx.ripples.ripple(C.clone().setY(0.01), MAG, 1.4); };
    tappables.push(spark);

    // ---- the activated pieces
    const fx = { ripples: new Ripples(world, 14), shards: new Shards(world, 140), confetti: new Confetti(world, [BLUE, MAG, WHITE, '#ffd34d'], 220) };
    const pieces = PIECES.map((p, i) => {
      const a = THREE.MathUtils.degToRad(p.ang), R = 2.7;
      const g = new THREE.Group(); g.name = 'piece-' + i; g.position.set(C.x + Math.sin(a) * R, 0, C.z + Math.cos(a) * R); world.add(g);
      // plinth: flat toon cylinder with a light ring
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.42, 40), toon('#1a2140', ramp)); plinth.position.y = 0.21; g.add(plinth);
      const top = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.34, 48), new THREE.MeshBasicMaterial({ color: '#2b3866', side: THREE.DoubleSide })); top.rotation.x = -Math.PI / 2; top.position.y = 0.422; g.add(top);
      let model = data.pieces[i].scene.clone(true);
      if (p.flat) { const up = new THREE.Group(); model.rotation.x = -Math.PI / 2; up.add(model); model = up; }   // retail-shelf models lie flat, front up
      model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
      const holder = new THREE.Group(); holder.add(model); fitHeight(model, p.h); model.position.y -= p.h / 2;
      holder.position.y = 0.42 + 0.12 + p.h / 2; g.add(holder);
      // the NFC disc: flat, floating in front, pulsing
      const nfc = new THREE.Group();
      const d1 = new THREE.Mesh(new THREE.CircleGeometry(0.075, 40), new THREE.MeshBasicMaterial({ color: WHITE, side: THREE.DoubleSide }));
      const d2 = new THREE.Mesh(new THREE.RingGeometry(0.095, 0.115, 40), new THREE.MeshBasicMaterial({ color: BLUE, side: THREE.DoubleSide }));
      const d3 = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.05, 32), new THREE.MeshBasicMaterial({ color: BLUE, side: THREE.DoubleSide })); d3.position.z = 0.002;
      nfc.add(d1, d2, d3); nfc.position.set(0, holder.position.y, 0.42); g.add(nfc);
      const tag = label('TAP TO ACTIVATE', { color: '#02121c', bg: BLUE, h: 0.07 }); tag.position.set(0, 0.06, 0.42); g.add(tag);
      const screen = videoScreen(p.clip, { w: 0.55, h: 0.935, frame: BLUE }); screen.visible = false; screen.position.y = 0.54 + p.h + 0.56; g.add(screen);
      const it = { g, holder, nfc, tag, screen, top, spin: 0, on: false, t: 0, ang: a, name: p.name };
      g.userData.tap = () => activate(it);
      tappables.push(g);
      return it;
    });
    let activated = 0, finaleDone = false;
    function activate(it) {
      if (it.on) { it.spin = 9; sound.tone(NOTES[(Math.random() * NOTES.length) | 0], 0.25, 'triangle', 0.1); return; }
      it.on = true; it.t = 0; it.spin = 16; activated++;
      it.screen.visible = true; it.screen.scale.setScalar(0.01); it.screen.userData.play();
      it.tag.visible = false; it.top.material.color.set(MAG); it.nfc.children[1].material.color.set(MAG); it.nfc.children[2].material.color.set(MAG);
      fx.ripples.ripple(it.g.position.clone(), BLUE, 2.4, 1.0); fx.ripples.ripple(it.g.position.clone(), MAG, 3.4, 1.4);
      fx.shards.pop(it.g.position.clone().setY(it.holder.position.y), [BLUE, MAG, WHITE], 22, 2.4, 1.2);
      sound.chord([NOTES[activated % NOTES.length] / 2, NOTES[activated % NOTES.length], NOTES[(activated + 2) % NOTES.length]], 0.8, 'triangle', 0.09, 0.07);
      sound.noise(0.5, 2400, 0.1, 0, 1, 0.3);
      ctx.buzz([20, 30, 20]);
      ctx.setCounter('Activated', activated, PIECES.length);
      ctx.toast(`${it.name}`, activated < PIECES.length ? `Activated · ${activated} of ${PIECES.length}` : 'Collection complete');
      ctx.post && ctx.post('reward', { what: 'activate', n: activated });
      if (activated === 1) act('Big_Wave_Hello');
      if (activated === PIECES.length && !finaleDone) setTimeout(finale, 1300);
    }

    // ---- toys: floating flat shapes. Tap one, it pops into shards with a note, then grows back.
    const shapeGeos = [new THREE.IcosahedronGeometry(0.16, 0), new THREE.TorusGeometry(0.14, 0.05, 10, 28), new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.OctahedronGeometry(0.17, 0), new THREE.ConeGeometry(0.14, 0.28, 5)];
    const shapeCols = [BLUE, MAG, WHITE, '#ffd34d', '#7b5cff'];
    const toys = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2, r = 3.9 + Math.random() * 2.8;
      const m = new THREE.Mesh(shapeGeos[i % shapeGeos.length], toon(shapeCols[(i * 3) % shapeCols.length], ramp));
      m.name = 'toy-' + i;
      const base = new THREE.Vector3(C.x + Math.sin(a) * r, 0.6 + Math.random() * 2.2, C.z + Math.cos(a) * r);
      // keep the doorway clear
      if (base.z > -1.2 && Math.abs(base.x) < 1.6) base.x += Math.sign(base.x || 1) * 1.8;
      m.position.copy(base); world.add(m);
      const t = { m, base, ph: Math.random() * 6, spin: 0.4 + Math.random(), gone: 0, col: shapeCols[(i * 3) % shapeCols.length], note: NOTES[i % NOTES.length] };
      m.userData.tap = () => {
        if (t.gone > 0) return;
        fx.shards.pop(m.position.clone(), [t.col, WHITE], 16, 2.0); sound.tone(t.note, 0.5, 'triangle', 0.14); sound.tone(t.note * 2, 0.2, 'sine', 0.05, 0.03);
        ctx.buzz(12); t.gone = 3.5; m.visible = false; popped++;
      };
      tappables.push(m); toys.push(t);
    }
    let popped = 0;

    // floor taps: a ripple where you tapped
    const floorPlane = new THREE.Plane(), hit = new THREE.Vector3();
    const onTapNothing = (ray) => {
      if (!ctx.inside) return;
      world.updateMatrixWorld(true);
      const p0 = new THREE.Vector3().setFromMatrixPosition(world.matrixWorld);
      floorPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), p0);
      if (!ray.ray.intersectPlane(floorPlane, hit)) return;
      const local = world.worldToLocal(hit.clone());
      fx.ripples.ripple(local, Math.random() < 0.5 ? BLUE : MAG, 1.2, 0.9); sound.tone(NOTES[(Math.random() * 4) | 0] / 2, 0.3, 'sine', 0.1);
    };

    // ---- finale: wordmark in the sky, confetti, Spark cheers
    const wm = data.wordmark; wm.colorSpace = THREE.SRGBColorSpace;
    const wAsp = wm.image ? wm.image.width / wm.image.height : 5;
    const word = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 / wAsp), new THREE.MeshBasicMaterial({ map: wm, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    word.position.set(C.x, 3.1, C.z - 0.6); word.visible = false; world.add(word);
    let wordT = -1;
    function finale() {
      finaleDone = true; act('Cheer_with_Both_Hands_Up'); ctx.hint('Tap anything: Spark, the shapes, the floor'); wordT = 0; word.visible = true;
      fx.confetti.burst(new THREE.Vector3(C.x, 2.4, C.z), 3.2, 2.2);
      for (let i = 0; i < 4; i++) setTimeout(() => fx.ripples.ripple(C.clone(), i % 2 ? BLUE : MAG, 7, 1.6), i * 280);
      sound.chord([262, 330, 392, 523, 659, 784], 1.6, 'triangle', 0.08, 0.09);
      ctx.buzz([40, 60, 40, 60, 80]);
      ctx.post && ctx.post('reward', { what: 'collection' });
      setTimeout(() => ctx.finale(`
        <img class="fin-art" src="/brand/medialife-lockup.webp" alt="" style="width:180px;height:auto">
        <h2>Collection activated</h2>
        <p>Every piece you just woke up is real MEDIALIFE merch. A flat NFC disc in the print opens an experience like this one, straight from the phone, no app.</p>
        <div class="row"><a class="btn primary" href="/activated-merch/" target="_blank" rel="noopener">See Activated Merch</a><button data-close>Keep exploring</button></div>`), 2600);
    }

    // ---- ambient: a slow pad (heard inside), quieter outside
    sound.pad([110, 164.8, 220, 329.6], 'sine', 0.03);
    sound.musicLevel(0.15);
    ctx.register();
    ctx.register(fx.confetti.mesh);

    const camW = new THREE.Vector3();
    return {
      onPlaced() { ctx.hint('Walk through the door'); },
      onEnter(n) {
        if (n === 1) { act('Big_Wave_Hello'); ctx.toast('Welcome to MEDIALIFE', 'Tap the merch to activate it'); ctx.setCounter('Activated', activated, PIECES.length); }
        ctx.hint(activated < PIECES.length ? 'Tap a piece of merch to activate it' : 'Tap anything: Spark, the shapes, the floor');
      },
      onExit() {},
      onTapNothing,
      stats: () => ({ activated, popped }),
      tick(dt, t) {
        mixer.update(dt);
        ctx.camera.getWorldPosition(camW);
        if (!acting) faceTowards(spark, camW, dt, 2.5);
        for (const it of pieces) {
          it.spin *= Math.exp(-1.6 * dt);
          it.holder.rotation.y += (0.5 + it.spin) * dt;
          it.holder.position.y = 0.42 + 0.12 + PIECES[pieces.indexOf(it)].h / 2 + Math.sin(t * 1.3 + it.ang) * 0.03;
          const pulse = 1 + (it.on ? 0 : 0.12 * Math.max(0, Math.sin(t * 4 + it.ang)));
          it.nfc.scale.setScalar(pulse); faceTowards(it.nfc, camW, dt, 6); faceTowards(it.tag, camW, dt, 6);
          if (it.on) {
            it.t += dt; const k = easeOutBack(it.t / 0.7); it.screen.scale.setScalar(Math.max(0.01, k));
            faceTowards(it.screen, camW, dt, 3);
          }
        }
        for (const ty of toys) {
          if (ty.gone > 0) { ty.gone -= dt; if (ty.gone <= 0) { ty.m.visible = true; ty.m.scale.setScalar(0.01); } continue; }
          if (ty.m.scale.x < 1) ty.m.scale.setScalar(Math.min(1, ty.m.scale.x + dt * 2.5));
          ty.m.position.y = ty.base.y + Math.sin(t * 0.9 + ty.ph) * 0.12;
          ty.m.rotation.x += ty.spin * dt * 0.6; ty.m.rotation.y += ty.spin * dt;
        }
        runway.forEach((r, i) => { r.material.opacity = ((Math.floor(t * 5) - i) % 6 + 6) % 6 === 0 ? 0.9 : 0.25; });
        if (wordT >= 0) { wordT += dt; const k = easeOutBack(wordT / 1.2); word.scale.setScalar(Math.max(0.01, k)); word.position.y = 3.1 + Math.sin(t) * 0.05; faceTowards(word, camW, dt, 2); }
        fx.ripples.tick(dt); fx.shards.tick(dt); fx.confetti.tick(dt);
      },
    };
  };
}
