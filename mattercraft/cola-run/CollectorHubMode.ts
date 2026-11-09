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
 *     Overwrite them where they are (same names, same folder) and delete any
 *     second copy: the scene keeps using whichever file it was built with.
 *     The node's Version field then reads v4 (or later).
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

import {
  CollectorHub,
  HIDEOUT_VERSION,
  type HubHome,
  type HubState,
  type RoomFitter,
} from "./HubCore";

const VERSION_LABEL = `v${HIDEOUT_VERSION} · 2026-11-09`;

interface ConstructorProps {}

/** Where the round "Bobo's Hideout" icon sits. */
export enum ButtonCorner {
  /** Stacked under the game's menu button (and the record button, if there is one). */
  UnderMenu = "underMenu",
  TopLeft = "topLeft",
  TopRight = "topRight",
  BottomLeft = "bottomLeft",
  BottomRight = "bottomRight",
}

/** How big the room gets. */
export enum RoomFit {
  /**
   * Sized to the person holding the phone: the loft sits just under their
   * eye level and they stand at the room's open edge, so both floors are in
   * view at once.
   */
  BothFloors = "bothFloors",
  /** Big enough that the person holding the phone stands inside it (AR). */
  AroundViewer = "aroundViewer",
  /** Sized to Bobo only (Room Size × Bobo-sized), wherever the viewer stands. */
  MatchBobo = "matchBobo",
}

/** When BOBO OS becomes the whole game's home screen. */
export enum HomeScreen {
  /** Once this phone has unlocked Bobo's Hideout (a merch code went in). */
  AfterActivation = "afterActivation",
  /** For everyone (handy for testing in the editor). */
  Always = "always",
  /** Never: the game keeps its own menu, and the hideout is one of its modes. */
  Off = "off",
}

/** Where an activated fan lands when the experience opens. */
export enum StartIn {
  MyRoom = "myRoom",
  Lounge = "lounge",
  ColaRun = "colaRun",
}

export enum MenuButtonSpot {
  TopRight = "top",
  BottomCorner = "dock",
}

export enum RecordButtonSpot {
  BottomCentre = "bottomCenter",
  RecorderSetting = "recorder",
}

export enum JoystickSide {
  /** Find the EVADE JoystickController on screen (bottom right if there isn't one). */
  Auto = "auto",
  Left = "left",
  Right = "right",
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const smooth = (t: number) => t * t * (3 - 2 * t);
const UP = new THREE.Vector3(0, 1, 0);
/** The fan's own size, turn and spot for their room, on top of the fitted one. */
interface Fit {
  k: number;
  r: number;
  ox: number;
  oz: number;
}
const FIT_KEY = "mlh-room-fit";
const FIT_MIN = 0.5;
const FIT_MAX = 1.6;
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
   * Which Bobo's Hideout files this project has: v4 or later is the release
   * with no portal. If this field isn't here, or the room still shows a
   * portal, the project is still running older copies of the three files:
   * replace CollectorHubMode.ts, HubCore.ts and OrbHuntGame.ts (same names,
   * same folder) and reload the preview.
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 110
   * @zdefault v4 · 2026-11-06
   */
  public version = new Observable(VERSION_LABEL, (v) => {
    if (v !== VERSION_LABEL) this.version.value = VERSION_LABEL; // read-only
  });

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
   * Where the icon sits. Under Menu (default) stacks it under the game's
   * menu button and the record button, well away from a joystick in the
   * bottom corners.
   *
   * @zui
   * @zgroup Game
   * @zgrouppriority 300
   * @zpriority 78
   * @zdefault underMenu
   */
  public buttonCorner = new Observable<ButtonCorner>(ButtonCorner.UnderMenu, () =>
    this._applyLook(),
  );

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

  /* ══ Home (BOBO OS) ═════════════════════════════════════════════════ */

  /**
   * Make BOBO OS the home screen of the whole game. One button (bottom
   * corner, away from the joystick) opens a sheet with every mode (Cola
   * Run, Lounge, My Room), the apps, music, sound, Move scene, How to play
   * and Join EVADE; Bobo's moves sit behind one action button. The game's
   * own menu, intro card, sound, reset and lounge buttons step aside.
   * After Activation (default): once this phone has unlocked the hideout.
   *
   * @zui
   * @zgroup Home (BOBO OS)
   * @zgrouppriority 250
   * @zpriority 100
   * @zdefault afterActivation
   */
  public homeScreen = new Observable<HomeScreen>(HomeScreen.AfterActivation, () =>
    this._syncShell(),
  );

  /**
   * Where an activated fan lands when they open the experience: My Room
   * (default), the Lounge, or Cola Run.
   *
   * @zui
   * @zgroup Home (BOBO OS)
   * @zgrouppriority 250
   * @zpriority 90
   * @zdefault myRoom
   */
  public startIn = new Observable<StartIn>(StartIn.MyRoom);

  /**
   * Which side your on-screen joystick is on. The home button and Bobo's
   * moves button sit in the other bottom corner, under the thumb that
   * isn't steering. Auto (default) finds the JoystickController on screen
   * and checks again if it moves; with none found it assumes bottom right,
   * the JoystickController's own default.
   *
   * @zui
   * @zgroup Home (BOBO OS)
   * @zgrouppriority 250
   * @zpriority 80
   * @zdefault auto
   */
  public joystickSide = new Observable<JoystickSide>(JoystickSide.Auto, () => this._applyLook());

  /**
   * Where the BOBO OS button sits. Top Right (default) is where a game's
   * menu and pause button usually are: out of the thumbs' way mid-round,
   * and it turns into the pause button while a round is on. The sheet it
   * opens comes up from the bottom, in reach of a thumb. Bottom Corner puts
   * it next to Bobo's moves, away from the joystick.
   *
   * @zui
   * @zgroup Home (BOBO OS)
   * @zgrouppriority 250
   * @zpriority 75
   * @zdefault top
   */
  public menuButton = new Observable<MenuButtonSpot>(MenuButtonSpot.TopRight, () =>
    this._applyLook(),
  );

  /**
   * Where the record button (ColaRunRecorder) goes with BOBO OS as home.
   * Bottom Centre (default): a camera-style shutter in the thumb's reach,
   * clear of the joystick. It steps aside while the scene is being placed
   * (Place sits there) and in the room. Recorder Setting keeps the
   * recorder's own Corner.
   *
   * @zui
   * @zgroup Home (BOBO OS)
   * @zgrouppriority 250
   * @zpriority 70
   * @zdefault bottomCenter
   */
  public recordButton = new Observable<RecordButtonSpot>(RecordButtonSpot.BottomCentre);

  /* ══ Room ════════════════════════════════════════════════════════════ */

  /**
   * Let fans resize, turn and move their room: pinch and twist with two
   * fingers in the room, or Resize room in BOBO OS for a one-handed panel
   * (drag the room to move it there). Their choice is remembered on the
   * phone and comes back every time the room builds.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 110
   * @zdefault true
   */
  public allowAdjust = new Observable(true, (v) =>
    this._hub?.setFitter(v ? this._makeFitter() : null),
  );

  /**
   * How big the room gets.
   *  - Both Floors (default): sized to the person holding the phone. The
   *    loft sits just under their eye level (Eye Level) and they stand at the
   *    open edge (Viewer Spot), so they see both floors at once.
   *  - Around Viewer: Room Scale, grown (up to Max Room Scale) until they're
   *    standing inside it.
   *  - Match Bobo: Room Scale only.
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 100
   * @zdefault bothFloors
   */
  public roomFit = new Observable<RoomFit>(RoomFit.BothFloors);

  /**
   * How big the room is, in Bobo-sized rooms: 1 = the room's own Bobo would
   * be exactly as tall as yours. Default 2.7: a walk-in, room-scale space
   * around Bobo that the person holding the phone stands inside. Placing
   * the scene bigger or smaller resizes the room with it. (0.5 to 10)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 90
   * @zdefault 2.7
   */
  public roomScale = new Observable(2.7);

  /**
   * With Around Viewer: the biggest the room may grow to fit the viewer in
   * too, in Bobo-sized rooms. Someone standing further away than that just
   * walks in. Never smaller than Room Scale. (1 to 20)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 85
   * @zdefault 7.2
   */
  public maxRoomScale = new Observable(7.2);

  /**
   * Where the person holding the phone stands, from the middle of the room
   * (0) to its open edge (1). Default 1.05: just outside the opening, far
   * enough back to see both floors. The room is pushed back (Bobo glides
   * with it, in his bed), brought closer, or grows to put them there.
   * (0.3 to 1.1)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 84
   * @zdefault 1.05
   */
  public viewerSpot = new Observable(1.05);

  /**
   * Lower the room (and Bobo with it) this many Bobo heights below the
   * placed floor as it builds, so the loft sits lower in view. 0 keeps it
   * on the floor. (0 to 3)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 83
   * @zdefault 0.5
   */
  public roomDrop = new Observable(0.5);

  /**
   * With Both Floors: how high the loft's floor sits, as a share of the
   * viewer's eye height. 0.85 is just under eye level, so they look slightly
   * down into the loft. Lower makes the room smaller. (0.3 to 1.5)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 82.5
   * @zdefault 0.85
   */
  public eyeLevel = new Observable(0.85);

  /**
   * How bright the room is. Camera feeds are bright, so the default lifts it
   * above its on-screen look: 1 is the room as modelled. (0.5 to 3)
   *
   * @zui
   * @zgroup Room
   * @zgrouppriority 200
   * @zpriority 82
   * @zdefault 1.6
   */
  public brightness = new Observable(1.6, () => this._applyLook());

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
  /** A move picked on BOBO OS's action button (the game's lounge action number). */
  public onBoboMove = new Event<[{ move: string }]>();

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
      this._loadFit();
      if (this.allowAdjust.value) this._hub.setFitter(this._makeFitter());
      this._bindGame();
      this._syncShell();
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
      this._fails = 0;
    } catch (e) {
      console.error("[CollectorHubMode]", e);
      this._failedAt = performance.now();
      this._fails++;
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
    this._snapGlide(); // Bobo back on his own floor before measuring
    const parent = player.parent;
    const center = (this._homeSet ? this._home : player.position).clone();
    // The room's floor goes under Bobo's feet, whatever his pivot is.
    center.y = this._feetY(player, center.y);
    const bobo = this._playerHeight(player) / (parent ? parent.getWorldScale(this._v).y || 1 : 1);
    const unit = bobo / hub.boboHeight(); // a Bobo-sized room, in the parent's units
    const both = this.roomFit.value === RoomFit.BothFloors;
    // Both Floors sizes to the viewer: Room Scale is then only a floor for tiny scenes.
    const size = both ? 0.5 : clamp(this.roomScale.value, 0.5, 10);
    const drop = clamp(this.roomDrop.value, 0, 3) * bobo;
    hub.placeAround({
      parent,
      center,
      cameraWorld: this._camera!.getWorldPosition(this._v),
      scale: unit * size,
      wrapViewer: this.roomFit.value !== RoomFit.MatchBobo,
      maxScale: unit * Math.max(size, clamp(this.maxRoomScale.value, 1, 20)),
      boboScale: unit,
      viewerSpot: clamp(this.viewerSpot.value, 0.3, 1.1),
      eyeLevel: both ? clamp(this.eyeLevel.value, 0.3, 1.5) : undefined,
      drop: both ? drop : undefined,
    });
    // The room settles back (and down) into place as it builds, Bobo with it:
    // it starts where Bobo stands and glides to where it's been placed.
    this._groundY = player.position.y;
    this._glide.set(hub.lastPush.x, -drop, hub.lastPush.z);
    this._glideBase.copy(hub.root.position).sub(this._glide);
    // The fitted pose; the fan's own size, turn and spot go on top (Adjust room).
    this._baseYaw = hub.root.rotation.y;
    this._baseScale = hub.root.scale.x || 1;
    // Size and turn go about the room's own middle, so it grows and spins
    // where it stands (the fitted room is pushed back from Bobo's spot to
    // wrap the viewer, so his spot would swing the whole room away).
    this._pivot.copy(hub.root.position);
    this._boboUnit = unit;
    this._glideK = 0;
    this._glideTo = 1;
    this._poseRoom();
    // Bobo starts on his spot in the room (it moves with the room when the fan has moved it).
    const spot = this._xf(this._v2.copy(center), this._v2);
    const c = hub.root.position;
    const dx = player.position.x - c.x;
    const dz = player.position.z - c.z;
    if (this._fit.ox || this._fit.oz || Math.hypot(dx, dz) > hub.floorRadius() * 0.8)
      this._setPlayerPos(spot.x, player.position.y, spot.z);
  }

  /* ── the fan's own size, turn and spot (Adjust room) ── */

  private readonly _fit: Fit = { k: 1, r: 0, ox: 0, oz: 0 };
  private _baseYaw = 0;
  private _baseScale = 1;
  private _boboUnit = 1;
  private readonly _pivot = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();

  /** A point of the fitted room (parent space) where the fan's adjustments put it. */
  private _xf(v: THREE.Vector3, out: THREE.Vector3) {
    const f = this._fit;
    const p = this._pivot;
    const o = this._v3.set(f.ox, 0, f.oz).multiplyScalar(this._baseScale);
    o.applyAxisAngle(UP, this._baseYaw);
    return out.copy(v).sub(p).multiplyScalar(f.k).applyAxisAngle(UP, f.r).add(p).add(o);
  }

  /** Where the room's root is at glide k (0 = where it starts building, 1 = settled). */
  private _roomAt(k: number, out: THREE.Vector3) {
    return this._xf(out.copy(this._glideBase).addScaledVector(this._glide, k), out);
  }

  /** Put the room where the glide and the fan's adjustments say. */
  private _poseRoom() {
    const hub = this._hub;
    if (!hub) return;
    this._roomAt(smooth(this._glideK), hub.root.position);
    hub.root.rotation.set(0, this._baseYaw + this._fit.r, 0);
    hub.root.scale.setScalar(this._baseScale * this._fit.k);
    hub.fitBed(this._boboUnit);
    hub.root.updateMatrixWorld(true);
  }

  private _loadFit() {
    try {
      const j = JSON.parse(localStorage.getItem(FIT_KEY) || "null");
      if (!j) return;
      this._fit.k = clamp(Number(j.k) || 1, FIT_MIN, FIT_MAX);
      this._fit.r = Number(j.r) || 0;
      this._fit.ox = clamp(Number(j.ox) || 0, -20, 20);
      this._fit.oz = clamp(Number(j.oz) || 0, -20, 20);
    } catch {
      /* private mode, or nothing saved */
    }
  }

  private _saveFit() {
    try {
      localStorage.setItem(FIT_KEY, JSON.stringify(this._fit));
    } catch {
      /* private mode: it lasts for this visit */
    }
  }

  /**
   * Change the fan's adjustments. While the room is up it moves at once and
   * Bobo goes with it (he keeps his spot in the room, on its floor).
   */
  private _changeFit(p: Partial<Fit>) {
    const hub = this._hub;
    if (!hub) return;
    const up = hub.state !== "hidden" && hub.root.visible;
    const player = up ? this._findPlayer() : undefined;
    const carry = !!player && player.parent === hub.root.parent;
    let local: THREE.Vector3 | null = null;
    const y0 = hub.root.position.y;
    if (carry) {
      hub.root.updateMatrixWorld(true);
      local = hub.root.worldToLocal(player!.getWorldPosition(new THREE.Vector3()));
    }
    Object.assign(this._fit, p);
    this._saveFit();
    if (!up) return;
    this._poseRoom();
    if (carry && local) {
      const w = hub.root.localToWorld(local);
      const q = player!.parent!.worldToLocal(w);
      this._setPlayerPos(q.x, player!.position.y + (hub.root.position.y - y0), q.z);
    }
  }

  private _makeFitter(): RoomFitter {
    return {
      get: () => ({ size: this._fit.k, turn: this._fit.r }),
      range: () => [FIT_MIN, FIT_MAX],
      setSize: (k) => this._changeFit({ k: clamp(k, FIT_MIN, FIT_MAX) }),
      turn: (rad) => {
        let r = this._fit.r + rad;
        r = Math.atan2(Math.sin(r), Math.cos(r));
        this._changeFit({ r });
      },
      move: (from, to) => {
        const hub = this._hub;
        const parent = hub?.root.parent;
        if (!hub || !parent) return;
        const a = parent.worldToLocal(from.clone());
        const b = parent.worldToLocal(to.clone());
        // Into the fitted room's own frame and units.
        const d = b.sub(a).applyAxisAngle(UP, -this._baseYaw).divideScalar(this._baseScale);
        let ox = this._fit.ox + d.x;
        let oz = this._fit.oz + d.z;
        // The spot you placed on stays inside the room, so it can't be
        // dragged off somewhere you'd have to go looking for it.
        const lim = (hub.floorRadius() / (this._baseScale * this._fit.k || 1)) * 0.85;
        const len = Math.hypot(ox, oz);
        if (len > lim) {
          ox *= lim / len;
          oz *= lim / len;
        }
        this._changeFit({ ox, oz });
      },
      reset: () => this._changeFit({ k: 1, r: 0, ox: 0, oz: 0 }),
    };
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
  private _leavingNow = false;
  private async _leaveRoom(then: "exit" | "play" | "record" | "game") {
    const hub = this._hub;
    if (!hub) return;
    // The room can be up with _active already cleared (an outline after a
    // Reset, or a build the safety net started): anything showing folds away.
    const showing = hub.state !== "hidden";
    if (!this._active && !showing) return;
    this._leavingNow = true;
    try {
      await this._leaveRoomInner(hub, then);
    } finally {
      this._leavingNow = false;
    }
  }

  private async _leaveRoomInner(hub: CollectorHub, then: "exit" | "play" | "record" | "game") {
    const seq = ++this._seq;
    this._rebuild = false;
    this._glideTo = 0; // Bobo steps back up onto the real floor as the room folds
    this._walkHome(); // …and back to the spot he was placed on, where the round and the lounge are
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
    // Already folding away (mode switch, Exit): let it finish; the game has left the hideout.
    if (s === "leaving") return;
    if (s === "building" || s === "live" || s === "preview") {
      ++this._seq;
      this._rebuild = true;
      this._homeSet = false; // the next Place sets Bobo's new spot
      this._glideTo = 0; // Bobo rises back to the real floor, the outline with him
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
    else if (name === "signedOut") {
      void this._leaveRoom("exit");
      this._syncShell();
    } else if (name === "play") this._startRound(!!p.record);
    else if (name === "adjust") this._onAdjust(!!p.on);
    else if (name === "osClose") this._resumeAfterHome();
    else if (name === "unlocked") {
      this.onUnlocked.emit({ firstClaim: !!p.firstClaim, owned: p.me?.owned ?? 0 });
      this._syncShell();
    } else if (name === "alert") this.onAlert.emit({ title: p.title });
    else if (name === "state" && (p as HubState) === "live") {
      this._playCharacter(this.roomTimeline.value);
      this.onRoomReady.emit();
    }
  }

  /**
   * Start a Cola Run round from anywhere. The game changes mode at once and
   * counts down, and the room (if it's up) folds away during the count.
   * Games without the countdown: the room folds first, then the round.
   */
  private _startRound(record: boolean) {
    const g = this._game;
    if (!g) return;
    this._pausedByHome = false;
    const counts = g.countdown !== undefined;
    if (counts || this._hub?.state === "hidden") {
      g.startGame?.();
      this._syncButton();
      if (record) setTimeout(() => this._recorder()?.startRecording?.(), counts ? 150 : 500);
    } else void this._leaveRoom(record ? "record" : "play");
  }

  /** The Adjust room panel opened or closed: the joystick steps aside meanwhile. */
  private _stickWas: { j: any; v: boolean | undefined; el?: HTMLElement; vis: string }[] = [];
  private _onAdjust(on: boolean) {
    if (on) {
      this._stickWas = [];
      for (const j of ((globalThis as any).__mattercraftJoysticks as any[] | undefined) ?? []) {
        const el = j?.joystickContainer as HTMLElement | undefined;
        const obs = typeof j?.visible?.value === "boolean" ? j.visible : undefined;
        if (obs?.value === false) continue;
        // Its own switch where it has one, and the element as well: a stick
        // under a finger that's dragging the room would steal the drag.
        this._stickWas.push({ j, v: obs?.value, el, vis: el?.style.visibility ?? "" });
        if (obs) obs.value = false;
        if (el) el.style.visibility = "hidden";
      }
    } else {
      for (const { j, v, el, vis } of this._stickWas) {
        if (typeof v === "boolean") j.visible.value = v;
        if (el) el.style.visibility = vis;
      }
      this._stickWas = [];
    }
    this._applyLook();
  }

  private _layoutT = 0;
  private _tick(dt: number) {
    const hub = this._hub;
    if (!hub) return;
    this._stepGlide(dt);
    this._stepHome(dt);
    hub.update(dt);
    // The record button shows and hides with the game: keep the icon clear of it.
    // And make sure the room matches the game's mode (see _reconcile).
    if ((this._layoutT += dt) > 0.25) {
      this._layoutT = 0;
      hub.layoutModeButton();
      this._reconcile();
      if (this._lookKey() !== this._layoutKey) this._applyLook();
      this._syncRecorder();
      this._syncButton(); // the countdown has no event of its own
      hub.syncHome();
    }
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

  /* The room's settle-back glide (push back + drop), shared with Bobo. */
  private readonly _glide = new THREE.Vector3();
  private readonly _glideBase = new THREE.Vector3();
  private _glideK = 0;
  private _glideTo = 0;
  private _groundY = 0; // Bobo's height on the real floor, in his parent's space

  /** Move the glide toward its target; Bobo moves by the same amount. */
  private _stepGlide(dt: number) {
    if (this._glideK === this._glideTo) return;
    const prev = this._glideK;
    const rate = dt / (this._glideTo > prev ? 1.6 : 0.7);
    this._glideK =
      this._glideTo > prev
        ? Math.min(this._glideTo, prev + rate)
        : Math.max(this._glideTo, prev - rate);
    this._applyGlide(smooth(prev), smooth(this._glideK));
  }

  private _applyGlide(from: number, to: number) {
    const hub = this._hub;
    const d = to - from;
    if (!hub || Math.abs(d) < 1e-6) return;
    // Settling in, Bobo rides along with the room. Coming back up, he stays
    // wherever he's walked to and only rises to the real floor.
    const p = this._findPlayer();
    const a = this._roomAt(from, new THREE.Vector3());
    const b = this._roomAt(to, new THREE.Vector3());
    const zero = this._roomAt(0, new THREE.Vector3());
    if (p && p.parent === hub.root.parent)
      this._setPlayerPos(
        p.position.x + (d > 0 ? b.x - a.x : 0),
        this._groundY + (b.y - zero.y),
        p.position.z + (d > 0 ? b.z - a.z : 0),
      );
    if (hub.state !== "hidden") this._poseRoom();
  }

  private _homeT = -1;
  private readonly _homeFrom = new THREE.Vector3();
  /** Glide Bobo back to where he was placed (the room may have taken him a long way). */
  private _walkHome() {
    const p = this._findPlayer();
    const hub = this._hub;
    if (!p || !hub || !this._homeSet || p.parent !== hub.root.parent) return;
    if (Math.hypot(p.position.x - this._home.x, p.position.z - this._home.z) < 1e-3) return;
    this._homeFrom.copy(p.position);
    this._homeT = 0;
  }

  private _stepHome(dt: number) {
    if (this._homeT < 0) return;
    const p = this._findPlayer();
    if (!p) {
      this._homeT = -1;
      return;
    }
    this._homeT = Math.min(1, this._homeT + dt / 0.8);
    const k = smooth(this._homeT);
    const f = this._homeFrom;
    const h = this._home;
    this._setPlayerPos(f.x + (h.x - f.x) * k, p.position.y, f.z + (h.z - f.z) * k);
    if (this._homeT >= 1) this._homeT = -1;
  }

  /** Put Bobo straight back where the glide started (before re-placing). */
  private _snapGlide() {
    const k = this._glideK;
    this._glideK = this._glideTo = 0;
    this._applyGlide(smooth(k), 0);
  }

  private _failedAt = -1e9;
  private _fails = 0;
  /**
   * The safety net under the event wiring: four times a second, check that
   * the room matches what the game is doing, and fix it if an event was
   * missed (a timeline that places the scene without the game's Place
   * button, events arriving out of order, a failed open).
   *  - Hideout mode, scene placed, room only an outline or not there: build it.
   *  - Not hideout mode any more, room still up: fold it away.
   *  - The scene went back to placing without a Reset: outline mode.
   */
  private _reconcile() {
    const hub = this._hub;
    const g = this._game;
    if (!hub || !g?.enterHideout || !hub.loaded) return;
    const s = hub.state;
    const now = performance.now();
    if (!g.isInHideout) {
      if ((s === "live" || s === "building" || s === "preview") && !this._leavingNow)
        void this._leaveRoom("game");
      return;
    }
    if (!this._placedOk()) {
      if (s === "live" || s === "building") this._onReset();
      return;
    }
    // In hideout mode and placed: the room should be up or on its way.
    if (this._active || s === "building" || s === "live" || s === "leaving") return;
    if (now - this._failedAt < 3000 * Math.min(4, this._fails)) return;
    if (s === "preview") this._rebuild = true;
    // A cancelled unlock form takes the game out of hideout mode, so this
    // never re-opens a form someone just closed.
    void this._open();
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
        !!g.isCountingDown || // a round is about to start
        (!g.isLounging && (st === "playing" || st === "paused")));
    // BOBO OS as home has My Room in its sheet: no separate icon.
    const show = this.showButton.value && !this._active && !busy && !this._shellOn;
    hub.modeButton(show ? () => this.open() : null);
  }

  private _syncGameMenus() {
    const g = this._game;
    if (g?.hideoutEnabled) g.hideoutEnabled.value = !!this.showInMenus.value;
  }

  /* ── BOBO OS as the game's home screen ── */

  private _layoutKey = "";
  /** What the layout depends on that can change under us (the joystick, the record button). */
  private _lookKey() {
    return `${this._stickSide()}${this._recCorner()}${this._stickClear()}`;
  }
  /** How much of the bottom of the screen the joystick takes (px), 0 with none showing. */
  private _stickClear() {
    if (typeof document === "undefined") return 0;
    let clear = 0;
    for (const j of ((globalThis as any).__mattercraftJoysticks as any[] | undefined) ?? []) {
      const el = j?.joystickContainer as HTMLElement | undefined;
      if (!el?.isConnected || j?.visible?.value === false) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      clear = Math.max(clear, innerHeight - r.top);
    }
    return Math.round(clamp(clear, 0, 400) / 4) * 4;
  }

  private _recCornerWas: string | undefined;
  /**
   * The record button with BOBO OS as home: a shutter at the bottom centre
   * (Record Button), and out of the way while the scene is being placed
   * (Place sits there) and while the room is up (it's for runs).
   */
  private _syncRecorder() {
    const r = this._recorder();
    if (!r) return;
    const bc = this._shellOn && this.recordButton.value === RecordButtonSpot.BottomCentre;
    if (r.corner) {
      if (bc) {
        if (this._recCornerWas === undefined) this._recCornerWas = r.corner.value;
        if (r.corner.value !== "bottomCenter") r.corner.value = "bottomCenter";
      } else if (this._recCornerWas !== undefined) {
        r.corner.value = this._recCornerWas;
        this._recCornerWas = undefined;
      }
    }
    const hub = this._hub;
    const roomUp = this._active || (!!hub && hub.state !== "hidden");
    const placing = this._game?.gameState === "placing";
    this._setRecorderVisible(!(roomUp || (bc && placing)));
  }
  /** The record button's corner (ColaRunRecorder), when BOBO OS is home and it's in a top one. */
  private _recCorner(): "tr" | "tl" | "" {
    if (!this._shellOn || typeof document === "undefined") return "";
    const el = document.querySelector(".crc-anchor");
    return el?.classList.contains("crc-tr") ? "tr" : el?.classList.contains("crc-tl") ? "tl" : "";
  }
  /** Where the joystick is: the property, or (Auto) where it is on screen. */
  private _stickSide(): "left" | "right" {
    const pick = this.joystickSide.value;
    if (pick === JoystickSide.Left || pick === JoystickSide.Right) return pick;
    // The EVADE JoystickController registers itself here.
    const list = (globalThis as any).__mattercraftJoysticks as any[] | undefined;
    for (const j of list ?? []) {
      const el = j?.joystickContainer as HTMLElement | undefined;
      if (!el?.isConnected || j?.visible?.value === false) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      // Bottom centre counts as left: the dock takes the right-hand corner.
      return r.left + r.width / 2 > innerWidth * 0.6 ? "right" : "left";
    }
    return "right";
  }

  private _shellOn = false;
  private _pausedByHome = false;
  private _startedHome = false;

  /** Turn the home screen on or off to match Home Screen and the sign-in. */
  private _syncShell() {
    const hub = this._hub;
    const g = this._game;
    if (!hub) return;
    const pick = this.homeScreen.value;
    const want =
      !!g?.setShell && (pick === HomeScreen.Always || (pick !== HomeScreen.Off && hub.signedIn));
    if (want === this._shellOn) return;
    this._shellOn = want;
    // Signed out with a round paused under BOBO OS: the game's own menu takes over (its close resumes).
    if (!want && this._pausedByHome) {
      this._pausedByHome = false;
      if (g && (g.gameState === "paused" || g.isCountdownHeld)) setTimeout(() => g.showMenu?.(), 0);
    }
    hub.setHome(want ? this._homeHost() : null);
    g?.setShell?.(want ? { openHome: () => hub.openHome() } : null);
    this._applyLook();
    this._syncButton();
    this._syncRecorder(); // back to its own corner at once on sign-out
    // An activated fan opening the experience lands in their spot (once).
    if (want && !this._startedHome && g && !g.isInHideout && !g.isLounging) {
      const st: string | undefined = g.gameState;
      if (st !== "playing" && st !== "paused") {
        if (this.startIn.value === StartIn.MyRoom) this.open();
        else if (this.startIn.value === StartIn.Lounge && g.loungeEnabled?.value !== false)
          g.enterLounge?.();
      }
    }
    this._startedHome = true;
  }

  /** Give the round back once nothing of BOBO OS is open over it. */
  private _resumeAfterHome() {
    const hub = this._hub;
    const g = this._game;
    if (!this._pausedByHome || !hub || !g) return;
    if (hub.homeOpen || g.isIntroOpen) return;
    this._pausedByHome = false;
    if (g.gameState === "paused" || g.isCountdownHeld) g.resumeGame?.();
  }

  private _homeHost(): HubHome {
    const game = () => this._game;
    const mode = (): ReturnType<HubHome["mode"]> => {
      const g = game();
      if (!g) return "idle";
      if (g.isInHideout) return "room";
      if (g.isLounging) return "lounge";
      if (g.isCountingDown) return g.isCountdownHeld ? "paused" : "play";
      const st: string | undefined = g.gameState;
      if (st === "playing") return "play";
      if (st === "paused") return "paused";
      if (st === "placing") return "placing";
      return "idle";
    };
    return {
      mode,
      status: () => {
        const g = game();
        const placing = g?.gameState === "placing";
        switch (mode()) {
          case "room": {
            if (placing) return "Point at the floor, then tap Place";
            const me = this._hub?.me;
            const total = me?.collection?.products.length || me?.total || 0;
            return total
              ? `In your room · ${me?.owned ?? 0} of ${total} collected`
              : "In your room";
          }
          case "lounge":
            return placing ? "Point at the floor, then tap Place" : "Hanging out with Bobo";
          case "play": {
            const r = g?.roundStatus;
            return r ? `Cola Run · ${r.score} of ${r.target} cans` : "Cola Run";
          }
          case "paused": {
            const r = g?.roundStatus;
            return r ? `Paused · ${r.left} ${r.left === 1 ? "can" : "cans"} to go` : "Paused";
          }
          case "placing":
            return "Point at the floor, then tap Place";
          default:
            return g?.gameState === "won"
              ? "Round won · your reward is waiting"
              : "Ready when you are";
        }
      },
      moves: () => game()?.loungeMoves ?? [],
      move: (id) => {
        const g = game();
        if (!g) return;
        g.loungeMove?.(id);
        this.onBoboMove.emit({ move: id });
      },
      movesReady: () => {
        const g = game();
        if (!g || g.gameState === "placing") return false;
        if (g.isLounging) return true;
        return !!g.isInHideout && this._hub?.state === "live";
      },
      go: (to) => {
        const g = game();
        if (!g) return;
        this._pausedByHome = false;
        if (to === "resume") g.resumeGame?.();
        else if (to === "restart") g.startGame?.();
        else if (to === "play") this._startRound(false);
        else if (to === "lounge") g.enterLounge?.();
        else if (to === "room") this.open();
      },
      howTo: () => game()?.showIntro?.(),
      replace: () => {
        this._pausedByHome = false;
        game()?.resetPlacement?.();
      },
      join: () => {
        const g = game();
        return g && g.claimEnabled?.value !== false
          ? { label: String(g.claimLabel?.value || "Join EVADE") }
          : null;
      },
      doJoin: () => game()?.claim?.(),
      reward: () => {
        const g = game();
        if (!g?.rewardEarned || g.rewardEnabled?.value === false) return null;
        return {
          title: String(g.rewardModalTitle?.value || "Your reward"),
          sub: `${String(g.instructionsMenuLabel?.value || "How to claim")} · your code is inside`,
        };
      },
      doReward: () => {
        this._pausedByHome = false;
        game()?.showInstructions?.();
      },
      audio: () => ({
        music: game()?.musicEnabled?.value !== false,
        sound: game()?.soundEnabled?.value !== false,
      }),
      setAudio: (kind, on) => {
        const g = game();
        const o = kind === "music" ? g?.musicEnabled : g?.soundEnabled;
        if (o) o.value = on;
      },
      opened: () => {
        const g = game();
        const st: string | undefined = g?.gameState;
        const counting = !!g?.isCountingDown;
        if (st === "playing" || counting) g.pauseGame?.();
        if (st === "playing" || st === "paused" || counting) this._pausedByHome = true;
      },
      closed: () => this._resumeAfterHome(),
    };
  }

  /** Fit the hideout's UI around the game's: corner buttons, stacking, BOBO OS. */
  private _applyLook() {
    const hub = this._hub;
    if (!hub) return;
    const g = this._game;
    // With BOBO OS as home the game's menu button is gone from its corner.
    const gameUi = !!g && g.uiEnabled?.value !== false && !this.hideGameUi.value && !this._shellOn;
    const rgb = (v: unknown) =>
      Array.isArray(v) && v.length >= 3
        ? `rgb(${v
            .slice(0, 3)
            .map((x: number) => Math.round(clamp(Number(x), 0, 1) * 255))
            .join(",")})`
        : undefined;
    const corner: string = g?.menuCorner?.value ?? "";
    const soundCorner: string = g?.soundToggleCorner?.value ?? "";
    const soundOn = !!g && g.soundToggleEnabled?.value !== false;
    const z = Number(g?.modalLayer?.value);
    this._layoutKey = this._lookKey();
    const menuTop = this._shellOn && this.menuButton.value !== MenuButtonSpot.BottomCorner;
    hub.configure({
      osSize: clamp(this.osSize.value, 0.5, 1),
      osOpacity: clamp(this.osOpacity.value, 0.4, 1),
      osDim: clamp(this.osDim.value, 0, 0.8),
      // The game's menu button stays in its corner in the room: keep the top bar clear of it.
      // With BOBO OS as home the record button moves up into that corner instead.
      hudInsetRight:
        gameUi && corner === "topRight" ? 62 : menuTop ? 66 : this._recCorner() === "tr" ? 58 : 0,
      hudInsetLeft: gameUi && corner === "topLeft" ? 62 : this._recCorner() === "tl" ? 58 : 0,
      menuSpot: menuTop || !this._shellOn ? "top" : "dock",
      stickClear: this._stickClear(),
      // Under the game's dialogs (its menu opens over the room), over its corner buttons.
      zIndex: Number.isFinite(z) && z > 200 ? z - 100 : 2000100,
      ...this._iconSpot(gameUi, corner, soundOn ? soundCorner : ""),
      brightness: clamp(Number(this.brightness.value), 0.5, 3),
      topOffset: Number(this.topOffset.value) || 0,
      joystickSide: this._stickSide(),
      // The game's own mode colours, so BOBO OS and the game read as one.
      accents: {
        play: rgb(g?.uiAccent?.value),
        lounge: rgb(g?.loungeAccent?.value),
        room: rgb(g?.hideoutAccent?.value),
      },
    });
  }

  /**
   * Where the round icon goes. Under Menu: the game menu's corner, below the
   * menu button and the record button. Other corners step past whatever of
   * the game's own buttons share them, so the icon never sits on a joystick
   * (bottom corners are left to it unless picked) or on another button.
   */
  private _iconSpot(gameUi: boolean, menuCorner: string, soundCorner: string) {
    const g = this._game;
    const pick = this.buttonCorner.value;
    const corner = (pick === ButtonCorner.UnderMenu || !pick ? menuCorner || "topRight" : pick) as
      "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
    let gap = 14;
    if (gameUi && menuCorner === corner) gap = 78; // under (or over) the 54 px menu button
    // The record button (ColaRunRecorder) is measured on screen: it has nudges of its own.
    const modeAvoid = ".crc-anchor";
    if (corner.startsWith("bottom")) {
      if (g && soundCorner === corner) gap = Math.max(gap, 74);
      if (g && g.resetCorner?.value === corner) gap = Math.max(gap, 74);
      return { modeCorner: corner, modeBottom: gap, modeAvoid };
    }
    return { modeCorner: corner, modeTop: gap, modeAvoid };
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
    if (g.hideoutVersion !== HIDEOUT_VERSION) {
      const msg =
        "Bobo's Hideout files don't match: replace OrbHuntGame.ts, CollectorHubMode.ts and " +
        "HubCore.ts with the same release";
      console.warn("[CollectorHubMode] " + msg, { game: g.hideoutVersion, hub: HIDEOUT_VERSION });
      // Never ships like this, so say it where it'll be seen: in the preview.
      setTimeout(() => this._hub?.toast(msg), 1500);
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
    const sync = () =>
      setTimeout(() => {
        this._syncButton();
        this._hub?.syncHome();
      });
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
    // How to play opened from BOBO OS mid-round: closing it hands the round back.
    on(g.onIntroClose, () => this._resumeAfterHome());
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
      g.resetCorner,
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

  /**
   * The height of Bobo's feet in his parent's space: the bottom of his
   * bounds, under where he stands. Falls back to his position when the
   * bounds are odd (nothing visible, or far from him).
   */
  private _feetY(p: THREE.Object3D, fallback: number) {
    const parent = p.parent;
    if (!parent) return fallback;
    const b = new THREE.Box3().setFromObject(p);
    if (b.isEmpty()) return fallback;
    p.getWorldPosition(this._v2);
    this._v2.y = b.min.y;
    const y = parent.worldToLocal(this._v2).y;
    const h = this._playerHeight(p) / (parent.getWorldScale(this._v2).y || 1);
    return Math.abs(y - fallback) <= h ? y : fallback;
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
    // Mid-adjust when the scene went: give the joysticks back.
    if (this._stickWas.length) this._onAdjust(false);
    return super.dispose();
  }
}
