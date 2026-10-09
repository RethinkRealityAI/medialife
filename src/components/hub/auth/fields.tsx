/**
 * Form pieces for the Creator Hub account pages and the intake: a labelled
 * field with hint and error wiring, the password field, error and notice
 * blocks, the dev-only link notice and the Discord button.
 */
import { forwardRef, useId, useState, type ComponentProps, type ReactNode } from "react";
import { AlertCircle, Copy, ExternalLink, Eye, EyeOff, Info, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Inputs in the hub: taller for thumbs, quiet fill, a clear invalid state. */
export const INPUT =
  "h-11 rounded-lg border-input bg-white/[0.03] px-3.5 shadow-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive/80 aria-[invalid=true]:focus-visible:ring-destructive/30";

export const TEXTAREA =
  "min-h-[104px] rounded-lg border-input bg-white/[0.03] px-3.5 py-2.5 shadow-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive/80";

/** Native <select> styled to match INPUT. Better than a popover on phones for long lists. */
export const SELECT = cn(
  INPUT,
  "w-full appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10 text-base md:text-sm",
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
  "border [&>option]:bg-popover [&>option]:text-popover-foreground",
);

/** aria props that tie an input to its hint and error. */
export function describedBy(id: string, opts: { hint?: ReactNode; error?: string | null }) {
  const ids = [opts.error ? `${id}-error` : null, opts.hint ? `${id}-hint` : null].filter(Boolean);
  return {
    id,
    "aria-invalid": opts.error ? (true as const) : undefined,
    "aria-describedby": ids.length ? ids.join(" ") : undefined,
  };
}

export function FieldLabel({
  htmlFor,
  children,
  optional,
  id,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  optional?: boolean;
  id?: string;
  className?: string;
}) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag
      id={id}
      htmlFor={htmlFor}
      className={cn("flex items-baseline justify-between gap-3 text-sm font-medium", className)}
    >
      <span>{children}</span>
      {optional ? (
        <span className="mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
          Optional
        </span>
      ) : null}
    </Tag>
  );
}

export function FieldError({ id, children }: { id: string; children?: string | null }) {
  if (!children) return null;
  return (
    <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function FieldHint({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Label, control, error and hint, in that order. The control is passed in;
 * spread `describedBy(id, { hint, error })` on it.
 */
export function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
  className,
  labelAside,
}: {
  id: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  labelAside?: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id} optional={optional} className="flex-1">
          {label}
        </FieldLabel>
        {labelAside}
      </div>
      {children}
      <FieldError id={id}>{error}</FieldError>
      <FieldHint id={id}>{hint}</FieldHint>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Password
   --------------------------------------------------------------------------- */

export const MIN_PASSWORD = 10;

/** 0–4: a rough read on how guessable a password is. The server's rule is just length. */
export function passwordScore(pw: string) {
  if (pw.length < MIN_PASSWORD) return pw.length === 0 ? 0 : 1;
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/\d/.test(pw)) variety++;
  if (/[^A-Za-z0-9]/.test(pw)) variety++;
  if (/^(.)\1+$/.test(pw)) return 1;
  if (pw.length >= 16 || variety >= 3) return pw.length >= 14 && variety >= 3 ? 4 : 3;
  return 2;
}

const STRENGTH = [
  { label: "", tone: "bg-white/10" },
  { label: "Too short", tone: "bg-destructive" },
  { label: "OK", tone: "bg-amber-400" },
  { label: "Good", tone: "bg-primary" },
  { label: "Strong", tone: "bg-emerald-400" },
];

type PasswordFieldProps = Omit<ComponentProps<"input">, "type" | "onChange" | "value"> & {
  id: string;
  label?: string;
  value: string;
  onValueChange: (v: string) => void;
  error?: string | null;
  /** Show the length rule and strength meter (new passwords). */
  showStrength?: boolean;
  labelAside?: ReactNode;
};

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { id, label = "Password", value, onValueChange, error, showStrength, labelAside, ...rest },
    ref,
  ) {
    const [shown, setShown] = useState(false);
    const score = passwordScore(value);
    const short = value.length > 0 && value.length < MIN_PASSWORD;
    const hint = showStrength
      ? short
        ? `${MIN_PASSWORD - value.length} more character${MIN_PASSWORD - value.length === 1 ? "" : "s"} to go — at least ${MIN_PASSWORD}.`
        : `At least ${MIN_PASSWORD} characters. A short phrase is easy to remember and hard to guess.`
      : undefined;

    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <FieldLabel htmlFor={id} className="flex-1">
            {label}
          </FieldLabel>
          {labelAside}
        </div>
        <div className="relative">
          <Input
            ref={ref}
            type={shown ? "text" : "password"}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className={cn(INPUT, "pr-12")}
            {...describedBy(id, { hint: error ? undefined : hint, error })}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-controls={id}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {shown ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
        {showStrength ? (
          <div className="mt-2 flex items-center gap-3" aria-hidden>
            <div className="grid flex-1 grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={cn(
                    "h-1 rounded-full transition-colors",
                    score >= n ? STRENGTH[score].tone : "bg-white/10",
                  )}
                />
              ))}
            </div>
            <span className="mono w-16 text-right text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              {STRENGTH[score].label}
            </span>
          </div>
        ) : null}
        <FieldError id={id}>{error}</FieldError>
        {error ? null : <FieldHint id={id}>{hint}</FieldHint>}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
   Messages
   --------------------------------------------------------------------------- */

/**
 * A form-level error. The live region is always mounted, so screen readers
 * announce the message when it appears.
 */
export function FormError({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div aria-live="assertive" aria-atomic="true" className={className}>
      {children ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
  className,
  icon,
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warn";
  className?: string;
  icon?: ReactNode;
}) {
  const tones = {
    info: "border-primary/35 bg-primary/[0.07]",
    success: "border-emerald-400/35 bg-emerald-400/[0.07]",
    warn: "border-amber-400/40 bg-amber-400/[0.07]",
  } as const;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed",
        tones[tone],
        className,
      )}
    >
      {icon ?? (
        <Info
          className={cn(
            "mt-0.5 size-4 shrink-0",
            tone === "success"
              ? "text-emerald-300"
              : tone === "warn"
                ? "text-amber-300"
                : "text-primary",
          )}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Localhost and deploy previews have no email provider, so the server returns
 * the link it would have sent. Shown so the flows can be tested end to end.
 */
export function DevLinkNotice({
  href,
  label = "Open the link",
  className,
}: {
  href: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!href) return null;
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-amber-400/50 bg-amber-400/[0.06] px-3.5 py-3 text-sm",
        className,
      )}
    >
      <div className="mono text-[10px] tracking-[0.18em] text-amber-300 uppercase">
        Dev only · no email sent
      </div>
      <p className="mt-1.5 leading-relaxed text-muted-foreground">
        Email isn't set up on this environment — open the link directly.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-400/10"
        >
          {label}
          <ExternalLink className="size-3" aria-hidden />
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Copy className="size-3" aria-hidden />
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Buttons
   --------------------------------------------------------------------------- */

export function SubmitButton({
  busy,
  children,
  busyLabel,
  className,
  ...rest
}: ComponentProps<"button"> & { busy?: boolean; busyLabel?: string }) {
  return (
    <button
      type="submit"
      aria-disabled={busy || undefined}
      className={cn(
        "btn-pill btn-ember mono inline-flex h-12 w-full items-center justify-center gap-2 px-6 text-xs font-medium tracking-[0.18em] uppercase disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {busy ? (busyLabel ?? children) : children}
    </button>
  );
}

export function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 2.85a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

/** A full-page link to the Discord OAuth route (it's a server redirect, not a SPA route). */
export function DiscordButton({
  href,
  children = "Continue with Discord",
  className,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#5865F2] px-6 text-sm font-medium text-white transition-[filter,transform] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-safe:hover:-translate-y-px",
        className,
      )}
    >
      <DiscordMark className="size-5" />
      {children}
    </a>
  );
}

export function OrDivider({ children = "or" }: { children?: ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Stable ids for a form's fields. */
export function useFieldIds<const K extends string>(...names: K[]): Record<K, string> {
  const base = useId();
  return Object.fromEntries(names.map((n) => [n, `${base}-${n}`])) as Record<K, string>;
}

export const LINK =
  "text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
