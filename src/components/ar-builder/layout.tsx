import { useRef, useState, type KeyboardEvent } from "react";
import { Eye, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

// The pieces of the compact editor layouts (see use-layout.ts).

/**
 * The divider between the preview (above) and settings (below) in the stack
 * layout. Drag it (mouse, pen or finger), or focus it and use the arrow keys.
 * `fraction` is the preview's share of the height.
 */
export function SplitDivider({
  fraction,
  onChange,
  containerRef,
  onDragging,
}: {
  fraction: number;
  onChange: (f: number) => void;
  containerRef: React.RefObject<HTMLElement | null>;
  onDragging?: (on: boolean) => void;
}) {
  const [drag, setDrag] = useState(false);
  const clamp = (f: number) => Math.min(0.75, Math.max(0.22, f));
  const move = (clientY: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.height <= 0) return;
    onChange(clamp((clientY - box.top) / box.height));
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.04;
    if (e.key === "ArrowUp") onChange(clamp(fraction - step));
    else if (e.key === "ArrowDown") onChange(clamp(fraction + step));
    else if (e.key === "Home") onChange(0.22);
    else if (e.key === "End") onChange(0.75);
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the preview"
      aria-valuemin={22}
      aria-valuemax={75}
      aria-valuenow={Math.round(fraction * 100)}
      tabIndex={0}
      onKeyDown={key}
      onPointerDown={(e) => {
        // capture keeps the drag even when the finger passes over the iframe
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        onDragging?.(true);
      }}
      onPointerMove={(e) => drag && move(e.clientY)}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDrag(false);
        onDragging?.(false);
      }}
      onPointerCancel={() => {
        setDrag(false);
        onDragging?.(false);
      }}
      onDoubleClick={() => onChange(fraction > 0.5 ? 0.4 : 0.65)}
      className="group relative z-10 flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center border-y border-border bg-background outline-none select-none"
    >
      {/* a 44 px touch area around the thin bar */}
      <span aria-hidden className="absolute inset-x-0 -top-4 -bottom-4" />
      <span
        aria-hidden
        className={cn(
          "h-1 w-12 rounded-full transition-colors",
          drag
            ? "bg-primary"
            : "bg-white/25 group-hover:bg-white/45 group-focus-visible:bg-primary",
        )}
      />
    </div>
  );
}

/** Settings | Preview, for the tabs layout. */
export function PaneTabs({
  value,
  onChange,
  issues,
}: {
  value: "settings" | "preview";
  onChange: (v: "settings" | "preview") => void;
  issues: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opts = [
    { value: "settings" as const, label: "Settings", icon: SlidersHorizontal },
    { value: "preview" as const, label: "Preview", icon: Eye },
  ];
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Editor panes"
      className="grid shrink-0 grid-cols-2 gap-1 border-b border-border bg-background p-1.5"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next = value === "settings" ? "preview" : "settings";
        onChange(next);
        ref.current?.querySelector<HTMLElement>(`[data-pane="${next}"]`)?.focus();
      }}
    >
      {opts.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            id={`pane-tab-${o.value}`}
            aria-selected={on}
            aria-controls={`pane-${o.value}`}
            tabIndex={on ? 0 : -1}
            data-pane={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <o.icon className={cn("size-4", on && "text-primary")} aria-hidden />
            {o.label}
            {o.value === "settings" && issues ? (
              <span className="grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] leading-5 text-destructive-foreground tabular-nums">
                {issues}
                <span className="sr-only"> to fix</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
