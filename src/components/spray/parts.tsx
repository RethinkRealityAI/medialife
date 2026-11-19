import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Upload } from "lucide-react";

import { cn } from "@/lib/utils";

import { scoreLabel, type Trackability } from "./convert";

// Small pieces the Spray Bobo admin screens share. Flat colours only (no gradients).

export const EVADE_YELLOW = "#f6c344";
export const CUT_LINE = "#ff4fa3";

/** 44 px targets everywhere on this page */
export const tap = "min-h-11";

const LABEL_STYLE: Record<Trackability["label"], { bar: string; text: string; ring: string }> = {
  Great: { bar: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-400/40" },
  Good: { bar: "bg-sky-400", text: "text-sky-300", ring: "ring-sky-400/40" },
  Weak: { bar: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-400/40" },
  Poor: { bar: "bg-rose-400", text: "text-rose-300", ring: "ring-rose-400/40" },
};

const LABEL_SUMMARY: Record<Trackability["label"], string> = {
  Great: "Plenty of detail all over: the camera will find it fast and hold it steady.",
  Good: "Should track well. More detail towards the edges helps it hold steady.",
  Weak: "The camera may be slow to find it, or the paint may wobble. See the tips below.",
  Poor: "The camera will struggle to find this picture. Use a more detailed one.",
};

/** A small coloured chip for a score: "84 · Great". */
export function ScoreChip({ score, className }: { score: number | null; className?: string }) {
  if (score == null)
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center rounded-full bg-white/[0.06] px-2.5 text-[11px] text-white/70 ring-1 ring-white/10 ring-inset",
          className,
        )}
      >
        Tested on phones
      </span>
    );
  const label = scoreLabel(score);
  const s = LABEL_STYLE[label];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full bg-black/30 px-2.5 text-[11px] font-medium tabular-nums ring-1 ring-inset",
        s.ring,
        s.text,
        className,
      )}
      title="How easily the camera finds this picture (0 to 100)"
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", s.bar)} />
      {score} · {label}
    </span>
  );
}

/** The trackability score, its word, a meter and plain-language tips. */
export function ScoreCard({
  score,
  advice,
  title = "How well the camera can follow it",
  className,
}: {
  score: number | null;
  advice?: string[];
  title?: string;
  className?: string;
}) {
  if (score == null)
    return (
      <div className={cn("rounded-xl border border-white/[0.08] bg-black/25 p-4", className)}>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">No score saved for this picture.</p>
      </div>
    );
  const label = scoreLabel(score);
  const s = LABEL_STYLE[label];
  return (
    <div className={cn("rounded-xl border border-white/[0.08] bg-black/25 p-4", className)}>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{score}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
        <span className={cn("ml-1 text-base font-semibold", s.text)}>{label}</span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label={`Tracking score: ${score} out of 100, ${label}`}
      >
        <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/75">{LABEL_SUMMARY[label]}</p>
      {advice?.length ? (
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-white/75">
          {advice.map((a) => (
            <li key={a} className="flex gap-2">
              <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full", s.bar)} />
              {a}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A 3:4 preview drawn on a canvas. `draw` runs whenever `deps` change. */
export function Preview({
  draw,
  deps,
  label,
  caption,
  w = 384,
  h = 512,
  className,
}: {
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  deps: unknown[];
  label: string;
  caption?: ReactNode;
  w?: number;
  h?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <figure className={cn("min-w-0", className)}>
      <canvas
        ref={ref}
        width={w}
        height={h}
        role="img"
        aria-label={label}
        className="block aspect-[3/4] w-full rounded-xl border border-white/[0.08] bg-[#24252b]"
      />
      {caption ? (
        <figcaption className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** An empty 3:4 slot where a preview will appear. */
export function PreviewSlot({ children }: { children: ReactNode }) {
  return (
    <div className="grid aspect-[3/4] w-full place-items-center rounded-xl border border-dashed border-white/[0.14] bg-white/[0.02] p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * A file picker that looks like a button: the real input stays in the tab order (visually hidden),
 * its label is the button, and a picture can also be dropped on it.
 */
export function FilePick({
  label,
  accept,
  onPick,
  fileName,
  hint,
  disabled,
}: {
  label: string;
  accept: string;
  onPick: (f: File) => void;
  fileName?: string | null;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <div className="min-w-0">
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="peer sr-only"
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !disabled) onPick(f);
        }}
        className={cn(
          "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-2.5 text-sm transition-colors hover:border-[var(--partner)] hover:bg-white/[0.05] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--partner)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          over && "border-[var(--partner)] bg-white/[0.06]",
        )}
      >
        <Upload className="size-4 shrink-0 text-[var(--partner)]" aria-hidden />
        <span className="min-w-0">
          <span className="block font-medium">
            {fileName ? "Choose a different picture" : label}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {fileName ?? "or drop it here"}
          </span>
        </span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A choice in a radio group: the whole row is the target. */
export function ChoiceRow({
  id,
  title,
  sub,
  control,
  selected,
}: {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  control: ReactNode;
  selected?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors hover:bg-white/[0.04]",
        selected ? "border-[var(--partner)] bg-white/[0.04]" : "border-white/[0.1]",
      )}
    >
      <span className="mt-0.5">{control}</span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {sub ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{sub}</span>
        ) : null}
      </span>
    </label>
  );
}

/** A numbered step of the editor. */
export function Step({
  n,
  title,
  sub,
  children,
  id,
}: {
  n: number;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const hid = useId();
  return (
    <section
      id={id}
      aria-labelledby={hid}
      className="rounded-2xl border border-white/[0.08] bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--partner)] text-sm font-semibold text-black"
        >
          {n}
        </span>
        <div className="min-w-0">
          <h3 id={hid} className="text-base font-semibold tracking-tight">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h3>
          {sub ? (
            <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{sub}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A warning or error line inside the editor. */
export function Note({
  tone,
  children,
  role,
}: {
  tone: "warn" | "error" | "info";
  children: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed",
        tone === "error"
          ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
          : tone === "warn"
            ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
            : "border-sky-400/30 bg-sky-500/10 text-sky-100",
      )}
    >
      {children}
    </div>
  );
}

/** A row of buttons where one is picked (Add / Erase, Fill / Outline only). 44 px tall. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex min-h-11 max-w-full flex-wrap gap-0.5 rounded-xl border border-white/[0.12] bg-black/25 p-1",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex min-h-9 min-w-11 flex-auto shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
            value === o.value
              ? "bg-[var(--partner)] text-black"
              : "text-white/75 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A 3:4 preview you can tap or drag on (taps: fractions of the picture; drags: the change in fractions).
 * Only takes over touch while `interactive`, so the page still scrolls over it otherwise.
 */
export function TouchPreview({
  draw,
  deps,
  label,
  caption,
  interactive,
  onTap,
  onDrag,
  w = 384,
  h = 512,
  className,
}: {
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  deps: unknown[];
  label: string;
  caption?: ReactNode;
  interactive?: "tap" | "drag" | null;
  onTap?: (u: number, v: number) => void;
  onDrag?: (du: number, dv: number) => void;
  w?: number;
  h?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const frac = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };
  return (
    <figure className={cn("min-w-0", className)}>
      <canvas
        ref={ref}
        width={w}
        height={h}
        role="img"
        aria-label={label}
        style={{ touchAction: interactive ? "none" : undefined }}
        className={cn(
          "block aspect-[3/4] w-full rounded-xl border border-white/[0.08] bg-[#24252b]",
          interactive === "tap" && "cursor-crosshair",
          interactive === "drag" && "cursor-move",
        )}
        onPointerDown={(e) => {
          if (!interactive || (e.pointerType === "mouse" && e.button !== 0)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
        }}
        onPointerMove={(e) => {
          const l = last.current;
          if (!l || l.id !== e.pointerId) return;
          const r = ref.current!.getBoundingClientRect();
          const dx = e.clientX - l.x,
            dy = e.clientY - l.y;
          l.moved += Math.abs(dx) + Math.abs(dy);
          if (interactive === "drag" && onDrag) {
            onDrag(dx / r.width, dy / r.height);
            l.x = e.clientX;
            l.y = e.clientY;
          }
        }}
        onPointerUp={(e) => {
          const l = last.current;
          last.current = null;
          if (!l || l.id !== e.pointerId) return;
          if (interactive === "tap" && onTap && l.moved < 12) {
            const [u, v] = frac(e);
            if (u >= 0 && u <= 1 && v >= 0 && v <= 1) onTap(u, v);
          }
        }}
        onPointerCancel={() => (last.current = null)}
      />
      {caption ? (
        <figcaption className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
