/**
 * The live half of the overlay: polls the public feed, turns new orders into
 * alerts, rolls the counter up as each alert lands, and throws the "goal
 * smashed" party once.
 *
 * Runs for hours inside OBS, so: one poll timer (setTimeout chain, never
 * overlapping), one alert timer (useAlertQueue), rAF only while something
 * moves, and nothing that grows without bound — the "seen" set is rebuilt from
 * each feed (at most 12 ids), the alert queue is capped, and the particle pool
 * is fixed-size.
 *
 * Embedded in the Go live studio's preview iframe it also talks to its parent
 * (same origin only): it posts a summary of each feed, and polls at once when
 * the parent says settings changed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OverlayFeed } from "@/lib/hub/overlay.server";
import { money } from "@/lib/hub/model";

import { ACCENTS } from "./accents";
import { useAlertQueue } from "./alert-queue";
import { ParticleField } from "./confetti";
import { OverlayNote, OverlayStage, OverlayView, type OverlayAlert } from "./overlay-view";
import { StreamScene } from "./stream-scene";

const POLL_MS = 5000;
const GONE_POLL_MS = 15000;
/** Orders older than this when first seen aren't "live" (a webhook that arrived very late). */
const STALE_MS = 30 * 60_000;
const CELEBRATE_MS = 6800;
const CELEBRATE_OUT_MS = 800;

export const OVERLAY_MSG = {
  /** parent → overlay: poll now (settings changed, test alert sent). */
  poll: "medialife-overlay:poll",
  /** overlay → parent: what the overlay is showing. */
  feed: "medialife-overlay:feed",
} as const;

export type OverlayFeedMessage = {
  type: typeof OVERLAY_MSG.feed;
  status: "live" | "gone" | "off";
  units?: number;
  goal?: number;
  scans?: number;
  revenue?: number | null;
  currency?: string;
  lastOrderAt?: number | null;
  goalStartedAt?: number;
};

type QAlert = OverlayAlert & { countQty: number };

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Eases a number toward `target` with rAF; stops when it gets there. */
function useTween(target: number | null, instant: boolean) {
  const [value, setValue] = useState(0);
  const cur = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (target === null) return;
    const from = cur.current;
    const delta = target - from;
    if (instant || delta === 0) {
      cur.current = target;
      setValue(target);
      first.current = false;
      return;
    }
    const ms = first.current ? 1800 : 1100;
    first.current = false;
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      cur.current = from + delta * e;
      setValue(cur.current);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, instant]);
  return value;
}

function storageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* private mode / blocked storage: the in-memory guard still holds */
  }
}

export function LiveOverlay({
  token,
  scale = 1,
  backdrop = false,
}: {
  token: string;
  scale?: number;
  /** Draw a stand-in stream behind the overlay (?bg=1, for previewing in a browser). */
  backdrop?: boolean;
}) {
  const [feed, setFeed] = useState<OverlayFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "gone" | "off">("loading");
  const [embedded, setEmbedded] = useState(false);
  const reduced = useReducedMotion();
  const q = useAlertQueue<QAlert>();
  const { enqueue, clearAll } = q;

  // Feed bookkeeping, in refs: none of it should re-render on its own.
  const seen = useRef<Set<string> | null>(null);
  const lastTestAt = useRef<number | null>(null);
  const lastProductId = useRef<string | null>(null);

  useEffect(() => setEmbedded(window.parent !== window), []);

  /* ---- polling ---- */
  const handleFeed = useCallback(
    (data: OverlayFeed) => {
      const ids = new Set(data.recent.map((r) => r.id));
      if (!seen.current) {
        // First load: everything already in the feed is history, not news.
        lastTestAt.current = data.settings.testAt;
        lastProductId.current = data.settings.productId;
      } else if (data.settings.productId !== lastProductId.current) {
        // The creator switched products: a different order list, not new orders.
        lastProductId.current = data.settings.productId;
        clearAll();
      } else {
        const fresh = data.recent
          .filter((r) => !seen.current!.has(r.id) && data.serverTime - r.at < STALE_MS)
          .reverse()
          .map((r): QAlert => ({
            key: r.id,
            kind: "order",
            flag: r.flag,
            country: r.country,
            qty: r.qty,
            // one order with two variants of a tee reads "Tee + Tee" in the feed
            product: [...new Set(r.product.split(" + "))].join(" + "),
            countQty: r.at >= data.settings.goalStartedAt ? r.qty : 0,
          }));
        const testAt = data.settings.testAt;
        if (testAt && testAt !== lastTestAt.current) {
          fresh.push({
            key: `test-${testAt}`,
            kind: "test",
            flag: "🇨🇦",
            country: "Canada",
            qty: 1,
            product: data.product?.name ?? "your merch",
            countQty: 0,
          });
        }
        lastTestAt.current = testAt;
        enqueue(fresh);
      }
      seen.current = ids;
      setFeed(data);
      setStatus("live");
    },
    [enqueue, clearAll],
  );

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight = false;
    let again = false;
    let ctrl: AbortController | null = null;
    const url = `/api/hub/overlay/${encodeURIComponent(token)}`;

    const schedule = (ms: number) => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    async function run() {
      if (inflight) {
        again = true;
        return;
      }
      inflight = true;
      ctrl = new AbortController();
      let next = POLL_MS;
      try {
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        if (res.status === 404) {
          next = GONE_POLL_MS;
          seen.current = null; // if it comes back (re-enabled), start fresh
          setStatus("gone");
          setFeed(null);
          post({ type: OVERLAY_MSG.feed, status: "gone" });
        } else if (res.ok) {
          const body = (await res.json()) as OverlayFeed | { status: "off" | "gone" };
          if (stopped) return;
          if (body.status !== "live") {
            // "off": switched off or not live yet — render nothing.
            // "gone": the link was regenerated — say so.
            next = GONE_POLL_MS;
            seen.current = null; // if it comes back, start fresh
            setStatus(body.status);
            setFeed(null);
            post({ type: OVERLAY_MSG.feed, status: body.status });
            return;
          }
          const data = body;
          handleFeed(data);
          post({
            type: OVERLAY_MSG.feed,
            status: "live",
            units: data.units,
            goal: data.settings.goal,
            scans: data.scans,
            revenue: data.revenue,
            currency: data.currency,
            lastOrderAt: data.recent[0]?.at ?? null,
            goalStartedAt: data.settings.goalStartedAt,
          });
        }
      } catch {
        if (stopped) return;
        // offline / server blip: keep showing the last feed, try again
      } finally {
        inflight = false;
        ctrl = null;
      }
      if (again) {
        again = false;
        next = 0;
      }
      schedule(next);
    }

    function post(msg: OverlayFeedMessage) {
      if (window.parent === window) return;
      try {
        window.parent.postMessage(msg, window.location.origin);
      } catch {
        /* cross-origin parent: nothing to tell */
      }
    }

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string } | null)?.type === OVERLAY_MSG.poll) schedule(0);
    };
    window.addEventListener("message", onMessage);
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctrl?.abort();
      window.removeEventListener("message", onMessage);
    };
  }, [token, handleFeed]);

  /* ---- the counter: what's sold, minus what's still waiting to be announced ---- */
  const pending = q.queue.reduce((s, a) => s + a.countQty, 0);
  const target = feed ? Math.max(0, feed.units - pending) : null;
  const units = useTween(target, reduced);

  const [bump, setBump] = useState<{ n: number; qty: number }>({ n: 0, qty: 0 });
  const prevTarget = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const prev = prevTarget.current;
    prevTarget.current = target;
    if (prev !== null && target > prev) setBump((b) => ({ n: b.n + 1, qty: target - prev }));
  }, [target]);

  /* ---- particles ---- */
  const field = useRef<ParticleField | null>(null);
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const onCanvas = useCallback((c: HTMLCanvasElement | null) => {
    if (c === canvasEl.current) return;
    field.current?.destroy();
    field.current = c ? new ParticleField(c) : null;
    canvasEl.current = c;
  }, []);
  useEffect(() => () => field.current?.destroy(), []);

  const accent = feed ? ACCENTS[feed.settings.accent] : ACCENTS.ember;
  const flagRef = useRef<HTMLSpanElement>(null);

  // A sparkle burst from the flag as each alert lands; a flash on the bar for a test.
  const currentKey = q.current?.key ?? null;
  useEffect(() => {
    if (!currentKey) return;
    if (currentKey.startsWith("test-")) setBump((b) => ({ n: b.n + 1, qty: 0 }));
    if (reduced) return;
    const t = setTimeout(() => {
      const c = canvasEl.current;
      const f = flagRef.current;
      if (!c || !f || !field.current) return;
      const cr = c.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      const fit = cr.width / c.width || 1;
      field.current.burst(
        (fr.left + fr.width / 2 - cr.left) / fit,
        (fr.top + fr.height / 2 - cr.top) / fit,
        {
          count: 56,
          colors: accent.particles,
          speed: 760,
          sparkle: true,
        },
      );
    }, 220);
    return () => clearTimeout(t);
    // accent.particles is stable per accent; the burst belongs to the alert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, reduced]);

  /* ---- goal smashed ---- */
  const [celebrating, setCelebrating] = useState<"in" | "out" | null>(null);
  const goal = feed?.settings.goal ?? 0;
  const goalStartedAt = feed?.settings.goalStartedAt ?? 0;
  const reached = target !== null && goal > 0 && target >= goal;
  const prevReached = useRef<boolean | null>(null);
  const celebrationTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => celebrationTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (target === null) return;
    const was = prevReached.current;
    prevReached.current = reached;
    const key = `mlo-celebrated:${token}:${goalStartedAt}:${goal}`;
    if (was === null || !reached || was) {
      // Already past the goal when the overlay loaded: that party happened
      // before this source was watching. Don't throw it now.
      if (was === null && reached) storageSet(key);
      return;
    }
    if (storageGet(key)) return;
    storageSet(key);
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    // Let the counter roll up to the goal first.
    timers.push(
      setTimeout(() => {
        setCelebrating("in");
        const c = canvasEl.current;
        if (c && !reduced) field.current?.celebrate(c.width, c.height, accent.particles);
      }, 900),
    );
    timers.push(setTimeout(() => setCelebrating("out"), 900 + CELEBRATE_MS));
    timers.push(setTimeout(() => setCelebrating(null), 900 + CELEBRATE_MS + CELEBRATE_OUT_MS));
    celebrationTimers.current = timers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reached, target === null, token, goal, goalStartedAt]);

  /* ---- draw ---- */
  const model = useMemo(() => {
    if (!feed) return null;
    const s = feed.settings;
    return {
      creator: feed.creator,
      product: feed.product
        ? {
            name: feed.product.name,
            image: feed.product.image
              ? `${feed.product.image}?v=${encodeURIComponent(feed.product.sku)}`
              : null,
          }
        : null,
      qrUrl: feed.qrUrl,
      headline: s.headline,
      showQr: s.showQr,
      position: s.position,
      accent: s.accent,
      goal: s.goal,
      units: 0,
      revenue: feed.revenue !== null ? money(feed.revenue, feed.currency) : null,
      scans: feed.scans,
    };
  }, [feed]);

  const position = feed?.settings.position ?? "bottom";
  const nothingToShow = model && !model.product && !(model.showQr && model.qrUrl);

  return (
    <>
      {backdrop ? <StreamScene facecam={position === "top" ? "bottom" : "top"} /> : null}
      <OverlayStage onCanvas={onCanvas}>
        {status === "gone" ? (
          <OverlayNote>Overlay link expired — copy a new one from your Creator Hub</OverlayNote>
        ) : status === "off" ? (
          // On stream an "off" overlay is invisible; previews say why.
          backdrop || embedded ? (
            <OverlayNote>
              Overlay is off — switch it on in your Creator Hub to show it on stream
            </OverlayNote>
          ) : null
        ) : model ? (
          nothingToShow ? (
            backdrop || embedded ? (
              <OverlayNote>Your overlay shows up here once a product is live</OverlayNote>
            ) : null
          ) : (
            <OverlayView
              model={{ ...model, units }}
              alert={q.current}
              alertPhase={q.phase}
              queued={q.queue.length}
              celebrating={celebrating}
              bump={bump}
              scale={scale}
              flagRef={flagRef}
            />
          )
        ) : null}
      </OverlayStage>
    </>
  );
}
