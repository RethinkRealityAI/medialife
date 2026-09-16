/* MEDIALIFE × SIGNAL RUN — Activated Merchandise® fan experience demo.
   Classic script on purpose: works from file:// as well as over http.
   Three.js is loaded lazily via the document import map; every failure
   path falls back to a canvas-2D / CSS rendering, never a blank screen. */
(function () {
  'use strict';

  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  var STAGES = ['tap', 'activating', 'experience', 'reward', 'cta', 'data'];
  var LABELS = {
    tap: 'Tap to activate', activating: 'Activating', experience: 'The experience',
    reward: 'Your reward', cta: 'Back to the game', data: 'What the creator sees'
  };
  var DUR = { tap: 2500, activating: 1900, experience: 12000, reward: 7500, cta: 9000 };

  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mqReduce && mqReduce.matches); }

  var LORE = [
    { k: 'FRAGMENT 01', t: 'The Beacon',
      b: 'Dropped by the Architects three cycles before the blackout. It still transmits. Nobody has decoded what it is calling.',
      s: [['Signal range', '4.2 KM'], ['Uptime', '1,182 D']] },
    { k: 'FRAGMENT 02', t: 'Class: Vector',
      b: 'Runners who trade armour for acceleration. A Vector crosses the Relay in under ninety seconds — if nothing is chasing.',
      s: [['Top speed', '62 U/S'], ['Armour', '12%']] },
    { k: 'FRAGMENT 03', t: 'The Relay Network',
      b: 'Twelve nodes. Nine still online. Light one and the map redraws itself around you.',
      s: [['Nodes online', '9 / 12'], ['Sector', '07']] }
  ];

  var S = {
    stage: null, i: -1,
    activatedAt: null, t0: 0,
    expMs: 0, expEnter: 0,
    hot: [false, false, false], hotCount: 0,
    cta: false, revealed: false, copied: false,
    code: null, events: []
  };

  /* ------------------------------------------------------------ elements */
  var stageEl = $('#stage');
  var railEl = $('#rail');
  var sceneEl = $('#scene');
  var canvas = $('#gl');
  var loreEl = $('#lore');
  var panels = {};
  $$('.panel').forEach(function (p) { panels[p.dataset.stage] = p; });

  var timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

  /* ------------------------------------------------------------- utility */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function stamp(d) {
    return pad2(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() +
      ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function clock(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function randInt(max) {
    try {
      if (window.crypto && crypto.getRandomValues) {
        var a = new Uint32Array(1); crypto.getRandomValues(a);
        return a[0] % max;
      }
    } catch (e) { /* fall through */ }
    return Math.floor(Math.random() * max);
  }
  function makeCode() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var i = 0; i < 8; i++) { if (i === 4) out += '-'; out += A.charAt(randInt(A.length)); }
    return 'SR-' + out;
  }
  function ensureCode() {
    if (!S.code) { S.code = makeCode(); }
    $('#rewardCode').textContent = S.code;
    $('#ctaCode').textContent = S.code;
    return S.code;
  }

  function log(name, detail) {
    if (!S.t0) S.t0 = now();
    S.events.push({ ms: Math.max(0, now() - S.t0), name: name, detail: detail || '' });
  }

  /* --------------------------------------------------------- stage engine */
  function buildRail() {
    STAGES.forEach(function (id, idx) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.title = (idx + 1) + '. ' + LABELS[id];
      b.setAttribute('data-rail', id);
      b.innerHTML = '<span class="sr-only">Go to stage ' + (idx + 1) + ': ' + LABELS[id] + '</span>';
      b.addEventListener('click', function () { go(id, true); });
      railEl.appendChild(b);
    });
  }

  function syncRail() {
    $$('button', railEl).forEach(function (b, idx) {
      if (idx === S.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.setAttribute('data-done', idx < S.i ? '1' : '0');
    });
  }

  function ensureActivated() {
    if (!S.activatedAt) {
      S.activatedAt = new Date();
      S.t0 = now();
      log('tag.activation', 'NFC · TAG 8F-2C');
    }
  }

  function leave(id) {
    if (id === 'experience') {
      accumulate();
      closeLore(true);
      pauseScene();
    }
  }

  function accumulate() {
    if (S.expEnter) { S.expMs += now() - S.expEnter; S.expEnter = 0; }
  }

  function go(id, user) {
    if (STAGES.indexOf(id) < 0) return;
    clearTimers();
    stopActivating();
    if (S.stage === id && id !== 'tap') { schedule(id); return; }

    leave(S.stage);
    var prev = S.stage;
    S.stage = id;
    S.i = STAGES.indexOf(id);

    STAGES.forEach(function (k) {
      var p = panels[k];
      if (!p) return;
      if (k === id) { p.setAttribute('data-active', ''); p.removeAttribute('inert'); p.scrollTop = 0; }
      else { p.removeAttribute('data-active'); p.setAttribute('inert', ''); }
    });

    syncRail();
    enter(id, user, prev);
    schedule(id);

    try { history.replaceState(null, '', '#stage=' + id); } catch (e) { /* file:// */ }
    emit(id);
  }

  function next() { go(STAGES[Math.min(S.i + 1, STAGES.length - 1)]); }

  function schedule(id) {
    // "activating" is a transition, not an autoplay loop — it always advances,
    // so no stage is ever a dead end under prefers-reduced-motion.
    if (id === 'activating') { later(next, reduced() ? 700 : DUR.activating); return; }
    if (reduced() || !DUR[id]) return;
    later(next, DUR[id]);
  }

  function enter(id, user, prev) {
    if (id === 'activating') { ensureActivated(); runActivating(); }

    if (id === 'experience') {
      ensureActivated();
      if (prev !== 'experience') log('experience.open', 'SIGNAL RUN / TRANSMISSION 01');
      S.expEnter = now();
      startScene();
    }

    if (id === 'reward') {
      ensureActivated();
      ensureCode();
      if (!S.revealed) later(function () { reveal(true); }, reduced() ? 60 : 850);
    }

    if (id === 'cta') { ensureActivated(); ensureCode(); }

    if (id === 'data') { ensureActivated(); ensureCode(); renderReport(); }
  }

  function emit(id) {
    var payload = { type: 'medialife:activate:stage', stage: id, index: S.i, total: STAGES.length };
    try { if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*'); } catch (e) { /* cross-origin */ }
    try { doc.dispatchEvent(new CustomEvent('medialife:stage', { detail: payload })); } catch (e) { /* old browser */ }
  }

  /* ---------------------------------------------------- 2. activating run */
  var actRaf = 0;
  var ACT_STEPS = [[0, 'NFC HANDSHAKE'], [26, 'RESOLVING TAG 8F-2C'], [55, 'STREAMING EXPERIENCE'], [82, 'RENDERING SCENE']];
  function stopActivating() { if (actRaf) { cancelAnimationFrame(actRaf); actRaf = 0; } }
  function runActivating() {
    var fill = $('#actFill'), pct = $('#actPct'), step = $('#actStep');
    var total = reduced() ? 400 : DUR.activating - 250;
    var t0 = now();
    fill.style.width = '0%';
    function tick() {
      var k = Math.min(1, (now() - t0) / total);
      var v = Math.round(k * 100);
      fill.style.width = v + '%';
      pct.textContent = pad2(Math.min(99, v)) + '%';
      var label = ACT_STEPS[0][1];
      for (var i = 0; i < ACT_STEPS.length; i++) { if (v >= ACT_STEPS[i][0]) label = ACT_STEPS[i][1]; }
      if (step.textContent !== label) step.textContent = label;
      if (k < 1) actRaf = requestAnimationFrame(tick);
      else { actRaf = 0; pct.textContent = '100%'; step.textContent = 'READY'; }
    }
    actRaf = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------- 3. lore */
  var loreOpenIndex = -1;
  function openLore(i) {
    var d = LORE[i];
    if (!d) return;
    $('#loreKicker').textContent = d.k;
    $('#loreTitle').textContent = d.t;
    $('#loreBody').textContent = d.b;
    $('#loreStats').innerHTML = d.s.map(function (row) {
      return '<div><b>' + row[1] + '</b><span class="mono">' + row[0] + '</span></div>';
    }).join('');
    loreEl.setAttribute('data-open', '');
    loreEl.removeAttribute('inert');
    loreOpenIndex = i;

    $$('.hotspot').forEach(function (h, idx) { h.setAttribute('aria-expanded', idx === i ? 'true' : 'false'); });
    var btn = $('.hotspot[data-hotspot="' + i + '"]');
    if (btn) btn.setAttribute('data-seen', '1');

    if (!S.hot[i]) { S.hot[i] = true; S.hotCount++; log('hotspot.open', d.t.toUpperCase()); }
    clearTimers(); // reading time is not dead time — hold the sequence
    try { $('#loreClose').focus({ preventScroll: true }); } catch (e) { $('#loreClose').focus(); }
  }

  function closeLore(silent) {
    if (loreOpenIndex < 0) return;
    var prevIndex = loreOpenIndex;
    loreOpenIndex = -1;
    loreEl.removeAttribute('data-open');
    loreEl.setAttribute('inert', '');
    $$('.hotspot').forEach(function (h) { h.setAttribute('aria-expanded', 'false'); });
    if (!silent) {
      var btn = $('.hotspot[data-hotspot="' + prevIndex + '"]');
      if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); } }
      if (S.stage === 'experience') schedule('experience');
    }
  }

  /* ----------------------------------------------------------- 4. reward */
  function reveal(auto) {
    var flip = $('#flip');
    flip.setAttribute('data-revealed', '');
    $('#flipBtn').setAttribute('aria-expanded', 'true');
    if (!S.revealed) {
      S.revealed = true;
      log('reward.issued', 'VECTOR RELAY VISOR · RARE');
    }
    if (!auto) { /* manual flip keeps the running timer */ }
  }

  function setCopyNote(msg) { $('#copyNote').textContent = msg; }

  function copyCode() {
    var btn = $('#copyBtn');
    var txt = ensureCode();
    function done() {
      btn.setAttribute('data-done', '1');
      btn.textContent = 'Copied';
      setCopyNote('COPIED TO CLIPBOARD · ONE-TIME USE');
      if (!S.copied) { S.copied = true; log('reward.code_copied', txt); }
      later(function () { btn.removeAttribute('data-done'); btn.textContent = 'Copy'; setCopyNote('ONE-TIME USE · EXPIRES IN 30 DAYS'); }, 2400);
    }
    function legacy() {
      var ok = false;
      try {
        var ta = doc.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        doc.body.appendChild(ta);
        ta.select();
        ok = doc.execCommand && doc.execCommand('copy');
        doc.body.removeChild(ta);
      } catch (e) { ok = false; }
      if (ok) done(); else selectFallback();
    }
    function selectFallback() {
      try {
        var r = doc.createRange();
        r.selectNodeContents($('#rewardCode'));
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
      } catch (e) { /* ignore */ }
      setCopyNote('SELECT THE CODE AND COPY IT MANUALLY');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, legacy);
    } else { legacy(); }
  }

  /* ------------------------------------------------------------ 6. report */
  function renderReport() {
    accumulate();
    $('#mTime').textContent = clock(S.expMs);
    $('#mHot').innerHTML = S.hotCount + ' <small>/ 3</small>';
    $('#mCta').textContent = S.cta ? 'YES' : 'NO';
    $('#mCtaWrap').className = 'stat ' + (S.cta ? 'stat--yes' : 'stat--no');
    $('#mIssued').textContent = S.revealed ? 'YES' : 'NO';
    $('#mStamp').textContent = S.activatedAt ? stamp(S.activatedAt) : '—';
    $('#mCode').textContent = S.code || '—';

    log('session.report', 'DWELL ' + clock(S.expMs));
    var rows = S.events.map(function (e) {
      return '<li><span>t+' + (e.ms / 1000).toFixed(2) + 's</span><b>' + e.name + '</b><i>' + e.detail + '</i></li>';
    }).join('');
    $('#eventLog').innerHTML = rows;
    // drop the synthetic report row so replays don't stack duplicates
    S.events.pop();
  }

  /* ------------------------------------------------------------- parallax */
  var par = { tx: 0, ty: 0, x: 0, y: 0, on: false };
  function setParallaxTarget(x, y) {
    par.tx = Math.max(-1, Math.min(1, x));
    par.ty = Math.max(-1, Math.min(1, y));
  }
  function stepParallax(dt) {
    if (reduced()) { par.x = par.y = 0; }
    else {
      var k = 1 - Math.pow(0.0025, dt);
      par.x += (par.tx - par.x) * k;
      par.y += (par.ty - par.y) * k;
    }
    sceneEl.style.setProperty('--px', par.x.toFixed(4));
    sceneEl.style.setProperty('--py', par.y.toFixed(4));
  }

  function bindPointerParallax() {
    sceneEl.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = sceneEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setParallaxTarget((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
    }, { passive: true });
    sceneEl.addEventListener('pointerleave', function () { setParallaxTarget(0, 0); }, { passive: true });
  }

  function onOrientation(e) {
    if (e.gamma == null && e.beta == null) return;
    par.on = true;
    setParallaxTarget((e.gamma || 0) / 32, ((e.beta || 45) - 45) / 32);
  }

  function bindOrientation() {
    var DOE = window.DeviceOrientationEvent;
    if (!DOE) return;
    var needsPermission = typeof DOE.requestPermission === 'function';
    var btn = $('#tiltBtn');
    if (needsPermission) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        DOE.requestPermission().then(function (res) {
          if (res === 'granted') {
            window.addEventListener('deviceorientation', onOrientation, { passive: true });
            btn.hidden = true;
            log('experience.motion_granted', 'DEVICE TILT');
          } else { btn.textContent = 'Tilt unavailable'; }
        })['catch'](function () { btn.textContent = 'Tilt unavailable'; });
      });
    } else {
      window.addEventListener('deviceorientation', onOrientation, { passive: true });
    }
  }

  /* --------------------------------------------------------------- scene */
  var scene = { ready: false, running: false, raf: 0, last: 0, t: 0, render: null, resize: null, kind: 'none' };

  function hasWebGL() {
    try {
      var c = doc.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl', { failIfMajorPerformanceCaveat: false })));
    } catch (e) { return false; }
  }

  function loop(ts) {
    scene.raf = 0;
    if (!scene.running) return;
    var dt = scene.last ? Math.min((ts - scene.last) / 1000, 0.05) : 0.016; // clamped delta
    scene.last = ts;
    if (!reduced()) scene.t += dt;
    stepParallax(dt);
    if (scene.render) { try { scene.render(scene.t, dt); } catch (e) { scene.running = false; return; } }
    scene.raf = requestAnimationFrame(loop);
  }

  function startScene() {
    if (!scene.ready) { bootScene(); return; }
    if (scene.running) return;
    scene.running = true;
    scene.last = 0;
    if (!scene.raf) scene.raf = requestAnimationFrame(loop);
  }
  function pauseScene() {
    scene.running = false;
    if (scene.raf) { cancelAnimationFrame(scene.raf); scene.raf = 0; }
  }

  var booting = false;
  function bootScene() {
    if (booting || scene.ready) return;
    booting = true;
    // file:// blocks ES module loading outright, so don't even attempt the
    // fetch there — it would only produce a CORS console error. 2D takes over.
    if (hasWebGL() && location.protocol !== 'file:') {
      boot3D().then(function (ok) {
        if (!ok) boot2D();
        booting = false;
        if (S.stage === 'experience') startScene();
      })['catch'](function () {
        boot2D(); booting = false;
        if (S.stage === 'experience') startScene();
      });
    } else {
      boot2D(); booting = false;
      if (S.stage === 'experience') startScene();
    }
  }

  function sizeOf() {
    var r = sceneEl.getBoundingClientRect();
    return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
  }

  /* ------------------------------------------------------- WebGL renderer */
  function boot3D() {
    return Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js')
    ]).then(function (m) {
      var THREE = m[0];
      var EffectComposer = m[1].EffectComposer, RenderPass = m[2].RenderPass;
      var UnrealBloomPass = m[3].UnrealBloomPass, OutputPass = m[4].OutputPass;

      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // DPR capped at 2
      renderer.setClearColor(0x020202, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.92;

      var sc = new THREE.Scene();
      sc.fog = new THREE.FogExp2(0x020202, 0.055);
      var cam = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
      cam.position.set(0, 0, 6.4);

      var CYAN = new THREE.Color(0x19affe), MAGENTA = new THREE.Color(0xff37ae);
      var emblem = new THREE.Group();
      sc.add(emblem);

      // fresnel shell
      var shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.34, 3),
        new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
          uniforms: { uT: { value: 0 }, cA: { value: CYAN.clone() }, cB: { value: MAGENTA.clone() } },
          vertexShader: [
            'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
            'void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0);',
            ' vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }'
          ].join('\n'),
          fragmentShader: [
            'precision mediump float;',
            'uniform float uT; uniform vec3 cA; uniform vec3 cB;',
            'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
            'void main(){',
            ' float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);',
            ' float scan = 0.5 + 0.5 * sin(vP.y * 16.0 - uT * 2.2);',
            ' vec3 col = mix(cA, cB, clamp(vP.y * 0.55 + 0.5, 0.0, 1.0));',
            ' float a = f * 0.55 + scan * 0.03;',
            ' gl_FragColor = vec4(col * (0.55 + scan * 0.25), a);',
            '}'
          ].join('\n')
        })
      );
      emblem.add(shell);

      // wireframe cage
      var cage = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.62, 1)),
        new THREE.LineBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0.4 })
      );
      emblem.add(cage);

      // bright core
      var core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.44, 0),
        new THREE.ShaderMaterial({
          uniforms: { cA: { value: CYAN.clone() }, cB: { value: MAGENTA.clone() } },
          vertexShader: [
            'varying vec3 vN;',
            'void main(){ vN = normalize(normalMatrix * normal);',
            ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
          ].join('\n'),
          fragmentShader: [
            'precision mediump float; uniform vec3 cA; uniform vec3 cB; varying vec3 vN;',
            'void main(){',
            ' float l = 0.12 + 0.95 * max(dot(normalize(vN), normalize(vec3(0.42, 0.66, 0.62))), 0.0);',
            ' vec3 col = mix(cA, cB, clamp(vN.y * 0.5 + 0.5, 0.0, 1.0)) * l + vec3(0.04, 0.05, 0.07);',
            ' gl_FragColor = vec4(col, 1.0); }'
          ].join('\n')
        })
      );
      emblem.add(core);

      // radial gauge ring facing the camera
      var ticks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.014, 0.12, 0.014),
        new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.8 }),
        64
      );
      var mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), eul = new THREE.Euler();
      for (var i = 0; i < 64; i++) {
        var a = i / 64 * Math.PI * 2;
        var long = (i % 8 === 0);
        pos.set(Math.cos(a) * 2.12, Math.sin(a) * 2.12, 0);
        eul.set(0, 0, a - Math.PI / 2);
        qt.setFromEuler(eul);
        scl.set(1, long ? 2.1 : 1, 1);
        mtx.compose(pos, qt, scl);
        ticks.setMatrixAt(i, mtx);
      }
      ticks.instanceMatrix.needsUpdate = true;
      var gauge = new THREE.Group();
      gauge.add(ticks);
      emblem.add(gauge);

      // orbit rings
      var ringA = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.007, 3, 180), new THREE.MeshBasicMaterial({ color: 0x19affe, transparent: true, opacity: 0.85 }));
      ringA.rotation.set(1.18, 0.35, 0);
      var ringB = new THREE.Mesh(new THREE.TorusGeometry(2.78, 0.006, 3, 180), new THREE.MeshBasicMaterial({ color: 0xff37ae, transparent: true, opacity: 0.7 }));
      ringB.rotation.set(-0.9, -0.5, 0.4);
      emblem.add(ringA); emblem.add(ringB);

      // particle field
      var N = 1500;
      var positions = new Float32Array(N * 3), seeds = new Float32Array(N);
      for (var j = 0; j < N; j++) {
        positions[j * 3] = (Math.random() - 0.5) * 20;
        positions[j * 3 + 1] = (Math.random() - 0.5) * 15;
        positions[j * 3 + 2] = -16 + Math.random() * 20;
        seeds[j] = Math.random();
      }
      var pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      var pMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        vertexShader: [
          'uniform float uT; uniform float uPR; attribute float aSeed; varying float vS;',
          'void main(){ vS = aSeed; vec3 p = position; float s = aSeed * 6.2831;',
          ' p.x += sin(uT * 0.24 + s) * 0.3; p.y += cos(uT * 0.19 + s * 1.7) * 0.3;',
          ' vec4 mv = modelViewMatrix * vec4(p, 1.0);',
          ' gl_PointSize = (12.0 + aSeed * 18.0) * uPR / max(-mv.z, 0.8);',
          ' gl_Position = projectionMatrix * mv; }'
        ].join('\n'),
        fragmentShader: [
          'precision mediump float; varying float vS;',
          'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);',
          ' if (d > 0.5) discard;',
          ' float a = smoothstep(0.5, 0.05, d);',
          ' vec3 col = mix(vec3(0.098, 0.686, 0.996), vec3(1.0, 0.216, 0.682), vS);',
          ' gl_FragColor = vec4(col, a * (0.3 + vS * 0.7)); }'
        ].join('\n')
      });
      var dust = new THREE.Points(pg, pMat);
      sc.add(dust);

      var sz = sizeOf();
      renderer.setSize(sz.w, sz.h, false);
      cam.aspect = sz.w / sz.h; cam.updateProjectionMatrix();

      var composer = new EffectComposer(renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      composer.setSize(sz.w, sz.h);
      composer.addPass(new RenderPass(sc, cam));
      var bloom = new UnrealBloomPass(new THREE.Vector2(sz.w, sz.h), 0.5, 0.38, 0.62);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());

      var OUTER = 2.78; // radius of the widest ring, in scene units
      function fit() {
        var vh = 2 * cam.position.z * Math.tan(cam.fov * Math.PI / 360);
        var vw = vh * cam.aspect;
        var target = Math.min(vw * 0.94, vh * 0.68); // desired diameter on screen
        emblem.scale.setScalar(Math.max(0.2, (target / 2) / OUTER));
      }

      scene.resize = function () {
        var s = sizeOf();
        renderer.setSize(s.w, s.h, false);
        composer.setSize(s.w, s.h);
        bloom.setSize(s.w, s.h);
        cam.aspect = s.w / s.h;
        cam.updateProjectionMatrix();
        fit();
      };

      var tmp = new THREE.Vector3();
      scene.render = function (t, dt) {
        shell.material.uniforms.uT.value = t;
        pMat.uniforms.uT.value = t;
        if (!reduced()) {
          emblem.rotation.y = t * 0.28;
          cage.rotation.y = -t * 0.16;
          cage.rotation.x = t * 0.09;
          core.rotation.set(t * 0.7, t * 0.55, 0);
          gauge.rotation.z = -t * 0.12;
          ringA.rotation.z = t * 0.22;
          ringB.rotation.z = -t * 0.17;
          dust.rotation.y = t * 0.014;
          var s = 1 + Math.sin(t * 1.6) * 0.03;
          core.scale.setScalar(s);
        }
        emblem.rotation.x = -par.y * 0.2;
        emblem.position.x = -par.x * 0.07;
        tmp.set(par.x * 0.16, -par.y * 0.13, 6.4);
        cam.position.lerp(tmp, 0.12);
        cam.lookAt(0, 0, 0);
        composer.render();
      };

      scene.kind = 'webgl';
      scene.ready = true;
      sceneEl.setAttribute('data-webgl', '1');
      scene.resize();
      return true;
    })['catch'](function () { return false; });
  }

  /* ------------------------------------------------- canvas-2D fallback */
  function boot2D() {
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) { scene.ready = true; scene.kind = 'static'; scene.render = null; return; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pts = [];
    for (var i = 0; i < 110; i++) {
      pts.push({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, s: Math.random() });
    }
    var w = 1, h = 1;
    scene.resize = function () {
      var s = sizeOf();
      w = s.w; h = s.h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    scene.render = function (t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var dx = reduced() ? 0 : Math.sin(t * 0.22 + p.s * 6.28) * 14 * p.z;
        var dy = reduced() ? 0 : Math.cos(t * 0.17 + p.s * 9.1) * 12 * p.z;
        var x = p.x * w + dx - par.x * 26 * p.z;
        var y = p.y * h + dy - par.y * 26 * p.z;
        var r = 0.6 + p.z * 1.5;
        ctx.globalAlpha = 0.18 + p.z * 0.45;
        ctx.fillStyle = p.s > 0.55 ? '#ff37ae' : '#19affe';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    scene.kind = 'canvas2d';
    scene.ready = true;
    scene.resize();
  }

  /* ------------------------------------------------------------- replay */
  function replay() {
    clearTimers();
    stopActivating();
    accumulate();
    S.activatedAt = null; S.t0 = 0;
    S.expMs = 0; S.expEnter = 0;
    S.hot = [false, false, false]; S.hotCount = 0;
    S.cta = false; S.revealed = false; S.copied = false;
    S.events = [];
    S.code = null;

    $('#flip').removeAttribute('data-revealed');
    $('#flipBtn').setAttribute('aria-expanded', 'false');
    $('#claimNote').hidden = true;
    $('#copyBtn').removeAttribute('data-done');
    $('#copyBtn').textContent = 'Copy';
    setCopyNote('ONE-TIME USE · EXPIRES IN 30 DAYS');
    $('#rewardCode').textContent = 'SR-••••-••••';
    $('#ctaCode').textContent = 'SR-••••-••••';
    $('#actFill').style.width = '0%';
    $('#actPct').textContent = '00%';
    $('#actStep').textContent = 'NFC HANDSHAKE';
    $('#eventLog').innerHTML = '';
    $$('.hotspot').forEach(function (h) { h.removeAttribute('data-seen'); h.setAttribute('aria-expanded', 'false'); });
    closeLore(true);

    S.stage = null; S.i = -1;
    go('tap');
  }

  /* --------------------------------------------------------------- wiring */
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var m = /(?:^|[?&])stage=([a-z]+)/i.exec(h);
    var id = m ? m[1].toLowerCase() : h.toLowerCase();
    return STAGES.indexOf(id) >= 0 ? id : null;
  }

  function init() {
    buildRail();
    loreEl.setAttribute('inert', '');

    $('#tapTarget').addEventListener('click', function () { go('activating', true); });
    $('#replayBtn').addEventListener('click', replay);

    $$('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-go'), true); });
    });

    $$('.hotspot').forEach(function (h) {
      h.addEventListener('click', function () {
        var i = parseInt(h.getAttribute('data-hotspot'), 10);
        if (loreOpenIndex === i) closeLore(); else openLore(i);
      });
    });
    $('#loreClose').addEventListener('click', function () { closeLore(); });

    $('#flipBtn').addEventListener('click', function () {
      if ($('#flip').hasAttribute('data-revealed')) {
        $('#flip').removeAttribute('data-revealed');
        $('#flipBtn').setAttribute('aria-expanded', 'false');
      } else { reveal(false); }
    });

    $('#copyBtn').addEventListener('click', copyCode);

    $('#claimBtn').addEventListener('click', function (e) {
      e.preventDefault();                       // preview only — never navigates
      $('#claimNote').hidden = false;
      if (!S.cta) { S.cta = true; log('cta.tap', 'DEEP LINK → ROBLOX EXPERIENCE'); }
      clearTimers();
      if (!reduced()) later(next, 6000);
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && loreOpenIndex >= 0) { e.preventDefault(); closeLore(); }
    });

    window.addEventListener('hashchange', function () {
      var id = readHash();
      if (id && id !== S.stage) go(id, true);
    });

    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'medialife:activate') return;
      if (d.action === 'replay') replay();
      else if (d.action === 'go' && typeof d.stage === 'string') go(d.stage, true);
    });

    // pause the loop when hidden or scrolled out of view
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { accumulate(); pauseScene(); }
      else {
        if (S.stage === 'experience') { S.expEnter = now(); startScene(); }
      }
    });

    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && S.stage === 'experience' && !doc.hidden) startScene();
          else if (!en.isIntersecting) pauseScene();
        });
      }, { threshold: 0.05 });
      io.observe(canvas);
    }

    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (scene.resize) scene.resize(); }, 140);
    }, { passive: true });

    if (mqReduce) {
      var onRM = function () { if (reduced()) clearTimers(); };
      if (mqReduce.addEventListener) mqReduce.addEventListener('change', onRM);
      else if (mqReduce.addListener) mqReduce.addListener(onRM);
    }

    bindPointerParallax();
    bindOrientation();

    // warm the scene up so stage 3 never shows an empty frame
    bootScene();

    var hashStage = readHash();
    go(hashStage || 'tap');
  }

  /* ------------------------------------------------------- public contract */
  window.MEDIALIFE_ACTIVATE = {
    stages: STAGES.slice(),
    labels: LABELS,
    go: function (id) { go(id, true); },
    next: next,
    replay: replay,
    current: function () { return S.stage; },
    renderer: function () { return scene.kind; },
    metrics: function () {
      return {
        stage: S.stage,
        activatedAt: S.activatedAt ? S.activatedAt.toISOString() : null,
        timeOnExperienceMs: Math.round(S.expMs + (S.expEnter ? now() - S.expEnter : 0)),
        hotspotsOpened: S.hotCount,
        ctaTapped: S.cta,
        rewardIssued: S.revealed,
        code: S.code,
        events: S.events.slice()
      };
    }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
