/* eslint-disable @typescript-eslint/no-explicit-any -- duck-typed game nodes */
/**
 * CollectorHubMode.ts: Mattercraft custom ZComponent
 *
 * Bobo's Hideout as the third Cola Run mode, next to the round and the lounge.
 * The game offers it on its opening card and in its menu ("Visit Bobo's
 * Hideout"), and a small round icon sits in the corner between rounds. The
 * first time, the fan unlocks their room with the code from their EVADE merch
 * card plus their email. The moment the code is in, Bobo's room builds itself
 * around him and around the person holding the phone: a glowing wireframe
 * races out from Bobo, then the room materialises floor to ceiling. Inside:
 * the BOBO OS computer (alerts, Where's Bobo?, leaderboard, Cola Run), the
 * collection wall, and live alerts the EVADE team sends from medialife.ai.
 *
 * ONE PLACEMENT FOR EVERYTHING
 * The room stands where Bobo was placed: it joins the same AR anchor as Bobo
 * (the Instant World Tracker the game's Place button drops), centred on his
 * placed spot and on the same floor, so it can't drift away from him or float
 * off to one side. The game's Bobo is Bobo in the room too (one Bobo, never
 * two): the joystick walks him around his room.
 * Reset placement in the room keeps you in the hideout: the room turns into a
 * faint outline that moves with the reticle and Bobo; tap Place and it builds
 * back in at the new spot.
 *
 * SETUP
 *  1. Copy these into the project's Scripts folder, replacing older copies:
 *       CollectorHubMode.ts   (this file)
 *       HubCore.ts            (the hub itself; shared with the browser labs)
 *       OrbHuntGame.ts        (the game, with the hideout mode)
 *  2. Hierarchy Panel → + → CollectorHubMode. Anywhere works (the room moves
 *     itself under Bobo's anchor when it opens); next to the game is tidiest.
 *  3. Leave "Game" empty (it finds OrbHuntGame) or point it at the game node.
 *  4. Optional: Build Timeline / Room Timeline for Bobo's excited and settle
 *     animations (the game's Lounge Character must be set for clean blending).
 *
 * The component never moves your camera. The game's menu button, sound button
 * and Reset placement stay on screen in the room.
 */
import {
  ContextManager,
  Event,
  Observable,
  isDesignTime,
  useCanvas,
  useOnBeforeRender,
  useOverlay,
} from "@zcomponent/core";
import { useRenderer } from "@zcomponent/three/lib/context";
import { Group } from "@zcomponent/three/lib/components/Group";
import { useCamera, useScene } from "@zcomponent/three/lib/scenecontext";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CollectorHub, type HubState } from "./HubCore";

interface ConstructorProps {}

/** How big the room gets. */
export enum RoomFit {
  /** Big enough that the person holding the phone stands inside it (AR). */
  AroundViewer = "aroundViewer",
  /** Sized to Bobo only (Room Size × Bobo-sized), wherever the viewer stands. */
  MatchBobo = "matchBobo",
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => r())
      : setTimeout(r, 16),
  );
const idle = (fn: () => void, ms: number) =>
  setTimeout(() => {
    const ric = (globalThis as any).requestIdleCallback;
    if (typeof ric === "function") ric(fn, { timeout: 2500 });
    else fn();
  }, ms);

/**
 * Bobo's Hideout: the MEDIALIFE Collector Hub as a Cola Run mode.
 *
 * @zcomponent
 * @zicon cottage
 * @ztag three/Object3D/Group/CollectorHubMode
 * @zparents three/Object3D/Group/**
 */
export class CollectorHubMode extends Group {
  /* ══ Game ════════════════════════════════════════════════════════════ */

  /**
   * Your Cola Run game node. Leave empty and the hideout finds the game itself.
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 100
   * @zvalues nodeids three/Object3D/**
   */
  public gameNode = new Observable<string | undefined>(undefined);

  /**
   * Bobo in the room. Leave empty to use the game's own Player Node (the
   * joystick character), which is what you want: one Bobo in every mode.
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 90
   * @zvalues nodeids three/Object3D/**
   */
  public playerNode = new Observable<string | undefined>(undefined);

  /**
   * Offer "Visit Bobo's Hideout" on the game's opening card and in its menu.
   * (Sets the game's own Hideout Enabled for you.)
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 85
   * @zdefault true
   */
  public showInMenus = new Observable(true, () => this._syncGameMenus());

  /**
   * Show the small round hideout icon in the corner between rounds (lounge,
   * menus, after a round). Turn off to rely on the menus, or open the room
   * from your own UI (call open()).
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 80
   * @zdefault true
   */
  public showButton = new Observable(true, () => this._syncButton());

  /**
   * Hide the game's own buttons (menu, sound, Reset placement) while Bobo is
   * in his room. Off by default, so moving the room with Reset placement and
   * switching modes from the menu work in the room as everywhere else.
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 70
   * @zdefault false
   */
  public hideGameUi = new Observable(false, () => this._applyLook());

  /* ══ Room ════════════════════════════════════════════════════════════ */

  /**
   * How big the room gets. Around Viewer (default) makes room for the person
   * holding the phone: it slides toward them and grows (up to Max Room Scale)
   * until they're standing inside it, so it builds around them in AR. Match
   * Bobo sizes it to Bobo only (Room Scale).
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 100
   * @zdefault aroundViewer
   */
  public roomFit = new Observable<RoomFit>(RoomFit.AroundViewer);

  /**
   * The smallest the room ever is, in Bobo-sized rooms: 1 = the room's own
   * Bobo would be exactly as tall as yours. Default 1.3 (30% roomier).
   * Placing the scene bigger or smaller resizes the room with it. (0.5 to 4)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 90
   * @zdefault 1.3
   */
  public roomScale = new Observable(1.3);

  /**
   * With Around Viewer: the biggest the room may grow, in Bobo-sized rooms.
   * Someone standing further away than that just walks in. (1 to 12)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 85
   * @zdefault 3
   */
  public maxRoomScale = new Observable(3);

  /**
   * Keep Bobo inside his room: the joystick stops him at the wall.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 80
   * @zdefault true
   */
  public keepBoboInside = new Observable(true);

  /**
   * Timeline or state played on Bobo when his room starts building (his
   * excited animation suits it). Played like a lounge button: set the game's
   * Lounge Character so it blends cleanly with the joystick.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 75
   * @zvalues layerclipids
   */
  public buildTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played on Bobo once the room is finished (sitting
   * down, a purr). Walking off with the joystick ends it.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 74
   * @zvalues layerclipids
   */
  public roomTimeline = new Observable<string | undefined>(undefined);

  /**
   * Push the hideout's top bar down (px) if it collides with something else
   * in the top corners.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 70
   * @zdefault 0
   */
  public topOffset = new Observable(0, () => this._applyLook());

  /* ══ BOBO OS ═════════════════════════════════════════════════════════ */

  /**
   * How much of the screen Bobo's computer takes. 0.8 = 80% of the screen,
   * with the room still in view around it. 1 = full screen. (0.5 to 1)
   *
   * @zui
   * @zgroup BOBO OS
   * @zgrouppriority 150
   * @zpriority 100
   * @ztype proportion
   * @zdefault 0.8
   */
  public osSize = new Observable(0.8, () => this._applyLook());

  /**
   * How solid the computer's screen is. 1 = fully solid; lower lets the room
   * show through behind the desktop (windows stay readable). (0.4 to 1)
   *
   * @zui
   * @zgroup BOBO OS
   * @zgrouppriority 150
   * @zpriority 90
   * @ztype proportion
   * @zdefault 0.88
   */
  public osOpacity = new Observable(0.88, () => this._applyLook());

  /**
   * How much the room around the computer is darkened while it's open.
   * 0 = not at all. (0 to 0.8)
   *
   * @zui
   * @zgroup BOBO OS
   * @zgrouppriority 150
   * @zpriority 80
   * @ztype proportion
   * @zdefault 0.18
   */
  public osDim = new Observable(0.18, () => this._applyLook());

  /* ══ Site ════════════════════════════════════════════════════════════ */

  /**
   * The MEDIALIFE site that holds the codes, alerts and leaderboard. A preview
   * deploy's address works for testing.
   *
   * @zui
   * @zgroup Site
   * @zgrouppriority 100
   * @zpriority 100
   * @ztype url
   * @zdefault https://medialife.ai
   */
  public endpoint = new Observable("https://medialife.ai");

  /**
   * The room model.
   *
   * @zui
   * @zgroup Site
   * @zgrouppriority 100
   * @zpriority 90
   * @ztype url
   * @zdefault https://medialife.ai/hub/evade/room.glb
   */
  public modelUrl = new Observable("https://medialife.ai/hub/evade/room.glb");

  /**
   * The Where's Bobo? globe, embedded in BOBO OS.
   *
   * @zui
   * @zgroup Site
   * @zgrouppriority 100
   * @zpriority 80
   * @ztype url
   * @zdefault https://medialife.ai/evade/where-is-bobo/
   */
  public globeUrl = new Observable("https://medialife.ai/evade/where-is-bobo/");

  /**
   * Print the shared test code under the unlock form. For test builds only:
   * the code is switched off on medialife.ai unless the team turns it on.
   *
   * @zui
   * @zgroup Site
   * @zgrouppriority 100
   * @zpriority 70
   * @zdefault false
   */
  public showTestCode = new Observable(false);

  /* ══ Events ══════════════════════════════════════════════════════════ */

  /** The room started building around Bobo (the code was accepted). */
  public onEnter = new Event<[]>();
  /** The room finished building. */
  public onRoomReady = new Event<[]>();
  /** Reset placement in the room: it's an outline now, waiting for Place. */
  public onRoomMoving = new Event<[]>();
  /** The room folded away. */
  public onLeave = new Event<[]>();
  /** A fan unlocked their room (or added an item). */
  public onUnlocked = new Event<[{ firstClaim: boolean; owned: number }]>();
  /** A live alert from the EVADE team arrived while the room was open. */
  public onAlert = new Event<[{ title: string }]>();

  private _hub: CollectorHub | null = null;
  private _camera?: THREE.Camera;
  private _renderer: any = null;
  private _scene: THREE.Object3D | null = null;
  private _game: any = null;
  private _player?: THREE.Object3D;
  private _playerComp: any = null;
  /** The room is opening or up (unlock form, building, live, leaving). */
  private _active = false;
  /** Bumped whenever the room is torn down, so anything in flight knows it lost. */
  private _seq = 0;
  /** Reset placement happened in the room: the next Place rebuilds it straight away. */
  private _rebuild = false;
  /** Where Bobo stood when the scene was placed (his parent's space): the room's centre. */
  private readonly _home = new THREE.Vector3();
  private _homeSet = false;
  private _uiWas: boolean | undefined;
  private _offGame: (() => void)[] = [];
  private readonly _v = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();

  constructor(
    contextManager: ContextManager,
    public constructorProps: ConstructorProps,
  ) {
    super(contextManager, constructorProps);
    if (isDesignTime(contextManager)) return; // no DOM in the editor's viewport

    const overlay = useOverlay(contextManager);
    const cam = useCamera(contextManager);
    this._camera = cam.value;
    this.register(cam, (c) => (this._camera = c));
    try {
      this._renderer = useRenderer(contextManager);
      this._scene = useScene(contextManager);
    } catch {
      /* no renderer context: the warm-up is skipped, nothing else changes */
    }

    this.register(useOnBeforeRender(contextManager), (dt: number) => this._tick(dt * 0.001)); // dt is ms

    // Built once the scene has finished constructing: the editor writes this
    // node's properties (Endpoint, Model URL, …) after the constructor runs,
    // so reading them here would always see the defaults.
    this.getZComponentInstance().constructed.then(() => {
      if (this._gone) return;
      const qs = new URLSearchParams(location.search);
      const loader = new GLTFLoader();
      this._hub = new CollectorHub({
        parent: this.element,
        host: overlay.value,
        canvas: useCanvas(contextManager),
        getCamera: () => this._camera,
        loader: { loadAsync: (url) => loader.loadAsync(url) as any },
        api: this.endpoint.value,
        modelUrl: this.modelUrl.value,
        globeUrl: this.globeUrl.value,
        testHint: this.showTestCode.value ? "BOBO-TEST-CATS" : null,
        hubCode: qs.get("hub"),
        exitLabel: "Back to Cola Run",
        hudOffset: this.topOffset.value,
        portal: false,
        ownBobo: false,
        on: (name, p: any) => this._onHub(name, p),
      });
      this._bindGame();
      this._syncGameMenus();
      this._applyLook();
      this._syncButton();
      // Load the room and compile its shaders while nobody's waiting for it,
      // so the build starts the moment the code is in (no freeze).
      idle(() => void this._prepare(), 1500);
      // Scanned a product's QR (…?hub=BOBO-XXXX-XXXX): straight to the hideout.
      if (qs.get("hub")) setTimeout(() => this.open(), 600);
    });
  }

  /** The hub itself (for hosts that drive their own camera, like the labs). */
  public get hub() {
    return this._hub;
  }

  /**
   * Open the hideout. With the game in the scene this switches the game to
   * its hideout mode (placement first if the scene isn't placed yet); the
   * room opens from there.
   */
  public open() {
    const g = this._game;
    if (g?.enterHideout) {
      if (g.isInHideout) this._maybeOpen();
      else g.enterHideout();
    } else void this._open();
  }

  /** The room folds back into Bobo and the game goes back to the lounge. */
  public leave(then?: "play" | "record") {
    return this._leaveRoom(then ?? "exit");
  }

  /* ── getting ready ── */

  private _prepared?: Promise<void>;
  /** Load the model and warm its shaders and textures. Runs once. */
  private _prepare() {
    const hub = this._hub;
    if (!hub) return Promise.resolve();
    this._prepared ??= hub
      .load()
      .then(() => hub.warm(this._renderer, this._camera, this._scene))
      .catch((e) => console.warn("[CollectorHubMode] room preload failed", e));
    return this._prepared;
  }

  /* ── opening ── */

  private _placedOk() {
    const g = this._game;
    return !g || !g.placementEnabled?.value || !!g.isPlaced;
  }

  /** Open the room if the game is in hideout mode and the scene is placed. */
  private _maybeOpen() {
    if (this._active || !this._game?.isInHideout || !this._placedOk()) return;
    void this._open();
  }

  private _stillWanted() {
    const g = this._game;
    return (!g || !g.enterHideout || g.isInHideout) && this._placedOk();
  }

  private async _open() {
    const hub = this._hub;
    if (!hub || this._active) return;
    this._active = true;
    const seq = ++this._seq;
    const rebuild = this._rebuild;
    this._rebuild = false;
    this._syncButton();
    try {
      if (!hub.loaded) {
        hub.prompt("Getting Bobo's room ready…");
        await this._prepare();
        hub.prompt(null);
      }
      if (seq !== this._seq) return;
      if (!hub.loaded) throw new Error("the room model didn't load");
      // Coming back after a re-placement: they're already signed in.
      if (!(rebuild && hub.signedIn) && !(await hub.ensureAccess())) {
        if (seq === this._seq) this._cancelled();
        return;
      }
      if (seq !== this._seq) return;
      if (!this._stillWanted()) return this._close();
      // The placement (a timeline in most projects) may still be moving the
      // scene: wait until Bobo has stopped moving in the world.
      await this._settle();
      if (seq !== this._seq || !this._stillWanted()) return this._close();
      const player = this._findPlayer();
      if (!player || !this._camera) {
        console.warn("[CollectorHubMode] no player node or camera; set Player Node");
        return this._close();
      }
      this._placeRoom(player);
      if (this.hideGameUi.value && this._game?.uiEnabled) {
        this._uiWas = this._game.uiEnabled.value;
        this._game.uiEnabled.value = false;
      }
      this._setRecorderVisible(false);
      player.getWorldPosition(this._v);
      hub.enter({ origin: this._v, quick: rebuild });
      this._playCharacter(this.buildTimeline.value);
      this.onEnter.emit();
    } catch (e) {
      console.error("[CollectorHubMode]", e);
      hub.prompt(null);
      if (seq === this._seq) this._close();
    }
  }

  /**
   * Stand the room on Bobo's placed spot, in his own space (the AR anchor),
   * open side to the camera. Bobo is brought home first if he's wandered
   * further than the room reaches.
   */
  private _placeRoom(player: THREE.Object3D) {
    const hub = this._hub!;
    const parent = player.parent;
    const center = (this._homeSet ? this._home : player.position).clone();
    const bobo = this._playerHeight(player) / (parent ? parent.getWorldScale(this._v).y || 1 : 1);
    const unit = bobo / hub.boboHeight(); // a Bobo-sized room, in the parent's units
    hub.placeAround({
      parent,
      center,
      cameraWorld: this._camera!.getWorldPosition(this._v),
      scale: unit * clamp(this.roomScale.value, 0.5, 4),
      wrapViewer: this.roomFit.value !== RoomFit.MatchBobo,
      maxScale: unit * clamp(this.maxRoomScale.value, 1, 12),
    });
    const c = hub.root.position;
    const dx = player.position.x - c.x;
    const dz = player.position.z - c.z;
    if (Math.hypot(dx, dz) > hub.floorRadius() * 0.8)
      this._setPlayerPos(center.x, player.position.y, center.z);
  }

  /** Up to half a second for the placement animation to put Bobo down. */
  private async _settle() {
    const p = this._findPlayer();
    await nextFrame();
    if (!p) return;
    const last = p.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 30; i++) {
      await nextFrame();
      const now = p.getWorldPosition(this._v);
      if (now.distanceTo(last) < 1e-4) return;
      last.copy(now);
    }
  }

  /** They closed the unlock form: back to the lounge (or the game's idle state). */
  private _cancelled() {
    this._close();
    const g = this._game;
    if (!g?.isInHideout) return;
    if (g.loungeEnabled?.value && g.enterLounge) g.enterLounge();
    else g.exitHideout?.();
  }

  /* ── closing ── */

  /**
   * The room folds back into Bobo.
   *  exit:          then the game goes to the lounge (or idle)
   *  play / record: quick fold, then a round (and the recorder)
   *  game:          the game already changed mode (menu): quick fold, nothing else
   */
  private async _leaveRoom(then: "exit" | "play" | "record" | "game") {
    const hub = this._hub;
    if (!hub || (!this._active && hub.state !== "preview")) return;
    const seq = ++this._seq;
    this._rebuild = false;
    const inside = hub.state === "building" || hub.state === "live";
    if (inside) {
      const p = this._findPlayer();
      const origin = p ? p.getWorldPosition(this._v) : undefined;
      await hub.leave({ fast: then !== "exit", origin });
      if (seq !== this._seq) return;
    }
    hub.hide();
    this._unpin();
    this._close();
    this.onLeave.emit();
    const g = this._game;
    if (!g) return;
    if (then === "play" || then === "record") {
      g.startGame?.();
      if (then === "record") setTimeout(() => this._recorder()?.startRecording?.(), 500);
    } else if (then === "exit" && g.isInHideout) {
      if (g.loungeEnabled?.value && g.enterLounge) g.enterLounge();
      else g.exitHideout?.();
    }
  }

  /**
   * Reset placement. In the room: it becomes an outline that moves with the
   * reticle and Bobo (it lives on the same anchor), and the next Place builds
   * it back in there. Anywhere else (the unlock form): just stop.
   */
  private _onReset() {
    const hub = this._hub;
    if (!hub) return;
    const s = hub.state;
    if (s === "building" || s === "live" || s === "leaving" || s === "preview") {
      ++this._seq;
      this._rebuild = true;
      this._homeSet = false; // the next Place sets Bobo's new spot
      // The outline stays put on the anchor, so it travels with Bobo and the
      // reticle; Place stands it back on Bobo's new spot.
      hub.preview();
      this._unpin();
      this._active = false;
      this._syncButton();
      this.onRoomMoving.emit();
      return;
    }
    if (this._active) {
      ++this._seq;
      hub.hide();
      this._unpin();
      this._close();
    }
  }

  private _unpin() {
    this._restoreGameUi();
    this._setRecorderVisible(true);
  }

  private _close() {
    this._active = false;
    this._hub?.prompt(null);
    this._syncButton();
  }

  private _onHub(name: string, p: any) {
    if (name === "exit") void this._leaveRoom("exit");
    else if (name === "signedOut") void this._leaveRoom("exit");
    else if (name === "play") void this._leaveRoom(p.record ? "record" : "play");
    else if (name === "unlocked")
      this.onUnlocked.emit({ firstClaim: !!p.firstClaim, owned: p.me?.owned ?? 0 });
    else if (name === "alert") this.onAlert.emit({ title: p.title });
    else if (name === "state" && (p as HubState) === "live") {
      this._playCharacter(this.roomTimeline.value);
      this.onRoomReady.emit();
    }
  }

  private _tick(dt: number) {
    const hub = this._hub;
    if (!hub) return;
    hub.update(dt);
    if (!this.keepBoboInside.value) return;
    const s = hub.state;
    if (s !== "building" && s !== "live") return;
    // The joystick keeps walking Bobo: stop him at the wall.
    const p = this._findPlayer();
    if (!p || p.parent !== hub.root.parent) return;
    const c = hub.root.position;
    const r = hub.floorRadius() * 0.82;
    const dx = p.position.x - c.x;
    const dz = p.position.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > r) this._setPlayerPos(c.x + (dx / d) * r, p.position.y, c.z + (dz / d) * r);
  }

  /**
   * Move Bobo. Through his component's position when he has one: a joystick
   * behaviour integrates position.value, so writing only the three.js
   * object would be undone on its next frame.
   */
  private _setPlayerPos(x: number, y: number, z: number) {
    const p = this._findPlayer();
    if (!p) return;
    const pos = this._playerComp?.position;
    if (pos && Array.isArray(pos.value)) pos.value = [x, y, z];
    p.position.set(x, y, z);
  }

  private _playCharacter(id?: string) {
    if (!id) return;
    const g = this._game;
    if (g?.playCharacterClip) return g.playCharacterClip(id);
    const clip = this.getZComponentInstance().animation?.layerClipByID?.get(id);
    if (!clip) return;
    clip.seek(0, { dontActivateLayer: true });
    clip.play();
  }

  private _restoreGameUi() {
    if (this._uiWas !== undefined && this._game?.uiEnabled)
      this._game.uiEnabled.value = this._uiWas;
    this._uiWas = undefined;
  }

  /* ── the icon, the menus and the look ── */

  private _syncButton() {
    const hub = this._hub;
    if (!hub) return;
    const g = this._game;
    // Only between rounds: lounge, menus, before the first round. Never mid-round
    // (playing or paused), never before the AR scene has been placed, and not
    // while the hideout is already the mode.
    const st: string | undefined = g?.gameState ?? g?._state;
    const busy =
      !!g &&
      (st === "placing" ||
        !!g.isInHideout ||
        !!g.isIntroOpen || // the card offers the hideout itself
        (!g.isLounging && (st === "playing" || st === "paused")));
    hub.modeButton(this.showButton.value && !this._active && !busy ? () => this.open() : null);
  }

  private _syncGameMenus() {
    const g = this._game;
    if (g?.hideoutEnabled) g.hideoutEnabled.value = !!this.showInMenus.value;
  }

  /** Fit the hideout's UI around the game's: corner buttons, stacking, BOBO OS. */
  private _applyLook() {
    const hub = this._hub;
    if (!hub) return;
    const g = this._game;
    const gameUi = !!g && g.uiEnabled?.value !== false && !this.hideGameUi.value;
    const corner: string = g?.menuCorner?.value ?? "";
    const soundCorner: string = g?.soundToggleCorner?.value ?? "";
    const soundOn = !!g && g.soundToggleEnabled?.value !== false;
    const z = Number(g?.modalLayer?.value);
    hub.configure({
      osSize: clamp(this.osSize.value, 0.5, 1),
      osOpacity: clamp(this.osOpacity.value, 0.4, 1),
      osDim: clamp(this.osDim.value, 0, 0.8),
      // The game's menu button stays in its corner in the room: keep the top bar clear of it.
      hudInsetRight: gameUi && corner === "topRight" ? 62 : 0,
      hudInsetLeft: gameUi && corner === "topLeft" ? 62 : 0,
      // Under the game's dialogs (its menu opens over the room), over its corner buttons.
      zIndex: Number.isFinite(z) && z > 200 ? z - 100 : 2000100,
      // Stack the icon over the game's sound button when that's bottom left.
      modeBottom: !g || (soundOn && soundCorner === "bottomLeft") ? 74 : 16,
      topOffset: Number(this.topOffset.value) || 0,
    });
  }

  /* ── finding things ── */

  private _bindGame() {
    for (const off of this._offGame) off();
    this._offGame = [];
    const zc = this.getZComponentInstance();
    const id = this.gameNode.value;
    let g: any = id ? zc.resolveNodeID<any>(id) : null;
    if (!g) {
      const seen = new Set<any>();
      const walk = (c: any): any => {
        if (!c || seen.has(c)) return null;
        seen.add(c);
        if (c.onGameStart && c.enterLounge && c.playerNode) return c;
        for (const k of c.children ?? []) {
          const hit = walk(k);
          if (hit) return hit;
        }
        return null;
      };
      g = walk(zc);
    }
    this._game = g;
    if (!g) {
      console.warn(
        "[CollectorHubMode] couldn't find the Cola Run game; set Game to your OrbHuntGame node",
      );
      return;
    }
    if (!g.enterHideout || !g.playCharacterClip)
      console.warn(
        "[CollectorHubMode] this OrbHuntGame.ts is older than the hideout; copy in the new one " +
          "so the hideout shows in its menus and follows placement",
      );
    const on = (evt: any, fn: () => void) => {
      if (!evt?.addListener) return;
      evt.addListener(fn);
      this._offGame.push(() => evt.removeListener?.(fn));
    };
    const sync = () => setTimeout(() => this._syncButton());
    for (const e of [
      g.onGameStart,
      g.onLoungeEnter,
      g.onLoungeExit,
      g.onGameEnd,
      g.onTimeUp,
      g.onTargetReached,
      g.onGameReset,
      g.onRewardModalDismissed,
      g.onIntroClose,
    ])
      on(e, sync);
    // The game owns the mode and the placement; the room follows.
    on(g.onHideoutEnter, () => {
      sync();
      this._maybeOpen();
    });
    on(g.onHideoutExit, () => {
      sync();
      void this._leaveRoom("game");
    });
    on(g.onPlace, () => {
      sync();
      // Bobo's spot on the newly placed floor is where his room will stand,
      // whichever mode comes first. Read once the placement has settled.
      void this._settle().then(() => {
        this._rememberHome();
        this._maybeOpen();
      });
    });
    on(g.onResetPlacement, () => {
      this._onReset();
      sync();
    });
    // The game's corner settings decide where the hideout's buttons go.
    for (const o of [
      g.menuCorner,
      g.soundToggleCorner,
      g.soundToggleEnabled,
      g.uiEnabled,
      g.modalLayer,
    ])
      if (o?.addListener) {
        const fn = () => this._applyLook();
        o.addListener(fn);
        this._offGame.push(() => o.removeListener?.(fn));
      }
  }

  private _rememberHome() {
    const p = this._findPlayer();
    if (!p) return;
    this._home.copy(p.position);
    this._homeSet = true;
  }

  private _findPlayer(): THREE.Object3D | undefined {
    if (this._player?.parent) return this._player;
    const zc = this.getZComponentInstance();
    const id = this.playerNode.value || this._game?.playerNode?.value;
    const comp: any = id ? zc.resolveNodeID<any>(id) : null;
    this._playerComp = comp;
    this._player = comp?.element;
    return this._player;
  }

  private _heights = new WeakMap<THREE.Object3D, number>();
  /** Bobo's height in world units (measured once in his parent's space). */
  private _playerHeight(p: THREE.Object3D) {
    const ws = (p.parent ? p.parent.getWorldScale(this._v2).y : 1) || 1;
    let h = this._heights.get(p);
    if (!h) {
      const b = new THREE.Box3().setFromObject(p);
      h = Math.max(0.05, b.max.y - b.min.y) / ws;
      this._heights.set(p, h);
    }
    return h * ws;
  }

  private _recorder(): any {
    const zc = this.getZComponentInstance();
    const seen = new Set<any>();
    const walk = (c: any): any => {
      if (!c || seen.has(c)) return null;
      seen.add(c);
      if (c.onRecordStart && c.buttonVisible) return c;
      for (const k of c.children ?? []) {
        const hit = walk(k);
        if (hit) return hit;
      }
      return null;
    };
    return walk(zc);
  }

  private _recWas: boolean | undefined;
  private _setRecorderVisible(v: boolean) {
    const r = this._recorder();
    if (!r?.buttonVisible) return;
    if (!v) {
      if (this._recWas === undefined) this._recWas = r.buttonVisible.value;
      r.buttonVisible.value = false;
    } else if (this._recWas !== undefined) {
      r.buttonVisible.value = this._recWas;
      this._recWas = undefined;
    }
  }

  private _gone = false;
  public dispose() {
    this._gone = true;
    for (const off of this._offGame) off();
    this._offGame = [];
    this._restoreGameUi();
    this._hub?.dispose();
    this._hub = null;
    return super.dispose();
  }
}
