/**
 * The Partner Hub's own surfaces. Same building blocks as the Creator Hub, with
 * more depth and the partner's colours: raised cards with a soft shadow and a
 * tinted edge, icon tiles, a compact image banner for each page, and tabs that
 * swap content in place (kept in the URL, so a tab can be linked and Back works).
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** A raised card. `accent` tints the edge with the partner colour. */
export const surface =
  "rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.06),rgb(255_255_255/0.015))] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_20px_40px_-24px_rgb(0_0_0/0.9)]";
export const accentEdge =
  "border-[color-mix(in_oklab,var(--partner)_32%,transparent)] shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--partner)_30%,transparent),0_24px_48px_-28px_color-mix(in_oklab,var(--partner-2)_70%,black)]";
/** Hover and focus for anything clickable built on `surface`. */
export const lift =
  "transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--partner)_55%,transparent)] hover:shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--partner)_35%,transparent),0_28px_50px_-26px_color-mix(in_oklab,var(--partner-2)_85%,black)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0";

export function Surface({
  children,
  className,
  accent,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  as?: "div" | "li" | "section" | "article";
}) {
  return <As className={cn(surface, accent && accentEdge, className)}>{children}</As>;
}

/** Icon colours, from the Snowday × MEDIALIFE palette. */
const TILE = {
  ice: "from-[#96c8ec]/30 to-[#96c8ec]/5 text-[#b9dcf4] ring-[#96c8ec]/30",
  blue: "from-[#6f86d6]/35 to-[#6f86d6]/5 text-[#aebcf0] ring-[#6f86d6]/30",
  violet: "from-[#a78bfa]/30 to-[#a78bfa]/5 text-[#c9b8fd] ring-[#a78bfa]/30",
  mint: "from-[#5eead4]/25 to-[#5eead4]/5 text-[#99f0e1] ring-[#5eead4]/25",
  amber: "from-[#fbbf24]/25 to-[#fbbf24]/5 text-[#fcd679] ring-[#fbbf24]/25",
} as const;
export type TileTone = keyof typeof TILE;
export const TILE_TONES = Object.keys(TILE) as TileTone[];

export function IconTile({
  icon: Icon,
  tone = "ice",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: TileTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-inset",
        size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10",
        TILE[tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

/** A small coloured tag. */
export function Tag({
  children,
  tone = "ice",
  className,
}: {
  children: ReactNode;
  tone?: TileTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full bg-gradient-to-br px-2.5 text-[11px] font-medium ring-1 ring-inset",
        TILE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The banner at the top of each page: an image from the kit behind the title. */
export function PartnerBanner({
  image,
  imageClassName = "object-right",
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  image: string;
  /** Where to crop the image, e.g. "object-[50%_40%]". */
  imageClassName?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative isolate overflow-hidden rounded-3xl border",
        accentEdge,
        "bg-[var(--partner-ink,#0b0e1f)]",
        className,
      )}
    >
      <img
        src={image}
        alt=""
        className={cn("absolute inset-0 -z-10 size-full object-cover opacity-80", imageClassName)}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(8_10_24/0.97)_0%,rgb(8_10_24/0.88)_45%,rgb(8_10_24/0.25)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent opacity-70"
      />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 sm:p-7">
        <div className="max-w-xl min-w-0">
          {eyebrow ? (
            <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/70 sm:line-clamp-none sm:text-[15px]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export type TabDef<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  /** A count or a "new" dot after the label. */
  badge?: ReactNode;
};

/**
 * Tabs that swap content in place. The bar sticks under the header, so another
 * tab is always one tap away; switching brings the top of the content back
 * into view rather than leaving the reader halfway down the last one.
 */
export function PartnerTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
  className,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const top = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // On phones the bar scrolls sideways: keep the current tab in view.
  useEffect(() => {
    const bar = list.current;
    const el = bar?.querySelector<HTMLElement>('[data-state="active"]');
    if (!bar || !el) return;
    const left = el.offsetLeft - (bar.clientWidth - el.clientWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [value]);
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        onChange(v as T);
        const el = top.current;
        if (el && el.getBoundingClientRect().top < 0) {
          el.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }}
      className={cn("mt-5", className)}
    >
      <div ref={top} className="scroll-mt-14" />
      <div className="sticky top-16 z-20 py-2">
        <TabsList
          ref={list}
          aria-label={label}
          className="glass flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-[22px] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-10 shrink-0 gap-2 rounded-xl px-3.5 text-sm text-muted-foreground hover:text-foreground max-sm:gap-1.5 max-sm:px-2.5 max-sm:text-[13px] data-[state=active]:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_26%,transparent),color-mix(in_oklab,var(--partner-2)_22%,transparent))] data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--partner)_45%,transparent)] focus-visible:ring-offset-0"
            >
              <t.icon className="size-4" aria-hidden />
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

export function PartnerTab({
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

/** A one-line intro at the top of a tab. */
export function TabIntro({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
