// Happi's experience: splash, 3D showcase, AR, and the engine side of the Selfie and Photo modes, in one page
// with one engine session, one HUD and one bear. Framework-free (vanilla DOM + three.js r180 + the 8th Wall engine
// binary, loaded by index.html's <script> tag). The app talks to it only through ExperienceApi
// (src/shared/contracts.ts); docs/handoff/xr-core.md explains the inside.
//
//   const exp = createExperience({ title, lead });
//   await exp.mount(el);          // splash + loading; Start (a tap) -> showcase
//   exp.setMode('ar');            // from a tap; switches in place
//   exp.trigger('rainbow');       // case-insensitive
import { movesHtml } from '../happi/moves';
import * as THREE from 'three';
import '../shared/theme.css';
import { happiSky } from '../happi/sky';
import type {
  VisemeFrame,
  ActionName, BearCharacter, ExperienceApi, ExperienceCommand, ExperienceEvents, ExperienceMode, ExperienceOptions,
  PlayGameId, PlayGameInfo,
} from '../shared/contracts';
import { loadBear, unlockAudio } from '@/bear';
import { Emitter } from './core/emitter';
import { Assets } from './core/assets';
import { Engine, EngineError } from './core/engine';
import { CAN_USE_CAMERA, IS_PHONE, askMotionPermission, qs, reducedMotion } from './core/device';
import { Hud } from './hud/hud';
import { PropKit } from './scene/props';
import { Media } from './scene/media';
import { Stage } from './scene/stage';
import { addHousePhoto } from './scene/house';
import { MOMENT_NAMES, MomentRunner, canonicalMoment } from './scene/moments';
import { ShowcaseMode } from './modes/showcase';
import { CaptureDock } from './capture/dock';
import { ArMode } from './modes/ar';
import { bindGestures, type Shared } from './modes/shared';
import { createFacePlaceholder } from './placeholders/face-placeholder';
import { createPhotoPlaceholder } from './placeholders/photo-placeholder';
import type { FaceEvent, Mode, ModeContext, ModeFactory, XrScene } from './types';
import { modeCanCommand, runModeCommand } from './commands';
import { PLAY_GAMES, PLAY_SVG, PlayDirector, type PlayMode } from './play';

export type { Mode, ModeContext, ModeFactory } from './types';

// face/photo modes live in their own folders (another worker); placeholders run until they exist
type ModeModule = { createMode?: ModeFactory; default?: ModeFactory };
const EXTERNAL = import.meta.glob<ModeModule>('./modes/{face,photo}/index.ts');

const LABEL: Record<ExperienceMode, string> = { showcase: '3D', ar: 'AR', face: 'Selfie', photo: 'Photo' };
const FRIENDLY: Record<string, { title: string; body: string }> = {
  permission: {
    title: 'The camera is switched off',
    body: 'To see Happi in your room, allow the camera for this page in your browser settings, then try again. The 3D view works without it.',
  },
  unsupported: {
    title: 'This phone cannot do that one',
    body: "This browser can't run the camera part. Try Safari on iPhone or Chrome on Android. The 3D view works right here.",
  },
  error: {
    title: 'The camera had a hiccup',
    body: 'Something stopped the camera. Try again in a moment. Back to the 3D view for now.',
  },
};

class Experience implements ExperienceApi {
  private ev = new Emitter<ExperienceEvents>();
  private opts: Required<Pick<ExperienceOptions, 'title' | 'lead'>> & ExperienceOptions;
  private host: HTMLElement | null = null;
  private box: HTMLElement | null = null;
  private hud: Hud | null = null;
  /** The 3D and AR views' shutter (bottom right): tap a photo, hold a video. */
  private dock: CaptureDock | null = null;
  private engine: Engine | null = null;
  private assets = new Assets();
  private media: Media | null = null;
  private kit = new PropKit();
  private bear: BearCharacter | null = null;
  private stages: { showcase: Stage; ar: Stage } | null = null;
  private runners: { showcase: MomentRunner; ar: MomentRunner } | null = null;
  private modes = new Map<ExperienceMode, Mode>();
  private showcase: ShowcaseMode | null = null;
  private cur: Mode | null = null;
  private entered = false;
  private chain: Promise<void> = Promise.resolve();
  private reserved = 0;
  private speech: MediaStream | null = null;
  private loaded = false;
  private disposed = false;
  private unbindTap: (() => void) | null = null;
  private offResize: (() => void) | null = null;
  private ctx: ModeContext | null = null;
  /** Mini games (Heart Run, Heart Hoops) in 3D and AR: src/experience/play. */
  private play = new PlayDirector((s) => this.ev.emit('play', s), !IS_PHONE);
  private offVis: (() => void) | null = null;
  started = false;

  constructor(opts: ExperienceOptions = {}) {
    this.opts = {
      ...opts,
      title: opts.title || 'Happi',
      lead: opts.lead || 'Meet Happi in 3D and in your room.',
    };
  }

  // ------------------------------------------------------------------ ExperienceApi
  get mode(): ExperienceMode {
    return this.cur?.id ?? 'showcase';
  }

  get actions(): readonly string[] {
    return MOMENT_NAMES;
  }

  on<K extends keyof ExperienceEvents>(event: K, cb: (payload: ExperienceEvents[K]) => void): () => void {
    return this.ev.on(event, cb);
  }

  async mount(container: HTMLElement): Promise<void> {
    if (this.box) throw new Error('Experience already mounted');
    (window as unknown as { THREE: typeof THREE }).THREE = THREE; // the engine's three.js module looks for it
    this.host = container;
    const box = document.createElement('div');
    box.className = 'cbx';
    box.style.setProperty('--cbx-reserved', this.reserved + 'px');
    container.appendChild(box);
    this.box = box;
    const hud = new Hud(box, {
      title: this.opts.title,
      lead: this.opts.lead,
      onStart: () => this.start(),
      onSwitch: (m) => void this.setMode(m),
      onRestart: () => this.restart(),
    });
    this.hud = hud;
    this.dock = new CaptureDock(hud, box, (blob) => { addHousePhoto(blob); this.ev.emit('photo', { blob, mode: this.mode }); }, reducedMotion);
    this.media = new Media();
    this.engine = new Engine(box, {
      onScene: (xr, kind) => this.onScene(xr, kind),
      onUpdate: (dt, now) => { if (this.entered && this.cur && this.cur.camera !== 'none') this.cur.update(dt, now); },
      onFace: (e) => this.onFace(e),
      onRuntimeError: (e) => this.onRuntimeError(e),
      releaseRenderer: (r) => this.bear?.releaseRenderer?.(r),
    });
    this.unbindTap = bindGestures(this.engine.canvas, {
      onTap: (x, y) => {
        const c = this.engine!.canvas;
        const ndc = new THREE.Vector2((x / c.clientWidth) * 2 - 1, -(y / c.clientHeight) * 2 + 1);
        if (this.entered) this.cur?.onTap?.(x, y, ndc);
      },
    });
    const onResize = () => { if (!this.started && this.showcase) this.showcase.setHero(hud.heroRect()); };
    window.addEventListener('resize', onResize);
    this.offResize = () => window.removeEventListener('resize', onResize);

    // ---- load (real progress: bear, props, backdrop, videos)
    this.assets.onProgress = (p) => { hud.progress(p * 0.97); this.ev.emit('progress', p); };
    const pBear = this.assets.part('bear', 6), pProps = this.assets.part('props', 3), pSky = this.assets.part('sky', 1), pVid = this.assets.part('video', 1);
    const bearP = loadBear({ onProgress: pBear }).then((b) => { pBear(1); return b; }).catch((e) => {
      console.error('[experience] the bear did not load', e);
      pBear(1);
      return null;
    });
    const propsP = this.kit.load(this.assets, pProps).catch((e) => console.error('[experience] props did not load', e));
    const skyP = Promise.resolve(happiSky()).then((t) => { pSky(1); return t; });
    void this.media.ready().then(() => pVid(1));
    const [bear, , sky] = await Promise.all([bearP, propsP, skyP]);
    if (this.disposed) return;
    this.bear = bear;
    if (bear && this.speech) bear.setSpeechStream(this.speech);
    this.applyLipTuning();

    this.build(sky);
    // the splash frames the bear in its hero window; compile everything before the first frame
    const sc = this.showcase!;
    sc.setHero(hud.heroRect());
    sc.preview();
    await sc.ensureRenderer();
    if (this.disposed) return;
    hud.bearReady();
    this.loaded = true;
    hud.ready();
    this.ev.emit('progress', 1);
    this.loadExternalModes();
    if (qs.has('autostart')) this.start();
  }

  setMode(mode: ExperienceMode): Promise<void> {
    if (!this.modes.has(mode) && !['face', 'photo'].includes(mode)) return Promise.resolve();
    if (!this.started) {
      this.opts.initialMode = mode;
      return Promise.resolve();
    }
    const want = this.modes.get(mode);
    const camera = want?.camera ?? (mode === 'face' ? 'face' : 'world');
    if (camera !== 'none') {
      if (!CAN_USE_CAMERA) {
        void this.hud!.openOnPhone(LABEL[mode]);
        this.ev.emit('unavailable', { mode, reason: 'desktop', message: `${LABEL[mode]} needs a phone camera.` });
        return Promise.resolve();
      }
      // iPhone: motion permission must be asked inside the tap, before anything async
      if (camera === 'world') askMotionPermission();
    }
    this.chain = this.chain.then(() => this.switchTo(mode)).catch((e) => console.error('[experience] switch failed', e));
    return this.chain;
  }

  trigger(action: ActionName): boolean {
    const name = canonicalMoment(String(action));
    const m = this.cur;
    if (!m || !this.loaded) return false;
    let ok = false;
    if (m.trigger) ok = m.trigger(name ?? String(action), 'api');
    if (ok) this.ev.emit('action', { name: name ?? String(action), source: 'api' });
    return ok;
  }

  /** Voice / app commands (shutter, Place, Move, hug...): src/experience/commands.ts. */
  command(name: ExperienceCommand): boolean {
    if (!this.loaded || !this.entered || !this.cur || !this.box) return false;
    return runModeCommand(name, this.cur, this.box, { stages: this.stages, runners: this.runners, reduced: reducedMotion() });
  }

  canCommand(name: ExperienceCommand): boolean {
    if (!this.loaded || !this.entered || !this.cur || !this.box) return false;
    return modeCanCommand(name, this.box);
  }

  setSpeechStream(stream: MediaStream | null): void {
    this.speech = stream;
    this.bear?.setSpeechStream(stream);
  }

  setVisemes(frame: VisemeFrame | null): void {
    this.bear?.setVisemes(frame);
  }

  private lipTuning: { intensity?: number; attackMs?: number; releaseMs?: number } | null = null;
  setLipSync(tuning: { intensity?: number; attackMs?: number; releaseMs?: number }): void {
    this.lipTuning = tuning;
    this.applyLipTuning();
  }
  private applyLipTuning(): void {
    const engine = (this.bear as unknown as { lipSync?: { setConfig(p: Record<string, number>): void } } | null)?.lipSync;
    if (!engine || !this.lipTuning) return;
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.lipTuning)) if (typeof v === 'number' && Number.isFinite(v)) patch[k] = v;
    engine.setConfig(patch);
  }

  setSpeechText(text: string | null): void {
    this.hud?.speech(text);
  }

  async say(audioUrl: string, caption?: string): Promise<void> {
    if (caption) this.hud?.speech(caption);
    try {
      await this.bear?.say(audioUrl);
    } finally {
      if (caption) this.hud?.speech(null);
    }
  }

  setReservedCorner(px: number): void {
    this.reserved = Math.max(0, px);
    if (this.hud) this.hud.setReserved(this.reserved);
    else this.box?.style.setProperty('--cbx-reserved', this.reserved + 'px');
  }

  // ------------------------------------------------------------------ mini games (round 3, src/experience/play)
  get playGames(): readonly PlayGameInfo[] {
    return PLAY_GAMES;
  }

  /** Start Heart Run / Heart Hoops in the current mode. False in Selfie / Photo (switch to 3D first). */
  async startPlay(id: PlayGameId): Promise<boolean> {
    if (!this.started || !this.loaded || this.disposed) return false;
    await this.chain; // a mode switch in progress finishes first
    const m = this.cur as (Mode & Partial<PlayMode>) | null;
    if (!m || !this.entered || (m.id !== 'showcase' && m.id !== 'ar') || !m.playHost || !m.setGame) return false;
    this.hud?.closeAllSheets();
    return this.play.start(id, m as unknown as PlayMode);
  }

  stopPlay(): void {
    this.play.stop();
  }

  /** (games-3) The app's sheet is over the scene: hold the round without a pause card; let go when it closes (3-2-1). */
  holdPlay(on: boolean): boolean {
    return on ? this.play.pause('sheet') : this.play.resume('sheet');
  }

  /** The Actions button (bottom right in 3D and AR): a grid of everything Happi can do; a tap closes it and he does it. */
  private pickMove(): void {
    const hud = this.hud;
    if (!hud || hud.sheetOpen) return;
    void hud.sheet({ title: 'What should Happi do?', body: '', html: movesHtml(), buttons: ['Close'] });
    const wraps = this.box?.querySelectorAll<HTMLElement>('.cbx-sheet-wrap');
    const wrap = wraps?.[wraps.length - 1];
    wrap?.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((b) => b.addEventListener('click', () => {
      (wrap.querySelector('.row .btn') as HTMLButtonElement | null)?.click();
      window.setTimeout(() => this.trigger(b.dataset.move!), 120);
    }));
  }

  /** The Games button (bottom left in 3D, above Move in AR): a small chooser sheet. */
  private pickGame(): void {
    const hud = this.hud;
    if (!hud || hud.sheetOpen) return;
    const icon = { 'heart-run': PLAY_SVG.run, 'heart-hoops': PLAY_SVG.hoops } as const;
    const html = `<div class="cbp-pick">${PLAY_GAMES.map((g) => `<button type="button" data-game="${g.id}"><span class="ic${g.id === 'heart-hoops' ? ' hoops' : ''}">${icon[g.id]}</span><span><b>${g.label}</b><span>${g.lead}</span></span></button>`).join('')}</div>`;
    void hud.sheet({ title: 'Play with Happi', body: '', html, buttons: ['Not now'] });
    const wraps = this.box?.querySelectorAll<HTMLElement>('.cbx-sheet-wrap');
    const wrap = wraps?.[wraps.length - 1];
    wrap?.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((b) => b.addEventListener('click', () => {
      (wrap.querySelector('.row .btn') as HTMLButtonElement | null)?.click(); // closes the sheet
      void this.startPlay(b.dataset.game as PlayGameId);
    }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.play.stop();
    this.offVis?.();
    try { this.cur?.exit('showcase'); } catch { /* ignore */ }
    this.runners?.showcase.cancel();
    this.runners?.ar.cancel();
    this.unbindTap?.();
    this.offResize?.();
    this.engine?.dispose();
    for (const m of this.modes.values()) { try { m.dispose?.(); } catch { /* ignore */ } }
    this.media?.dispose();
    this.hud?.dispose();
    this.bear?.dispose();
    this.box?.remove();
    this.ev.clear();
  }

  // ------------------------------------------------------------------ setup
  private build(sky: THREE.Texture): void {
    const hud = this.hud!, media = this.media!;
    const reduced = reducedMotion();
    const showcase = new Stage('showcase', this.kit, media);
    const ar = new Stage('ar', this.kit, media);
    if (reduced) { showcase.fx.scale = 0.5; ar.fx.scale = 0.5; }
    this.stages = { showcase, ar };
    const arMode: { m: ArMode | null } = { m: null };
    this.runners = {
      showcase: new MomentRunner(showcase, { reducedMotion: reduced }),
      ar: new MomentRunner(ar, { reducedMotion: reduced, intercept: (n) => n === 'House' && !!arMode.m?.inside }),
    };
    const self = this;
    const ctx: ModeContext = {
      assets: this.assets,
      hud,
      engine: this.engine!,
      get bear() { return self.bear; },
      emit: (event, payload) => this.ev.emit(event, payload),
      capture: (blob) => { addHousePhoto(blob); this.ev.emit('photo', { blob, mode: this.mode }); },
      get mode() { return self.mode; },
      setMode: (m) => this.setMode(m),
      reducedMotion: reduced,
      container: this.box!,
    };
    this.ctx = ctx;
    const shared: Shared = {
      ctx, hud, media, reduced, container: this.box!,
      bear: () => this.bear,
      tapAction: (name) => this.ev.emit('action', { name, source: 'tap' }),
    };
    this.showcase = new ShowcaseMode(shared, showcase, this.runners.showcase, sky);
    arMode.m = new ArMode(shared, ar, this.runners.ar);
    this.modes.set('showcase', this.showcase);
    this.modes.set('ar', arMode.m);
    this.showcase.onPickGame = arMode.m.onPickGame = () => this.pickGame();
    this.showcase.onPickMove = arMode.m.onPickMove = () => this.pickMove();
    // a hidden tab holds the round (the pause card waits for you)
    const onVis = () => { if (document.hidden) this.play.pause('hidden'); };
    document.addEventListener('visibilitychange', onVis);
    this.offVis = () => document.removeEventListener('visibilitychange', onVis);
    this.engine!.addRoot(arMode.m.root);
    // placeholders until the real face/photo modules load
    this.addMode(createFacePlaceholder(ctx));
    this.addMode(createPhotoPlaceholder(ctx));
  }

  private addMode(m: Mode): void {
    const old = this.modes.get(m.id);
    if (old?.root) this.engine!.removeRoot(old.root);
    this.modes.set(m.id, m);
    if (m.root) {
      m.root.visible = false;
      this.engine!.addRoot(m.root);
    }
  }

  private loadExternalModes(): void {
    for (const [path, load] of Object.entries(EXTERNAL)) {
      void load()
        .then(async (mod) => {
          const f = mod.createMode ?? mod.default;
          if (!f || !this.ctx || this.disposed) return;
          const m = f(this.ctx);
          await m.load?.();
          // swap in only while that mode is not on screen (it is picked up next time)
          if (this.cur?.id === m.id) return;
          this.addMode(m);
        })
        .catch((e) => console.error(`[experience] ${path} failed to load; the placeholder stays`, e));
    }
  }

  // ------------------------------------------------------------------ start / switch
  private start(): void {
    if (this.started || !this.loaded) return;
    const hud = this.hud!;
    hud.starting();
    // all of this inside the Start tap
    try { unlockAudio(); } catch (e) { console.warn('[experience] unlockAudio', e); }
    this.ev.emit('userGesture', undefined);
    this.media!.prime();
    let first: ExperienceMode = this.opts.initialMode ?? 'showcase';
    if (first !== 'showcase' && !CAN_USE_CAMERA) first = 'showcase';
    if (first === 'ar' || first === 'photo') askMotionPermission();
    this.started = true;
    hud.hideSplash();
    this.chain = this.chain
      .then(() => this.switchTo(first))
      .then(() => {
        this.ev.emit('started', { mode: this.mode });
        if (this.mode === 'showcase') window.setTimeout(() => { if (this.mode === 'showcase' && this.entered) this.runners?.showcase.trigger('Wave'); }, reducedMotion() ? 100 : 900);
      })
      .catch((e) => console.error('[experience] start failed', e));
  }

  private async switchTo(id: ExperienceMode, fallback = true): Promise<void> {
    const to = this.modes.get(id);
    const from = this.cur;
    if (!to || (from === to && this.entered)) return;
    this.play.stop(); // a mini game belongs to the mode it started in
    const hud = this.hud!, engine = this.engine!;
    this.ev.emit('mode', { mode: id, busy: true });
    hud.setMode(id, true);
    const camera = to.camera !== 'none';
    // (awaited: the hud's iris finishes covering the old view before it is torn down; ~0.35 s)
    if (from) await hud.cover(camera ? (to.camera === 'face' ? 'Turning the camera round…' : 'Opening the camera…') : 'Back to New York…');
    this.entered = false;
    this.dock?.show(false); // (stops a clip that is still recording)
    try {
      if (from) await from.exit(id);
    } catch (e) {
      console.error('[experience] exit failed', e);
    }
    if (from?.root) from.root.visible = false;
    this.cur = to;
    try {
      if (!camera) {
        engine.stop();
        await to.enter(from?.id ?? null);
      } else {
        this.showcase?.releaseRenderer();
        for (const m of this.modes.values()) if (m.root) m.root.visible = m === to;
        await engine.start(to.camera as 'world' | 'face');
        await to.enter(from?.id ?? null);
      }
      this.entered = true;
      this.dock?.show(id === 'showcase' || id === 'ar');
    } catch (e) {
      const err = e instanceof EngineError ? e : new EngineError('error', String((e as Error)?.message ?? e));
      console.warn('[experience] could not start', id, err.reason, err.message);
      if (to.root) to.root.visible = false;
      this.cur = null;
      this.ev.emit('unavailable', { mode: id, reason: err.reason, message: err.message });
      if (fallback && id !== 'showcase') {
        await this.switchTo('showcase', false);
        const f = FRIENDLY[err.reason] ?? FRIENDLY.error;
        void hud.sheet({ title: f.title, body: f.body, buttons: ['OK'] });
        return;
      }
    } finally {
      hud.cover(null);
    }
    hud.setMode(this.mode, false);
    this.ev.emit('mode', { mode: this.mode, busy: false });
  }

  private restart(): void {
    if (!this.started) return;
    this.play.stop();
    for (const m of this.modes.values()) { try { m.reset?.(); } catch (e) { console.warn(e); } }
    this.media?.reset();
    this.hud?.speech(null);
    const goHome = () => window.setTimeout(() => { if (this.mode === 'showcase') this.runners?.showcase.trigger('Wave'); }, 500);
    if (this.mode === 'showcase') goHome();
    else void this.setMode('showcase').then(goHome);
  }

  // ------------------------------------------------------------------ engine hooks
  private onScene(xr: XrScene, kind: 'none' | 'world' | 'face'): void {
    for (const m of this.modes.values()) if (m.root) m.root.visible = m === this.cur;
    if (this.cur && this.cur.camera === kind) {
      try { this.cur.onScene?.(xr); } catch (e) { console.error('[experience] onScene', e); }
    }
  }

  private onFace(e: FaceEvent): void {
    if (this.entered && this.cur?.camera === 'face') this.cur.onFace?.(e);
  }

  private onRuntimeError(err: EngineError): void {
    if (!this.cur || this.cur.camera === 'none') return;
    const id = this.cur.id;
    this.ev.emit('unavailable', { mode: id, reason: err.reason, message: err.message });
    this.chain = this.chain.then(async () => {
      await this.switchTo('showcase', false);
      const f = FRIENDLY[err.reason] ?? FRIENDLY.error;
      void this.hud?.sheet({ title: f.title, body: f.body, buttons: ['OK'] });
    });
  }

  // ------------------------------------------------------------------ test hooks (dev page, simulator)
  /** Numbers for tests: shader programs, mode, moments. Not part of the app contract. */
  debug(): Record<string, unknown> {
    const sc = this.showcase;
    const xr = this.engine?.xr;
    const ar = this.modes.get('ar') as ArMode | undefined;
    return {
      mode: this.mode,
      entered: this.entered,
      started: this.started,
      phone: IS_PHONE,
      fps: Math.round(sc?.fps ?? 0),
      engineFps: Math.round(this.engine?.fps ?? 0),
      showcasePrograms: sc?.renderer?.info.programs?.length ?? null,
      showcaseProgramsAfterWarm: sc?.programsAfterWarm ?? null,
      enginePrograms: xr?.renderer.info.programs?.length ?? null,
      engine: this.engine?.health(),
      tracking: this.engine?.tracking,
      settled: this.engine?.settled(),
      moment: { showcase: this.runners?.showcase.current, ar: this.runners?.ar.current },
      asleep: { showcase: this.stages?.showcase.actor.asleep, ar: this.stages?.ar.actor.asleep },
      ar: ar ? { placed: ar.placed, inside: ar.inside, restoring: ar.waitingToRestore, visible: ar.stageVisible } : null,
      themeOn: this.media?.themeOn,
      play: this.play.status(),
    };
  }
  /** Internals for tests. */
  get internals(): Record<string, unknown> {
    return { stages: this.stages, runners: this.runners, modes: this.modes, engine: this.engine, showcase: this.showcase, media: this.media, bear: this.bear, play: this.play };
  }
}

/** The one entry point (src/shared/contracts.ts). */
export function createExperience(opts?: ExperienceOptions): ExperienceApi {
  const exp = new Experience(opts);
  if (qs.has('test')) (window as unknown as { __cbx: Experience }).__cbx = exp;
  return exp;
}
