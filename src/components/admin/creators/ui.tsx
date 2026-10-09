import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CREATOR_STATUS, timeAgo, type CreatorStatus, type Tone } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../format";
import { Eyebrow } from "../kit";

// Small pieces the /admin/creators screens share.

export const TONE_CLASSES: Record<Tone, string> = {
  live: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  primary: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  accent: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
  watch: "border-amber-400/45 bg-amber-400/10 text-amber-300",
  muted: "border-white/15 bg-white/[0.04] text-muted-foreground",
  danger: "border-red-400/45 bg-red-400/10 text-red-300",
};

export function Pill({
  tone = "muted",
  children,
  className,
  dot = true,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "mono inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] tracking-[0.08em] whitespace-nowrap uppercase",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/**
 * "3 days ago", with the exact time on hover. Relative and local times differ
 * between the server render and the browser, so the mismatch is expected.
 */
export function Ago({
  ts,
  prefix = "",
  className,
}: {
  ts: number;
  prefix?: string;
  className?: string;
}) {
  return (
    <time
      dateTime={new Date(ts).toISOString()}
      title={formatDateTime(ts)}
      className={className}
      suppressHydrationWarning
    >
      {`${prefix}${timeAgo(ts)}`}
    </time>
  );
}

/** Short team-facing names; CREATOR_STATUS labels are written for the creator. */
export const STATUS_SHORT: Record<CreatorStatus, string> = {
  draft: "Draft",
  submitted: "To review",
  approved: "Active",
  waitlist: "Waitlist",
  declined: "Declined",
  paused: "Paused",
};

export function StatusPill({ status, className }: { status: CreatorStatus; className?: string }) {
  return (
    <Pill
      tone={CREATOR_STATUS[status].tone}
      className={className}
      title={CREATOR_STATUS[status].label}
    >
      {STATUS_SHORT[status]}
    </Pill>
  );
}

/** A form field: label, control, then an error or a hint. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {optional ? (
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** A labelled checkbox row, e.g. "Email the creator". */
export function CheckRow({
  id,
  checked,
  onChange,
  children,
  hint,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="cursor-pointer text-sm leading-snug font-normal">
        {children}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </Label>
    </div>
  );
}

/** Label / value rows for read-only records (the application). */
export function DataList({
  rows,
  className,
}: {
  rows: Array<[ReactNode, ReactNode]>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border text-sm", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{isBlank(v) ? <Blank /> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

const isBlank = (v: ReactNode) => v === null || v === undefined || v === false || v === "";

export function Blank({ children = "Not given" }: { children?: ReactNode }) {
  return <span className="text-muted-foreground/70">{children}</span>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <Eyebrow className={cn("block", className)}>{children}</Eyebrow>;
}

/** Free-text chips: type, Enter or comma to add, × to remove. */
export function ChipsInput({
  id,
  value,
  onChange,
  placeholder,
  validate,
  mono,
  max = 50,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** Returns an error message for a chip that can't be added. */
  validate?: (chip: string) => string | null;
  mono?: boolean;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  function add(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      const err = validate?.(p);
      if (err) {
        setError(err);
        return;
      }
      if (!next.includes(p) && next.length < max) next.push(p);
    }
    setError(null);
    onChange(next);
    setDraft("");
  }
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
        {value.map((v) => (
          <span
            key={v}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-border bg-white/[0.05] py-0.5 pr-0.5 pl-2 text-xs",
              mono && "mono",
            )}
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <Input
          id={id}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          className={cn(
            "h-6 min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:ring-0",
            mono && "mono text-xs",
          )}
        />
      </div>
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type Result = { ok: boolean; error?: string };

/** A readable message from a thrown server-function error (zod issues arrive as JSON). */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message;
  try {
    const parsed = JSON.parse(m) as Array<{ message?: string; path?: Array<string | number> }>;
    if (Array.isArray(parsed) && parsed[0]?.message) {
      const p = parsed[0].path?.filter((x) => typeof x === "string").join(" › ");
      return p ? `${p}: ${parsed[0].message}` : parsed[0].message;
    }
  } catch {
    /* not JSON */
  }
  if (/forbidden|unauthori[sz]ed/i.test(m)) return "Your admin session has ended. Sign in again.";
  return m && m.length < 200 ? m : fallback;
}

/**
 * Runs a server mutation: tracks which one is pending, toasts the outcome,
 * reloads the route's data on success. Returns the result, or null on failure.
 */
export function useRun() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <T extends Result>(
      key: string,
      fn: () => Promise<T>,
      success?: string | ((r: T) => string | null) | null,
    ): Promise<T | null> => {
      setPending(key);
      try {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error ?? "That didn't work. Try again.");
          return null;
        }
        const msg = typeof success === "function" ? success(r) : success;
        if (msg) toast.success(msg);
        await router.invalidate();
        return r;
      } catch (err) {
        toast.error(errorMessage(err));
        return null;
      } finally {
        setPending(null);
      }
    },
    [router],
  );
  return { pending, run, busy: pending !== null };
}

/** Cents → a dollars string for an <input type="number">. */
export const centsToInput = (c: number | null | undefined) =>
  c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, "");

/** "" → null, otherwise a finite number (or NaN when it doesn't parse). */
export function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  return Number(t);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const ghostBtn = "hover:bg-white/[0.06] hover:text-foreground";
export const outlineBtn = "bg-transparent hover:bg-white/[0.06] hover:text-foreground";
