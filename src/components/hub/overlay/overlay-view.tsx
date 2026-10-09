/**
 * The Live Drop overlay, drawn: the goal bar, the QR card, the order alert and
 * the "goal smashed" moment. Purely presentational — LiveOverlay (live-overlay.tsx)
 * feeds it from the public feed; the Go live studio feeds it demo data for its
 * locked-state mock.
 *
 * Laid out on a 1920×1080 logical stage (OverlayStage scales it to whatever
 * size the browser source is: 1080p, 720p, a 16:9 preview frame). Styled with
 * its own scoped CSS in hex/rgba rather than Tailwind's oklch palette, because
 * OBS / Streamlabs embed Chromium builds that predate oklch().
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { ACCENTS, type Accent } from "./accents";
import type { AlertPhase } from "./alert-queue";
import { OverlayQr } from "./qr";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export type OverlayAlert = {
  key: string;
  kind: "order" | "test";
  flag: string | null;
  country: string | null;
  qty: number;
  product: string;
};

export type OverlayModel = {
  creator: string;
  product: { name: string; image: string | null } | null;
  qrUrl: string | null;
  headline: string;
  showQr: boolean;
  position: "bottom" | "top";
  accent: Accent;
  goal: number;
  /** Units as displayed right now (LiveOverlay tweens it). */
  units: number;
  /** Already formatted, or null when hidden. */
  revenue: string | null;
  scans: number;
};

const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString("en-US");
const compactNum = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : fmt(n);

/* ---------------------------------------------------------------------------
   Stage: a 1920×1080 logical canvas, scaled to fit its container
   --------------------------------------------------------------------------- */

export function OverlayStage({
  children,
  onCanvas,
  style,
}: {
  children: ReactNode;
  /** Receives the particle canvas (stage-sized, in logical px). */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  style?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number; fit: number } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const fit = Math.min(cw / STAGE_W, ch / STAGE_H);
      setBox((b) =>
        b && Math.abs(b.fit - fit) < 1e-4 && Math.abs(b.w - cw / fit) < 0.5
          ? b
          : { w: cw / fit, h: ch / fit, fit },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={host}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    >
      {box ? (
        <div
          className="mlo-stage"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: box.w,
            height: box.h,
            transform: `scale(${box.fit})`,
            transformOrigin: "0 0",
          }}
        >
          {children}
          {onCanvas ? (
            <canvas
              ref={onCanvas}
              width={Math.round(box.w)}
              height={Math.round(box.h)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The overlay
   --------------------------------------------------------------------------- */

export function OverlayView({
  model,
  alert,
  alertPhase = "in",
  queued = 0,
  celebrating = null,
  bump,
  scale = 1,
  flagRef,
  entrance = true,
}: {
  model: OverlayModel;
  alert?: OverlayAlert | null;
  alertPhase?: AlertPhase;
  queued?: number;
  /** The celebration banner, while it plays: "in" then "out". */
  celebrating?: AlertPhase | null;
  /** The last roll-up: re-keys the flash and "+N" chip. */
  bump?: { n: number; qty: number } | null;
  scale?: number;
  flagRef?: Ref<HTMLSpanElement>;
  /** Animate the cards in on mount. */
  entrance?: boolean;
}) {
  const pal = ACCENTS[model.accent];
  const showGoal = !!model.product;
  const showQr = model.showQr && !!model.qrUrl;
  const vars = {
    "--a": pal.a,
    "--b": pal.b,
    "--mid": pal.mid,
    "--s": String(scale),
    "--dir": model.position === "top" ? "-1" : "1",
  } as CSSProperties;

  return (
    <div
      className={`mlo-root${entrance ? " mlo-entrance" : ""}`}
      data-pos={model.position}
      style={vars}
    >
      <style>{OVERLAY_CSS}</style>
      <div className="mlo-dock">
        <div className={`mlo-left${showGoal ? "" : " mlo-empty"}`}>
          {showGoal ? <GoalCard model={model} bump={bump ?? null} /> : null}
          <div className="mlo-alert-slot" aria-live="polite">
            {alert ? (
              <AlertCard
                key={alert.key}
                alert={alert}
                phase={alertPhase}
                queued={queued}
                flagRef={flagRef}
              />
            ) : null}
          </div>
        </div>
        {showQr ? <QrCard model={model} /> : null}
      </div>
      {celebrating ? (
        <Celebration phase={celebrating} goal={model.goal} units={model.units} />
      ) : null}
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "ML"
  );
}

function Thumb({ product }: { product: NonNullable<OverlayModel["product"]> }) {
  const [broken, setBroken] = useState(false);
  const onError = useCallback(() => setBroken(true), []);
  useEffect(() => setBroken(false), [product.image]);
  return (
    <div className="mlo-thumb">
      {product.image && !broken ? (
        <img src={product.image} alt="" onError={onError} />
      ) : (
        <span className="mlo-thumb-mono">{initials(product.name)}</span>
      )}
    </div>
  );
}

function GoalCard({
  model,
  bump,
}: {
  model: OverlayModel;
  bump: { n: number; qty: number } | null;
}) {
  const product = model.product!;
  const hasGoal = model.goal > 0;
  const p = hasGoal ? Math.min(1, model.units / model.goal) : 0;
  const reached = hasGoal && model.units >= model.goal;
  const left = Math.max(0, model.goal - Math.round(model.units));
  const pct = `${(p * 100).toFixed(2)}%`;

  return (
    <div
      className={`mlo-card mlo-goal mlo-enter${reached ? " mlo-reached" : ""}`}
      style={{ "--pct": pct } as CSSProperties}
    >
      {bump && bump.n > 0 ? <span key={`f${bump.n}`} className="mlo-flash" /> : null}
      <Thumb product={product} />
      <div className="mlo-goal-body">
        <div className="mlo-eyebrow">
          <span className="mlo-live">
            <i />
            Live drop
          </span>
          <span className="mlo-creator">{model.creator}</span>
          {model.revenue ? <span className="mlo-chip">{model.revenue} raised</span> : null}
        </div>
        <div className="mlo-name">{product.name}</div>
        {hasGoal ? (
          <>
            <div className="mlo-bar">
              <div className="mlo-bar-glow" />
              <div className="mlo-fill-clip">
                <div className="mlo-fill" />
              </div>
              <span className="mlo-tick" style={{ left: "25%" }} />
              <span className="mlo-tick" style={{ left: "50%" }} />
              <span className="mlo-tick" style={{ left: "75%" }} />
              {p > 0.015 ? <span className="mlo-spark" /> : null}
              {bump && bump.n > 0 && bump.qty > 0 ? (
                <span key={`p${bump.n}`} className="mlo-plus">
                  +{bump.qty}
                </span>
              ) : null}
            </div>
            <div className="mlo-meta">
              {reached ? (
                <>
                  <span className="mlo-count">
                    Goal reached <em>·</em> <b>{fmt(model.units)}</b> sold
                  </span>
                  <span className="mlo-togo">
                    <span className="mlo-emoji">🔥</span> Keep it going
                  </span>
                </>
              ) : (
                <>
                  <span className="mlo-count">
                    {fmt(model.units)}
                    <em> / {fmt(model.goal)}</em> <small>sold</small>
                  </span>
                  <span className="mlo-togo">{fmt(left)} to go</span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mlo-meta">
            <span className="mlo-count">
              {fmt(model.units)} <small>sold this stream</small>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function QrCard({ model }: { model: OverlayModel }) {
  return (
    <div className="mlo-right">
      <div className="mlo-card mlo-qr mlo-enter" style={{ animationDelay: "0.12s" }}>
        <div className="mlo-qr-plate">
          <span className="mlo-ring mlo-ring-pulse" />
          <span className="mlo-ring" />
          <OverlayQr value={model.qrUrl!} />
        </div>
        <div className="mlo-qr-head">{model.headline || "Scan to unlock"}</div>
        {model.scans > 0 ? (
          <div className="mlo-scans">
            <i />
            {compactNum(model.scans)} {model.scans === 1 ? "scan" : "scans"}
          </div>
        ) : (
          <div className="mlo-scans">
            <i />
            Point your camera
          </div>
        )}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  phase,
  queued,
  flagRef,
}: {
  alert: OverlayAlert;
  phase: AlertPhase;
  queued: number;
  flagRef?: Ref<HTMLSpanElement>;
}) {
  const test = alert.kind === "test";
  return (
    <div
      className={`mlo-card mlo-alert ${phase === "in" ? "mlo-in" : "mlo-out"}${queued > 0 ? " mlo-has-more" : ""}`}
    >
      <span className="mlo-sweep" />
      <span ref={flagRef} className="mlo-flag">
        <span className="mlo-flag-ring" />
        <span className="mlo-emoji">{alert.flag ?? "🛍️"}</span>
      </span>
      <div className="mlo-alert-body">
        <div className={`mlo-kicker${test ? " mlo-kicker-test" : ""}`}>
          {test ? "Test alert — this is what your viewers will see" : "New order"}
        </div>
        <div className="mlo-alert-line">
          {alert.country ? `Someone in ${alert.country} just grabbed` : "Someone just grabbed"}
        </div>
        <div className="mlo-alert-product">
          {alert.qty > 1 ? <span className="mlo-qty">{alert.qty}×</span> : null}
          <span className="mlo-alert-name">{alert.product}</span>
        </div>
      </div>
      {queued > 0 ? <span className="mlo-more">+{queued} more</span> : null}
      <span className="mlo-timer" />
    </div>
  );
}

function Celebration({ phase, goal, units }: { phase: AlertPhase; goal: number; units: number }) {
  return (
    <div className={`mlo-celebrate ${phase === "in" ? "mlo-in" : "mlo-out"}`} role="status">
      <span className="mlo-rays" />
      <span className="mlo-cglow" />
      <div className="mlo-ckicker">★ Sales goal ★</div>
      <div className="mlo-ctitle">
        <span className="mlo-ctext">Goal smashed</span> <span className="mlo-emoji">🎉</span>
      </div>
      <div className="mlo-csub">{fmt(Math.max(goal, units))} sold live on stream. Thank you!</div>
    </div>
  );
}

/** A small note in the corner (link expired, nothing live yet). */
export function OverlayNote({ children }: { children: ReactNode }) {
  return (
    <div className="mlo-root">
      <style>{OVERLAY_CSS}</style>
      <div className="mlo-note">
        <i />
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Styles
   --------------------------------------------------------------------------- */

const OVERLAY_CSS = `
.mlo-root{position:absolute;inset:0;color:#fff;pointer-events:none;
  font-family:"Space Grotesk","Noto Color Emoji",ui-sans-serif,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;font-feature-settings:"ss01","ss02";--edge:56px}
.mlo-root *{box-sizing:border-box}
.mlo-emoji{font-family:"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif;
  -webkit-text-fill-color:initial;color:initial;font-weight:400}
.mlo-mono,.mlo-eyebrow,.mlo-count,.mlo-kicker,.mlo-scans,.mlo-more,.mlo-plus,.mlo-ckicker,.mlo-chip{
  font-family:"JetBrains Mono",ui-monospace,monospace}

.mlo-dock{position:absolute;left:var(--edge);right:var(--edge);display:flex;justify-content:space-between;gap:40px}
.mlo-root[data-pos=bottom] .mlo-dock{bottom:52px;align-items:flex-end}
.mlo-root[data-pos=top] .mlo-dock{top:52px;align-items:flex-start}
.mlo-left{position:relative;width:820px;transform:scale(var(--s))}
.mlo-right{transform:scale(var(--s))}
.mlo-root[data-pos=bottom] .mlo-left{transform-origin:left bottom}
.mlo-root[data-pos=top] .mlo-left{transform-origin:left top}
.mlo-root[data-pos=bottom] .mlo-right{transform-origin:right bottom}
.mlo-root[data-pos=top] .mlo-right{transform-origin:right top}
.mlo-alert-slot{position:absolute;left:0;width:820px}
.mlo-root[data-pos=bottom] .mlo-alert-slot{bottom:calc(100% + 20px)}
.mlo-root[data-pos=top] .mlo-alert-slot{top:calc(100% + 20px)}
.mlo-root[data-pos=bottom] .mlo-empty .mlo-alert-slot{bottom:0}
.mlo-root[data-pos=top] .mlo-empty .mlo-alert-slot{top:0}

/* glass card with a gradient hairline */
.mlo-card{position:relative;border-radius:28px;
  background:linear-gradient(180deg,rgba(24,23,40,.88),rgba(9,9,17,.93));
  box-shadow:0 30px 80px -30px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.10) inset;
  -webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px)}
.mlo-card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;
  background:linear-gradient(120deg,var(--a),rgba(255,255,255,.10) 32%,rgba(255,255,255,.05) 68%,var(--b));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;opacity:.8;transition:opacity .6s}

/* goal */
.mlo-goal{display:flex;align-items:center;gap:26px;padding:22px 30px 22px 22px}
.mlo-thumb{position:relative;flex:none;width:124px;height:124px;border-radius:22px;overflow:hidden;
  background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 14px 34px -14px var(--b)}
.mlo-thumb::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.16)}
.mlo-thumb img{display:block;width:100%;height:100%;object-fit:cover;background:#fff}
.mlo-thumb-mono{display:grid;place-items:center;width:100%;height:100%;font-size:46px;font-weight:700;letter-spacing:-.04em}
.mlo-goal-body{flex:1;min-width:0}
.mlo-eyebrow{display:flex;align-items:center;gap:14px;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.62);white-space:nowrap}
.mlo-live{display:inline-flex;align-items:center;gap:9px;padding:5px 12px 5px 10px;border-radius:999px;
  background:rgba(255,59,92,.16);color:#ff7d93;font-weight:500;box-shadow:inset 0 0 0 1px rgba(255,59,92,.35)}
.mlo-live i{width:10px;height:10px;border-radius:50%;background:#ff3b5c;animation:mlo-live 1.6s ease-out infinite}
.mlo-creator{overflow:hidden;text-overflow:ellipsis}
.mlo-chip{margin-left:auto;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;letter-spacing:.06em;text-transform:none;font-size:16px}
.mlo-name{margin-top:10px;font-size:38px;font-weight:600;letter-spacing:-.025em;line-height:1.08;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-bottom:2px}
.mlo-bar{position:relative;margin-top:16px;height:24px;border-radius:999px;background:rgba(255,255,255,.08);
  box-shadow:inset 0 1px 3px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.05)}
.mlo-fill-clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
.mlo-fill,.mlo-bar-glow{position:absolute;left:0;top:0;bottom:0;width:var(--pct);min-width:0;border-radius:999px;
  background:linear-gradient(90deg,var(--a),var(--mid) 55%,var(--b))}
.mlo-bar-glow{filter:blur(16px);opacity:.6;top:2px;bottom:-4px}
.mlo-fill{overflow:hidden}
.mlo-fill::before{content:"";position:absolute;left:0;right:0;top:0;height:50%;border-radius:999px 999px 0 0;background:linear-gradient(180deg,rgba(255,255,255,.45),rgba(255,255,255,0))}
.mlo-fill::after{content:"";position:absolute;top:0;bottom:0;left:0;width:240px;
  background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.6),rgba(255,255,255,0));
  transform:translateX(-260px);animation:mlo-shimmer 3.2s ease-in-out infinite}
.mlo-tick{position:absolute;top:6px;bottom:6px;width:2px;margin-left:-1px;border-radius:2px;background:rgba(255,255,255,.14)}
.mlo-spark{position:absolute;top:50%;left:var(--pct);width:44px;height:44px;margin:-22px 0 0 -26px;border-radius:50%;
  background:radial-gradient(circle,#fff 0,#fff 14%,rgba(255,255,255,.5) 26%,rgba(255,255,255,0) 62%);
  animation:mlo-twinkle 1.8s ease-in-out infinite}
.mlo-plus{position:absolute;left:var(--pct);top:-10px;padding:4px 12px;border-radius:999px;font-size:22px;font-weight:500;color:#fff;
  background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 8px 24px -8px var(--b);
  transform:translate(-50%,-100%);animation:mlo-plus 1.8s cubic-bezier(.2,.8,.3,1) both}
.mlo-meta{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-top:14px}
.mlo-count{font-size:28px;font-weight:500;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap}
.mlo-count em{font-style:normal;color:rgba(255,255,255,.5)}
.mlo-count small{font-size:20px;color:rgba(255,255,255,.55);font-family:"Space Grotesk",sans-serif;letter-spacing:0}
.mlo-togo{font-size:22px;font-weight:600;white-space:nowrap;background:linear-gradient(90deg,var(--a),var(--b));
  -webkit-background-clip:text;background-clip:text;color:transparent}
.mlo-flash{position:absolute;inset:-2px;border-radius:30px;pointer-events:none;opacity:0;
  box-shadow:0 0 0 2px var(--b),0 0 70px 8px var(--b);animation:mlo-flash 1.3s ease-out}
.mlo-reached{box-shadow:0 30px 80px -30px rgba(0,0,0,.9),0 0 80px -16px var(--b),0 0 50px -20px var(--a)}
.mlo-reached::before{opacity:1;padding:2px;background:linear-gradient(120deg,var(--a),var(--mid),var(--b))}
.mlo-reached .mlo-fill{background:linear-gradient(90deg,var(--a),var(--mid),var(--b),var(--mid),var(--a));background-size:200% 100%;animation:mlo-flow 3s linear infinite}
.mlo-reached .mlo-count{color:#fff;font-family:"Space Grotesk",sans-serif;font-weight:600;letter-spacing:-.015em}
.mlo-reached .mlo-count b{font-family:"JetBrains Mono",monospace;font-weight:500}
.mlo-reached .mlo-count em{color:var(--b)}

/* QR */
.mlo-qr{width:284px;padding:22px 22px 20px;display:flex;flex-direction:column;align-items:center}
.mlo-qr-plate{position:relative;width:240px;height:240px;border-radius:24px;background:#fff;padding:12px;
  box-shadow:0 16px 46px -14px var(--a),0 0 0 1px rgba(255,255,255,.4)}
.mlo-qr-plate svg{display:block;width:100%;height:100%;border-radius:10px}
.mlo-ring{position:absolute;inset:-9px;border-radius:31px;padding:3px;pointer-events:none;
  background:linear-gradient(135deg,var(--a),var(--b));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.mlo-ring-pulse{animation:mlo-ring 2.6s cubic-bezier(.2,.6,.3,1) infinite}
.mlo-qr-head{margin-top:20px;font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1;text-align:center;max-width:100%;overflow-wrap:anywhere}
.mlo-scans{display:flex;align-items:center;gap:9px;margin-top:10px;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.mlo-scans i{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 0 12px var(--a)}

/* alert */
.mlo-alert{display:flex;align-items:center;gap:26px;padding:24px 32px 28px 24px;overflow:hidden;
  box-shadow:0 30px 80px -30px rgba(0,0,0,.9),0 0 70px -24px var(--b)}
.mlo-alert::before{opacity:1;padding:2px;background:linear-gradient(120deg,var(--a),var(--mid),var(--b))}
.mlo-in.mlo-alert{animation:mlo-pop .8s cubic-bezier(.18,1.3,.35,1) both}
.mlo-out.mlo-alert{animation:mlo-drop .6s cubic-bezier(.55,0,.75,.2) both}
.mlo-sweep{position:absolute;top:0;bottom:0;left:0;width:55%;pointer-events:none;
  background:linear-gradient(105deg,rgba(255,255,255,0),rgba(255,255,255,.16),rgba(255,255,255,0));
  transform:translateX(-120%);animation:mlo-sweep 1.2s .35s ease-out both}
.mlo-flag{position:relative;flex:none;display:grid;place-items:center;width:104px;height:104px;border-radius:50%;font-size:56px;line-height:1;
  background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.20),rgba(255,255,255,.03) 62%),#12111f;
  box-shadow:0 0 50px -8px var(--b)}
.mlo-flag-ring{position:absolute;inset:-4px;border-radius:50%;padding:3px;
  background:conic-gradient(from 0deg,var(--a),var(--b),var(--mid),var(--a));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
  animation:mlo-spin 2.4s linear infinite}
.mlo-flag .mlo-emoji{animation:mlo-wave 1.1s .3s ease-in-out 2 both}
.mlo-alert-body{flex:1;min-width:0}
.mlo-kicker{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlo-kicker-test{color:#ffd166}
.mlo-has-more .mlo-kicker{padding-right:96px}
.mlo-alert-line{margin-top:6px;font-size:26px;color:rgba(255,255,255,.80);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlo-alert-product{display:flex;align-items:baseline;gap:12px;margin-top:2px;font-size:42px;font-weight:700;letter-spacing:-.03em;line-height:1.12;min-width:0}
.mlo-qty{flex:none;color:var(--a)}
.mlo-alert-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-bottom:3px;
  background:linear-gradient(90deg,#fff 0,#fff 45%,var(--a) 78%,var(--b));-webkit-background-clip:text;background-clip:text;color:transparent}
.mlo-more{position:absolute;top:16px;right:20px;padding:4px 11px;border-radius:999px;font-size:14px;letter-spacing:.06em;color:#fff;background:rgba(255,255,255,.10)}
.mlo-timer{position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--a),var(--b));
  transform-origin:left center;animation:mlo-timer 5.2s .2s linear both}
.mlo-out .mlo-timer{animation:none;transform:scaleX(0)}

/* goal smashed */
.mlo-celebrate{position:absolute;left:50%;top:42%;width:1400px;margin-left:-700px;transform:translateY(-50%);text-align:center}
.mlo-rays{position:absolute;left:50%;top:50%;width:1300px;height:1300px;margin:-650px 0 0 -650px;border-radius:50%;
  background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.08) 0deg 5deg,rgba(255,255,255,0) 5deg 15deg);
  -webkit-mask:radial-gradient(circle,#000 0,#000 18%,rgba(0,0,0,0) 60%);mask:radial-gradient(circle,#000 0,#000 18%,rgba(0,0,0,0) 60%);
  animation:mlo-spin 18s linear infinite}
.mlo-cglow{position:absolute;left:50%;top:50%;width:1100px;height:520px;margin:-260px 0 0 -550px;border-radius:50%;
  background:radial-gradient(closest-side,rgba(8,8,16,.85),rgba(8,8,16,.55) 55%,rgba(8,8,16,0))}
.mlo-cglow::after{content:"";position:absolute;inset:18% 20%;border-radius:50%;background:radial-gradient(closest-side,var(--b),rgba(0,0,0,0));opacity:.35;filter:blur(30px)}
.mlo-ckicker,.mlo-ctitle,.mlo-csub{position:relative}
.mlo-ckicker{font-size:24px;letter-spacing:.42em;text-transform:uppercase;color:rgba(255,255,255,.85)}
.mlo-ctitle{margin-top:6px;font-size:168px;font-weight:700;letter-spacing:-.045em;line-height:1;white-space:nowrap;text-transform:uppercase}
.mlo-ctext{display:inline-block;padding:0 6px 14px;
  background:linear-gradient(100deg,var(--a) 0%,var(--mid) 30%,#fff 50%,var(--mid) 70%,var(--b) 100%);background-size:220% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;animation:mlo-flow 2.6s linear infinite}
.mlo-ctitle .mlo-emoji{display:inline-block;font-size:130px;vertical-align:8px;animation:mlo-wave .9s .5s ease-in-out 3 both}
.mlo-csub{margin-top:8px;font-size:36px;font-weight:500;color:rgba(255,255,255,.92)}
.mlo-celebrate.mlo-in{animation:mlo-boom 1s cubic-bezier(.16,1.45,.3,1) both}
.mlo-celebrate.mlo-out{animation:mlo-fadeup .8s ease-in both}

/* notes */
.mlo-note{position:absolute;left:32px;bottom:32px;display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
  background:rgba(9,9,16,.82);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-size:22px;color:rgba(255,255,255,.88)}
.mlo-note i{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#19affe,#ff2fae)}

/* entrance: the cards rise in when the source (re)loads */
.mlo-entrance .mlo-enter{animation:mlo-rise .9s cubic-bezier(.2,1.15,.3,1) both}

@keyframes mlo-rise{from{opacity:0;transform:translateY(calc(var(--dir) * 48px)) scale(.96)}to{opacity:1;transform:none}}
@keyframes mlo-pop{0%{opacity:0;transform:translateY(calc(var(--dir) * 60px)) scale(.86)}60%{opacity:1}100%{opacity:1;transform:none}}
@keyframes mlo-drop{to{opacity:0;transform:translateY(calc(var(--dir) * 24px)) scale(.95)}}
@keyframes mlo-sweep{to{transform:translateX(240%)}}
@keyframes mlo-timer{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes mlo-spin{to{transform:rotate(360deg)}}
@keyframes mlo-wave{0%,100%{transform:rotate(0) scale(1)}30%{transform:rotate(-12deg) scale(1.12)}65%{transform:rotate(9deg) scale(1.06)}}
@keyframes mlo-live{0%{box-shadow:0 0 0 0 rgba(255,59,92,.7)}80%,100%{box-shadow:0 0 0 10px rgba(255,59,92,0)}}
@keyframes mlo-shimmer{0%{transform:translateX(-260px)}55%,100%{transform:translateX(820px)}}
@keyframes mlo-twinkle{0%,100%{opacity:.75;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}
@keyframes mlo-plus{0%{opacity:0;transform:translate(-50%,-40%) scale(.6)}18%{opacity:1;transform:translate(-50%,-110%) scale(1.08)}70%{opacity:1;transform:translate(-50%,-150%) scale(1)}100%{opacity:0;transform:translate(-50%,-190%) scale(.96)}}
@keyframes mlo-flash{0%{opacity:0}20%{opacity:.9}100%{opacity:0}}
@keyframes mlo-flow{from{background-position:0% 0}to{background-position:-220% 0}}
@keyframes mlo-ring{0%{opacity:.9;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.16)}}
@keyframes mlo-boom{0%{opacity:0;transform:translateY(-50%) scale(.35)}55%{opacity:1}100%{opacity:1;transform:translateY(-50%) scale(1)}}
@keyframes mlo-fadeup{to{opacity:0;transform:translateY(-56%) scale(1.06)}}
@keyframes mlo-fade{from{opacity:0}to{opacity:1}}
@keyframes mlo-fadeout{to{opacity:0}}
@keyframes mlo-blink{0%,100%{opacity:0}15%,80%{opacity:1}}

@media (prefers-reduced-motion: reduce){
  .mlo-root *,.mlo-root *::before,.mlo-root *::after{animation-iteration-count:1!important;transition:none!important}
  .mlo-entrance .mlo-enter,.mlo-in.mlo-alert,.mlo-celebrate.mlo-in{animation:mlo-fade .5s ease-out both!important}
  .mlo-out.mlo-alert,.mlo-celebrate.mlo-out{animation:mlo-fadeout .5s ease-in both!important}
  .mlo-live i,.mlo-fill::after,.mlo-spark,.mlo-ring-pulse,.mlo-flag-ring,.mlo-rays,.mlo-ctext,.mlo-reached .mlo-fill,
  .mlo-sweep,.mlo-emoji,.mlo-flag .mlo-emoji,.mlo-ctitle .mlo-emoji{animation:none!important}
  .mlo-sweep,.mlo-ring-pulse,.mlo-fill::after{display:none}
  .mlo-plus{animation:mlo-blink 1.8s both!important;transform:translate(-50%,-130%)}
}
`;
