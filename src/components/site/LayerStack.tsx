import { useEffect, useRef, useState } from "react";
import { HEX, type Hue } from "./kit";

export type Layer = {
  name: string;
  line: string;
  body: string;
  tools: string[];
  /** a few words drawn on the plane itself */
  mark: string;
};

/**
 * The stack as five glass planes floating in 3D. Pick a layer (from the list
 * or by clicking its plane) and it lifts out of the stack and lights up; its
 * story shows beside it. While nobody has touched it, it walks through the
 * layers by itself (not with reduced motion). The planes spread apart as the
 * section scrolls into view.
 */
export function LayerStack({ layers }: { layers: Layer[] }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const touched = useRef(false);
  const root = useRef<HTMLDivElement | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    const io = new IntersectionObserver(
      (es) => {
        const on = es[0].isIntersecting;
        if (on) setOpen(true);
        window.clearInterval(timer);
        if (on && !reduce)
          timer = window.setInterval(() => {
            if (!touched.current) setActive((a) => (a + 1) % layers.length);
          }, 3800);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [layers.length]);

  const pick = (i: number) => {
    touched.current = true;
    setActive(i);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = layers.length;
    const to =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    pick(to);
    tabs.current[to]?.focus();
  };

  const hue = (i: number): Hue => (i % 2 === 0 ? "blue" : "magenta");
  const cur = layers[active];

  return (
    <div ref={root} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
      {/* the stack */}
      <div className="relative lg:col-span-6" aria-hidden>
        <div className="relative mx-auto aspect-square w-full max-w-[520px] [perspective:1600px]">
          <div
            className="absolute inset-0 transition-transform duration-1000 [transform-style:preserve-3d]"
            style={{ transform: "rotateX(58deg) rotateZ(-38deg) translateZ(-60px)" }}
          >
            {layers.map((l, i) => {
              const on = i === active;
              const gap = open ? 52 : 12;
              const lift = on ? 34 : 0;
              const c = HEX[hue(i)];
              return (
                <button
                  key={l.name}
                  type="button"
                  tabIndex={-1}
                  onClick={() => pick(i)}
                  className="absolute inset-[16%] cursor-pointer rounded-[28px] border transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{
                    transform: `translateZ(${i * gap + lift}px)`,
                    borderColor: on ? c : "rgba(255,255,255,0.14)",
                    background: on
                      ? `linear-gradient(135deg, ${c}33, rgba(8,10,16,0.82) 60%)`
                      : "rgba(10,12,18,0.62)",
                    boxShadow: on
                      ? `0 0 0 1px ${c}, 0 0 60px ${c}66, inset 0 1px 0 rgba(255,255,255,0.18)`
                      : "inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 60px -30px rgba(0,0,0,0.9)",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  <span
                    className="absolute inset-0 rounded-[28px] grid-bg opacity-30"
                    style={{ backgroundSize: "28px 28px" }}
                  />
                  <span
                    className="absolute left-[8%] top-[8%] mono text-[11px] uppercase tracking-[0.25em]"
                    style={{ color: on ? c : "rgba(255,255,255,0.55)" }}
                  >
                    {String(i + 1).padStart(2, "0")} · {l.name}
                  </span>
                  <span
                    className="absolute bottom-[8%] right-[8%] display text-[clamp(18px,2.4vw,30px)] transition-opacity duration-500"
                    style={{ color: "white", opacity: on ? 0.95 : 0.3 }}
                  >
                    {l.mark}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* the list and the chosen layer's story */}
      <div className="lg:col-span-6">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Layers of the stack"
          className="grid gap-2"
        >
          {layers.map((l, i) => {
            const on = i === active;
            return (
              <button
                key={l.name}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`layer-tab-${i}`}
                aria-selected={on}
                aria-controls="layer-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => pick(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={`group flex items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  on
                    ? "border-white/20 bg-white/[0.06]"
                    : "border-transparent hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border mono text-[11px] transition-colors"
                  style={{
                    borderColor: on ? HEX[hue(i)] : "rgba(255,255,255,0.15)",
                    color: on ? HEX[hue(i)] : "rgba(255,255,255,0.6)",
                  }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-base font-semibold ${on ? "text-white" : "text-white/70"}`}
                  >
                    {l.name}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{l.line}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          id="layer-panel"
          role="tabpanel"
          aria-labelledby={`layer-tab-${active}`}
          className="lg-card mt-6 rounded-[26px] p-6 sm:p-7"
        >
          <p key={active} className="text-white/85 layer-fade">
            {cur.body}
          </p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Built with">
            {cur.tools.map((t) => (
              <li
                key={t}
                className="lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.16em] text-white/85"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
