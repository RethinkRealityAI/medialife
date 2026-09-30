import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PROGRAM_SLUG } from "@/lib/ar/projects";

/**
 * The live 3D showcase on /activated-retail: the endcap engine in an iframe (?embed=1), driven over
 * a same-origin postMessage API (see the end of public/activated-retail/engine/engine.js).
 *
 * - Desktop: loads when it scrolls near the viewport, inline, with a poster until the scene is up.
 *   The scroll wheel keeps scrolling the page until someone clicks into the display.
 * - Touch screens: a poster; tapping it opens the display full screen (a one-finger drag inside an
 *   inline 3D view would fight the page scroll).
 * Anything on the page (the fixture parts, merch cards, venue cards, "Your IP") calls the
 * controller from useShowcase(); commands wait until the display is ready.
 */

export const SHOWCASE_SRC = `/x/${PROGRAM_SLUG}?embed=1`;
const POSTER = "/medialife/activated-retail/page/showcase-poster.webp";
const POSTER_SM = "/medialife/activated-retail/page/showcase-poster-sm.webp";
// the built-in showcase's AR files, until the display reports its own
const AR_FALLBACK = {
  glb: "/medialife/activated-retail/ar/medialife.glb",
  usdz: "/medialife/activated-retail/ar/medialife.usdz",
  title: "Activated Retail",
};

export type Goto = {
  view?: "aisle" | "hero" | "shelf" | "qr" | "totem" | "dashboard" | "build";
  zone?: string;
  theme?: string;
  venue?: "retail" | "popup" | "convention";
  mode?: "build" | "walk" | "explore";
};
type ThemeInfo = { id: string; name: string; led: string };
type ArInfo = { glb: string | null; usdz: string | null; title: string; handoff?: string };
type State = {
  status: "idle" | "loading" | "ready";
  pct: number;
  theme: string | null;
  venue: string | null;
  themes: ThemeInfo[];
  focus: string | null;
  ar: ArInfo | null;
};
type IpResult = { ok: boolean; name?: string; message?: string } | null;

type Ctl = {
  frame: React.RefObject<HTMLIFrameElement | null>;
  mounted: boolean;
  state: State;
  full: boolean;
  ip: IpResult;
  /** start loading (and on touch screens, open full screen) */
  open: () => void;
  close: () => void;
  goto: (g: Goto) => void;
  tour: () => void;
  activate: () => void;
  viewInAR: () => void;
  customIP: (file: File, name: string) => void;
};

const ShowcaseCtx = createContext<Ctl | null>(null);
export function useShowcase(): Ctl {
  const c = useContext(ShowcaseCtx);
  if (!c) throw new Error("useShowcase outside <ShowcaseProvider>");
  return c;
}

type ARLaunchApi = {
  open: (o: {
    usdz?: string;
    glb?: string;
    title?: string;
    handoffUrl?: string;
    onEvent?: (n: string, p?: unknown) => void;
  }) => void;
};

function prefersOverlay() {
  if (typeof window === "undefined") return false;
  return matchMedia("(pointer: coarse)").matches || innerWidth < 768;
}

export function ShowcaseProvider({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const queue = useRef<unknown[]>([]);
  const [mounted, setMounted] = useState(false);
  const [full, setFull] = useState(false);
  const [ip, setIp] = useState<IpResult>(null);
  const [state, setState] = useState<State>({
    status: "idle",
    pct: 0,
    theme: null,
    venue: null,
    themes: [],
    focus: null,
    ar: null,
  });
  const ready = state.status === "ready";

  const post = useCallback(
    (msg: unknown) => {
      const w = frame.current?.contentWindow;
      if (ready && w) w.postMessage(msg, location.origin);
      else queue.current.push(msg);
    },
    [ready],
  );

  // flush what was asked for before the display was up
  useEffect(() => {
    if (!ready) return;
    const w = frame.current?.contentWindow;
    if (!w) return;
    for (const m of queue.current.splice(0)) w.postMessage(m, location.origin);
  }, [ready]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        !frame.current ||
        e.source !== frame.current.contentWindow
      )
        return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d.type !== "string") return;
      switch (d.type) {
        case "ar:progress":
          setState((s) => ({ ...s, status: "loading", pct: Math.max(s.pct, Number(d.pct) || 0) }));
          break;
        case "ar:ready":
          setState((s) => ({
            ...s,
            status: "ready",
            pct: 100,
            theme: (d.theme as string) ?? null,
            venue: (d.venue as string) ?? null,
            themes: Array.isArray(d.themes) ? (d.themes as ThemeInfo[]) : [],
            ar: (d.ar as ArInfo) ?? null,
          }));
          break;
        case "ar:theme":
          setState((s) => ({ ...s, theme: d.theme as string }));
          break;
        case "ar:venue":
          setState((s) => ({ ...s, venue: d.venue as string }));
          break;
        case "ar:focus":
          setState((s) => ({ ...s, focus: (d.zone as string) ?? null }));
          break;
        case "ar:ip":
          setIp({ ok: !!d.ok, name: d.name as string, message: d.message as string });
          break;
      }
    };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
  }, []);

  const open = useCallback(() => {
    setMounted(true);
    setState((s) => (s.status === "idle" ? { ...s, status: "loading" } : s));
    if (prefersOverlay()) setFull(true);
  }, []);
  const close = useCallback(() => setFull(false), []);

  // full screen: the page scroll stays put, and the display owns every gesture
  useEffect(() => {
    if (!full) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      removeEventListener("keydown", onKey);
    };
  }, [full]);
  useEffect(() => {
    if (ready) post({ type: "ar:engage", on: full, sticky: full });
  }, [full, ready, post]);

  // smooth unless the display is about to do heavy work on the shared main thread (a re-skin),
  // which cancels a smooth scroll midway
  const reveal = useCallback(
    (smooth = true) => {
      open();
      if (!prefersOverlay())
        document
          .getElementById("showcase")
          ?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "center" });
    },
    [open],
  );

  const ctl = useMemo<Ctl>(
    () => ({
      frame,
      mounted,
      state,
      full,
      ip,
      open,
      close,
      goto: (g) => {
        reveal();
        post({ type: "ar:goto", ...g });
      },
      tour: () => {
        reveal();
        post({ type: "ar:tour", play: true });
      },
      activate: () => {
        reveal();
        post({ type: "ar:activate" });
      },
      viewInAR: () => {
        const L = (window as unknown as { ARLaunch?: ARLaunchApi }).ARLaunch;
        const ar = state.ar?.glb || state.ar?.usdz ? state.ar : null;
        const files = ar ?? AR_FALLBACK;
        if (!L?.open) {
          reveal();
          return;
        }
        L.open({
          usdz: files.usdz || undefined,
          glb: files.glb || undefined,
          title: files.title,
          handoffUrl:
            ar?.handoff ||
            `${location.origin}/ar/?glb=${encodeURIComponent(AR_FALLBACK.glb)}&usdz=${encodeURIComponent(AR_FALLBACK.usdz)}&p=${encodeURIComponent("/medialife/activated-retail/ar/medialife.jpg")}&t=${encodeURIComponent("Activated Retail")}&d=x:${PROGRAM_SLUG}`,
        });
      },
      customIP: (file, name) => {
        setIp(null);
        reveal(false);
        post({ type: "ar:ip", file, name });
      },
    }),
    [mounted, state, full, ip, open, close, reveal, post],
  );

  return <ShowcaseCtx.Provider value={ctl}>{children}</ShowcaseCtx.Provider>;
}

/** The display: poster while it loads, inline on desktop, full screen on phones (same iframe). */
export function ShowcaseStage() {
  const { frame, mounted, state, open, close, full } = useShowcase();
  const slot = useRef<HTMLDivElement | null>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch(prefersOverlay());
    // desktop: start loading shortly before it scrolls into view
    if (prefersOverlay() || !slot.current) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          open();
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(slot.current);
    return () => io.disconnect();
  }, [open]);

  const ready = state.status === "ready";
  const showPoster = !full && (touch || !ready);
  return (
    <div
      id="showcase-slot"
      ref={slot}
      className="relative w-full overflow-hidden border border-border bg-[#07060d] aspect-[4/5] sm:aspect-[16/10] lg:aspect-auto lg:h-[min(78vh,820px)]"
    >
      <div
        className={
          full
            ? "fixed inset-0 z-[70] flex flex-col bg-[#07060d]"
            : `absolute inset-0 ${touch ? "invisible" : ""}`
        }
        role={full ? "dialog" : undefined}
        aria-modal={full || undefined}
        aria-label={full ? "Activated Retail live 3D showcase" : undefined}
      >
        {full && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <button
              type="button"
              onClick={close}
              className="mono inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] hover:text-primary"
            >
              <span aria-hidden>←</span> Back to the page
            </button>
            <span className="mono pr-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {ready ? "Live 3D" : `Loading · ${state.pct}%`}
            </span>
          </div>
        )}
        {mounted && (
          <iframe
            ref={frame}
            src={SHOWCASE_SRC}
            title="Interactive 3D showcase of the MEDIALIFE activated-retail fixture"
            allow="fullscreen; xr-spatial-tracking; web-share; clipboard-write"
            className={`w-full border-0 bg-[#07060d] transition-opacity duration-700 ${full ? "flex-1" : "h-full"} ${ready ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </div>
      {showPoster && (
        <>
          <picture>
            <source media="(max-width: 767px)" srcSet={POSTER_SM} />
            <img
              src={POSTER}
              alt="The MEDIALIFE activated-retail fixture in a store aisle: lit towers, a video wall, a stocked merch bay and a digital totem"
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
            />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 flex flex-col items-start gap-3">
            {touch ? (
              <button
                type="button"
                onClick={open}
                className="btn-pill btn-ember mono text-xs uppercase tracking-[0.18em] font-medium px-6 py-3.5"
              >
                Tap to explore in 3D <span aria-hidden>→</span>
              </button>
            ) : (
              <div className="w-full max-w-md" role="status" aria-live="polite">
                <div className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {state.status === "idle"
                    ? "Live 3D showcase"
                    : `Loading the showcase · ${state.pct}%`}
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{ width: `${state.pct}%`, background: "var(--gradient-ember)" }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
