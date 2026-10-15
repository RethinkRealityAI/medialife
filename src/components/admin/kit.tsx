import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { createLink, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, FlaskConical, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { copyText } from "./format";

// The pieces every /admin screen shares, so Creators, Partners, Analytics and
// Client links read as one tool: raised surfaces with depth and a tinted edge,
// colour-coded icon tiles, a banner page header, sticky glass tabs and calm
// empty states. Same language as the Partner Hub (src/components/partner/ui.tsx)
// in MEDIALIFE's colours (--partner / --partner-2 / --partner-ink, :root).

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

/** A raised card: soft gradient fill, a bright top edge and a drop shadow. */
export const surface =
  "rounded-2xl border border-white/[0.08] bg-card bg-[linear-gradient(180deg,rgb(255_255_255/0.055),rgb(255_255_255/0.012))] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_18px_36px_-22px_rgb(0_0_0/0.95)]";
/** Tints a surface's edge with the accent colour. */
export const accentEdge =
  "border-[color-mix(in_oklab,var(--partner)_30%,transparent)] shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--partner)_28%,transparent),0_22px_44px_-26px_color-mix(in_oklab,var(--partner-2)_65%,black)]";
/** Hover and focus for anything clickable built on `surface`. */
export const lift =
  "transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--partner)_50%,transparent)] hover:shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--partner)_32%,transparent),0_26px_48px_-26px_color-mix(in_oklab,var(--partner-2)_80%,black)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0";
/** A quiet inset well inside a surface: rows, read-only values, code. */
export const well = "rounded-xl border border-white/[0.06] bg-black/25";

/* ── Tones ────────────────────────────────────────────────────────────────── */

const TONES = {
  sky: {
    tile: "from-sky-400/30 to-sky-400/[0.04] text-sky-200 ring-sky-400/30",
    text: "text-sky-300",
    bar: "bg-sky-400",
    track: "bg-sky-400/15",
    edge: "border-sky-400/35",
  },
  violet: {
    tile: "from-violet-400/30 to-violet-400/[0.04] text-violet-200 ring-violet-400/30",
    text: "text-violet-300",
    bar: "bg-violet-400",
    track: "bg-violet-400/15",
    edge: "border-violet-400/35",
  },
  mint: {
    tile: "from-emerald-400/25 to-emerald-400/[0.04] text-emerald-200 ring-emerald-400/25",
    text: "text-emerald-300",
    bar: "bg-emerald-400",
    track: "bg-emerald-400/15",
    edge: "border-emerald-400/35",
  },
  amber: {
    tile: "from-amber-400/25 to-amber-400/[0.04] text-amber-200 ring-amber-400/25",
    text: "text-amber-300",
    bar: "bg-amber-400",
    track: "bg-amber-400/15",
    edge: "border-amber-400/40",
  },
  rose: {
    tile: "from-fuchsia-400/30 to-fuchsia-400/[0.04] text-fuchsia-200 ring-fuchsia-400/30",
    text: "text-fuchsia-300",
    bar: "bg-fuchsia-400",
    track: "bg-fuchsia-400/15",
    edge: "border-fuchsia-400/35",
  },
  slate: {
    tile: "from-white/15 to-white/[0.03] text-white/80 ring-white/15",
    text: "text-white/80",
    bar: "bg-white/70",
    track: "bg-white/10",
    edge: "border-white/20",
  },
} as const;
export type Tone = keyof typeof TONES;
export const toneText = (t: Tone) => TONES[t].text;
export const toneEdge = (t: Tone) => TONES[t].edge;

/** A gradient tile with an icon, colour-coded by tone. */
export function IconTile({
  icon: Icon,
  tone = "sky",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br ring-1 ring-inset",
        size === "xs"
          ? "size-6 rounded-md"
          : size === "sm"
            ? "size-8 rounded-lg"
            : size === "lg"
              ? "size-12 rounded-2xl"
              : "size-10 rounded-xl",
        TONES[tone].tile,
        className,
      )}
    >
      <Icon
        className={
          size === "xs"
            ? "size-3.5"
            : size === "sm"
              ? "size-4"
              : size === "lg"
                ? "size-6"
                : "size-5"
        }
      />
    </span>
  );
}

/** A small coloured tag. */
export function Tag({
  children,
  tone = "slate",
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full bg-gradient-to-br px-2.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3",
        TONES[tone].tile,
        className,
      )}
    >
      {children}
    </span>
  );
}

const AVATAR = [
  "from-sky-500 to-indigo-600",
  "from-fuchsia-500 to-violet-600",
  "from-emerald-500 to-teal-700",
  "from-amber-500 to-orange-700",
  "from-violet-500 to-indigo-700",
  "from-rose-500 to-fuchsia-700",
  "from-cyan-500 to-blue-700",
] as const;

/** Initials on a colour picked from the name, so people are easy to tell apart. */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const clean = name.trim() || "?";
  const words = clean
    .replace(/[@(].*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = ((words[0]?.[0] ?? clean[0]) + (words[1]?.[0] ?? "")).toUpperCase();
  let h = 0;
  for (const ch of clean) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_6px_14px_-6px_rgb(0_0_0/0.8)] ring-1 ring-white/15 [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]",
        size === "sm"
          ? "size-7 rounded-lg text-[11px]"
          : size === "lg"
            ? "size-14 rounded-2xl text-lg"
            : "size-9 rounded-xl text-xs",
        AVATAR[h % AVATAR.length],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* ── Page structure ───────────────────────────────────────────────────────── */

/** The link back to a parent page, above a page title. */
const BackAnchor = forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  function BackAnchor({ children, className, ...props }, ref) {
    return (
      <a
        ref={ref}
        {...props}
        className={cn(
          "inline-flex items-center gap-1 rounded-md text-xs font-medium text-white/60 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
          className,
        )}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {children}
      </a>
    );
  },
);
export const BackLink = createLink(BackAnchor);

/**
 * The banner at the top of each admin page: an icon, the title, one line of
 * description and the page's main actions. `image` fades a picture in on the
 * right for pages that benefit from it.
 */
export function PageHeader({
  title,
  badge,
  actions,
  children,
  eyebrow,
  icon,
  tone = "sky",
  description,
  back,
  image,
  imageClassName,
  className,
}: {
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  description?: ReactNode;
  /** A <BackLink> to the parent page. */
  back?: ReactNode;
  image?: string;
  /** Where to crop the image, e.g. "object-[50%_30%]". */
  imageClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8", className)}>
      <header
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border bg-[var(--partner-ink)]",
          accentEdge,
        )}
      >
        {image ? (
          <>
            <img
              src={image}
              alt=""
              className={cn(
                "absolute inset-y-0 right-0 -z-10 h-full w-full object-cover opacity-70 sm:w-3/5",
                imageClassName,
              )}
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(9_10_24/0.98)_0%,rgb(9_10_24/0.9)_40%,rgb(9_10_24/0.35)_100%)]"
            />
          </>
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(70%_120%_at_100%_0%,color-mix(in_oklab,var(--partner-2)_30%,transparent),transparent_70%),radial-gradient(50%_90%_at_0%_100%,color-mix(in_oklab,var(--partner)_14%,transparent),transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent opacity-70"
        />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
          <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
            {icon ? (
              <IconTile
                icon={icon}
                tone={tone}
                size="lg"
                className="hidden shadow-[0_10px_24px_-12px_rgb(0_0_0/0.9)] sm:grid"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              {back ? <div className="mb-1.5">{back}</div> : null}
              {eyebrow ? (
                <div className="mb-1 text-[11px] font-semibold tracking-[0.16em] text-[var(--partner)] uppercase">
                  {eyebrow}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
                  {title}
                </h1>
                {badge}
              </div>
              {description ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/65">
                  {description}
                </p>
              ) : null}
              {children}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
    </div>
  );
}

/** The padded column under a PageHeader. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-5 px-4 py-5 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Panel({
  children,
  className,
  accent,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("min-w-0", surface, accent && accentEdge, className)} {...props}>
      {children}
    </div>
  );
}

export function PanelTitle({
  title,
  sub,
  actions,
  className,
  id,
  icon,
  tone = "sky",
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null}
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {sub ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{sub}</p>
          ) : null}
        </div>
      </div>
      {actions}
    </div>
  );
}

/** A heading for a group of cards outside a panel. */
export function SectionTitle({
  children,
  actions,
  className,
  id,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-2", className)}>
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {children}
      </h2>
      {actions}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Nothing to show yet: an icon, a line on what goes here, and what to do. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  tone = "sky",
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.015] px-6 py-10 text-center",
        className,
      )}
    >
      <IconTile icon={icon} tone={tone} size="lg" />
      <h3 className="mt-3 text-base font-semibold tracking-tight">{title}</h3>
      {children ? (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */

export type AdminTabDef<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** A count or a dot after the label. */
  badge?: ReactNode;
};

/** The count after a tab label. `alert` colours it so it reads as "needs you". */
export function TabCount({ n, alert }: { n: number; alert?: "sky" | "amber" }) {
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
        alert === "amber"
          ? "bg-amber-400/20 text-amber-200"
          : alert === "sky"
            ? "bg-sky-400/20 text-sky-200"
            : "bg-white/[0.08] text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}

/**
 * Tabs that swap a page's sections in place. The bar is frosted glass and sticks
 * under the header, so another section is always one tap away; switching brings
 * the top of the content back into view. Keep the value in the URL.
 */
export function AdminTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
  className,
  sticky = true,
}: {
  tabs: AdminTabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  const top = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // On phones the bar scrolls sideways: keep the current tab in view.
  useEffect(() => {
    const bar = list.current;
    const el = bar?.querySelector<HTMLElement>('[data-state="active"]');
    if (!bar || !el) return;
    const left = el.offsetLeft - (bar.clientWidth - el.clientWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left) });
  }, [value]);
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        onChange(v as T);
        const el = top.current;
        if (el && el.getBoundingClientRect().top < 0) {
          el.scrollIntoView({ block: "start" });
        }
      }}
      className={className}
    >
      <div ref={top} className="scroll-mt-[4.5rem]" />
      <div className={cn(sticky && "sticky top-[4.25rem] z-20")}>
        <TabsList
          ref={list}
          aria-label={label}
          className="glass-strong flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-10 shrink-0 gap-2 rounded-xl px-3.5 text-sm text-white/65 hover:text-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--partner)] focus-visible:outline-solid data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:glass-pill [&[data-state=active]>svg]:text-[var(--partner)]"
            >
              {t.icon ? <t.icon className="size-4" aria-hidden /> : null}
              {t.label}
              {t.badge ?? null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}

export function AdminTab({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContent
      value={value}
      className={cn(
        "mt-4 animate-in duration-300 fade-in-0 focus-visible:ring-offset-0 motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </TabsContent>
  );
}

/* ── Small parts ──────────────────────────────────────────────────────────── */

/** Deploy previews and local dev keep their own data, apart from medialife.ai. */
export function NamespaceBadge({ ns }: { ns: "prod" | "preview" | "dev" | undefined }) {
  if (!ns || ns === "prod") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex h-6 items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 text-[11px] font-medium whitespace-nowrap text-amber-200 ring-1 ring-amber-400/35 outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FlaskConical className="size-3" aria-hidden />
          Preview data
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 border border-border bg-popover text-popover-foreground">
        {ns === "dev"
          ? "Local dev: data is stored on this machine, not on medialife.ai."
          : "Deploy preview: visits and links here are separate from medialife.ai."}
      </TooltipContent>
    </Tooltip>
  );
}

/** An icon button that copies `text` and confirms with a check and a toast. */
export function CopyButton({
  text,
  label = "Copy",
  toastText = "Copied",
  className,
  showLabel = false,
  size = "icon",
}: {
  text: string;
  label?: string;
  toastText?: string;
  className?: string;
  showLabel?: boolean;
  size?: "icon" | "sm";
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (await copyText(text)) {
      setDone(true);
      toast.success(toastText);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
    } else toast.error("Couldn't copy. Select the text and copy it instead.");
  }
  const Icon = done ? Check : Copy;
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "icon" && !showLabel ? "icon" : "sm"}
      onClick={onClick}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
      className={cn(
        "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        size === "icon" && !showLabel && "size-8",
        className,
      )}
    >
      <Icon className={cn(done && "text-emerald-400")} aria-hidden />
      {showLabel ? <span>{done ? "Copied" : label}</span> : null}
    </Button>
  );
}

/**
 * A labelled figure. `icon`/`tone` add a colour-coded tile; `meter` (0–1) draws
 * a thin share bar under the value; `onClick` makes the whole tile a button
 * (e.g. to filter a list), with `active` marking the current choice.
 */
export function StatTile({
  label,
  value,
  hint,
  meter,
  loading,
  icon,
  tone = "sky",
  onClick,
  active,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  meter?: number | null;
  loading?: boolean;
  icon?: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="pt-0.5 text-xs leading-snug font-medium text-muted-foreground">
          {label}
        </span>
        {icon ? <IconTile icon={icon} tone={tone} size="sm" className="-mt-0.5 -mr-0.5" /> : null}
      </span>
      {loading ? (
        <span className="mt-2 block h-8 w-20 animate-pulse rounded-md bg-white/[0.06]" />
      ) : (
        <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums md:text-[1.75rem]">
          {value}
        </span>
      )}
      {meter != null && !loading ? (
        <span
          className={cn(
            "mt-2.5 block h-1.5 w-full overflow-hidden rounded-full",
            TONES[tone].track,
          )}
          aria-hidden
        >
          <span
            className={cn("block h-full rounded-full", TONES[tone].bar)}
            style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
          />
        </span>
      ) : null}
      {hint ? (
        <span className="mt-auto hidden pt-2 text-xs leading-relaxed text-muted-foreground sm:block">
          {loading ? " " : hint}
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    surface,
    "flex min-w-0 flex-col p-4 text-left",
    active && accentEdge,
    active &&
      "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_12%,transparent),rgb(255_255_255/0.01))]",
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={cn(cls, lift)}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function SignInAgain() {
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-base font-medium">Your session has ended</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sign in again to keep going.</p>
      <Button asChild className="mt-4">
        <Link
          to="/admin/login"
          search={{
            next: typeof location !== "undefined" ? location.pathname + location.search : undefined,
          }}
        >
          Sign in
        </Link>
      </Button>
    </Panel>
  );
}
