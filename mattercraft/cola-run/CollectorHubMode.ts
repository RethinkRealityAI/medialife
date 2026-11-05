/* eslint-disable @typescript-eslint/no-explicit-any -- duck-typed game nodes */
/**
 * CollectorHubMode.ts: Mattercraft custom ZComponent
 *
 * Bobo's Hideout as a Cola Run mode. A "Bobo's Hideout" button sits in the
 * corner; tap it and (the first time) the fan unlocks their room with the code
 * from their EVADE merch card plus their email. Then a portal opens a few
 * steps ahead of Bobo. Walk Bobo into it and his room builds in around him:
 * the BOBO OS computer (alerts, Where's Bobo?, leaderboard, Cola Run), the
 * collection wall, and live alerts the EVADE team sends from medialife.ai.
 * The computer's Cola Run app folds the room away and starts a round (or a
 * recorded round).
 *
 * SETUP
 *  1. Copy these into the project's Scripts folder (next to OrbHuntGame.ts):
 *       CollectorHubMode.ts   (this file)
 *       HubCore.ts            (the hub itself; shared with the browser labs)
 *  2. Hierarchy Panel → + → CollectorHubMode, as a sibling of the game (same
 *     parent, so it moves with the game's placement).
 *  3. Leave "Game" empty (it finds OrbHuntGame) or point it at the game node.
 *  4. Ask the MEDIALIFE team to check the experience's origin can load
 *     https://medialife.ai/hub/evade/room.glb (it's served with CORS *).
 *
 * The component never moves your camera. It hides the player while Bobo is
 * in his room and keeps him at the portal, so the joystick can't wander off,
 * and switches the game's own HUD off while the room is open (back on after).
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
   * Show the "Bobo's Hideout" button while lounging and on the game's menu
   * screens. Turn off to open the hideout from your own UI (call open()).
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 80
   * @zdefault true
   */
  public showButton = new Observable(true, () => this._syncButton());

  /**
   * Hide the game's own HUD while the room is open (the room has its own top
   * bar). It comes back when Bobo leaves.
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 70
   * @zdefault true
   */
  public hideGameUi = new Observable(true);

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
  public topOffset = new Observable(0);

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
  private _active = false;
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

    this.register(useOnBeforeRender(contextManager), (dt: number) => this._tick(dt * 0.001)); // dt is ms

    this.getZComponentInstance().constructed.then(() => {
      this._bindGame();
      this._syncButton();
      // Scanned a product's QR (…?hub=BOBO-XXXX-XXXX): straight to the unlock form.
      if (qs.get("hub")) setTimeout(() => this.open(), 600);
    });
  }

  /** Open the hideout: unlock if needed, then the portal ahead of Bobo. */
  public async open() {
    const hub = this._hub;
    if (!hub || this._active) return;
    this._active = true;
    this._syncButton();
    try {
      // A hangout, not a round: no clock, no orbs on the board.
      if (this._game && !this._game.isLounging) this._game.enterLounge?.();
      hub.prompt("Opening the portal…");
      await hub.load();
      hub.prompt(null);
      if (!(await hub.ensureAccess())) return this._close();
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
      hub.showPortal();
      hub.prompt("Walk Bobo into the portal");
      this.onPortal.emit();
    } catch (e) {
      console.error("[CollectorHubMode]", e);
      hub.prompt(null);
      this._close();
    }
  }

  /** Bobo walks out and the room folds away. */
  public async leave(then?: "play" | "record") {
    const hub = this._hub;
    if (!hub || !this._active) return;
    await hub.leave();
    const player = this._findPlayer();
    if (player) {
      // Back out of the portal, a step towards the camera.
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
      player.visible = true;
    }
    this._pinned = false;
    this._restoreGameUi();
    this._setRecorderVisible(true);
    hub.hide();
    this._close();
    this.onLeave.emit();
    if (then && this._game) {
      this._game.exitLounge?.();
      this._game.startGame?.();
      if (then === "record") setTimeout(() => this._recorder()?.startRecording?.(), 500);
    }
  }

  private _close() {
    this._active = false;
    this._hub?.prompt(null);
    this._syncButton();
  }

  private _onHub(name: string, p: any) {
    if (name === "exit") this.leave();
    else if (name === "signedOut") this.leave();
    else if (name === "play") this.leave(p.record ? "record" : "play");
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
      if (hub.distanceToPortal(this._v) < r) {
        // Through the portal: the room's own Bobo takes over and walks home.
        player.visible = false;
        this._pin.copy(player.position);
        this._pinned = true;
        if (this.hideGameUi.value && this._game?.uiEnabled) {
          this._uiWas = this._game.uiEnabled.value;
          this._game.uiEnabled.value = false;
        }
        this._setRecorderVisible(false);
        hub.enter({ walk: true });
        this.onEnter.emit();
      }
    }
    // The joystick still drives the hidden player: keep him at the portal.
    if (this._pinned) player.position.copy(this._pin);
  }

  private _restoreGameUi() {
    if (this._uiWas !== undefined && this._game?.uiEnabled)
      this._game.uiEnabled.value = this._uiWas;
    this._uiWas = undefined;
  }

  /* ── the button ── */

  private _syncButton() {
    const hub = this._hub;
    if (!hub) return;
    const g = this._game;
    // Not in the middle of a timed round: lounge, menus, or before the first round.
    const inRound = g && !g.isLounging && g._state === "playing";
    hub.modeButton(this.showButton.value && !this._active && !inRound ? () => this.open() : null);
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
    if (!g) return;
    const on = (evt: any) => {
      if (!evt?.addListener) return;
      const fn = () => setTimeout(() => this._syncButton());
      evt.addListener(fn);
      this._offGame.push(() => evt.removeListener?.(fn));
    };
    for (const e of [
      g.onGameStart,
      g.onLoungeEnter,
      g.onLoungeExit,
      g.onGameEnd,
      g.onTimeUp,
      g.onTargetReached,
    ])
      on(e);
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
    let h = this._heights.get(p);
    if (!h) {
      const b = new THREE.Box3().setFromObject(p);
      h = Math.max(0.05, b.max.y - b.min.y);
      this._heights.set(p, h);
    }
    return h;
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
      this._recWas = r.buttonVisible.value;
      r.buttonVisible.value = false;
    } else if (this._recWas !== undefined) {
      r.buttonVisible.value = this._recWas;
      this._recWas = undefined;
    }
  }

  public dispose() {
    for (const off of this._offGame) off();
    this._offGame = [];
    this._restoreGameUi();
    this._hub?.dispose();
    this._hub = null;
    return super.dispose();
  }
}
