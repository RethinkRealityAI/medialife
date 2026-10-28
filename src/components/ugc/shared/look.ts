/**
 * The UGC Hub's visual vocabulary, shared by the creator app and the admin
 * pages: EVADE gold for the one main action on a screen, Cola Run teal for
 * focus and "you are here", and the MEDIALIFE cyan → magenta gradient for
 * progress. Same family as the EVADE creator landing page
 * (public/evade/creators/assets/css/page.css).
 *
 * Plain class strings, so any element (a <button>, an <a>, a router Link) can
 * wear them.
 */
import { cn } from "@/lib/utils";

export const UGC_COLORS = {
  gold: "#f6c344",
  gold2: "#ffdf7a",
  teal: "#3fe6e0",
  teal2: "#1fb8c4",
  cyan: "#19affe",
  magenta: "#ff37ae",
  bg: "#05080a",
  ink: "#071014",
} as const;

/** The EVADE art the hub uses (all real product art; nothing generated). */
export const UGC_ART = {
  bobo: "/evade/creators/assets/img/bobo-cat.webp",
  can: "/evade/creators/assets/img/eclipse-can.webp",
  splash: "/evade/creators/assets/img/cola-run-splash-sm.webp",
  splashLg: "/evade/creators/assets/img/cola-run-splash.webp",
  evadeLogo: "/brand/evade-logo.webp",
  mark: "/card/mark.svg",
} as const;

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3fe6e0]";

/** The gold pill: one per screen, for the thing to do next. 48px tall. */
export const btnGold = cn(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold whitespace-nowrap text-[#1a1203]",
  "bg-[linear-gradient(180deg,#ffe48a_0%,#f6c344_45%,#e0a21a_100%)]",
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-2px_0_rgb(120_70_0/0.35),0_10px_30px_-10px_rgb(246_195_68/0.65)]",
  "transition-[filter,transform,box-shadow] duration-200 hover:brightness-[1.06] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
  "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  focus,
);

/** A quiet glassy pill for secondary actions. 44px tall. */
export const btnGhost = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.04] px-4 text-sm font-medium whitespace-nowrap text-foreground",
  "transition-colors hover:border-white/[0.28] hover:bg-white/[0.07] active:scale-[0.98] motion-reduce:active:scale-100",
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  focus,
);

/** Teal outline pill: a positive secondary action ("Track package"). */
export const btnTeal = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#3fe6e0]/40 bg-[#3fe6e0]/[0.08] px-4 text-sm font-medium whitespace-nowrap text-[#bff7f4]",
  "transition-colors hover:border-[#3fe6e0]/70 hover:bg-[#3fe6e0]/[0.14] active:scale-[0.98] motion-reduce:active:scale-100",
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  focus,
);

/** A destructive text button. */
export const btnDanger = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-red-300",
  "transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  focus,
);

/** A 44px round icon button. Give it an aria-label. */
export const btnIcon = cn(
  "inline-grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.12] bg-white/[0.04] text-foreground",
  "transition-colors hover:border-white/[0.26] hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px]",
  focus,
);

/** Small monospace label above a heading. */
export const eyebrow =
  "font-mono text-[10.5px] font-medium tracking-[0.2em] text-[#3fe6e0] uppercase";

/** The raised card every panel sits on. */
export const card =
  "rounded-[22px] border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.055),rgb(255_255_255/0.015))] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_24px_48px_-30px_rgb(0_0_0/0.95)]";

/** Text inputs: tall for thumbs, quiet fill, teal focus, clear invalid state. */
export const field = cn(
  "block h-12 w-full min-w-0 rounded-xl border border-white/[0.12] bg-white/[0.035] px-3.5 text-base text-foreground placeholder:text-muted-foreground/70 sm:text-[15px]",
  "transition-[border-color,box-shadow] focus-visible:border-[#3fe6e0]/70 focus-visible:ring-2 focus-visible:ring-[#3fe6e0]/25 focus-visible:outline-none",
  "aria-[invalid=true]:border-red-400/70 disabled:opacity-60",
);

export const textarea = cn(field, "h-auto min-h-24 py-3 leading-relaxed");

export const select = cn(
  field,
  "appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat pr-10",
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
  "[&>option]:bg-[#0b1318] [&>option]:text-foreground",
);

/** The MEDIALIFE gradient, for progress fills. */
export const gradientFill = "bg-[linear-gradient(90deg,#19affe,#ff37ae)]";
