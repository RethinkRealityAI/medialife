// 3D Photo: your selfie in Bobo's picture frame, in your room (or a life-size Bobo cutout a friend puts their face
// through). Built on the pattern of MEDIALIFE Labs "Wear It, Meet It" (one engine session, front camera -> back
// camera, no reload).
//
//   selfie   FRONT camera (the mode opens here the first time). Bobo Booth's "Be Bobo" look on your face (cat hat,
//            bells, whiskers), a guide oval, the shutter bottom centre. The selfie is cropped round your head (from
//            the face tracking; the oval when no face is found) to the frame opening's shape and goes into the frame.
//   flip     "Meet Bobo" flips to the BACK camera in the same engine session (xr-core's Engine.start swap).
//   placing  a reticle on the floor with the frame (your selfie in it) and Bobo beside it, facing you; pinch to size;
//            Place (or a tap) once world tracking has settled.
//   placed   Bobo keeps turning to face you; tap for a hop and sparkles; shutter bottom centre takes the room photo
//            (camera + 3D) -> the review sheet (Save / Share / Retake). Move (bottom left,
//            always there) places it again; "Selfie" (stacked above Move) flips back for a new selfie.
// Placement (relative to the phone, as the AR mode does), size and the selfie survive every flip and leaving the mode.
// The frame is EVADE's, built in code (src/evade/capture/frame-board.ts) with the same opening as before: x -0.04..0.405,
// y 0.385..0.93, face z 0.112 in model units (1 unit tall, feet on y = 0, facing +z). The cutout is a three.js render of
// the real Bobo model on a die-cut board (src/evade/capture/cutout.ts).
import * as THREE from 'three';
import type { ExperienceMode } from '../../../shared/contracts';
import type { CameraKind, EngineView, FaceEvent, HudApi, Mode, ModeContext, XrScene } from '../../types';
import { ReviewSheet, RevealPlayer, compose, engineShot, flash, el } from '../../capture';
import { FRAME_STYLES, PHOTO_FILTERS, drawFrameArt, loadFrameArt, type FrameSpec, type FrameStyle, type PhotoFilter } from '../../capture/frame-art';
import { askMotionPermission } from '../../core/device';
import { bindGestures } from '../shared';
import { ICON } from '../../hud/icons';
import { FaceFx, heartShape } from '../face/face-fx';
import { boboPhotoFrame } from '../../../evade/capture/frame-board';
import { boboCutout } from '../../../evade/capture/cutout';
import { clipHold } from '../../capture/recorder';
import { FILTER_CSS } from '../../capture/style-strip';

const SIZE = { def: 1.0, min: 0.4, max: 1.8 }; // the frame's height in metres
// the cutout standee. Dapo (round 5, after the phone test): at least twice the old 2.3 default; pinch from 1.6 up.
// Dapo 2026-11-20: half the earlier 4.6 (iPhone showed it far too big). World units follow the phone's height when
// the camera starts (responsive scale, CAM_H 1.3), so 2.3 units is about 2.3 m held at chest height.
const CUT = { def: 2.1, min: 1.2, max: 4.6 }; // Bobo's board is a little shorter than a person
/** Bobo beside the frame (model units: the frame is 1 tall), turned a little toward it. A rig with RightArm /
 *  RightForeArm / RightHand bones reaches for `grip` on the frame's edge; Bobo's cat rig has none, so he just stands. */
const BESIDE = { x: 0.7, z: 0.04, yaw: -0.42, h: 0.74, grip: new THREE.Vector3(0.47, 0.42, 0.15) };
type Variant = 'frame' | 'cutout';
const REACH = { min: 0.9, max: 4.0 };
/** The frame opening in model units (feet on y = 0, 1 unit tall, facing +z); the plane is a touch bigger, inside. */
const OPENING = { x0: -0.04, x1: 0.405, y0: 0.385, y1: 0.93, z: 0.112 };
const OPEN_ASPECT = (OPENING.x1 - OPENING.x0) / (OPENING.y1 - OPENING.y0); // ~0.82 (w / h)
const SELFIE_PX = { w: 612, h: Math.round(612 / OPEN_ASPECT) };

type Cam = 'face' | 'world';
type State = 'off' | 'selfie' | 'flipping' | 'placing' | 'restoring' | 'placed' | 'busy' | 'review' | 'recording';

type SwapEngine = EngineView & { start?(kind: 'world' | 'face'): Promise<void> };
type CoverHud = HudApi & { cover?(text: string | null): void };

export class PhotoMode implements Mode {
  readonly id = 'photo' as ExperienceMode;
  readonly root = new THREE.Group();
  state: State = 'off';
  size = SIZE.def;
  faceFound = false;
  readonly diag = {
    shots: 0, lastPhoto: null as Blob | null, placedCount: 0, moved: 0, selfies: 0, flips: 0, flipMs: [] as number[],
    restored: 0, reactions: 0, lastSelfie: null as Blob | null, selfieCrop: '' as string, errors: [] as string[],
  };

  /** Which camera the mode runs now. The experience reads it to start the engine, route face events and scenes. */
  private cam: Cam = 'face';
  get camera(): CameraKind {
    return this.cam;
  }

  private anchor = new THREE.Group(); // the spot on the floor
  private model = new THREE.Group(); // scaled to `size`
  private framed = new THREE.Group(); // the frame, plus the selfie plane and the sparkles
  private hop = new THREE.Group(); // the tap reaction moves this
  private selfieMat: THREE.MeshBasicMaterial;
  private selfieTex: THREE.Texture;
  private hasSelfie = false;
  private reticle = new THREE.Group();
  private faceAnchor = new THREE.Group();
  private fx = new FaceFx({ look: 'cat' }); // Be Bobo: no shades, so your eyes show in the frame
  private hearts: Array<{ m: THREE.Mesh; v: THREE.Vector3; t: number; spin: number }> = [];
  private hopT = 1;
  private target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, fresh: false };
  // where it stood relative to the phone when we left the back camera (restored once tracking settles again)
  private rel: { fwd: number; side: number; yaw: number } | null = null;
  private placedOnce = false;
  private freshSelfie = false; // a new selfie since we last left the room view
  // HUD
  private placeBtn: HTMLButtonElement;
  private moveBtn: HTMLButtonElement;
  private flipBtn: HTMLButtonElement;
  private meetBtn: HTMLButtonElement;
  private thumb: HTMLImageElement;
  private thumbUrl: string | null = null;
  private guide: HTMLElement;
  private shutterBtn: HTMLButtonElement | null = null;
  private review: ReviewSheet;
  /** Which board: your selfie in Bobo's frame, or the life-size cutout a friend puts their face through. */
  private variant: Variant = 'frame';
  /** Choosing the cutout always lands in placing (size it, then Place), even across a camera flip. */
  private placeNext = false;
  private cutSize = CUT.def;
  private cutout = boboCutout();
  private variantBtn: HTMLButtonElement;
  private beside = new THREE.Group(); // Bobo's spot next to the frame
  private arm: { up: THREE.Object3D; fore: THREE.Object3D; hand: THREE.Object3D } | null = null;
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private frame: FrameStyle = 'hideout';
  private filter: PhotoFilter = 'natural';
  /** The last raw shot, kept while the review is open so a new frame / filter can recompose it. */
  private shot: HTMLImageElement | null = null;
  private reveal: RevealPlayer;
  private unbind: (() => void) | null = null;
  private hintT = 0;
  private lastReact = 0;
  // scratch
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camFwd = new THREE.Vector3();
  private ndc = new THREE.Vector2(0, -0.12);
  private box = new THREE.Box3();

  constructor(private ctx: ModeContext) {
    this.root.name = 'photo-root';
    this.root.visible = false;
    const hemi = new THREE.HemisphereLight(0xffffff, 0xc8a8bc, 1.25);
    const sun = new THREE.DirectionalLight(0xfff3e6, 1.7);
    sun.position.set(1.5, 3, 2);
    this.root.add(hemi, sun, this.anchor, this.reticle, this.faceAnchor);
    this.anchor.add(this.model);
    this.model.add(this.hop);
    this.hop.add(this.framed, this.cutout);
    this.cutout.visible = false;
    this.beside.name = 'photo-bobo-beside';
    this.beside.position.set(BESIDE.x, 0, BESIDE.z);
    this.beside.rotation.y = BESIDE.yaw;
    this.framed.add(this.beside);
    this.framed.position.x = -0.2; // frame + Bobo, centred on the spot
    this.anchor.visible = false;
    this.faceAnchor.add(this.fx.group);
    this.faceAnchor.visible = false;
    this.buildReticle();

    // the selfie plane in the frame opening (a placeholder until the first selfie, so its shader is compiled up front)
    this.selfieTex = placeholderTexture();
    this.selfieMat = new THREE.MeshBasicMaterial({ map: this.selfieTex, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(OPENING.x1 - OPENING.x0, OPENING.y1 - OPENING.y0), this.selfieMat);
    plane.position.set((OPENING.x0 + OPENING.x1) / 2, (OPENING.y0 + OPENING.y1) / 2, OPENING.z);
    plane.name = 'selfie-in-frame';
    this.framed.add(plane);
    // sparkles for the tap reaction: flat, opaque, EVADE yellow / white / cyan
    const hg = heartShape(0.09);
    const cols = [0xf6c344, 0xffffff, 0x4fd6e8];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: cols[i % 3], side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false;
      m.name = 'heart';
      this.framed.add(m);
      this.hearts.push({ m, v: new THREE.Vector3(), t: 9, spin: 0 });
    }

    const hud = ctx.hud;
    this.placeBtn = el('button', 'cbx-pill', 'Getting ready…');
    this.placeBtn.type = 'button';
    this.placeBtn.disabled = true;
    this.placeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.place(); });
    this.moveBtn = hud.toolButton({ label: 'Move', icon: ICON.move, aria: 'Move Bobo somewhere else', onClick: () => this.move() });
    this.placeBtn.dataset.cmd = 'place'; this.moveBtn.dataset.cmd = 'move'; // voice commands press these (../../commands.ts)
    this.variantBtn = hud.toolButton({ label: 'Cutout', icon: CUTOUT_ICON, aria: 'Use the Bobo cutout instead', tone: 'navy', onClick: () => void this.switchVariant(true) });
    this.flipBtn = hud.toolButton({ label: 'Selfie', icon: ICON.selfie, aria: 'Flip the camera for a new selfie', onClick: () => this.flipTo('face') });
    this.meetBtn = el('button', 'cbx-pill', 'Meet Bobo');
    this.meetBtn.type = 'button';
    this.meetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      askMotionPermission(); // iPhone: inside the tap, before anything async
      void this.flipTo('world');
    });
    this.thumb = el('img', 'cbc-thumb');
    this.thumb.alt = 'Your selfie';
    this.guide = el('div', 'cbc-guide');
    this.guide.setAttribute('aria-hidden', 'true');

    const name = 'bobo-3d-photo';
    const self = this;
    this.review = new ReviewSheet({
      container: ctx.container,
      name,
      title: 'Your 3D photo',
      share: { title: 'Bobo and me', text: 'A photo with Bobo from his hideout. EVADE' },
      onRetake: () => { this.dropShot(); this.toPlaced(); },
      styles: {
        frames: FRAME_STYLES, filters: PHOTO_FILTERS,
        get frame() { return self.frame; },
        get filter() { return self.filter; },
        restyle: async (frame, filter) => {
          if (!this.shot) throw new Error('no shot');
          const spec = this.spec(frame as FrameStyle, filter as PhotoFilter);
          return (await compose(this.shot, (g, w, h) => drawFrameArt(g, w, h, spec))).blob;
        },
        onChange: (blob, frame, filter) => {
          this.frame = frame as FrameStyle;
          this.filter = filter as PhotoFilter;
          this.diag.lastPhoto = blob;
        },
      },
    });
    this.reveal = new RevealPlayer(ctx.container, name);
  }

  private buildReticle(): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.17, 0.2, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 24),
      new THREE.MeshBasicMaterial({ color: 0xff389b, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
    );
    for (const m of [ring, dot]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = 3; }
    this.reticle.add(ring, dot);
    this.reticle.visible = false;
    this.reticle.name = 'photo-reticle';
  }

  // ------------------------------------------------------------------ Mode
  async load(): Promise<void> {
    void this.fx.load().catch(() => {}); // the can earrings stream in behind (Be Bobo uses none)
    const [scene] = await Promise.all([boboPhotoFrame(), loadFrameArt()]);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; }
    });
    // the frame is 1 unit tall, feet on y = 0, facing +z
    this.framed.add(scene);
  }

  onScene(_xr: XrScene): void {
    /* a new run has a new world origin: placement comes back relative to the phone (see rel) */
  }

  enter(_from: ExperienceMode | null): void {
    this.root.visible = true;
    this.applySize();
    this.unbind = bindGestures(this.ctx.engine.canvas, {
      onPinch: (k) => {
        if (this.cam !== 'world' || (this.state !== 'placing' && this.state !== 'placed')) return;
        if (this.variant === 'cutout') this.cutSize = THREE.MathUtils.clamp(this.cutSize * k, CUT.min, CUT.max);
        else this.size = THREE.MathUtils.clamp(this.size * k, SIZE.min, SIZE.max);
        this.applySize();
      },
    });
    if (!photoWelcomed) {
      // first time here this visit: "Welcome to photo mode", pick the frame or the cutout (Dapo, 2026-11-20)
      photoWelcomed = true;
      this.onCamera();
      void this.ctx.hud.sheet({ title: 'Welcome to photo mode', body: 'Two ways to take a photo with Bobo:', html: CHOICE_HTML(this.variant), buttons: ['Bobo’s frame', 'Life-size cutout'] })
        .then((i) => { if (i === 1 && this.variant !== 'cutout') void this.switchVariant(false); });
      return;
    }
    this.onCamera();
  }

  exit(_to: ExperienceMode): void {
    if (this.cam === 'world') this.remember();
    this.state = 'off';
    this.review.close();
    this.dropShot();
    this.reveal.close();
    this.returnBear();
    this.unbind?.();
    this.unbind = null;
    this.clearHud();
    this.root.visible = false;
    this.anchor.visible = false;
    this.reticle.visible = false;
    this.faceAnchor.visible = false;
    this.faceFound = false;
    this.ctx.hud.hint('');
    // next time: straight back to the room if you already have a selfie in the frame, else the selfie first
    this.cam = this.hasSelfie ? 'world' : 'face';
  }

  update(dt: number, now: number): void {
    const xr = this.ctx.engine.xr;
    if (!xr || this.state === 'off' || this.state === 'flipping') return;
    if (this.cam === 'face') {
      if (this.target.fresh) {
        const k = 1 - Math.exp(-dt * 30);
        this.faceAnchor.position.lerp(this.target.pos, k);
        this.faceAnchor.quaternion.slerp(this.target.quat, k);
        this.faceAnchor.scale.setScalar(this.faceAnchor.scale.x + (this.target.scale - this.faceAnchor.scale.x) * k);
      }
      this.fx.update(dt, this.ctx.reducedMotion);
      return;
    }
    const settled = this.ctx.engine.settled();
    const cam = xr.camera;
    if (this.state === 'placing') {
      const ok = settled && this.floorHit(cam);
      this.reticle.visible = ok;
      if (ok) {
        this.reticle.position.copy(this.hit);
        this.reticle.scale.setScalar(1 + Math.sin(now / 260) * (this.ctx.reducedMotion ? 0.01 : 0.05));
        if (!this.anchor.visible) this.anchor.position.copy(this.hit);
        else this.anchor.position.lerp(this.hit, 1 - Math.exp(-12 * dt));
        this.anchor.visible = true;
      }
      this.placeBtn.disabled = !ok;
      this.placeBtn.textContent = ok ? 'Place Bobo' : 'Getting ready…';
      this.ctx.hud.hint(settled ? 'Pinch to size, then Place' : 'Point at the floor');
    } else if (this.state === 'restoring') {
      if (settled) this.restore(cam);
    } else if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.ctx.hud.hint('');
    }
    // he turns to face you
    if (this.anchor.visible) {
      cam.getWorldPosition(this.camPos);
      const yaw = Math.atan2(this.camPos.x - this.anchor.position.x, this.camPos.z - this.anchor.position.z);
      let dy = yaw - this.anchor.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.anchor.rotation.y += dy * (1 - Math.exp(-(this.state === 'placing' ? 8 : 3) * dt));
    }
    this.animateReaction(dt);
    this.updateBear(dt);
  }

  onFace(ev: FaceEvent): void {
    if (ev.type === 'loading') { this.fx.meshLoading(ev.detail); return; }
    if (this.cam !== 'face') return;
    if (ev.type === 'found' || ev.type === 'updated') {
      const t = ev.detail?.transform;
      if (!t) return;
      this.target.pos.set(t.position.x, t.position.y, t.position.z);
      this.target.quat.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
      this.target.scale = t.scale ?? 1;
      this.target.fresh = true;
      this.fx.place(ev.detail?.attachmentPoints ?? null, ev.detail?.vertices);
      if (!this.faceFound) {
        this.faceFound = true;
        this.faceAnchor.position.copy(this.target.pos);
        this.faceAnchor.quaternion.copy(this.target.quat);
        this.faceAnchor.scale.setScalar(this.target.scale);
        this.faceAnchor.visible = true;
        this.fx.pop();
        if (this.state === 'selfie') this.selfieHint();
      }
    } else if (ev.type === 'lost') {
      this.faceFound = false;
      this.target.fresh = false;
      this.faceAnchor.visible = false;
      if (this.state === 'selfie') this.selfieHint();
    }
  }

  onTap(_x: number, _y: number, ndc: THREE.Vector2): boolean {
    if (this.cam !== 'world') return false;
    if (this.state === 'placing') {
      if (!this.placeBtn.disabled) this.place();
      return true;
    }
    if (this.state === 'placed' && this.hitsBear(ndc)) {
      this.react();
      return true;
    }
    return false;
  }

  trigger(name: string): boolean {
    if (this.cam !== 'world' || this.state !== 'placed') return false;
    if (!/^(wave|cheer|sparkle|magic|rainbow|party|dance|house|running|wakeup)$/i.test(name.replace(/\s+/g, ''))) return false;
    const t = performance.now();
    if (t - this.lastReact < 1200) return false;
    this.react();
    return true;
  }

  reset(): void {
    this.size = SIZE.def;
    this.cutSize = CUT.def;
    this.placeNext = false;
    this.setVariant('frame');
    this.applySize();
    this.rel = null;
    this.placedOnce = false;
    this.setSelfie(null);
    if (this.state !== 'off') {
      this.review.close();
      this.reveal.close();
      if (this.cam === 'world') void this.flipTo('face');
      else this.toSelfie();
    } else this.cam = 'face';
  }

  dispose(): void {
    this.exit('showcase');
    this.setSelfie(null);
    this.selfieTex.dispose();
  }

  // ------------------------------------------------------------------ cameras
  /** The camera has video: set up the step that goes with it. */
  private onCamera(): void {
    if (this.cam === 'face') this.toSelfie();
    else if (this.placeNext) { this.placeNext = false; this.toPlacing(); }
    else if (this.rel && this.placedOnce) this.toRestoring();
    else this.toPlacing();
  }

  /** Flip the camera inside the one engine session (xr-core's Engine.start: stop, swap tracker, run). From a tap. */
  private async flipTo(to: Cam): Promise<void> {
    if (this.state === 'off' || this.state === 'flipping' || this.state === 'busy' || this.cam === to) return;
    const engine = this.ctx.engine as SwapEngine;
    const hud = this.ctx.hud as CoverHud;
    if (!engine.start) return;
    if (this.cam === 'world') this.remember();
    const from = this.cam;
    this.state = 'flipping';
    this.clearHud();
    hud.hint('');
    hud.cover?.('Turning the camera round…');
    this.anchor.visible = false;
    this.reticle.visible = false;
    this.faceAnchor.visible = false;
    this.faceFound = false;
    this.target.fresh = false;
    this.cam = to; // before the run: the experience routes the new scene and face events by `camera`
    const t0 = performance.now();
    try {
      await engine.start(to);
      if (this.state !== 'flipping') return; // left the mode meanwhile
      this.diag.flips++;
      this.diag.flipMs.push(Math.round(performance.now() - t0));
      hud.cover?.(null);
      this.onCamera();
      if (to === 'world' && this.placedOnce) this.ctx.hud.toast(this.freshSelfie ? 'Your new selfie is in the frame' : 'Bobo is right where you left him', 1600);
      if (to === 'world') this.freshSelfie = false;
    } catch (e) {
      hud.cover?.(null);
      const msg = String((e as Error)?.message ?? e);
      this.diag.errors.push(msg);
      console.warn('[3d photo] camera flip failed', msg);
      if (this.state !== 'flipping') return;
      this.cam = from;
      this.state = 'off';
      // the camera stopped: back to the 3D view with a friendly word (the experience handles the switch)
      await this.ctx.setMode('showcase');
      void this.ctx.hud.sheet({
        title: 'The camera did not turn round',
        body: 'Your phone would not switch cameras just now. Try the Photo again in a moment.',
        buttons: ['OK'],
      });
    }
  }

  // ------------------------------------------------------------------ front camera: the selfie
  private toSelfie(): void {
    this.state = 'selfie';
    const hud = this.ctx.hud;
    this.clearHud();
    this.returnBear();
    this.showVariantBtn();
    this.anchor.visible = false;
    this.reticle.visible = false;
    if (!this.shutterBtn) this.shutterBtn = this.makeShutter();
    this.shutterBtn.disabled = false;
    this.shutterBtn.setAttribute('aria-label', 'Take your selfie for Bobo’s frame');
    hud.centre.appendChild(this.shutterBtn);
    hud.layer.appendChild(this.guide);
    this.drawGuide();
    this.showSelfieUi();
    this.selfieHint();
  }

  private selfieHint(): void {
    this.ctx.hud.hint(this.hasSelfie ? '' : this.faceFound ? 'Tap the shutter for your selfie' : 'Fit your face in the oval');
  }

  private showSelfieUi(): void {
    const hud = this.ctx.hud;
    if (this.hasSelfie) {
      this.meetBtn.textContent = this.placedOnce ? 'Back to Bobo' : 'Meet Bobo';
      hud.above.appendChild(this.meetBtn);
      hud.left.appendChild(this.thumb);
    } else {
      this.meetBtn.remove();
      this.thumb.remove();
    }
  }

  private async takeSelfie(): Promise<void> {
    if (this.state !== 'selfie') return;
    this.state = 'busy';
    if (this.shutterBtn) this.shutterBtn.disabled = true;
    try {
      flash(this.ctx.container, this.ctx.reducedMotion);
      const img = await engineShot(this.ctx.engine);
      if (this.state !== 'busy') return;
      const c = this.cropSelfie(img);
      img.src = '';
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
      if (this.state !== 'busy') return;
      this.setSelfie(c, blob);
      this.freshSelfie = true;
      this.diag.selfies++;
      this.diag.lastSelfie = blob;
      this.state = 'selfie';
      if (this.shutterBtn) this.shutterBtn.disabled = false;
      this.showSelfieUi();
      this.selfieHint();
      this.ctx.hud.toast(this.placedOnce ? 'New selfie in the frame' : 'Selfie saved', 1400);
    } catch (e) {
      console.warn('[3d photo] selfie failed', e);
      this.ctx.hud.toast('That selfie did not work. Try again?', 2200);
      this.state = 'selfie';
      if (this.shutterBtn) this.shutterBtn.disabled = false;
    }
  }

  /** Cut the selfie round your head (ears included) in the frame opening's shape, as you saw it on screen. */
  private cropSelfie(img: HTMLImageElement): HTMLCanvasElement {
    const W = img.naturalWidth, H = img.naturalHeight;
    let cx = W / 2, cy = H * 0.42, ch = H * 0.5;
    const xr = this.ctx.engine.xr;
    let how = 'oval';
    if (xr && this.faceFound) {
      const cam = xr.camera;
      cam.updateMatrixWorld();
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      this.faceAnchor.updateMatrixWorld(true);
      const toPx = (p: THREE.Vector3) => { p.project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
      const c0 = toPx(this.faceAnchor.localToWorld(this.v.set(0, 0.06, 0)));
      const c1 = toPx(this.faceAnchor.localToWorld(this.w.set(0, 1.06, 0)));
      const fu = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]); // pixels per face unit
      if (fu > 4 && c0[0] > -W * 0.2 && c0[0] < W * 1.2 && c0[1] > -H * 0.2 && c0[1] < H * 1.2) {
        cx = c0[0];
        cy = c0[1];
        ch = fu * 2.7; // chin (-1) to ear tops (+1.05) with a little room
        how = 'face';
      }
    } else {
      // the guide oval, in photo pixels
      const box = this.ctx.container.getBoundingClientRect();
      const o = this.ovalRect(box.width, box.height);
      const k = W / Math.max(1, box.width);
      cx = (o.x + o.w / 2) * k;
      cy = (o.y + o.h / 2) * k;
      ch = o.h * 1.25 * k;
    }
    let cw = ch * OPEN_ASPECT;
    const fit = Math.min(1, W / cw, H / ch);
    cw *= fit;
    ch *= fit;
    const sx = THREE.MathUtils.clamp(cx - cw / 2, 0, W - cw), sy = THREE.MathUtils.clamp(cy - ch / 2, 0, H - ch);
    this.diag.selfieCrop = `${how} ${Math.round(sx)},${Math.round(sy)} ${Math.round(cw)}x${Math.round(ch)} of ${W}x${H}`;
    const c = document.createElement('canvas');
    c.width = SELFIE_PX.w;
    c.height = SELFIE_PX.h;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, cw, ch, 0, 0, c.width, c.height);
    return c;
  }

  private setSelfie(c: HTMLCanvasElement | null, blob?: Blob | null): void {
    if (this.thumbUrl) URL.revokeObjectURL(this.thumbUrl);
    this.thumbUrl = null;
    const old = this.selfieMat.map;
    if (!c) {
      this.hasSelfie = false;
      if (old && old !== this.selfieTex) old.dispose();
      this.selfieMat.map = this.selfieTex;
      this.thumb.removeAttribute('src');
      return;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.selfieMat.map = t; // same kind of texture, same program: no recompile
    if (old && old !== this.selfieTex) old.dispose();
    this.hasSelfie = true;
    if (blob) {
      this.thumbUrl = URL.createObjectURL(blob);
      this.thumb.src = this.thumbUrl;
    }
  }

  /** The guide oval (CSS pixels): about two thirds of the width, a little above the middle. */
  private ovalRect(W: number, H: number): { x: number; y: number; w: number; h: number } {
    const h = Math.min(H * 0.46, (W * 0.64) / 0.78);
    const w = h * 0.78;
    return { x: (W - w) / 2, y: H * 0.42 - h / 2, w, h };
  }

  private drawGuide(): void {
    const box = this.ctx.container.getBoundingClientRect();
    const W = Math.round(box.width), H = Math.round(box.height);
    const o = this.ovalRect(W, H);
    const rx = o.w / 2, ry = o.h / 2, cx = o.x + rx, cy = o.y + ry;
    const oval = `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0z`;
    this.guide.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">` +
      `<path d="M0,0H${W}V${H}H0z ${oval}" fill="rgba(8,8,10,0.32)" fill-rule="evenodd"/>` +
      `<path d="${oval}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 9" stroke-linecap="round"/></svg>`;
  }

  // ------------------------------------------------------------------ back camera: place, react, shoot
  private toPlacing(): void {
    this.state = 'placing';
    this.anchor.visible = false;
    this.reticle.visible = false;
    const hud = this.ctx.hud;
    this.clearHud();
    this.placeBtn.disabled = true; // the frame loop enables it once the reticle is on the floor
    this.placeBtn.textContent = 'Getting ready…';
    hud.centre.appendChild(this.placeBtn);
    if (this.variant === 'frame') hud.left.appendChild(this.flipBtn);
    this.showVariantBtn();
    hud.hint('Point at the floor');
  }

  private toRestoring(): void {
    this.state = 'restoring';
    this.anchor.visible = false;
    this.clearHud();
    this.ctx.hud.left.appendChild(this.flipBtn);
    this.ctx.hud.hint('Hold still a moment');
  }

  /** Put it back where it stood relative to the phone, once world tracking has settled in this run. */
  private restore(cam: THREE.Camera): void {
    const r = this.rel;
    if (!r) { this.toPlacing(); return; }
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camFwd).setY(0);
    if (this.camFwd.lengthSq() < 1e-6) this.camFwd.set(0, 0, -1);
    this.camFwd.normalize();
    const side = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
    this.anchor.position.copy(this.camPos).addScaledVector(this.camFwd, r.fwd).addScaledVector(side, r.side).setY(0);
    const camYaw = Math.atan2(this.camFwd.x, this.camFwd.z);
    this.anchor.rotation.set(0, camYaw + r.yaw, 0);
    this.diag.restored++;
    this.toPlaced();
    this.ctx.hud.hint('');
  }

  /** Remember where it stands relative to the phone (we are leaving the back camera). */
  private remember(): void {
    const xr = this.ctx.engine.xr;
    if (!xr || !this.placedOnce || (this.state !== 'placed' && this.state !== 'review' && this.state !== 'busy' && this.state !== 'placing')) return;
    const cam = xr.camera;
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camFwd).setY(0);
    if (this.camFwd.lengthSq() < 1e-6) this.camFwd.set(0, 0, -1);
    this.camFwd.normalize();
    const side = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
    const d = this.v.copy(this.anchor.position).sub(this.camPos).setY(0);
    const camYaw = Math.atan2(this.camFwd.x, this.camFwd.z);
    this.rel = { fwd: d.dot(this.camFwd), side: d.dot(side), yaw: this.anchor.rotation.y - camYaw };
  }

  private place(): void {
    if (this.state !== 'placing' || this.placeBtn.disabled || !this.reticle.visible) return;
    this.diag.placedCount++;
    this.placedOnce = true;
    this.reticle.visible = false;
    this.anchor.position.copy(this.hit);
    this.toPlaced();
    this.ctx.hud.hint(this.variant === 'cutout' ? 'Stand behind it, face in the oval, then snap' : 'Tap Bobo, then snap');
    this.hintT = this.variant === 'cutout' ? 7 : 4;
    this.react();
  }

  private toPlaced(): void {
    if (this.state === 'off') return;
    this.state = 'placed';
    const hud = this.ctx.hud;
    this.clearHud();
    if (!this.shutterBtn) this.shutterBtn = this.makeShutter();
    this.shutterBtn.disabled = false;
    this.shutterBtn.setAttribute('aria-label', 'Take a photo with Bobo. Hold to record a video');
    hud.centre.appendChild(this.shutterBtn);
    // bottom left, always there once placed (the slot stacks bottom-up: Move at the bottom, Selfie above it)
    hud.left.append(this.moveBtn);
    if (this.variant === 'frame') hud.left.append(this.flipBtn);
    this.showVariantBtn();
    this.anchor.visible = true;
  }

  private move(): void {
    if (this.state !== 'placed') return;
    this.diag.moved++;
    this.toPlacing();
    this.anchor.visible = true; // keep showing it while you look for a new spot
  }

  /** One shutter for both cameras; in the room, press and hold records a video with the frame's lockup on it. */
  private makeShutter(): HTMLButtonElement {
    return this.ctx.hud.shutter(() => this.onShutter(), 'Take a photo', clipHold({
      can: () => this.cam === 'world' && this.state === 'placed',
      options: () => ({
        overlay: (g, w, h) => drawFrameArt(g, w, h, { ...this.spec(this.frame, this.filter), filter: undefined }),
        filter: FILTER_CSS[this.filter].filter, tint: FILTER_CSS[this.filter].tint,
      }),
      onStart: () => { this.state = 'recording'; this.ctx.hud.hint(''); },
      onDone: (blob) => {
        if ((this.state as string) !== 'recording') return;
        if (!blob) { this.ctx.hud.toast('Hold a little longer for a video', 2000); this.toPlaced(); return; }
        this.state = 'review';
        this.review.show(blob);
      },
    }));
  }

  private onShutter(): void {
    if (this.cam === 'face') void this.takeSelfie();
    else void this.shoot();
  }

  private async shoot(): Promise<void> {
    if (this.state !== 'placed') return;
    this.state = 'busy';
    if (this.shutterBtn) this.shutterBtn.disabled = true;
    try {
      flash(this.ctx.container, this.ctx.reducedMotion);
      const img = await engineShot(this.ctx.engine);
      if (this.state !== 'busy') return;
      const spec = this.spec(this.frame, this.filter);
      const { blob } = await compose(img, (g, w, h) => drawFrameArt(g, w, h, spec));
      this.dropShot();
      this.shot = img;
      if (this.state !== 'busy') return;
      this.diag.shots++;
      this.diag.lastPhoto = blob;
      this.ctx.capture(blob);
      this.state = 'review';
      this.review.show(blob);
    } catch (e) {
      console.warn('[3d photo] failed', e);
      this.ctx.hud.toast('That photo did not work. Try again?', 2200);
      this.toPlaced();
    }
  }

  private spec(frame: FrameStyle, filter: PhotoFilter): FrameSpec {
    return { title: true, titleWidth: 0.3, titleAt: 'bottom-left', frame, filter };
  }

  private dropShot(): void {
    if (this.shot) this.shot.src = '';
    this.shot = null;
  }

  private applySize(): void {
    this.model.scale.setScalar(this.variant === 'cutout' ? this.cutSize : this.size);
  }

  private showVariantBtn(): void {
    const cut = this.variant === 'cutout';
    const lbl = this.variantBtn.querySelector('span:last-child, .lbl');
    if (lbl) lbl.textContent = cut ? 'Frame' : 'Cutout';
    this.variantBtn.setAttribute('aria-label', cut ? 'Use Bobo’s photo frame instead' : 'Use the Bobo cutout instead');
    this.ctx.hud.right.appendChild(this.variantBtn);
  }

  private setVariant(v: Variant): void {
    this.variant = v;
    this.cutout.visible = v === 'cutout';
    this.framed.visible = v === 'frame';
    if (v === 'cutout') this.returnBear();
    this.applySize();
  }

  /** Frame <-> Cutout. The cutout needs no selfie: straight to the back camera. The frame needs one first. */
  private async switchVariant(ask: boolean): Promise<void> {
    if (this.state === 'busy' || this.state === 'flipping' || this.state === 'off') return;
    const to: Variant = this.variant === 'cutout' ? 'frame' : 'cutout';
    if (ask) {
      // say what each one is at the moment you choose (the chooser marks the one you're on)
      const i = await this.ctx.hud.sheet({ title: 'Frame or cutout?', body: '', html: CHOICE_HTML(this.variant), buttons: to === 'cutout' ? ['Use the cutout', 'Keep the frame'] : ['Use the frame', 'Keep the cutout'] });
      if (i !== 0 || (this.state as string) === 'busy' || (this.state as string) === 'flipping' || (this.state as string) === 'off') return;
    }
    this.setVariant(to);
    if (to === 'cutout') this.placeNext = true;
    if (to === 'cutout' && this.cam === 'face') { askMotionPermission(); await this.flipTo('world'); return; }
    if (to === 'cutout' && this.cam === 'world' && (this.state === 'placed' || this.state === 'placing' || this.state === 'restoring')) {
      // straight into placing with the standee shown where it stands: pinch to size, then Place
      this.placeNext = false;
      const shown = this.state === 'placed';
      this.toPlacing();
      this.anchor.visible = shown;
      this.ctx.hud.hint('Pinch to size the cutout, then Place');
      return;
    }
    if (to === 'frame' && this.cam === 'world' && !this.hasSelfie) { await this.flipTo('face'); return; }
    if (this.state === 'placed') {
      this.toPlaced();
      this.ctx.hud.hint(to === 'cutout' ? 'Stand behind it, face in the oval, then snap' : 'Tap Bobo, then snap');
      this.hintT = 6;
    }
    else if (this.state === 'placing') this.toPlacing();
    else if (this.state === 'selfie') this.showVariantBtn();
  }

  // ------------------------------------------------------------------ Bobo beside the frame
  private borrowBear(): void {
    const bear = this.ctx.bear;
    if (!bear || bear.object.parent === this.beside) return;
    bear.object.parent?.remove(bear.object);
    const o = bear.object;
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(BESIDE.h / (bear.height || 1));
    o.userData.cbxOwnGpu = !!bear.releaseRenderer;
    this.beside.add(o);
    const up = o.getObjectByName('RightArm'), fore = o.getObjectByName('RightForeArm'), hand = o.getObjectByName('RightHand');
    this.arm = up && fore && hand ? { up, fore, hand } : null;
    (bear as { setIdleStyle?: (s: 'front' | 'roam') => void }).setIdleStyle?.('front'); // no looking around beside the frame
    bear.play('idle', { fade: 0.2 });
  }

  private returnBear(): void {
    const bear = this.ctx.bear;
    if (bear && bear.object.parent === this.beside) this.beside.remove(bear.object);
    this.arm = null;
  }

  private updateBear(dt: number): void {
    if (this.cam !== 'world' || this.variant !== 'frame' || !this.anchor.visible) return;
    const bear = this.ctx.bear;
    if (!bear) return;
    if (bear.object.parent !== this.beside) this.borrowBear();
    bear.lookAt(this.camPos);
    bear.update(dt);
    this.holdEdge();
  }

  /** After the clip: his right arm reaches for the frame's edge (aim the upper arm, then the forearm, at the grip). */
  private holdEdge(): void {
    const a = this.arm;
    if (!a) return;
    this.beside.updateWorldMatrix(true, true);
    const grip = this.framed.localToWorld(this.v3.copy(BESIDE.grip));
    // two-bone reach: the hand lands ON the grip with the elbow bent down and back (aiming both bones straight at
    // the grip overshot it, so the hand and sleeve went through the frame)
    const S = a.up.getWorldPosition(new THREE.Vector3());
    const E0 = a.fore.getWorldPosition(new THREE.Vector3());
    const H0 = a.hand.getWorldPosition(new THREE.Vector3());
    const l1 = E0.distanceTo(S), l2 = H0.distanceTo(E0);
    const toT = grip.clone().sub(S);
    const d = Math.min(toT.length(), (l1 + l2) * 0.999);
    const dir = toT.normalize();
    if (d < l1 + l2 - 1e-4 && d > Math.abs(l1 - l2)) {
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(this.beside.getWorldQuaternion(this.q2));
      const pole = new THREE.Vector3(0, -1, 0).add(back.multiplyScalar(0.6));
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const elbow = S.clone().addScaledVector(dir, along).addScaledVector(pole, h);
      this.aim(a.up, a.fore, elbow);
    } else this.aim(a.up, a.fore, grip);
    this.aim(a.fore, a.hand, grip);
  }

  private aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
    if (!bone.parent) return;
    bone.updateWorldMatrix(true, true);
    const p = bone.getWorldPosition(this.v1);
    const d0 = child.getWorldPosition(this.v2).sub(p).normalize();
    const d1 = target.clone().sub(p).normalize();
    const delta = this.q1.setFromUnitVectors(d0, d1);
    const world = bone.getWorldQuaternion(this.q2).premultiply(delta);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parentQ.multiply(world));
    bone.updateWorldMatrix(false, true);
  }

  /** A happy hop with a little squash, and sparkles out of the frame. */
  private react(): void {
    this.lastReact = performance.now();
    this.diag.reactions++;
    this.hopT = 0;
    const bear = this.ctx.bear;
    if (bear && bear.object.parent === this.beside) bear.play('cheer', { once: true, fade: 0.2 });
    const reduced = this.ctx.reducedMotion;
    this.hearts.forEach((h, i) => {
      const a = (i / this.hearts.length) * Math.PI * 2;
      h.t = reduced ? 0.6 : i * 0.05;
      h.m.position.set(0.18 + Math.cos(a) * 0.06, 0.66 + Math.sin(a) * 0.06, OPENING.z + 0.08);
      h.v.set(Math.cos(a) * 0.25, 0.45 + Math.random() * 0.25, 0.1 + Math.random() * 0.1);
      h.spin = (Math.random() - 0.5) * 3;
      h.m.scale.setScalar(0.001);
      h.m.visible = true;
    });
  }

  private animateReaction(dt: number): void {
    const reduced = this.ctx.reducedMotion;
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / 0.7);
      const t = this.hopT;
      const up = reduced ? 0 : Math.sin(Math.min(1, t / 0.75) * Math.PI) * 0.09;
      // squash before the jump and on landing, stretch in the air
      const squash = reduced ? 0 : t < 0.12 ? -Math.sin((t / 0.12) * Math.PI) * 0.06 : t > 0.82 ? -Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.05 : Math.sin(((t - 0.12) / 0.7) * Math.PI) * 0.03;
      this.hop.position.y = up;
      this.hop.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
      this.hop.rotation.z = reduced ? 0 : Math.sin(t * Math.PI * 2) * 0.05 * (1 - t);
    }
    for (const h of this.hearts) {
      if (!h.m.visible) continue;
      h.t += dt;
      const life = 1.3;
      if (h.t <= 0) continue;
      if (h.t > life) { h.m.visible = false; continue; }
      h.m.position.addScaledVector(h.v, dt);
      h.v.y -= 0.15 * dt;
      h.m.rotation.z += h.spin * dt;
      const k = h.t / life;
      h.m.scale.setScalar(Math.max(0.001, k < 0.2 ? k / 0.2 : k > 0.75 ? (1 - k) / 0.25 : 1));
    }
  }

  // ------------------------------------------------------------------ helpers
  private clearHud(): void {
    this.placeBtn.remove();
    this.moveBtn.remove();
    this.flipBtn.remove();
    this.meetBtn.remove();
    this.thumb.remove();
    this.guide.remove();
    this.shutterBtn?.remove();
    this.variantBtn.remove();
  }

  private hitsBear(ndc: THREE.Vector2): boolean {
    const board = this.variant === 'cutout' ? this.cutout : this.framed;
    board.updateMatrixWorld(true);
    this.box.setFromObject(board);
    return this.ctx.engine.ray(ndc).ray.intersectsBox(this.box);
  }

  private floorHit(cam: THREE.Camera): boolean {
    const r = this.ctx.engine.ray(this.ndc);
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camFwd).setY(0);
    if (this.camFwd.lengthSq() < 1e-6) this.camFwd.set(0, 0, -1);
    this.camFwd.normalize();
    const got = r.ray.intersectPlane(this.plane, this.hit);
    let d = REACH.max;
    if (got) d = this.v.copy(this.hit).sub(this.camPos).setY(0).length();
    d = THREE.MathUtils.clamp(d, REACH.min, REACH.max);
    const side = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
    const off = got ? THREE.MathUtils.clamp(this.v.dot(side), -1, 1) : 0;
    this.hit.copy(this.camPos).addScaledVector(this.camFwd, d).addScaledVector(side, off).setY(0);
    return true;
  }
}

/** The frame before the first selfie: flat EVADE slate with a simple "you" figure (no gradients). */
function placeholderTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = SELFIE_PX.w;
  c.height = SELFIE_PX.h;
  const g = c.getContext('2d')!;
  const W = c.width, H = c.height;
  g.fillStyle = '#1b2a35';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#4fd6e8';
  g.beginPath();
  g.arc(W / 2, H * 0.4, W * 0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(W / 2, H * 0.98, W * 0.36, H * 0.3, 0, Math.PI, 0);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMode(ctx: ModeContext): Mode {
  return new PhotoMode(ctx);
}
export default createMode;

let photoWelcomed = false;

const FRAME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="15" rx="1.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M7.5 15.5c1-2.2 2.7-3 4.5-3s3.5.8 4.5 3M9 18l-2 4M15 18l2 4"/></g></svg>';

/** The two photo styles side by side, each with a one-line "how": the welcome and the Frame/Cutout chooser. */
const CHOICE_HTML = (cur: 'frame' | 'cutout') => `<div class="ph-choice">
  <div class="ph-card${cur === 'frame' ? ' on' : ''}"><span class="ph-ic">${FRAME_ICON}</span><b>Bobo’s frame</b><span>Take a selfie, then it stands in a big frame in your room with Bobo beside it. Great on your own.</span></div>
  <div class="ph-card${cur === 'cutout' ? ' on' : ''}"><span class="ph-ic">${CUTOUT_ICON}</span><b>Life-size cutout</b><span>Place a life-size Bobo board. A friend puts their face in the hole and you snap them as Bobo.</span></div>
</div>`;

const CUTOUT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 22V9.5L7 3l3 4h4l3-4 2 6.5V22z"/><ellipse cx="12" cy="12" rx="3" ry="3.8" fill="currentColor"/></g></svg>';
