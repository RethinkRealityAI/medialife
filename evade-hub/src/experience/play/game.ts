// The small framework both mini games share: a state machine (idle -> countdown -> playing -> paused -> won / over),
// the round clock, score, best score (localStorage, guarded), the `play` status, pause reasons (the app's sheet, the
// tab hidden, Move in AR, the pause button), the scoreboard / countdown / results UI and a clean teardown.
//
// A game runs inside ONE mode (3D showcase or AR), which hands it a PlayHost (its stage, runner, kit, HUD bits) and
// calls `update(dt)` every frame (instead of the free heart toss) and `walk(dt)` when the game moves Bobo.
import * as THREE from 'three';
import type { PlayGameId, PlayStatus } from '../../shared/contracts';
import type { Stage } from '../scene/stage';
import type { MomentRunner } from '../scene/moments';
import type { Body } from '../physics/world';
import type { PlayKit } from './kit';
import { PlaySounds } from './audio';
import { PlayUi, type Results } from './ui';

export interface PlayHost {
  readonly variant: 'showcase' | 'ar';
  readonly stage: Stage;
  readonly runner: MomentRunner;
  readonly kit: PlayKit;
  readonly reduced: boolean;
  /** The HUD's overlay layer (scoreboard, popups) and the experience root (cards). */
  readonly layer: HTMLElement;
  readonly root: HTMLElement;
  hint(text: string): void;
  /** Stage-local point -> container CSS pixels. False when it is behind the camera. */
  project(p: THREE.Vector3, out: THREE.Vector2): boolean;
  /** Keep a stage-local point inside the play area (and out of the house). */
  constrain(p: THREE.Vector3): void;
  /** Where pickups may go: centre and radius (stage units). */
  field(out: { x: number; z: number; r: number }): void;
  /** Stage units per metre. */
  readonly unitsPerM: number;
  /** The mode can play right now (AR: placed and tracking). Always true in 3D. */
  readonly ready: boolean;
  /** The game changed what the mode should show (joystick, Games button): re-sync the mode's HUD. */
  sync(): void;
  /**
   * Optional: where the camera will settle for this game (stage-local position and forward), for laying out the court
   * before the camera has got there (the 3D view eases over to the court during the countdown). Default: the camera now.
   */
  court?(pos: THREE.Vector3, dir: THREE.Vector3): void;
}

export type PauseReason = 'user' | 'sheet' | 'hidden' | 'move' | 'place';
const COUNT_S = 3;

const bestKey = (id: PlayGameId) => `cbx.play.best.${id}`;
export function readBest(id: PlayGameId): number {
  try { return Math.max(0, Number(localStorage.getItem(bestKey(id))) || 0); } catch { return 0; }
}
function writeBest(id: PlayGameId, v: number): void {
  try { localStorage.setItem(bestKey(id), String(v)); } catch { /* private mode: best is per visit */ }
}

export abstract class PlayGame {
  abstract readonly id: PlayGameId;
  abstract readonly label: string;
  state: PlayStatus['state'] = 'idle';
  score = 0;
  best = 0;
  timeLeft: number | null = null;
  /** The mode walks Bobo with the joystick (Can Dash while playing); otherwise the game moves him (`walk`). */
  stickWalk = false;
  /** Show the joystick while this game runs. */
  abstract readonly showStick: boolean;
  /** Swipes (and Space on a computer) go to `flick` (Paw Hoops). */
  readonly flicks: boolean = false;
  /** The 3D camera while this runs: pull back (`wide`), look down (`pitch`), hold on the court (`focus`). */
  readonly view: { wide: number; pitch: number | null; focus?: boolean } = { wide: 0, pitch: null };
  protected ui!: PlayUi;
  protected sounds: PlaySounds;
  protected readonly holds = new Set<PauseReason>();
  private cd = 0;
  private cdShown = '';
  private lastEmit = '';
  private savedHooks: { c: ((b: Body) => boolean) | null; m: ((b: Body) => void) | null; b: ((b: Body) => void) | null } | null = null;
  protected readonly zero = new THREE.Vector3();
  protected readonly v2 = new THREE.Vector2();
  private disposed = false;

  constructor(protected host: PlayHost, private emitStatus: (s: PlayStatus) => void, private exit: () => void) {
    this.sounds = new PlaySounds(host.reduced);
  }

  /** Round length in seconds (null: no clock). */
  protected abstract readonly roundS: number | null;
  /** Scores for 1, 2 and 3 stars. */
  protected abstract readonly starAt: readonly [number, number, number];
  protected abstract readonly balls: number;
  /** The short line under "Go!". */
  protected abstract readonly goLine: string;
  /** Fresh round (positions, counters). Called before every countdown of a new round. */
  protected abstract setup(): void;
  /** Per frame while playing. */
  protected abstract tick(dt: number): void;
  /** Per frame always (visuals: bobbing pickups, the hoop). */
  protected abstract visuals(dt: number): void;
  /** The results card's second line and title. */
  protected abstract summary(stars: number): { title: string; line: string };
  /** Remove the game's 3D bits. */
  protected abstract clear(): void;

  // ------------------------------------------------------------------ life cycle
  begin(): void {
    const st = this.host.stage, a = st.actor;
    this.best = readBest(this.id);
    this.ui = new PlayUi(this.host.layer, this.host.root, { label: this.label, clock: this.roundS !== null, balls: this.balls || undefined, onPause: () => this.pause('user') });
    // the free toy must not catch or score while we play
    const pg = st.play;
    this.savedHooks = { c: pg.onCatch, m: pg.onMiss, b: pg.onBonk };
    pg.onCatch = () => false;
    pg.onMiss = () => undefined;
    pg.onBonk = () => a.jiggle(-0.12);
    pg.clear();
    this.host.runner.cancel();
    if (a.asleep) this.host.runner.nudge();
    a.lookOverride = null;
    a.hop = 0;
    this.host.hint('');
    this.newRound();
  }

  private newRound(): void {
    this.score = 0;
    this.timeLeft = this.roundS;
    this.ui.closeCard();
    this.ui.setScore(0);
    if (this.roundS !== null) this.ui.setTime(this.roundS);
    this.ui.setBalls(0);
    this.setup();
    if (!this.host.ready) this.holds.add('place');
    if (this.holds.size) this.enterPaused();
    else this.startCountdown();
  }

  private startCountdown(): void {
    this.state = 'countdown';
    this.stickWalk = false;
    this.cd = COUNT_S;
    this.cdShown = '';
    this.host.hint('');
    this.emit(true);
    this.host.sync();
  }

  private enterPaused(): void {
    this.state = 'paused';
    this.stickWalk = false;
    this.ui.count('');
    // the app's sheet covers the scene and lets go when it closes, so it needs no card of its own
    const hard = this.holds.has('user') || this.holds.has('hidden');
    if (hard && !this.ui.cardOpen) this.ui.pauseCard(() => this.resume('all'), () => this.quit(), this.pauseExtra());
    if (!hard && (this.holds.has('move') || this.holds.has('place'))) this.host.hint('Place Bobo to keep playing');
    this.emit(true);
    this.host.sync();
  }

  /** Hold the round (the clock stops). Several reasons may hold at once. */
  pause(reason: PauseReason = 'user'): boolean {
    if (this.state === 'won' || this.state === 'over' || this.state === 'idle') return false;
    this.holds.add(reason);
    this.enterPaused();
    return true;
  }

  /** Let go of a reason ('all' = the user's Resume: everything but placement). Plays a fresh 3-2-1 once free. */
  resume(reason: PauseReason | 'all' = 'all'): boolean {
    if (this.state !== 'paused') return false;
    if (reason === 'all') { this.holds.delete('user'); this.holds.delete('sheet'); this.holds.delete('hidden'); }
    else this.holds.delete(reason);
    if (this.host.ready) { this.holds.delete('place'); this.holds.delete('move'); }
    if (this.holds.size) {
      // still held by something else (AR: not placed yet)
      this.ui.closeCard();
      this.enterPaused();
      return false;
    }
    this.ui.closeCard();
    this.host.hint('');
    this.startCountdown();
    return true;
  }

  /** AR placed again after Move: lift 'move' / 'place'. */
  placed(): void {
    if (this.state !== 'paused') return;
    this.holds.delete('move');
    this.holds.delete('place');
    if (!this.holds.size) this.resume('place');
    else this.enterPaused();
  }

  /** Again, from the results card or a voice command. */
  again(): boolean {
    if (this.state !== 'won' && this.state !== 'over') return false;
    this.newRound();
    return true;
  }

  quit(): void {
    this.exit();
  }

  /** The end of the round: stars, best, results. */
  protected finish(): void {
    if (this.state === 'won' || this.state === 'over') return;
    const stars = this.score >= this.starAt[2] ? 3 : this.score >= this.starAt[1] ? 2 : this.score >= this.starAt[0] ? 1 : 0;
    const newBest = this.score > this.best;
    if (newBest) { this.best = this.score; writeBest(this.id, this.score); }
    this.state = stars > 0 ? 'won' : 'over';
    this.stickWalk = false;
    this.ui.hidePlay();
    this.sounds.finish(stars);
    const a = this.host.stage.actor;
    // he cheers at the end, whatever the score
    if (a.bear && a.scripted === 0) void a.once('cheer', 2.6);
    a.face('happy', 3);
    const s = this.summary(stars);
    const r: Results = { title: s.title, line: s.line, score: this.score, best: this.best, newBest: newBest && this.score > 0, stars };
    // a beat to see his cheer before the card comes up
    window.setTimeout(() => {
      if (this.disposed || (this.state !== 'won' && this.state !== 'over')) return;
      this.ui.resultsCard(r, () => this.again(), () => this.quit());
    }, this.host.reduced ? 500 : 1100);
    this.emit(true);
    this.host.sync();
  }

  // ------------------------------------------------------------------ per frame
  /** The mode calls this every frame while the game runs (after it walked his). */
  update(dt: number): void {
    const st = this.host.stage;
    st.catching = false; // the free toss's catch sensor stays off
    this.ui.tick(dt);
    if (this.state === 'countdown') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      const txt = this.cd > 0 ? String(n) : 'Go!';
      if (txt !== this.cdShown) {
        this.cdShown = txt;
        this.ui.count(txt, this.cd > 0 && n === COUNT_S ? this.goLine : '');
        this.sounds.tick(txt === 'Go!');
      }
      if (this.cd <= -0.45) {
        this.ui.count('');
        this.state = 'playing';
        this.stickWalk = this.showStick;
        this.emit(true);
        this.host.sync();
      }
    } else if (this.state === 'playing') {
      if (this.timeLeft !== null) {
        const before = Math.ceil(this.timeLeft);
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this.ui.setTime(this.timeLeft);
        const after = Math.ceil(this.timeLeft);
        if (after !== before && after <= 5 && after > 0) this.sounds.warn();
        if (this.timeLeft <= 0) { this.tick(dt); this.finish(); }
      }
      if (this.state === 'playing') this.tick(dt);
    }
    this.visuals(dt);
    this.ui.setScore(this.score);
    this.emit(false);
  }

  /** Optional controls on the pause card (Paw Hoops: the aim guide). */
  protected pauseExtra(): HTMLElement | null {
    return null;
  }

  /** Move his when the joystick doesn't (countdown, paused, hoops): default = stand still. */
  walk(dt: number): void {
    this.host.stage.actor.drive(this.zero, dt);
  }

  /** A swipe up (hoops throws; Can Dash ignores it). */
  flick(_power: number, _side: number): boolean {
    return false;
  }

  status(): PlayStatus {
    return { id: this.id, state: this.state, score: this.score, best: Math.max(this.best, 0), timeLeft: this.timeLeft === null ? null : Math.ceil(this.timeLeft) };
  }

  private emit(force: boolean): void {
    const s = this.status();
    const key = `${s.state}|${s.score}|${s.best}|${s.timeLeft}`;
    if (!force && key === this.lastEmit) return;
    this.lastEmit = key;
    this.emitStatus(s);
  }

  /** A popup at a stage-local point. */
  protected popAt(p: THREE.Vector3, text: string, kind = '', small = ''): void {
    if (this.host.project(p, this.v2)) this.ui.pop(this.v2.x, this.v2.y, text, kind, small);
  }

  /** Clean teardown: UI, sounds, 3D bits, the toy hooks. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.host.kit.clear();
    this.ui?.dispose();
    this.sounds.dispose();
    const st = this.host.stage, pg = st.play;
    if (this.savedHooks) { pg.onCatch = this.savedHooks.c; pg.onMiss = this.savedHooks.m; pg.onBonk = this.savedHooks.b; }
    pg.clear();
    st.actor.lookOverride = null;
    st.actor.hop = 0;
    this.host.hint('');
    this.state = 'idle';
    this.stickWalk = false;
  }
}

/** A tiny seeded RNG (mulberry32): a round's layout can be replayed from its seed. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
