import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Lightbulb, RotateCcw, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Path } from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { useField } from "./editor-context";

// Form controls bound to the draft by path. Each renders its label, hint and
// validation message, and uses fieldId(path) as its id so "Fix" in the publish
// check can focus it.

export function FieldShell({
  id,
  label,
  hint,
  error,
  aside,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex min-h-4 items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-foreground/90">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const described = (id: string, error: string | null, hint?: ReactNode) =>
  error ? `${id}-err` : hint ? `${id}-hint` : undefined;

export const inputClass =
  "bg-background/60 aria-[invalid=true]:border-destructive/70 aria-[invalid=true]:focus-visible:ring-destructive";

export function TextField({
  path,
  label,
  hint,
  placeholder,
  optional,
  multiline,
  rows = 3,
  maxLength,
  transform,
  type = "text",
  className,
  showCount,
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
  placeholder?: string;
  /** empty input removes the field instead of storing "" */
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  transform?: (v: string) => string;
  type?: "text" | "url";
  className?: string;
  /** show the character count all the time, not just near the limit */
  showCount?: boolean;
}) {
  const f = useField<string | undefined>(path);
  const value = f.value ?? "";
  const onChange = (raw: string) => {
    const v = transform ? transform(raw) : raw;
    f.set(optional && v === "" ? undefined : v);
  };
  const count =
    maxLength && (showCount || value.length > maxLength * 0.8) ? (
      <span
        className={cn(
          "mono text-[10px] tabular-nums",
          value.length > maxLength ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {value.length}/{maxLength}
      </span>
    ) : null;
  const common = {
    id: f.id,
    value,
    placeholder,
    "aria-invalid": !!f.error,
    "aria-describedby": described(f.id, f.error, hint),
    className: inputClass,
  };
  return (
    <FieldShell
      id={f.id}
      label={label}
      hint={hint}
      error={f.error}
      aside={count}
      className={className}
    >
      {multiline ? (
        <Textarea
          {...common}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "min-h-0 resize-y text-sm")}
        />
      ) : (
        <Input
          {...common}
          type={type}
          inputMode={type === "url" ? "url" : undefined}
          spellCheck={type === "url" ? false : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FieldShell>
  );
}

/** USD price, stored as a number; the text stays as typed until it's a valid amount. */
export function PriceField({ path, label = "Price" }: { path: Path; label?: string }) {
  const f = useField<number>(path);
  const [text, setText] = useState(() => fmtPrice(f.value));
  useEffect(() => {
    // keep in sync when the value changes elsewhere (template, reset)
    setText((t) => (parsePrice(t) === f.value ? t : fmtPrice(f.value)));
  }, [f.value]);
  const invalid = parsePrice(text) === null;
  return (
    <FieldShell
      id={f.id}
      label={label}
      error={f.error ?? (invalid ? "Enter an amount like 24.99" : null)}
    >
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          id={f.id}
          inputMode="decimal"
          value={text}
          aria-invalid={!!f.error || invalid}
          aria-describedby={f.error || invalid ? `${f.id}-err` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = parsePrice(e.target.value);
            if (n !== null) f.set(n);
          }}
          onBlur={() => {
            const n = parsePrice(text);
            if (n !== null) setText(fmtPrice(n));
          }}
          className={cn(inputClass, "pl-6 tabular-nums")}
        />
      </div>
    </FieldShell>
  );
}
function parsePrice(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100) / 100;
}
const fmtPrice = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? Number.isInteger(n)
      ? String(n)
      : n.toFixed(2)
    : "";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ColorField({
  path,
  label,
  hint,
  optional,
  fallback = "#3aa8ff",
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  /** shown in the swatch when an optional colour is unset */
  fallback?: string;
}) {
  const f = useField<string | undefined>(path);
  const [text, setText] = useState(f.value ?? "");
  useEffect(
    () => setText((t) => (t.toLowerCase() === (f.value ?? "").toLowerCase() ? t : (f.value ?? ""))),
    [f.value],
  );
  const swatch = f.value && HEX.test(f.value) ? f.value : fallback;
  return (
    <FieldShell
      id={f.id}
      label={label}
      hint={hint}
      error={f.error}
      aside={
        optional && f.value ? (
          <button
            type="button"
            onClick={() => f.set(undefined)}
            className="rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            Use default
          </button>
        ) : null
      }
    >
      <div className="flex items-center gap-2">
        <label
          className={cn(
            "relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring",
            !f.value && "opacity-60",
          )}
          style={{ background: swatch }}
        >
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input
            type="color"
            value={swatch.toLowerCase()}
            onChange={(e) => {
              setText(e.target.value);
              f.set(e.target.value);
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          id={f.id}
          value={text}
          placeholder={optional ? "Default" : "#000000"}
          spellCheck={false}
          maxLength={7}
          aria-invalid={!!f.error}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = `#${v}`;
            setText(v);
            if (HEX.test(v)) f.set(v.toLowerCase());
            else if (!v && optional) f.set(undefined);
          }}
          onBlur={() => setText(f.value ?? "")}
          className={cn(inputClass, "mono uppercase placeholder:font-sans placeholder:normal-case")}
        />
      </div>
    </FieldShell>
  );
}

export function SwitchField({
  path,
  label,
  hint,
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
}) {
  const f = useField<boolean | undefined>(path);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={f.id} className="text-sm font-medium">
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <Switch id={f.id} checked={!!f.value} onCheckedChange={(v) => f.set(v)} className="mt-0.5" />
    </div>
  );
}

export function SliderField({
  path,
  label,
  min,
  max,
  step,
  reset,
  format,
}: {
  path: Path;
  label: string;
  min: number;
  max: number;
  step: number;
  reset: number;
  format: (v: number) => string;
}) {
  const f = useField<number | undefined>(path);
  const v = typeof f.value === "number" ? f.value : reset;
  return (
    <FieldShell
      id={f.id}
      label={label}
      error={f.error}
      aside={
        <span className="flex items-center gap-1.5">
          <span className="mono text-[11px] text-muted-foreground tabular-nums">{format(v)}</span>
          <button
            type="button"
            onClick={() => f.set(reset)}
            disabled={v === reset}
            aria-label={`Reset ${label.toLowerCase()}`}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30"
          >
            <RotateCcw className="size-3" aria-hidden />
          </button>
        </span>
      }
    >
      <Slider
        id={f.id}
        min={min}
        max={max}
        step={step}
        value={[v]}
        onValueChange={([n]) => f.set(n)}
        aria-label={label}
        className="py-1.5"
      />
    </FieldShell>
  );
}

export function SelectField<V extends string>({
  path,
  label,
  hint,
  options,
  placeholder,
  emptyValue,
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
  options: { value: V; label: string }[];
  placeholder?: string;
  /** a choice that stores "unset" */
  emptyValue?: { label: string };
}) {
  const f = useField<V | undefined>(path);
  const NONE = "__none__";
  return (
    <FieldShell id={f.id} label={label} hint={hint} error={f.error}>
      <Select
        value={f.value ?? (emptyValue ? NONE : undefined)}
        onValueChange={(v) => f.set(v === NONE ? undefined : (v as V))}
      >
        <SelectTrigger id={f.id} aria-invalid={!!f.error} className={inputClass}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {emptyValue ? <SelectItem value={NONE}>{emptyValue.label}</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

/** A small radio group that looks like a segmented control. */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  id,
  hideLabel,
}: {
  label: string;
  value: V;
  options: { value: V; label: string; icon?: ReactNode }[];
  onChange: (v: V) => void;
  id?: string;
  hideLabel?: boolean;
}) {
  const auto = useId();
  const gid = id ?? auto;
  return (
    <div className="min-w-0">
      <div
        id={`${gid}-label`}
        className={cn("mb-1.5 text-xs font-medium text-foreground/90", hideLabel && "sr-only")}
      >
        {label}
      </div>
      <div
        id={gid}
        role="radiogroup"
        aria-labelledby={`${gid}-label`}
        className="flex gap-1 rounded-lg border border-border bg-background/60 p-1"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault();
          const i = options.findIndex((o) => o.value === value);
          const d = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
          const next = options[(i + d + options.length) % options.length];
          onChange(next.value);
          (
            e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null
          )?.focus();
        }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-value={o.value}
              onClick={() => onChange(o.value)}
              className={cn(
                "inline-flex min-w-0 flex-auto items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5",
                on
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              {o.icon}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SIZE_PRESETS = [["S", "M", "L", "XL"], ["XS", "S", "M", "L", "XL", "XXL"], ["One size"]];

/** Size options as removable chips (max 8, ≤8 characters each). */
export function ChipsField({ path, label }: { path: Path; label: string }) {
  const f = useField<string[] | undefined>(path);
  const list = f.value ?? [];
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const add = (raw: string) => {
    const v = raw.trim().slice(0, 8);
    if (!v) return;
    if (list.length >= 8) return setNote("At most 8 sizes");
    if (list.some((x) => x.toLowerCase() === v.toLowerCase()))
      return setNote(`${v} is already there`);
    setNote(null);
    f.set([...list, v]);
    setText("");
  };
  const remove = (i: number) => {
    const next = list.filter((_, j) => j !== i);
    f.set(next.length ? next : undefined);
  };
  return (
    <FieldShell
      id={f.id}
      label={label}
      error={f.error ?? note}
      hint="Leave empty for no size picker. Press Enter to add."
    >
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring",
        )}
      >
        {list.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className="mono inline-flex items-center gap-1 rounded bg-secondary py-0.5 pr-1 pl-2 text-[11px]"
          >
            {s}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove size ${s}`}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={f.id}
          value={text}
          maxLength={8}
          placeholder={list.length ? "" : "Add a size"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && list.length) {
              remove(list.length - 1);
            }
          }}
          onBlur={() => add(text)}
          className="h-6 min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {!list.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.join()}
              type="button"
              onClick={() => f.set([...p])}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              {p.join(" · ")}
            </button>
          ))}
        </div>
      ) : null}
    </FieldShell>
  );
}

/**
 * A non-blocking suggestion: something will look off in the endcap, but nothing
 * stops a publish. Actions are small buttons that fix or jump to the cause.
 */
export function Hint({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div
      role="note"
      className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs leading-relaxed"
    >
      <div className="flex gap-2.5">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 text-foreground/90">{children}</div>
      </div>
      {actions ? <div className="mt-2.5 flex flex-wrap gap-1.5 pl-6">{actions}</div> : null}
    </div>
  );
}

export function HintAction({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center rounded-md border border-border bg-background/70 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** A titled block inside a settings section. */
export function Group({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("space-y-4 border-b border-border px-5 py-5 last:border-b-0", className)}
    >
      {title ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium tracking-tight">{title}</h3>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
