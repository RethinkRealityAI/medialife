import type { KeyboardEvent } from "react";

import { ZONES, ZONE_IDS, type ZoneId } from "@/lib/ar/project";
import { cn } from "@/lib/utils";

// A front-on sketch of the AR-01 endcap: header, towers, video wall with the
// hero screen, the two-shelf merch bay (and the freestanding totem). Used to
// pick a shelf zone and to show where each theme graphic goes.

export type PanelId = "header" | "towerL" | "towerR" | "wall" | "screen" | "totem";

const ZONE_RECTS: Record<ZoneId, { x: number; y: number; w: number; h: number }> = {
  cap: { x: 64, y: 138, w: 86, h: 40 },
  plush: { x: 154, y: 138, w: 52, h: 40 },
  keychain: { x: 210, y: 138, w: 86, h: 18 },
  mousepad: { x: 210, y: 159, w: 86, h: 19 },
  figure: { x: 64, y: 184, w: 86, h: 38 },
  tee: { x: 154, y: 184, w: 52, h: 38 },
  hoodie: { x: 210, y: 184, w: 86, h: 38 },
};

const PANELS: Record<PanelId, { x: number; y: number; w: number; h: number; r?: number }> = {
  header: { x: 60, y: 8, w: 240, h: 32, r: 3 },
  towerL: { x: 6, y: 34, w: 48, h: 192, r: 3 },
  towerR: { x: 306, y: 34, w: 48, h: 192, r: 3 },
  wall: { x: 62, y: 46, w: 236, h: 84, r: 2 },
  screen: { x: 128, y: 55, w: 104, h: 66, r: 2 },
  totem: { x: 368, y: 118, w: 24, h: 108, r: 3 },
};

/** Little product shapes per zone, one per slot. */
function Slots({ id, r }: { id: ZoneId; r: { x: number; y: number; w: number; h: number } }) {
  const n = ZONES[id].slots;
  const pad = 6;
  const cw = (r.w - pad * 2) / n;
  return (
    <g aria-hidden className="pointer-events-none">
      {id === "keychain" ? (
        <line
          x1={r.x + 6}
          x2={r.x + r.w - 6}
          y1={r.y + 4}
          y2={r.y + 4}
          className="stroke-current"
          strokeWidth={1}
        />
      ) : null}
      {Array.from({ length: n }, (_, i) => {
        const cx = r.x + pad + cw * i + cw / 2;
        if (id === "keychain")
          return <circle key={i} cx={cx} cy={r.y + 11} r={3} className="fill-current" />;
        if (id === "mousepad")
          return (
            <rect
              key={i}
              x={cx - cw / 2 + 3}
              y={r.y + r.h - 9}
              width={cw - 6}
              height={6}
              rx={3}
              className="fill-current"
            />
          );
        const w = Math.min(cw - 5, id === "plush" ? 16 : 18);
        const h = id === "figure" ? 20 : id === "plush" ? 22 : id === "cap" ? 10 : 12;
        return (
          <rect
            key={i}
            x={cx - w / 2}
            y={r.y + r.h - h - 3}
            width={w}
            height={h}
            rx={id === "cap" ? 5 : id === "plush" ? 6 : 1.5}
            className="fill-current"
          />
        );
      })}
    </g>
  );
}

export function EndcapSchematic({
  selected,
  onSelect,
  onHover,
  enabled,
  highlight,
  labels,
  className,
}: {
  /** zone mode: the chosen zone */
  selected?: ZoneId | null;
  onSelect?: (id: ZoneId) => void;
  onHover?: (id: ZoneId | null) => void;
  enabled?: Partial<Record<ZoneId, boolean>>;
  /** graphics mode: panels to light up ("all" for key art) */
  highlight?: PanelId[] | "all" | null;
  /** accessible names per zone (e.g. the product label) */
  labels?: Partial<Record<ZoneId, string>>;
  className?: string;
}) {
  const interactive = !!onSelect;
  const lit = (p: PanelId) =>
    highlight === "all" || (Array.isArray(highlight) && highlight.includes(p));
  const key = (e: KeyboardEvent, id: ZoneId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
    }
  };
  return (
    <svg
      viewBox="0 0 400 234"
      className={cn("h-auto w-full select-none", className)}
      role={interactive ? "group" : "img"}
      aria-label={
        interactive ? "Shelf zones on the endcap" : "Where theme graphics go on the endcap"
      }
    >
      {/* panels */}
      {(Object.keys(PANELS) as PanelId[]).map((p) => {
        const r = PANELS[p];
        return (
          <rect
            key={p}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={r.r}
            className={cn(
              "transition-colors",
              p === "screen" ? "fill-background" : "fill-white/[0.035]",
              lit(p) ? "fill-primary/25 stroke-primary" : "stroke-white/15",
            )}
            strokeWidth={lit(p) ? 1.5 : 1}
          />
        );
      })}
      {/* wall tiles */}
      <g aria-hidden className="pointer-events-none stroke-white/[0.06]" strokeWidth={0.75}>
        {[1, 2, 3].map((i) => (
          <line key={`v${i}`} x1={62 + (236 / 4) * i} x2={62 + (236 / 4) * i} y1={46} y2={130} />
        ))}
        {[1, 2].map((i) => (
          <line key={`h${i}`} x1={62} x2={298} y1={46 + 28 * i} y2={46 + 28 * i} />
        ))}
      </g>
      <rect
        x={128}
        y={55}
        width={104}
        height={66}
        rx={2}
        className={cn("fill-background", lit("screen") ? "stroke-primary" : "stroke-white/15")}
        strokeWidth={lit("screen") ? 1.5 : 1}
      />
      {/* shelf bay */}
      <rect
        x={60}
        y={134}
        width={240}
        height={92}
        rx={2}
        className="fill-white/[0.02] stroke-white/15"
      />
      <line x1={60} x2={300} y1={181} y2={181} className="stroke-white/25" strokeWidth={1.5} />
      <line x1={60} x2={300} y1={226} y2={226} className="stroke-white/25" strokeWidth={1.5} />
      <text x={380} y={112} textAnchor="middle" className="fill-muted-foreground text-[8px]">
        totem
      </text>

      {ZONE_IDS.map((id) => {
        const r = ZONE_RECTS[id];
        const on = selected === id;
        const off = enabled && enabled[id] === false;
        return (
          <g
            key={id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? on : undefined}
            aria-label={
              interactive
                ? `${ZONES[id].label}${labels?.[id] ? `: ${labels[id]}` : ""}${off ? " (empty)" : ""}`
                : undefined
            }
            onClick={interactive ? () => onSelect?.(id) : undefined}
            onKeyDown={interactive ? (e) => key(e, id) : undefined}
            onMouseEnter={() => onHover?.(id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(id)}
            onBlur={() => onHover?.(null)}
            className={cn(
              "outline-none",
              interactive && "cursor-pointer",
              on ? "text-primary" : off ? "text-white/15" : "text-white/40 hover:text-white/70",
              "[&:focus-visible>rect]:stroke-ring [&:focus-visible>rect]:[stroke-width:2]",
            )}
          >
            <title>{ZONES[id].label}</title>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={2}
              className={cn(
                "transition-colors",
                on ? "fill-primary/15 stroke-primary" : "fill-transparent stroke-white/10",
                interactive && !on && "hover:fill-white/[0.04]",
              )}
              strokeWidth={on ? 1.5 : 1}
              strokeDasharray={off ? "3 3" : undefined}
            />
            <Slots id={id} r={r} />
          </g>
        );
      })}
    </svg>
  );
}
