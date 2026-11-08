import { initialize } from "@zcomponent/three";
import { default as Scene } from "./Scene.zcomp";

/**
 * LOOT BREAK entry point (Mattercraft's index.ts).
 *
 * initialize() loads the scene and enables #launchButton on the splash in
 * index.html once everything has downloaded. Tapping it hides the splash and
 * starts the AR session.
 *
 * The rest is analytics. GA (gtag) is loaded in index.html; this file only
 * fires events, using the same names as the other MEDIALIFE activations and
 * the `experience` parameter to tell them apart. Nothing here changes how the
 * game behaves: it only listens to LootBreakGame's public events.
 */

const EXPERIENCE = "tbh_lootbreak";
const PAGE_START = Date.now();

const result = initialize(Scene, {}, {
    launchButton: document.getElementById("launchButton"),
});

type Params = Record<string, string | number | undefined>;
function track(name: string, params: Params = {}) {
    try {
        const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
        g?.("event", name, { experience: EXPERIENCE, ...params });
    } catch {
        /* analytics must never break the experience */
    }
}
const seconds = (since: number) => Math.round((Date.now() - since) / 1000);

// Camera permission: granted, or denied and why (a refusal and a broken
// camera need very different fixes). Always calls through to the browser.
const md = navigator.mediaDevices;
if (md && md.getUserMedia) {
    const native = md.getUserMedia.bind(md);
    md.getUserMedia = (c?: MediaStreamConstraints) =>
        native(c)
            .then((s) => { track("camera_granted", { seconds: seconds(PAGE_START) }); return s; })
            .catch((e) => { track("camera_denied", { reason: (e && e.name) || "unknown" }); throw e; });
}

/** Every component in the scene (Component.children is the real tree). */
function componentTree(root: unknown): any[] {
    const out: any[] = [];
    const seen = new Set<unknown>();
    const walk = (c: any) => {
        if (!c || typeof c !== "object" || seen.has(c)) return;
        seen.add(c);
        out.push(c);
        if (Array.isArray(c.children)) for (const k of c.children) walk(k);
    };
    walk(root);
    return out;
}
/** Event.addListener, with a throwing handler contained. */
function on(evt: any, fn: (...a: any[]) => void) {
    if (!evt || typeof evt.addListener !== "function") return false;
    evt.addListener((...a: any[]) => { try { fn(...a); } catch { /* noop */ } });
    return true;
}

const r: any = result;
const game = componentTree(r?.rootInstance ?? r).find((n) => n?.onRoundEnd && n?.onBoss && n?.onRoundStart);

const session = { rounds: 0, best: 0, bestTier: "", bosses: 0, placed: 0, resets: 0 };
if (game) {
    // Placement is the first thing that can go wrong in AR: someone who never
    // places never plays, and without this they vanish from the funnel.
    on(game.onPlace, () => {
        session.placed++;
        track("scene_placed", { seconds: seconds(PAGE_START), attempt: session.placed });
    });
    on(game.onResetPlacement, () => {
        session.resets++;
        track("placement_reset", { count: session.resets });
    });
    let roundStart = 0;
    on(game.onRoundStart, () => {
        session.rounds++;
        roundStart = Date.now();
        track("game_start", { attempt: session.rounds });
    });
    on(game.onBoss, () => {
        session.bosses++;
        track("boss_reached", { attempt: session.rounds });
    });
    on(game.onRoundEnd, (score: number, tier: string) => {
        if (score > session.best) { session.best = score; session.bestTier = tier; }
        track("game_complete", {
            attempt: session.rounds,
            score,
            tier,
            seconds: roundStart ? seconds(roundStart) : undefined,
        });
    });
} else {
    track("bind_failure", { component: "LootBreakGame" });
}

// One summary row per session. pagehide, not unload (iOS ignores unload).
let summarised = false;
const summarise = () => {
    if (summarised) return;
    summarised = true;
    track("session_summary", {
        rounds: session.rounds,
        best_score: session.best,
        best_tier: session.bestTier || undefined,
        seconds: seconds(PAGE_START),
        placed: session.placed,
        resets: session.resets,
        furthest: session.rounds ? (session.bosses ? "boss" : "played") : session.placed ? "placed" : "landed",
    });
};
addEventListener("pagehide", summarise);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") summarise();
});
