/* eslint-disable @typescript-eslint/no-explicit-any -- duck-typed browser APIs and game nodes */
/**
 * ColaRunRecorder.ts: Mattercraft custom ZComponent
 *
 * A small record button for Cola Run. Players tap it, play, tap again (or hit
 * the time limit), watch their clip back, and send it to "Where is Bobo?" on
 * medialife.ai with one tap, or save it to their phone.
 *
 * SETUP
 *  1. Copy BOTH files into the project's Scripts folder (next to OrbHuntGame.ts):
 *       ColaRunRecorder.ts   (this file)
 *       CaptureCore.ts       (the recorder itself; shared with the browser lab)
 *  2. Hierarchy Panel → + → ColaRunRecorder (anywhere under the scene root).
 *  3. Optional: set "Game" to your OrbHuntGame node so the score is drawn on
 *     the video. Left empty, it finds the game itself.
 *  4. Ask the MEDIALIFE team to add the published experience's address (its
 *     origin, e.g. https://xxxx.zappar.io) to BOBO_INGEST_ORIGINS on Netlify,
 *     or uploads are refused (that list is what stands in for a password,
 *     since a phone can't keep one).
 *
 * The recording is the WebGL canvas (camera image + 3D) with a branded
 * overlay, plus the game's sound. The HTML HUD is not in the canvas, so the
 * score is redrawn onto the video instead. Recording is not possible inside a
 * WebXR session (Android Chrome after placement: the camera image never
 * reaches the page there), so the button hides while one is running.
 */
import {
  AudioContextContext,
  ContextManager,
  Event,
  Observable,
  isDesignTime,
  useCanvas,
  useOnAfterRender,
  useOverlay,
} from "@zcomponent/core";
import { Group } from "@zcomponent/three/lib/components/Group";
import { useRenderer } from "@zcomponent/three/lib/context";

import {
  ColaCapture,
  DEFAULT_SETTINGS,
  type CaptureCorner,
  type CaptureSettings,
  type HudInfo,
} from "./CaptureCore";

/** Which corner of the screen the record button sits in. */
export enum RecorderCorner {
  TopRight = "topRight",
  TopLeft = "topLeft",
  BottomRight = "bottomRight",
  BottomLeft = "bottomLeft",
}

interface ConstructorProps {}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const hex = (c: [number, number, number]) =>
  "#" +
  c
    .map((x) =>
      Math.round(clamp(x, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/**
 * Record button for Cola Run: record, review, send to Where is Bobo? or save.
 *
 * @zcomponent
 * @zicon screen_record
 * @ztag three/Object3D/Group/ColaRunRecorder
 * @zparents three/Object3D/Group/**
 */
export class ColaRunRecorder extends Group {
  /* ══ Recording ═══════════════════════════════════════════════════════ */

  /**
   * Longest clip, in seconds (5 to 60). Recording stops on its own at this
   * point. 30 s keeps uploads around 15 MB on a phone.
   *
   * @zui
   * @zgroup Recording
   * @zgrouppriority 300
   * @zpriority 100
   * @zdefault 30
   */
  public maxSeconds = new Observable(30, (v) => {
    const c = Math.round(clamp(v, 5, 60));
    if (c !== v) this.maxSeconds.value = c;
    this._set({ maxSeconds: c });
  });

  /**
   * Include the game's music and sound effects in the clip. The microphone is
   * never recorded.
   *
   * @zui
   * @zgroup Recording
   * @zgrouppriority 300
   * @zpriority 90
   * @zdefault true
   */
  public recordGameAudio = new Observable(true);

  /**
   * Draw the game name and the player's score onto the video, so a clip
   * shared anywhere still says where it came from.
   *
   * @zui
   * @zgroup Recording
   * @zgrouppriority 300
   * @zpriority 80
   * @zdefault true
   */
  public watermark = new Observable(true, (v) => this._set({ watermark: v }));

  /**
   * Big text on the video's badge.
   *
   * @zui
   * @zgroup Recording
   * @zgrouppriority 300
   * @zpriority 70
   * @zdefault COLA RUN
   */
  public brandTitle = new Observable("COLA RUN", (v) => this._set({ brandTitle: v }));

  /**
   * Small line under it. Leave empty for a one-line badge.
   *
   * @zui
   * @zgroup Recording
   * @zgrouppriority 300
   * @zpriority 60
   * @zdefault Where is Bobo? · EVADE
   */
  public brandTagline = new Observable("Where is Bobo? · EVADE", (v) =>
    this._set({ brandTagline: v }),
  );

  /**
   * Your Cola Run game node, so the score can go on the video. Leave empty
   * and the recorder finds the game by itself.
   *
   * @zui
   * @zgroup Recording
   * @zgrouppriority 300
   * @zpriority 50
   * @zvalues nodeids three/Object3D/**
   */
  public gameNode = new Observable<string | undefined>(undefined, () => this._bindGame());

  /* ══ Button ══════════════════════════════════════════════════════════ */

  /**
   * Show or hide the record button (animatable, e.g. hide it on an intro state).
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 100
   * @zdefault true
   */
  public buttonVisible = new Observable(true, (v) => this._capture?.setVisible(v));

  /**
   * Corner for the button. Top right puts it just under the game's menu
   * button, where it's easy to reach but out of the way of the joystick.
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 90
   * @zdefault topRight
   */
  public corner = new Observable<RecorderCorner>(RecorderCorner.TopRight, (v) =>
    this._set({ corner: v as unknown as CaptureCorner }),
  );

  /**
   * Nudge sideways, in pixels (positive moves it in from the edge).
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 80
   * @zdefault 0
   */
  public offsetX = new Observable(0, (v) => this._set({ offsetX: clamp(v, -400, 400) }));

  /**
   * Nudge up or down, in pixels (positive moves it away from the corner).
   * The default sits under a 54 px menu button; raise it if your menu is taller.
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 70
   * @zdefault 0
   */
  public offsetY = new Observable(0, (v) => this._set({ offsetY: clamp(v, -400, 800) }));

  /**
   * Show a one-time tip next to the button when the first round starts
   * (remembered per phone).
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 60
   * @zdefault true
   */
  public showHint = new Observable(true);

  /**
   * The tip's text.
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 50
   * @zdefault Record your run and send it to the Bobo globe
   */
  public hintText = new Observable("Record your run and send it to the Bobo globe", (v) =>
    this._set({ hintText: v }),
  );

  /**
   * Accent colour for the review sheet and badge. Defaults to the game's UI accent.
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 40
   * @ztype color-norm-rgb
   * @zdefault [0.31, 0.84, 0.91]
   */
  public accent = new Observable<[number, number, number]>([0.31, 0.84, 0.91], (v) =>
    this._set({ accent: hex(v) }),
  );

  /**
   * Hide the button while a WebXR session runs (recording can't see the
   * camera there). Turn off only to test.
   *
   * @zui
   * @zgroup Button
   * @zgrouppriority 200
   * @zpriority 30
   * @zdefault true
   */
  public hideInWebXR = new Observable(true, (v) => this._set({ hideInXR: v }));

  /* ══ Sending ═════════════════════════════════════════════════════════ */

  /**
   * Offer "Send to Where is Bobo?". Off = players can only save their clip.
   *
   * @zui
   * @zgroup Sending
   * @zgrouppriority 100
   * @zpriority 100
   * @zdefault true
   */
  public sendEnabled = new Observable(true, (v) => this._set({ sendEnabled: v }));

  /**
   * The site that receives clips. A preview deploy's address works for testing.
   *
   * @zui
   * @zgroup Sending
   * @zgrouppriority 100
   * @zpriority 90
   * @ztype url
   * @zdefault https://medialife.ai
   */
  public endpoint = new Observable("https://medialife.ai");

  /**
   * Opened by "See the globe" after sending (in a new tab, so the game keeps running).
   *
   * @zui
   * @zgroup Sending
   * @zgrouppriority 100
   * @zpriority 80
   * @ztype url
   * @zdefault https://medialife.ai/evade/where-is-bobo/
   */
  public globeUrl = new Observable("https://medialife.ai/evade/where-is-bobo/");

  /**
   * The send button's label.
   *
   * @zui
   * @zgroup Sending
   * @zgrouppriority 100
   * @zpriority 70
   * @zdefault Send to Where is Bobo?
   */
  public sendLabel = new Observable("Send to Where is Bobo?", (v) => this._set({ sendLabel: v }));

  /**
   * The small print under the buttons. Say plainly who sees the clip and what
   * happens to it.
   *
   * @zui
   * @zgroup Sending
   * @zgrouppriority 100
   * @zpriority 60
   * @ztype text-multiline
   * @zdefault The EVADE team checks every clip first. If it's picked, it can show on the Where is Bobo? globe with your city, never your exact location.
   */
  public consentText = new Observable(DEFAULT_SETTINGS.consentText, (v) =>
    this._set({ consentText: v }),
  );

  /**
   * Stored with each clip so the team can tell experiences apart.
   *
   * @zui
   * @zgroup Sending
   * @zgrouppriority 100
   * @zpriority 50
   * @zdefault cola-run
   */
  public source = new Observable("cola-run");

  /* ══ Events (wire to timelines, analytics, pausing the game) ════════ */

  /** Recording started. */
  public onRecordStart = new Event<[]>();
  /** Recording stopped; payload is the clip length in seconds. */
  public onRecordStop = new Event<[{ seconds: number }]>();
  /** The review sheet opened (a good moment to pause the round). */
  public onReviewOpen = new Event<[]>();
  /** The review sheet closed. */
  public onReviewClose = new Event<[]>();
  /** A clip reached the globe's inbox. */
  public onSent = new Event<[{ id: string }]>();
  /** A clip was saved or shared from the phone. */
  public onSaved = new Event<[]>();

  private _capture: ColaCapture | null = null;
  private _hud: HudInfo = {};
  private _gameOff: Array<() => void> = [];
  private _hinted = false;

  constructor(
    contextManager: ContextManager,
    public constructorProps: ConstructorProps,
  ) {
    super(contextManager, constructorProps);
    if (isDesignTime(contextManager)) return; // no DOM in the editor's viewport

    const overlay = useOverlay(contextManager);
    const audio = contextManager.get(AudioContextContext);
    const renderer = useRenderer(contextManager) as any;

    this._capture = new ColaCapture({
      canvas: useCanvas(contextManager),
      host: overlay.value,
      endpoint: this.endpoint.value,
      globeUrl: this.globeUrl.value,
      source: this.source.value,
      audioContext: audio.audioContext,
      connectAudio: (dest) => {
        if (!this.recordGameAudio.value) return () => undefined;
        // every mixer layer (music, effects), like Zappar's own VideoRecorder
        const layers = [...audio.layers.values()];
        for (const l of layers) l.connect(dest);
        return () => {
          for (const l of layers) {
            try {
              l.disconnect(dest);
            } catch {
              /* already gone */
            }
          }
        };
      },
      isXR: () => !!renderer?.xr?.isPresenting,
      on: (name, payload: any) => {
        if (name === "recordStart") this.onRecordStart.emit();
        else if (name === "recordStop") this.onRecordStop.emit({ seconds: payload.seconds });
        else if (name === "reviewOpen") this.onReviewOpen.emit();
        else if (name === "reviewClose") this.onReviewClose.emit();
        else if (name === "sent") this.onSent.emit(payload);
        else if (name === "saved") this.onSaved.emit();
      },
    });
    this._set({
      maxSeconds: Math.round(clamp(this.maxSeconds.value, 5, 60)),
      watermark: this.watermark.value,
      brandTitle: this.brandTitle.value,
      brandTagline: this.brandTagline.value,
      corner: this.corner.value as unknown as CaptureCorner,
      offsetX: this.offsetX.value,
      offsetY: this.offsetY.value,
      hintText: this.hintText.value,
      accent: hex(this.accent.value),
      hideInXR: this.hideInWebXR.value,
      sendEnabled: this.sendEnabled.value,
      sendLabel: this.sendLabel.value,
      consentText: this.consentText.value,
    });
    this._capture.setVisible(this.buttonVisible.value);

    // the overlay is swapped when WebXR starts; follow it
    this.register(overlay, (el) => this._capture?.mount(el));
    // read the URLs at send time, so timelines/states can change them
    this.register(this.endpoint, (v) => this._opt("endpoint", v));
    this.register(this.globeUrl, (v) => this._opt("globeUrl", v));
    this.register(this.source, (v) => this._opt("source", v));
    // draw each frame into the recording in the render's own task (the WebGL
    // buffer is cleared after it)
    this.register(useOnAfterRender(contextManager), (_dt: number) => {
      this._capture?.frame();
    });

    this.getZComponentInstance().constructed.then(() => this._bindGame());
  }

  private _set(p: Partial<CaptureSettings>) {
    if (!this._capture) return;
    Object.assign(this._capture.settings, p);
    this._capture.apply();
  }

  private _opt(key: "endpoint" | "globeUrl" | "source", v: string) {
    this._capture?.configure({ [key]: v });
  }

  /* ── the game: score for the video, hint on the first round ── */

  private _findGame(): any {
    const zc = this.getZComponentInstance();
    const id = this.gameNode.value;
    if (id) {
      const n = zc.resolveNodeID<any>(id);
      if (n) return n;
    }
    // no node set: the first component that looks like OrbHuntGame
    const seen = new Set<any>();
    const walk = (c: any): any => {
      if (!c || seen.has(c)) return null;
      seen.add(c);
      if (c.onOrbCollected && c.onGameStart && c.onTargetReached) return c;
      for (const k of c.children ?? []) {
        const hit = walk(k);
        if (hit) return hit;
      }
      return null;
    };
    return walk(zc);
  }

  private _bindGame() {
    if (!this._capture) return;
    for (const off of this._gameOff) off();
    this._gameOff = [];
    const g = this._findGame();
    if (!g) return;
    const on = (evt: any, fn: (...a: any[]) => void) => {
      if (!evt || typeof evt.addListener !== "function") return;
      const safe = (...a: any[]) => {
        try {
          fn(...a);
        } catch {
          /* never break the game */
        }
      };
      evt.addListener(safe);
      this._gameOff.push(() => evt.removeListener?.(safe));
    };
    const target = () => Number(g.targetCount?.value) || undefined;
    const push = () => this._capture?.setHud({ ...this._hud });
    on(g.onGameStart, () => {
      this._hud = { score: 0, target: target() };
      push();
      if (this.showHint.value && !this._hinted) {
        this._hinted = true;
        this._capture?.showHint();
      }
    });
    on(g.onOrbCollected, (e: any) => {
      this._hud = {
        ...this._hud,
        score: Number(e?.score) || 0,
        target: Number(e?.target) || target(),
      };
      push();
    });
    on(g.onTargetReached, () => {
      this._hud = { ...this._hud, badge: "Run complete!" };
      push();
    });
    on(g.onTimeUp, () => {
      this._hud = { ...this._hud, badge: "Time's up" };
      push();
    });
  }

  public dispose() {
    for (const off of this._gameOff) off();
    this._gameOff = [];
    this._capture?.dispose();
    this._capture = null;
    return super.dispose();
  }
}
