/* eslint-disable @typescript-eslint/no-explicit-any -- duck-typed game nodes */
/**
 * CollectorHubMode.ts: Mattercraft custom ZComponent
 *
 * Bobo's Hideout as the third Cola Run mode, next to the round and the lounge.
 * The game offers it on its opening card and in its menu ("Visit Bobo's
 * Hideout"), and a small round icon sits in the corner between rounds. The
 * first time, the fan unlocks their room with the code from their EVADE merch
 * card plus their email. Then a portal opens a few steps ahead of Bobo. Walk
 * Bobo into it and his room builds in around him: the BOBO OS computer
 * (alerts, Where's Bobo?, leaderboard, Cola Run), the collection wall, and live
 * alerts the EVADE team sends from medialife.ai.
 *
 * Placement is the game's, for all three modes: pick the hideout before the
 * scene is placed and the room opens once you tap Place. Reset placement while
 * in the room and it disappears at once; Place again and it builds straight
 * back in at the new spot and size (no second walk through the portal).
 *
 * SETUP
 *  1. Copy these into the project's Scripts folder, replacing older copies:
 *       CollectorHubMode.ts   (this file)
 *       HubCore.ts            (the hub itself; shared with the browser labs)
 *       OrbHuntGame.ts        (the game, which now has the hideout mode)
 *  2. Hierarchy Panel → + → CollectorHubMode, as a sibling of the game (same
 *     parent, so it moves with the game's placement).
 *  3. Leave "Game" empty (it finds OrbHuntGame) or point it at the game node.
 *  4. Ask the MEDIALIFE team to check the experience's origin can load
 *     https://medialife.ai/hub/evade/room.glb (it's served with CORS *).
 *
 * The component never moves your camera. It hides the player while Bobo is
 * in his room and keeps him at the portal, so the joystick can't wander off.
 * The game's menu button, sound button and Reset placement stay on screen in
 * the room (the hideout's top bar makes room for the menu button).
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
import { Group } from "@zcomponent/three/lib/components/Group";
import { useCamera } from "@zcomponent/three/lib/scenecontext";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CollectorHub, type HubState } from "./HubCore";

interface ConstructorProps {}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => r())
      : setTimeout(r, 16),
  );

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
   * The character that walks into the portal. Leave empty to use the game's
   * own Player Node.
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
   * How far ahead of Bobo the portal opens, in Bobo heights (2 to 8).
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 100
   * @zdefault 3
   */
  public portalDistance = new Observable(3);

  /**
   * Room size. 1 = the room's Bobo is exactly as tall as your player (0.3 to 3).
   * The room follows the placed scene, so placing the scene bigger or smaller
   * (Reset placement, then Place) resizes the room too.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 90
   * @zdefault 1
   */
  public roomScale = new Observable(1);

  /**
   * How close Bobo has to get to the portal to go through, in Bobo heights.
   * Phones with a joystick want a little more than 0.5.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 80
   * @zdefault 0.7
   */
  public enterRadius = new Observable(0.7);

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

  /** The portal opened. */
  public onPortal = new Event<[]>();
  /** Bobo walked through and the room started building. */
  public onEnter = new Event<[]>();
  /** The room finished building. */
  public onRoomReady = new Event<[]>();
  /** Bobo left and the room folded away. */
  public onLeave = new Event<[]>();
  /** A fan unlocked their room (or added an item). */
  public onUnlocked = new Event<[{ firstClaim: boolean; owned: number }]>();
  /** A live alert from the EVADE team arrived while the room was open. */
  public onAlert = new Event<[{ title: string }]>();

  private _hub: CollectorHub | null = null;
  private _camera?: THREE.Camera;
  private _game: any = null;
  private _player?: THREE.Object3D;
  /** The portal or the room is up (or on its way). */
  private _active = false;
  /** Bumped whenever the room is torn down, so a fold in flight knows it lost. */
  private _seq = 0;
  /** Reset placement happened inside the room: the next Place rebuilds it straight away. */
  private _rebuild = false;
  private _home = new THREE.Vector3();
  private _homeSet = false;
  private _pin = new THREE.Vector3();
  private _pinned = false;
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
        on: (name, p: any) => this._onHub(name, p),
      });
      this._bindGame();
      this._syncGameMenus();
      this._applyLook();
      this._syncButton();
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

  /** Bobo walks out, the room folds away, and the game goes back to the lounge. */
  public leave(then?: "play" | "record") {
    return this._leaveRoom(then ?? "exit");
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
        hub.prompt("Opening the portal…");
        await hub.load();
        hub.prompt(null);
      }
      if (seq !== this._seq) return;
      // Coming back after a re-placement: they're already signed in.
      if (!(rebuild && hub.signedIn) && !(await hub.ensureAccess())) {
        if (seq === this._seq) this._cancelled();
        return;
      }
      if (seq !== this._seq) return;
      if (!this._stillWanted()) return this._close();
      // Let the placement (a timeline in most projects) settle the scene first.
      await nextFrame();
      await nextFrame();
      if (seq !== this._seq || !this._stillWanted()) return this._close();
      const player = this._findPlayer();
      if (!player || !this._camera) {
        console.warn("[CollectorHubMode] no player node or camera; set Player Node");
        return this._close();
      }
      const h = this._playerHeight(player);
      player.getWorldPosition(this._v);
      this._camera.getWorldPosition(this._v2);
      const scale = (h / hub.boboHeight()) * clamp(this.roomScale.value, 0.3, 3);
      hub.placeNear(this._v, this._v2, h * clamp(this.portalDistance.value, 2, 8), scale);
      this._home.copy(player.position);
      this._homeSet = true;
      hub.showPortal();
      this.onPortal.emit();
      if (rebuild) this._goIn(player, false);
      else hub.prompt("Walk Bobo into the portal");
    } catch (e) {
      console.error("[CollectorHubMode]", e);
      hub.prompt(null);
      if (seq === this._seq) this._close();
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

  /** Through the portal: hide the player and build the room around him. */
  private _goIn(player: THREE.Object3D, walk: boolean) {
    const hub = this._hub;
    if (!hub) return;
    player.visible = false;
    this._pin.copy(player.position);
    this._pinned = true;
    if (this.hideGameUi.value && this._game?.uiEnabled) {
      this._uiWas = this._game.uiEnabled.value;
      this._game.uiEnabled.value = false;
    }
    this._setRecorderVisible(false);
    hub.enter({ walk });
    this.onEnter.emit();
  }

  /* ── closing ── */

  /**
   * Bobo walks out and the room folds away.
   *  exit:          walk-out, then the game goes to the lounge (or idle)
   *  play / record: quick fold, then a round (and the recorder)
   *  game:          the game already changed mode (menu): quick fold, nothing else
   */
  private async _leaveRoom(then: "exit" | "play" | "record" | "game") {
    const hub = this._hub;
    if (!hub || !this._active) return;
    const seq = ++this._seq;
    const player = this._findPlayer();
    const inside = hub.state === "building" || hub.state === "live";
    if (inside) {
      if (then === "exit") {
        await hub.leave();
        if (seq !== this._seq) return;
        this._restorePlayer(player, true);
      } else {
        // A round (or another mode) is starting: Bobo is back at once.
        this._restorePlayer(player, true);
        await hub.leave({ fast: true });
        if (seq !== this._seq) return;
      }
    } else this._restorePlayer(player, false);
    hub.hide();
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
   * Reset placement: the scene is about to move, so the room goes at once (no
   * animation) and Bobo is put back where he stood. Place again and _open
   * rebuilds the room there.
   */
  private _suspend() {
    const hub = this._hub;
    if (!hub || !this._active) return;
    ++this._seq;
    this._rebuild = hub.state === "building" || hub.state === "live" || hub.state === "leaving";
    hub.hide();
    const player = this._findPlayer();
    if (player) {
      if (this._homeSet) player.position.copy(this._home);
      player.visible = true;
    }
    this._unpin();
    this._close();
  }

  /** Show the player again, a step out of the portal towards the camera. */
  private _restorePlayer(player: THREE.Object3D | undefined, outOfPortal: boolean) {
    const hub = this._hub;
    if (player && hub) {
      if (outOfPortal) {
        hub.portalPosition(this._v);
        if (this._camera) {
          this._camera.getWorldPosition(this._v2);
          this._v2
            .sub(this._v)
            .setY(0)
            .normalize()
            .multiplyScalar(this._playerHeight(player) * 0.9);
          this._v.add(this._v2);
        }
        if (player.parent) player.parent.worldToLocal(this._v);
        if (this._pinned) this._v.y = this._pin.y; // same floor height as before
        player.position.copy(this._v);
      }
      player.visible = true;
    }
    this._unpin();
  }

  private _unpin() {
    this._pinned = false;
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
    else if (name === "portal") this._hub?.prompt("Walk Bobo into the portal");
    else if (name === "unlocked")
      this.onUnlocked.emit({ firstClaim: !!p.firstClaim, owned: p.me?.owned ?? 0 });
    else if (name === "alert") this.onAlert.emit({ title: p.title });
    else if (name === "state" && (p as HubState) === "live") this.onRoomReady.emit();
  }

  private _tick(dt: number) {
    const hub = this._hub;
    if (!hub) return;
    hub.update(dt);
    if (!this._active) return;
    const player = this._findPlayer();
    if (!player) return;
    if (hub.state === "portal" && player.visible) {
      player.getWorldPosition(this._v);
      const r = this._playerHeight(player) * clamp(this.enterRadius.value, 0.2, 2);
      // Through the portal: the room's own Bobo takes over and walks home.
      if (hub.distanceToPortal(this._v) < r) this._goIn(player, true);
    }
    // The joystick still drives the hidden player: keep him at the portal.
    if (this._pinned) player.position.copy(this._pin);
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
    if (!g.enterHideout)
      console.warn(
        "[CollectorHubMode] this OrbHuntGame.ts has no hideout mode; copy in the new one " +
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
      this._maybeOpen();
    });
    on(g.onResetPlacement, () => {
      this._suspend();
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

  private _findPlayer(): THREE.Object3D | undefined {
    if (this._player?.parent) return this._player;
    const zc = this.getZComponentInstance();
    const id = this.playerNode.value || this._game?.playerNode?.value;
    const comp: any = id ? zc.resolveNodeID<any>(id) : null;
    this._player = comp?.element;
    return this._player;
  }

  private _heights = new WeakMap<THREE.Object3D, number>();
  private _playerHeight(p: THREE.Object3D) {
    // Measured once in the player's parent space, returned in world units: the
    // placed scene's scale can change between placements.
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
