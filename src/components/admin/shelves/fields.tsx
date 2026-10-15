import { useEffect, useState, type ReactNode } from "react";
import { ImageIcon, Replace, X } from "lucide-react";

import { FieldShell, inputClass } from "@/components/ar-builder/fields";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Controlled form fields for the shelf editor. They look like the endcap
// builder's (same FieldShell, same input styling) but take value/onChange, since
// a ShelfConfig isn't an endcap Project.

export function TextInput({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  maxLength,
  multiline,
  rows = 3,
  optional,
  counter,
  className,
  mono,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  optional?: boolean;
  /** show "12/28" beside the label */
  counter?: boolean;
  className?: string;
  mono?: boolean;
}) {
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const common = {
    id,
    value,
    placeholder,
    maxLength,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
    className: cn(inputClass, mono && "mono text-xs"),
  };
  return (
    <FieldShell
      id={id}
      label={
        <>
          {label}
          {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
        </>
      }
      hint={hint}
      error={error}
      className={className}
      aside={
        counter && maxLength ? (
          <span
            className={cn(
              "mono text-[10px] text-muted-foreground tabular-nums",
              value.length >= maxLength && "text-amber-300",
            )}
          >
            {value.length}/{maxLength}
          </span>
        ) : null
      }
    >
      {multiline ? (
        <Textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldShell>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ColorInput({
  id,
  label,
  value,
  onChange,
  hint,
  swatches,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  /** quick picks shown under the input */
  swatches?: readonly string[];
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText((t) => (t.toLowerCase() === value.toLowerCase() ? t : value)), [value]);
  const swatch = HEX.test(value) ? value : "#000000";
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <label
          className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring pointer-coarse:size-11"
          style={{ background: swatch, boxShadow: `0 0 14px -2px ${swatch}` }}
        >
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input
            type="color"
            value={swatch.toLowerCase()}
            onChange={(e) => {
              setText(e.target.value);
              onChange(e.target.value.toLowerCase());
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          id={id}
          value={text}
          spellCheck={false}
          maxLength={7}
          placeholder="#000000"
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = `#${v}`;
            setText(v);
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          onBlur={() => setText(value)}
          className={cn(inputClass, "mono uppercase")}
        />
      </div>
      {swatches?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${label} swatches`}>
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={c}
              aria-pressed={c.toLowerCase() === value.toLowerCase()}
              className={cn(
                "size-6 rounded-full border border-white/15 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:size-9",
                c.toLowerCase() === value.toLowerCase() && "ring-2 ring-foreground/70",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      ) : null}
    </FieldShell>
  );
}

/** Dollars in the input, cents in the config. */
export function PriceInput({
  id,
  label = "Price",
  cents,
  onChange,
}: {
  id: string;
  label?: string;
  cents: number;
  onChange: (cents: number) => void;
}) {
  const fmt = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
  const [text, setText] = useState(fmt(cents));
  useEffect(() => {
    setText((t) => (Math.round(parseFloat(t) * 100) === cents ? t : fmt(cents)));
  }, [cents]);
  return (
    <FieldShell id={id} label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            setText(v);
            const n = parseFloat(v);
            if (Number.isFinite(n)) onChange(Math.max(0, Math.min(100_000, Math.round(n * 100))));
          }}
          onBlur={() => setText(fmt(cents))}
          className={cn(inputClass, "pl-6 tabular-nums")}
        />
      </div>
    </FieldShell>
  );
}

export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-medium text-foreground/90">
          {label}
        </label>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** An image held as "/api/ar/asset/<id>" (or any site path / https URL); null = none. */
export function ImageInput({
  id,
  label,
  value,
  onChoose,
  onClear,
  hint,
  empty,
  clearLabel = "Remove",
}: {
  id: string;
  label: string;
  value: string | null;
  onChoose: () => void;
  onClear: () => void;
  hint?: ReactNode;
  empty: string;
  clearLabel?: string;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint}>
      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-input bg-background/60 p-1.5 pr-2">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded bg-[conic-gradient(oklch(0.2_0.01_280)_25%,oklch(0.15_0.01_280)_0_50%,oklch(0.2_0.01_280)_0_75%,oklch(0.15_0.01_280)_0)] bg-[length:10px_10px]">
            <img src={value} alt="" className="size-full object-contain" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={value}>
            {value.startsWith("/api/ar/asset/") ? "Uploaded image" : value}
          </span>
          <button
            id={id}
            type="button"
            onClick={onChoose}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 [&_svg]:size-3.5"
          >
            <Replace aria-hidden /> Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            title={clearLabel}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:size-11 [&_svg]:size-3.5"
          >
            <X aria-hidden />
          </button>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          onClick={onChoose}
          className="flex h-14 w-full items-center gap-3 rounded-md border border-dashed border-input bg-background/40 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
        >
          <ImageIcon aria-hidden />
          {empty}
        </button>
      )}
    </FieldShell>
  );
}
