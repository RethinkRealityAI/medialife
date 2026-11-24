// Selfie with Bobo (front camera, face effects).
//
//   live      Bobo Booth's wearables on your face (face-fx.ts / wearables.ts: the cat hat, Bobo shades, Eclipse can
//             earrings, nose rings, face paint) in one of four looks picked above the frame + filter chips. Bobo
//             himself (the shared rigged model, borrowed from the stages) stands small in the bottom-left corner: an
//             OVERLAY, drawn last after a depth clear, so he is always in front of you. He says hello, reacts to your
//             face (smile, mouth wide, wink, eyebrows up, head tilt; gated, see signals.ts) and cheers for the photo.
//             The Bobo button (bottom right) hides / shows him. Shutter: a visible 5 s countdown, a second tap shoots
//             at once; hold it for a video with the frame and filter baked in.
//   smile     optional "Smile" switch (bottom left, off by default): a held smile starts the shot.
//   review    camera + 3D + the frame art in one JPEG (the selfie is the mirror image you saw; the art is never
//             mirrored): Save / Share / Retake.
import * as THREE from 'three';
import type { BearClip, BearExpression, ExperienceMode } from '../../../shared/contracts';
import type { FaceEvent, Mode, ModeContext, XrScene } from '../../types';
import {
  BtsPlayer, CICON, Countdown, RevealPlayer, ReviewSheet, chromaMaterial, compose, engineShot, flash, el, segmented,
} from '../../capture';
import { styleStrip, FILTER_CSS, type StyleStrip } from '../../capture/style-strip';
import { clipHold } from '../../capture/recorder';
import { drawFrameArt, loadFrameArt, type FrameStyle, type PhotoFilter } from '../../capture/frame-art';
import { shutterSound } from '../../capture/sounds';
import { FaceFx, FX_LOOKS, type FxLook } from './face-fx';
import { FaceSignals, type FaceCue } from './signals';

const COUNTDOWN_S = 5;
const SMILE_COUNTDOWN_S = 3;
/** She holds her last pose this long before "Smile!" (the clip ends on her wink + peace sign). */
const CLIP_HOLD_MS = 250;
/** Classic, after her pose: "Smile!" for this long, then 3, 2, 1. */
const CLASSIC_LEAD_S = 1.1;
const CLASSIC_COUNT_S = 3;
/** Draw order of the 3D bear: after everything else, behind a depth clear. */
const OVERLAY_ORDER = 1000;

type State = 'off' | 'live' | 'countdown' | 'clip' | 'busy' | 'review' | 'recording';
type Look = FxLook;

// trigger words -> what the selfie bear does
const REACT: Record<string, BearClip> = {
  wave: 'wave', dance: 'dance', party: 'dance', cold: 'shiver',
  cheer: 'cheer', sparkle: 'cheer', magic: 'cheer', rainbow: 'cheer', house: 'cheer', running: 'cheer', wakeup: 'cheer',
};

const BOBO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11 4.5 3.5 9.5 7M19 11l.5-7.5L14.5 7"/><path d="M4.5 13a7.5 6.5 0 0 0 15 0 7.5 6.5 0 0 0-15 0Z"/><path d="M9.5 12v1M14.5 12v1M11 15.5h2M2 14h3M19 14h3"/></svg>';
const SMILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"/><path d="M9 9.5v.5M15 9.5v.5"/></svg>';

export class FaceMode implements Mode {
  readonly id = 'face' as ExperienceMode;
  readonly camera = 'face' as const;
  readonly root = new THREE.Group();
  state: State = 'off';
  look: Look = 'full';
  faceFound = false;
  smileSnap = false;
  /** Test hooks. */
  readonly diag = {
    shots: 0, clips: 0, lastPhoto: null as Blob | null, faceEvents: 0, soundPrimed: false,
    clipPlays: 0, clipEnds: 0, clipAutoShots: 0, clipBlocked: 0, clipMuted: false, clipT: 0, clipCounts: 0,
    reactions: {} as Record<string, number>, expression: 'neutral' as BearExpression, smileShots: 0,
    overlayClears: 0, attachmentKeys: [] as string[],
  };
  readonly signals: FaceSignals;

  private cam = new THREE.Group(); // follows the engine camera: screen-anchored things
  private anchor = new THREE.Group(); // follows the face
  private fx = new FaceFx({ look: 'full' });
  private bearHolder = new THREE.Group();
  private clipQuad: THREE.Mesh;
  private clipMat: THREE.ShaderMaterial;
  private video: HTMLVideoElement;
  private videoTex: THREE.VideoTexture;
  private target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, fresh: false };
  // HUD
  private overlay: HTMLCanvasElement;
  private shutterBtn: HTMLButtonElement | null = null;
  private picker: { el: HTMLElement; set(id: string): void };
  /** The live frame + filter chips above the shutter (Dapo, 2026-11-20: pick them while framing, not after). */
  private strip: StyleStrip;
  private tint: HTMLElement;
  private smileBtn: HTMLButtonElement;
  /** Show the 3D Bobo beside you (the Bobo on/off button, bottom right). */
  private showBobo = true;
  private boboBtn: HTMLButtonElement;
  private tapPlay: HTMLButtonElement;
  private countdown: Countdown | null = null;
  private review: ReviewSheet;
  private reveal: RevealPlayer;
  private bts: BtsPlayer;
  private clipTimer = 0;
  private clipWatch = 0;
  private cheered = false;
  private lastReact = 0;
  private resizeObs: ResizeObserver | null = null;
  private frame: FrameStyle = 'hideout';
  private filter: PhotoFilter = 'natural';
  /** The last raw shot (camera + 3D), kept while the review sheet is open so a new frame / filter can recompose it. */
  private shot: HTMLImageElement | null = null;
  private wp = new THREE.Vector3();
  private unprime: (() => void) | null = null;
  private lastPhoto: Blob | null = null;
  // the bear's live reactions
  private headBone: THREE.Object3D | null = null;
  private tilt = 0;
  private bounce = 0; // 0..1 decaying "beam" bounce
  private recoil = 0; // 0..1 decaying "gasp" recoil
  private smileHeldAt = 0;
  private smileArmed = true;
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v1 = new THREE.Vector3();

  constructor(private ctx: ModeContext) {
    this.root.name = 'face-root';
    this.root.visible = false;
    // the stages' two lights, so the borrowed bear's shaders are the ones already compiled (no recompile on enter)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xc8a8bc, 1.25);
    const sun = new THREE.DirectionalLight(0xfff3e6, 1.7);
    sun.position.set(0.6, 1.4, 1.2);
    this.root.add(hemi, sun, this.cam, this.anchor);
    this.anchor.add(this.fx.group);
    this.anchor.visible = false;
    this.bearHolder.name = 'face-bear';
    this.cam.add(this.bearHolder);
    this.signals = new FaceSignals((c) => this.onCue(c));

    // The 3D bear is a layer in front of the camera AND your face: everything else draws first (render order), then
    // this invisible triangle clears the depth buffer, then the bear (render order OVERLAY_ORDER) draws on top. The
    // face effects keep their own occlusion against the head occluder; the bear ignores it.
    const clear = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }),
    );
    clear.name = 'bear-depth-clear';
    clear.frustumCulled = false;
    clear.renderOrder = OVERLAY_ORDER - 1;
    clear.onBeforeRender = (renderer) => {
      renderer.state.buffers.depth.setMask(true);
      renderer.clearDepth();
      this.diag.overlayClears++;
    };
    this.bearHolder.add(clear);

    // the Classic clip: a camera-facing quad, keyed in the shader (compiled with the root at engine start)
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    v.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    this.video = v;
    this.videoTex = new THREE.VideoTexture(v);
    this.videoTex.minFilter = THREE.LinearFilter;
    this.videoTex.generateMipmaps = false;
    this.clipMat = chromaMaterial(this.videoTex, { texel: [1 / 720, 1 / 1280] }); // wink.mp4 is 720x1280
    this.clipQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.clipMat);
    this.clipQuad.renderOrder = 100;
    this.clipQuad.frustumCulled = false;
    this.clipQuad.visible = false;
    this.clipQuad.name = 'classic-clip';
    this.cam.add(this.clipQuad);

    this.overlay = el('canvas', 'cbc-overlay');
    this.overlay.setAttribute('aria-hidden', 'true');
    // choosing Classic is a tap: the clip starts (with sound) inside it
    this.picker = segmented('Selfie look', FX_LOOKS.map((l) => ({ id: l.id, label: l.short })), this.look, (id) => this.setLook(id as Look, true));
    this.picker.el.classList.add('cbc-seg-looks');
    this.strip = styleStrip(this.frame, this.filter, (frame, filter) => {
      this.frame = frame;
      this.filter = filter;
      this.drawOverlay();
      this.liveFilter();
    });
    this.tint = el('div', 'cbc-tint');
    this.tint.setAttribute('aria-hidden', 'true');
    this.smileBtn = ctx.hud.toolButton({ label: 'Smile', icon: SMILE_ICON, aria: 'Smile to take the photo', onClick: () => this.toggleSmileSnap() });
    this.smileBtn.setAttribute('aria-pressed', 'false');
    this.smileBtn.classList.add('cbc-toggle');
    this.boboBtn = ctx.hud.toolButton({ label: 'Bobo', icon: BOBO_ICON, aria: 'Show Bobo beside you', tone: 'orange', onClick: () => this.toggleBobo() });
    this.boboBtn.setAttribute('aria-pressed', 'true');
    this.boboBtn.classList.add('cbc-toggle', 'on');
    this.tapPlay = el('button', 'cbc-tapplay', `${CICON.play}<span>Tap to play</span>`);
    this.tapPlay.type = 'button';
    this.tapPlay.setAttribute('aria-label', 'Play the video');
    this.tapPlay.addEventListener('click', (e) => { e.stopPropagation(); this.playClip(); });

    const name = 'bobo-selfie';
    this.review = new ReviewSheet({
      container: ctx.container,
      name,
      title: 'Your selfie',
      share: { title: 'Me and Bobo', text: 'My selfie with Bobo in his hideout. EVADE' },
      onRetake: () => { this.dropShot(); this.toLive(false); },
    });
    this.reveal = new RevealPlayer(ctx.container, name);
    this.bts = new BtsPlayer(ctx.container);
  }

  // ------------------------------------------------------------------ Mode
  async load(): Promise<void> {
    // the tap on "Selfie" lets the Classic clip play with sound when the mode opens in Classic (iOS: play unmuted +
    // pause inside the tap unlocks this element)
    const onClick = (e: Event) => {
      const t = (e.target as HTMLElement | null)?.closest?.('[data-mode="face"]');
      void t;
    };
    this.ctx.container.addEventListener('click', onClick, true);
    this.unprime = () => this.ctx.container.removeEventListener('click', onClick, true);
    // the Eclipse can (for the can earrings) streams in behind; the rest is built in code and is on at once
    void this.fx.load().catch((e) => console.warn('[selfie] wearables failed', e));
    await loadFrameArt();
  }

  onScene(_xr: XrScene): void {
    /* root is re-added by the engine; everything follows the camera / face each frame */
  }

  enter(_from: ExperienceMode | null): void {
    this.root.visible = true;
    this.anchor.visible = false;
    this.faceFound = false;
    this.signals.reset();
    const hud = this.ctx.hud;
    this.countdown = new Countdown(hud.layer, this.ctx.reducedMotion);
    hud.layer.append(this.tint, this.overlay);
    this.drawOverlay();
    this.liveFilter();
    this.resizeObs = new ResizeObserver(() => this.drawOverlay());
    this.resizeObs.observe(this.ctx.container);
    this.borrowBear();
    this.state = 'live';
    this.toLive(true);
  }

  exit(_to: ExperienceMode): void {
    this.state = 'off';
    this.stopClip();
    this.countdown?.dispose();
    this.countdown = null;
    this.review.close();
    this.dropShot();
    this.reveal.close();
    this.bts.close();
    this.shutterBtn?.remove();
    this.shutterBtn = null;
    this.picker.el.remove();
    this.strip.el.remove();
    this.tint.remove();
    this.liveFilter(true);
    this.smileBtn.remove();
    this.boboBtn.remove();
    this.tapPlay.remove();
    this.overlay.remove();
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.setExpression('neutral');
    this.returnBear();
    this.root.visible = false;
    this.anchor.visible = false;
    this.ctx.hud.hint('');
  }

  update(dt: number): void {
    const xr = this.ctx.engine.xr;
    if (!xr || this.state === 'off') return;
    const cam = xr.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(this.cam.position);
    cam.getWorldQuaternion(this.cam.quaternion);
    const P = cam.projectionMatrix.elements;
    const tanY = 1 / (P[5] || 1), tanX = 1 / (P[0] || 1);

    if (this.clipQuad.visible) {
      // the 9:16 clip at 1 m, full screen height: covers a phone held upright (narrower than 9:16); on a wider
      // screen (tablet, landscape) it fits the height so she stays whole and the keyed camera shows at the sides
      const hh = tanY, a = 9 / 16;
      const h = 2 * hh, w = h * a;
      this.clipQuad.position.set(0, 0, -1);
      this.clipQuad.scale.set(w, h, 1);
      this.diag.clipT = +this.video.currentTime.toFixed(2);
    }

    // the 3D bear: big, bottom left, peeking in beside you (like the old art), turned towards the middle
    if (this.bearHolder.visible) {
      const d = 1.3, hh = d * tanY, hw = d * tanX;
      // small, in the bottom-left corner beside the shutter, so he never covers you (Dapo, round 3)
      const H = hh * Math.min(0.66, (hw / hh) * 1.25);
      const top = -hh + 0.22 * hh + H; // feet just above the dock
      // live reactions: a little bounce when he beams, a small step back when he gasps, a lean with your tilt
      const kb = 1 - Math.exp(-dt * 3.2);
      this.bounce -= this.bounce * kb;
      this.recoil -= this.recoil * (1 - Math.exp(-dt * 2.4));
      const want = this.signals.roll;
      this.tilt += (want - this.tilt) * (1 - Math.exp(-dt * 6));
      const hop = this.ctx.reducedMotion ? 0 : Math.sin(Math.min(1, 1 - this.bounce) * Math.PI) * this.bounce * 0.06;
      this.bearHolder.position.set(-hw + 0.36 * H, top - H + hop * H, -d - this.recoil * 0.18);
      this.bearHolder.scale.setScalar(H);
      this.bearHolder.rotation.set(-this.recoil * 0.12, 0.22, this.tilt * 0.15); // nearly square on: he looks at you
    }

    // face anchor: smoothed towards the latest engine transform (snap when first found)
    if (this.target.fresh) {
      const k = 1 - Math.exp(-dt * 30);
      this.anchor.position.lerp(this.target.pos, k);
      this.anchor.quaternion.slerp(this.target.quat, k);
      const s = this.anchor.scale.x + (this.target.scale - this.anchor.scale.x) * k;
      this.anchor.scale.setScalar(s);
    }
    this.fx.update(dt, this.ctx.reducedMotion);

    const bear = this.ctx.bear;
    if (bear && bear.object.parent === this.bearHolder) {
      bear.lookAt(cam.getWorldPosition(this.wp));
      bear.update(dt);
      this.tiltHead();
    }

    // smile to snap: a held smile (about a second) starts the shot, once per smile
    if (this.smileSnap && this.state === 'live' && this.signals.smile && this.smileArmed && !this.review.open) {
      if (!this.smileHeldAt) this.smileHeldAt = performance.now();
      else if (performance.now() - this.smileHeldAt > 600) {
        this.smileArmed = false;
        this.smileHeldAt = 0;
        this.diag.smileShots++;
        this.startCountdown(SMILE_COUNTDOWN_S);
      }
    } else if (!this.signals.smile) {
      this.smileHeldAt = 0;
      this.smileArmed = true;
    }
  }

  onFace(ev: FaceEvent): void {
    this.diag.faceEvents++;
    const now = performance.now();
    if (ev.type === 'found' || ev.type === 'updated') {
      const t = ev.detail?.transform;
      if (!t) return;
      this.target.pos.set(t.position.x, t.position.y, t.position.z);
      this.target.quat.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
      this.target.scale = t.scale ?? 1;
      this.fx.place(ev.detail?.attachmentPoints ?? null, ev.detail?.vertices);
      if (!this.diag.attachmentKeys.length && ev.detail?.attachmentPoints) this.diag.attachmentKeys = Object.keys(ev.detail.attachmentPoints);
      if (!this.faceFound) {
        this.faceFound = true;
        this.anchor.position.copy(this.target.pos);
        this.anchor.quaternion.copy(this.target.quat);
        this.anchor.scale.setScalar(this.target.scale);
        this.anchor.visible = true;
        this.fx.pop();
        this.ctx.hud.hint('');
      }
      this.target.fresh = true;
      this.signals.update(ev.detail, now);
    } else if (ev.type === 'lost') {
      this.faceFound = false;
      this.target.fresh = false;
      this.anchor.visible = false;
      this.signals.lost();
      if (this.state === 'live') this.ctx.hud.hint('Look at the camera');
    } else if (ev.type === 'loading') {
      this.fx.meshLoading(ev.detail);
    } else if (ev.type === 'other') {
      this.signals.event(ev.name, now);
    }
  }

  onTap(): boolean {
    // a refused autoplay: any tap on the camera view plays the clip (it is a user gesture)
    if (this.state === 'clip' && this.tapPlay.isConnected) {
      this.playClip();
      return true;
    }
    return false;
  }

  trigger(name: string): boolean {
    const bear = this.ctx.bear;
    if (!bear || (this.state !== 'live' && this.state !== 'countdown')) return false;
    const clip = REACT[name.toLowerCase().replace(/\s+/g, '')];
    if (!clip) return false;
    const t = performance.now();
    if (t - this.lastReact < 1200) return false;
    this.lastReact = t;
    bear.play(clip, { once: true, fade: 0.25 });
    return true;
  }

  reset(): void {
    this.look = 'full';
    this.picker.set('full');
    this.setSmileSnap(false);
    if (this.state !== 'off') {
      this.review.close();
      this.dropShot();
      this.reveal.close();
      this.bts.close();
      this.countdown?.cancel();
      this.state = 'live';
      this.setLook('full', false);
      this.toLive(false);
    }
  }

  dispose(): void {
    this.exit('showcase');
    this.unprime?.();
    try { this.video.pause(); } catch { /* none */ }
    this.video.removeAttribute('src');
    this.video.remove();
    this.videoTex.dispose();
  }

  /** Test hook: act as if your face did something (same reactions, no gates). */
  fire(cue: FaceCue | 'tilt', value = 0.3): void {
    if (cue === 'tilt') {
      this.signals.rollOverride = value || null;
      this.signals.roll = value;
      return;
    }
    this.signals.fire(cue);
  }

  // ------------------------------------------------------------------ the Classic clip (dormant: no clip ships in the hub; kept so the engine wiring and tests stay the same)
  private primeSound(): void {
    const v = this.video;
    try {
      v.muted = false;
      const p = v.play();
      v.pause();
      this.diag.soundPrimed = true;
      p?.catch((e: Error) => { if (e?.name !== 'AbortError') { this.diag.soundPrimed = false; v.muted = true; } });
    } catch {
      this.diag.soundPrimed = false;
      v.muted = true;
    }
  }

  /**
   * Play the Classic clip from the start, with sound. Called inside a tap (picker, shutter, Tap to play) where it can,
   * so iOS lets the sound play. When the browser still refuses, "Tap to play" shows; a second refusal plays it muted.
   */
  private playClip(): void {
    if (this.state === 'off' || this.state === 'busy' || this.state === 'review') return;
    if (this.state === 'countdown') this.countdown?.cancel();
    this.state = 'clip';
    this.setBearVisible(false);
    const v = this.video;
    const retry = this.tapPlay.isConnected;
    this.tapPlay.remove();
    clearTimeout(this.clipTimer);
    clearInterval(this.clipWatch);
    v.onended = () => this.onClipEnd();
    try { v.currentTime = 0; } catch { /* not seekable yet: starts at 0 anyway */ }
    v.muted = false;
    this.clipQuad.visible = true;
    this.armShutter(true, 'Take the photo at the end');
    this.ctx.hud.hint('');
    this.diag.clipPlays++;
    this.diag.clipMuted = false;
    const p = v.play();
    p?.catch((e: Error) => {
      if (this.state !== 'clip' || e?.name === 'AbortError') return;
      this.diag.clipBlocked++;
      if (!retry) {
        // autoplay with sound refused (no gesture reached us): ask for a tap
        this.ctx.hud.layer.appendChild(this.tapPlay);
        this.tapPlay.focus({ preventScroll: true });
        return;
      }
      // refused even inside a tap: play it muted rather than not at all
      v.muted = true;
      this.diag.clipMuted = true;
      void v.play().catch(() => this.onClipEnd());
    });
    // a stalled clip must not leave you stuck: if time stops moving for 4 s while it should play, offer the tap
    let lastT = -1, still = 0;
    this.clipWatch = window.setInterval(() => {
      if (this.state !== 'clip' || this.tapPlay.isConnected) return;
      if (v.currentTime === lastT && !v.ended) {
        if (++still >= 8) { still = 0; this.ctx.hud.layer.appendChild(this.tapPlay); }
      } else still = 0;
      lastT = v.currentTime;
    }, 500);
  }

  private stopClip(): void {
    clearTimeout(this.clipTimer);
    clearInterval(this.clipWatch);
    const v = this.video;
    v.onended = null;
    try { v.pause(); } catch { /* none */ }
    v.muted = true;
    this.clipQuad.visible = false;
    this.tapPlay.remove();
  }

  /**
   * Her last frame: she holds the pose (the ended video stays on its last frame, so she is in the photo exactly as on
   * screen) while "Smile!" and a 3, 2, 1 count you in, then the photo. The shutter shoots at once meanwhile.
   */
  private onClipEnd(): void {
    // the old character's clip is gone from this build; kept so a stray "ended" event lands back in live
    clearInterval(this.clipWatch);
    if (this.state === 'clip') this.toLive(false);
  }

  // ------------------------------------------------------------------ live / capture
  private toLive(hello: boolean): void {
    if (this.state === 'off') return;
    this.state = 'live';
    const hud = this.ctx.hud;
    if (!this.shutterBtn) this.shutterBtn = hud.shutter(() => this.onShutter(), 'Take a selfie with Bobo', clipHold({
      // hold the shutter for a video: the chosen frame and filter are baked into the clip
      can: () => this.state === 'live',
      options: () => ({ overlay: (g, w, h) => drawFrameArt(g, w, h, { title: true, frame: this.frame }), filter: FILTER_CSS[this.filter].filter, tint: FILTER_CSS[this.filter].tint }),
      onStart: () => { this.state = 'recording'; this.tuckPicker(true); this.ctx.hud.hint(''); },
      onDone: (blob) => {
        if (this.state !== 'recording') return;
        if (!blob) { this.ctx.hud.toast('Hold a little longer for a video', 2000); this.toLive(false); return; }
        this.diag.clips++;
        this.state = 'review';
        this.review.show(blob);
      },
    }));
    this.shutterBtn.disabled = false;
    this.armShutter(false);
    if (this.shutterBtn.parentElement !== hud.centre) hud.centre.appendChild(this.shutterBtn);
    this.tuckPicker(false);
    hud.above.append(this.picker.el, this.strip.el);
    hud.left.appendChild(this.smileBtn);
    hud.right.appendChild(this.boboBtn);
    // Classic between takes: she stays on her last frame (the clip is paused there); the shutter plays it again
    this.clipQuad.visible = false;
    this.fxLook(this.look);
    this.setBearVisible(true);
    this.drawOverlay();
    hud.hint(this.faceFound ? '' : 'Look at the camera');
    const bear = this.ctx.bear;
    if (hello && bear) this.hello();
  }

  /** Bobo's short hello: he waves and beams. */
  private hello(): void {
    const bear = this.ctx.bear;
    if (!bear || bear.object.parent !== this.bearHolder) return;
    bear.play('wave', { once: true, fade: 0.3 });
    this.setExpression('happy', 1.8);
    this.bounce = 1;
  }

  private fxLook(l: Look): void {
    this.fx.setLook(l, this.state !== 'off');
  }

  private setLook(l: Look, _fromTap: boolean): void {
    const was = this.look;
    this.look = l;
    this.picker.set(l);
    this.fxLook(l);
    if (this.state === 'off' || this.state === 'busy' || this.state === 'review') { this.drawOverlay(); return; }
    if (was !== l) this.hello();
    this.drawOverlay();
  }

  /** Your face -> the earrings swing and the hat hops (smile, gasp, eyebrows up, wink). */
  private fxReact(c: FaceCue): void {
    if (this.state !== 'live' && this.state !== 'countdown') return;
    if (c === 'smile') this.fx.react('happy', 2.2);
    else if (c === 'mouth') this.fx.react('surprised', 1.8);
    else if (c === 'brows') this.fx.react('surprised', 1.4);
    else if (c === 'wink') this.fx.react('sleepy', 1.6);
  }

  /** During the countdown / a recording the look picker and chips fade out and are inert until live again. */
  private tuckPicker(on: boolean): void {
    for (const el of [this.picker.el, this.strip.el]) {
      el.classList.toggle('cbc-tuck', on);
      el.inert = on;
    }
  }

  /** The chosen filter's live look on the camera canvas (and its flat tint); `off` clears it on leaving. */
  private liveFilter(off = false): void {
    const css = FILTER_CSS[off ? 'natural' : this.filter];
    const cam = this.ctx.container.querySelector<HTMLCanvasElement>('canvas.cbx-xr');
    if (cam) cam.style.filter = css.filter;
    this.tint.style.background = css.tint;
    this.tint.hidden = !css.tint;
  }

  private toggleBobo(): void {
    this.showBobo = !this.showBobo;
    this.boboBtn.setAttribute('aria-pressed', String(this.showBobo));
    this.boboBtn.classList.toggle('on', this.showBobo);
    this.ctx.hud.toast(this.showBobo ? 'Bobo is in the picture' : 'Just you this time');
    if (this.state === 'live' || this.state === 'countdown') this.setBearVisible(true);
  }

  private setBearVisible(on: boolean): void {
    on = on && this.showBobo;
    this.bearHolder.visible = on;
    if (!on) this.setExpression('neutral');
  }

  private armShutter(on: boolean, aria = 'Take the photo now'): void {
    const b = this.shutterBtn;
    if (!b) return;
    b.classList.toggle('cbc-armed', on);
    b.setAttribute('aria-label', on ? aria : 'Take a selfie with Bobo');
  }

  private onShutter(): void {
    if (this.state === 'countdown') {
      this.countdown?.now();
      return;
    }
    if (this.state === 'clip') {
      if (this.tapPlay.isConnected) this.playClip();
      return; // she is counting you down already
    }
    if (this.state !== 'live') return;
    this.startCountdown(COUNTDOWN_S);
  }

  private startCountdown(seconds: number): void {
    if (this.state !== 'live' || !this.countdown) return;
    this.state = 'countdown';
    this.cheered = false;
    this.ctx.hud.hint('');
    this.tuckPicker(true);
    this.armShutter(true);
    void this.countdown
      .start(seconds, (left) => { if (!this.cheered && left <= 1.3) this.cheer(); })
      .then((go) => {
        if (this.state !== 'countdown') return;
        if (go) void this.capture();
        else this.toLive(false);
      });
  }

  private cheer(): void {
    this.cheered = true;
    const bear = this.ctx.bear;
    if (bear && bear.object.parent === this.bearHolder) {
      bear.play('cheer', { once: true, fade: 0.2 });
      this.setExpression('happy', 2.5);
    }
  }

  private async capture(): Promise<void> {
    if (this.state !== 'countdown' && this.state !== 'busy') return;
    const classic = false;
    this.state = 'busy';
    const b = this.shutterBtn;
    if (b) { b.disabled = true; b.classList.remove('cbc-armed'); }
    try {
      if (!classic && !this.cheered) {
        this.cheer();
        await new Promise((r) => setTimeout(r, 380)); // let his arms come up
      }
      if (this.state !== 'busy') return; // left the mode meanwhile
      flash(this.ctx.container, this.ctx.reducedMotion);
      shutterSound(this.ctx.reducedMotion);
      const img = await engineShot(this.ctx.engine);
      if (this.state !== 'busy') return;
      const frame = this.frame, filter = this.filter;
      const { blob } = await compose(img, (g, w, h) => drawFrameArt(g, w, h, { title: true, frame, filter }));
      this.dropShot();
      this.shot = img;
      if (this.state !== 'busy') return;
      this.diag.shots++;
      this.diag.lastPhoto = blob;
      this.lastPhoto = blob;
      this.ctx.capture(blob);
      this.state = 'review';
      if (b) b.disabled = false;
      this.review.show(blob);
    } catch (e) {
      this.dropShot();
      console.warn('[selfie] photo failed', e);
      this.ctx.hud.toast('That photo did not work. Try again?', 2200);
      this.toLive(false);
    }
  }

  private dropShot(): void {
    if (this.shot) this.shot.src = '';
    this.shot = null;
  }

  // ------------------------------------------------------------------ smile to snap
  private toggleSmileSnap(): void {
    this.setSmileSnap(!this.smileSnap);
    this.ctx.hud.toast(this.smileSnap ? 'Smile to take the photo' : 'Smile to snap is off', 1600);
  }

  private setSmileSnap(on: boolean): void {
    this.smileSnap = on;
    this.smileArmed = !this.signals.smile; // a smile already on when you switch it on does not count
    this.smileBtn.setAttribute('aria-pressed', String(on));
    this.smileBtn.classList.toggle('on', on);
  }

  // ------------------------------------------------------------------ Bobo mirrors you
  private onCue(c: FaceCue): void {
    this.diag.reactions[c] = (this.diag.reactions[c] ?? 0) + 1;
    const bear = this.ctx.bear;
    this.fxReact(c);
    if (!bear || !this.bearHolder.visible || bear.object.parent !== this.bearHolder) return;
    if (this.state !== 'live' && this.state !== 'countdown') return;
    switch (c) {
      case 'smile':
        if (!this.signals.mouthWide) { this.setExpression('happy'); this.bounce = 1; }
        break;
      case 'smileOff':
        if (this.diag.expression === 'happy') this.setExpression('neutral');
        break;
      case 'mouth':
        this.setExpression('surprised', 1.6);
        this.recoil = 1;
        break;
      case 'mouthOff':
        break; // the gasp fades by itself
      case 'wink':
        this.setExpression('wink', 0.9);
        break;
      case 'brows':
        this.setExpression('surprised', 1.1);
        this.bounce = 0.6;
        break;
    }
  }

  private setExpression(e: BearExpression, hold?: number): void {
    const bear = this.ctx.bear;
    this.diag.expression = e;
    if (!bear) return;
    bear.setExpression(e, hold ? { hold } : undefined);
    if (hold) {
      window.setTimeout(() => {
        if (this.diag.expression !== e) return;
        // back to beaming if you are still smiling, else neutral
        this.diag.expression = this.signals.smile ? 'happy' : 'neutral';
        if (this.diag.expression === 'happy') bear.setExpression('happy');
      }, hold * 1000);
    }
  }

  /** His head follows your head tilt (an additive turn on the head bone, after the clip and his look-at). */
  private tiltHead(): void {
    const h = this.headBone;
    if (!h || !h.parent || Math.abs(this.tilt) < 0.005) return;
    // the camera's view axis in the head's parent space; the bear restores this bone's clip pose every frame
    const parentQ = h.parent.getWorldQuaternion(this.q1);
    const axis = this.v1.set(0, 0, 1).applyQuaternion(this.cam.quaternion).applyQuaternion(parentQ.invert()).normalize();
    this.q2.setFromAxisAngle(axis, this.tilt * 0.75);
    h.quaternion.premultiply(this.q2);
  }

  // ------------------------------------------------------------------ bear + overlay
  private borrowBear(): void {
    const bear = this.ctx.bear;
    if (!bear) return;
    const o = bear.object;
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(1 / (bear.height || 1));
    o.userData.cbxOwnGpu = !!bear.releaseRenderer;
    // drawn after the depth clear (restored when he goes back to the stages)
    o.traverse((m) => {
      if (!(m as THREE.Mesh).isMesh) return;
      m.userData.cbcOrder = m.renderOrder;
      m.renderOrder = OVERLAY_ORDER + m.renderOrder;
    });
    this.bearHolder.add(o);
    this.headBone = o.getObjectByName('Head') ?? o.getObjectByName('mixamorigHead') ?? null;
    bear.play('idle', { fade: 0.2 });
  }

  private returnBear(): void {
    const bear = this.ctx.bear;
    if (!bear || bear.object.parent !== this.bearHolder) return;
    bear.object.traverse((m) => {
      if (typeof m.userData.cbcOrder === 'number') {
        m.renderOrder = m.userData.cbcOrder;
        delete m.userData.cbcOrder;
      }
    });
    this.bearHolder.remove(bear.object);
    this.headBone = null;
    this.tilt = 0;
  }

  private drawOverlay(): void {
    const c = this.overlay;
    const box = this.ctx.container;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.clientWidth * dpr)), h = Math.max(1, Math.round(box.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    if (this.state === 'off') return;
    drawFrameArt(g, w, h, { title: false, frame: this.frame, live: true });
  }
}

export function createMode(ctx: ModeContext): Mode {
  return new FaceMode(ctx);
}
export default createMode;
