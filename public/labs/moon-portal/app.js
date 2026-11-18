/* Moon Portal: 8th Wall's "A-Frame: World Tracking Portal" sample, as exported (src/app.js + components/),
 * plus MEDIALIFE boot: full splash, phone check + QR on computers, scene added on Start, error sheet, test log.
 * Sample code Copyright (c) 2023 8th Wall, Inc., MIT. Only the boot section at the bottom is ours. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ the sample's components (unchanged) */
  // This component hides and shows certain elements as the camera moves
  const portalCameraComponent = {
    schema: { width: { default: 10 }, height: { default: 10 } },
    init() {
      this.camera = this.el;
      this.contents = document.getElementById('portal-contents');
      this.walls = document.getElementById('hider-walls');
      this.portalWall = document.getElementById('portal-wall');
      this.portalVideo = document.getElementById('portalVideo');
      this.isInPortalSpace = false;
      this.wasOutside = true;
    },
    tick() {
      const { position } = this.camera.object3D;
      const isOutside = position.z > 0;
      const withinPortalBounds = position.y < this.data.height && Math.abs(position.x) < this.data.width / 2;
      if (this.wasOutside !== isOutside && withinPortalBounds) this.isInPortalSpace = !isOutside;
      this.contents.object3D.visible = this.isInPortalSpace || isOutside;
      this.walls.object3D.visible = !this.isInPortalSpace && isOutside;
      this.portalWall.object3D.visible = this.isInPortalSpace && !isOutside;
      this.portalVideo.object3D.visible = isOutside;
      this.wasOutside = isOutside;
      window.__mp && (window.__mp.inside = this.isInPortalSpace, window.__mp.cam = position.toArray());
    },
  };

  const tapToPlacePortalComponent = {
    init() {
      const { sceneEl } = this.el;
      const recenterBtn = document.getElementById('recenterButton');
      const portalHiderRing = sceneEl.querySelector('#portalHiderRing');
      const portalRim = sceneEl.querySelector('#portalRim');
      const portalVideo = sceneEl.querySelector('#portalVideo');
      const portalShadow = sceneEl.querySelector('#portalShadow');
      const handleClickEvent = (e) => {
        if (!e.touches || e.touches.length < 2) {
          recenterBtn.classList.add('pulse-once');
          sceneEl.emit('recenter');
          setTimeout(() => recenterBtn.classList.remove('pulse-once'), 200);
        }
      };
      const firstPlaceEvent = () => {
        sceneEl.emit('recenter');
        sceneEl.emit('dismissPrompt');
        portalHiderRing.setAttribute('animation__1', { property: 'radius-inner', dur: 1500, from: '0.001', to: '3.5', easing: 'easeOutElastic' });
        portalRim.setAttribute('animation__2', { property: 'scale', dur: 1500, from: '0.001 0.001 0.001', to: '4.3 4.3 4.3', easing: 'easeOutElastic' });
        portalVideo.setAttribute('animation__3', { property: 'scale', dur: 1500, from: '0.001 0.001 0.001', to: '7 7 1', easing: 'easeOutElastic' });
        portalShadow.setAttribute('animation__4', { property: 'scale', dur: 1500, from: '0.001 0.001 0.001', to: '15.5 2 11', easing: 'easeOutElastic' });
        sceneEl.removeEventListener('click', firstPlaceEvent);
        recenterBtn.addEventListener('click', handleClickEvent, true);
        window.__mp && (window.__mp.placed = true);
        log('placed');
      };
      sceneEl.addEventListener('click', firstPlaceEvent);
    },
  };

  const promptFlowComponent = {
    init() {
      this.prompt = document.getElementById('promptText');
      this.overlay = document.getElementById('overlay');
      this.el.sceneEl.addEventListener('realityready', () => {
        this.overlay.style.display = 'block';
        this.prompt.innerHTML = 'Tap to Place<br>Moon Portal';
        this.prompt.classList.add('fly-in');
      });
      this.el.addEventListener('dismissPrompt', () => {
        this.prompt.classList.remove('fly-in');
        this.prompt.classList.add('fly-out');
      });
    },
  };

  const spinComponent = {
    schema: { speed: { default: 2000 }, direction: { default: 'normal' }, axis: { default: 'y' } },
    init() {
      this.el.setAttribute('animation__spin', { property: `object3D.rotation.${this.data.axis}`, from: 0, to: 360, dur: this.data.speed, dir: this.data.direction, loop: true, easing: 'linear' });
    },
  };

  // separates behaviour by device category using the engine's sessionAttributes (sample's responsive-immersive)
  const responsiveImmersiveComponent = {
    init() {
      const onAttach = ({ sessionAttributes: s }) => {
        const scene = this.el;
        const mobile = !s.cameraLinkedToViewer && !s.controlsCamera && s.fillsCameraTexture && !s.supportsHtmlEmbedded && s.supportsHtmlOverlay && s.usesMediaDevices && !s.usesWebXr;
        const hmd = s.cameraLinkedToViewer && s.controlsCamera && !s.fillsCameraTexture && s.supportsHtmlEmbedded && !s.supportsHtmlOverlay && !s.usesMediaDevices && s.usesWebXr;
        const arHmd = hmd && this.el.sceneEl.xrSession && this.el.sceneEl.xrSession.environmentBlendMode !== 'opaque';
        if (mobile || arHmd) {
          scene.setAttribute('tap-to-place-portal', '');
          scene.setAttribute('prompt-flow', '');
          scene.sceneEl.camera.el.setAttribute('portal-camera', '');
        }
        log('session ' + (mobile ? 'mobile' : hmd ? 'headset' : 'desktop'));
      };
      const onxrloaded = () => XR8.addCameraPipelineModules([{ name: 'responsiveImmersive', onAttach }]);
      window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded);
    },
  };

  AFRAME.registerComponent('portal-camera', portalCameraComponent);
  AFRAME.registerComponent('spin', spinComponent);
  AFRAME.registerComponent('prompt-flow', promptFlowComponent);
  AFRAME.registerComponent('tap-to-place-portal', tapToPlacePortalComponent);
  AFRAME.registerComponent('responsive-immersive', responsiveImmersiveComponent);
  AFRAME.registerComponent('auto-play-video', {
    schema: { video: { type: 'string' } },
    init() { const v = document.querySelector(this.data.video); v && v.play && v.play().catch(() => {}); },
  });

  /* ------------------------------------------------------------------ MEDIALIFE boot */
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const SHOW_DIAG = params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
  const lines = [];
  function log(s) { lines.push(s); if (lines.length > 6) lines.shift(); if (SHOW_DIAG) { $('diagp').hidden = false; $('diagp').textContent = lines.join('\n'); } }
  window.__mp = { inside: false, placed: false, cam: null, log: lines };

  function qr(el) {
    try { window.QRCode && QRCode.toString(location.href.replace(/[?&](test|desktop)\b[^&]*/g, ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) { el.innerHTML = svg; el.hidden = false; } }); } catch (e) { /* no QR */ }
  }
  function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; log('err ' + title); }
  $('err-retry').onclick = () => location.reload();

  const btn = $('b-start');
  const ready = () => { btn.disabled = false; btn.textContent = 'Start'; $('splash').classList.add('ready'); };
  window.XR8 ? ready() : window.addEventListener('xrloaded', ready, { once: true });
  setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 25000);
  if (!PHONE && !params.has('desktop')) { $('desk').hidden = false; qr($('qr')); }

  window.addEventListener('error', (e) => log('js ' + String(e.message).slice(0, 120)));

  btn.onclick = () => {
    if (!PHONE && !params.has('desktop')) {
      showError('Open this on your phone', 'The portal needs your phone\'s camera and motion sensors. Scan this to open it there.');
      qr($('qr2')); $('err-retry').textContent = 'Close'; $('err-retry').onclick = () => { $('error').hidden = true; };
      return;
    }
    // iPhone: motion permission must be asked inside the tap
    try { window.DeviceMotionEvent && DeviceMotionEvent.requestPermission && DeviceMotionEvent.requestPermission().catch(() => {}); } catch (e) { /* none */ }
    try { window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission && DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (e) { /* none */ }
    btn.disabled = true; btn.textContent = 'Starting…';
    document.body.appendChild($('scene-tpl').content.cloneNode(true));
    const scene = document.querySelector('a-scene');
    let video = false;
    XR8.addCameraPipelineModules([{
      name: 'ml-boot',
      onCameraStatusChange: ({ status }) => {
        log('camera ' + status);
        if (status === 'hasVideo') { video = true; $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600); }
        if (status === 'failed') showError('The camera didn\'t start', 'Allow camera and motion access for this site, close other apps using the camera, then tap Try again.');
      },
      onException: (e) => {
        const msg = (e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : String(e));
        log('xr ' + msg.slice(0, 140));
        if (e && e.type === 'permission') return showError('Motion access is needed', 'The portal uses your phone\'s motion sensors to stay on the floor. Allow motion and orientation access, then try again.');
        if (/session manager|not supported|unsupported|device/i.test(msg) && !video) return showError('Open this on your phone', 'This device can\'t run world-tracked AR.');
      },
    }]);
    scene && scene.addEventListener('realityready', () => log('reality ready'));
    setTimeout(() => { if (!video) showError('The camera didn\'t start', 'Allow camera and motion access for this site, close other apps using the camera, then tap Try again.'); }, 15000);
  };
})();
