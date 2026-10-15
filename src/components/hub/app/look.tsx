/**
 * The Creator Hub's visual layer, on the same primitives as the Partner Hub
 * (src/components/partner/ui.tsx): raised surfaces, gradient icon tiles, image
 * banners and in-place tabs. This file adds the pieces only the Creator Hub
 * needs: a MEDIALIFE pink tone, image quick-action cards, a round "go" chip and
 * a heading row for panels.
 *
 * Accent colours come from --partner / --partner-2 (MEDIALIFE defaults in
 * src/styles.css), so these pieces read as one system with the Partner Hub.
 */
import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { IconTile, lift, surface, type TileTone } from "@/components/partner/ui";
import { cn } from "@/lib/utils";

import { HubLink } from "./hub-link";

export {
  IconTile,
  PartnerBanner as Banner,
  PartnerTab as HubTab,
  PartnerTabs as HubTabs,
  Surface,
  TabIntro,
  Tag,
  accentEdge,
  lift,
  surface,
  type TabDef,
  type TileTone,
} from "@/components/partner/ui";

/** The partner tones plus MEDIALIFE's own magenta. */
export type Tone = TileTone | "pink";

const PINK = "from-[#f472b6]/30 to-[#f472b6]/5 text-[#f9a8d4] ring-[#f472b6]/30";

/** An icon tile in any tone, including MEDIALIFE pink. */
export function Tile({
  icon,
  tone = "ice",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return tone === "pink" ? (
    <IconTile icon={icon} tone="violet" size={size} className={cn(PINK, className)} />
  ) : (
    <IconTile icon={icon} tone={tone} size={size} className={className} />
  );
}

/** The round arrow on a clickable card: fills with the accent on hover. */
export function GoChip({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-[var(--partner)]/15 text-[var(--partner)] transition-colors group-hover:bg-[var(--partner)] group-hover:text-[var(--partner-ink)] motion-reduce:transition-none",
        className,
      )}
    >
      <ArrowRight className="size-4" />
    </span>
  );
}

/** A panel's heading row: icon tile, title, optional sub-line and one action. */
export function PanelTitle({
  id,
  icon,
  tone = "ice",
  title,
  sub,
  action,
  className,
}: {
  id?: string;
  icon?: LucideIcon;
  tone?: Tone;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <Tile icon={icon} tone={tone} size="sm" /> : null}
        <div className="min-w-0">
          <h2 id={id} className="truncate text-base font-semibold tracking-tight">
            {title}
          </h2>
          {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/** The small "See all →" link in a panel's corner. */
export const cornerLink =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-[var(--partner)] transition-colors hover:bg-[var(--partner)]/10 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none [&_svg]:size-3.5";

/**
 * An image card that goes somewhere: picture on top (zooms a touch on hover),
 * an icon tile over its corner, a title, one line, and the round arrow.
 */
export function ImageAction({
  href,
  image,
  imageClassName = "object-center",
  icon,
  tone = "ice",
  title,
  body,
  badge,
  className,
}: {
  href: string;
  image: string;
  imageClassName?: string;
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  body: string;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <HubLink
      to={href}
      className={cn(surface, lift, "group flex h-full flex-col overflow-hidden", className)}
    >
      <span className="relative block aspect-[16/10] overflow-hidden bg-[var(--partner-ink)]">
        <img
          src={image}
          alt=""
          loading="lazy"
          className={cn(
            "size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
            imageClassName,
          )}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#0b0d1a]/85 via-[#0b0d1a]/10 to-transparent" />
        <span className="absolute bottom-2.5 left-2.5">
          <Tile icon={icon} tone={tone} size="sm" className="bg-black/50 backdrop-blur" />
        </span>
        {badge ? <span className="absolute top-2.5 right-2.5">{badge}</span> : null}
      </span>
      <span className="flex flex-1 items-end justify-between gap-2 p-3.5">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{body}</span>
        </span>
        <GoChip />
      </span>
    </HubLink>
  );
}

/** A glass "New" badge for cards over imagery. */
export function NewBadge({ children = "New" }: { children?: ReactNode }) {
  return (
    <span className="glass rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
      {children}
    </span>
  );
}

/** Images from the MEDIALIFE library the hub pages use as banners and cards. */
export const ART = {
  drop: "/medialife/activated-retail/assets/ml_phone_hero.webp",
  figure: "/medialife/activated-retail/assets/ml_reward_figure.webp",
  hoodie: "/medialife/activated-retail/assets/ml_reward_hoodie.webp",
  keychain: "/medialife/activated-retail/assets/ml_reward_keychain.webp",
  sticker: "/medialife/activated-retail/assets/ml_reward_sticker.webp",
  tee: "/medialife/activated-retail/assets/ml_reward_tee.webp",
  sunset: "/medialife/activated-retail/assets/ml_reward_mat.webp",
  mat: "/medialife/activated-retail/assets/ml_mat.webp",
  box: "/medialife/activated-retail/assets/ml_box_front.webp",
  stickerCard: "/medialife/activated-retail/assets/ml_sticker_card.webp",
  cutout: "/merch/keychain-cutout.webp",
  keychainHand: "/merch/keychain-hand.webp",
  fans: "/partner-kit/medialife/videos/fans-merch-apparel.webp",
  creator: "/partner-kit/medialife/videos/creator-fikshun.webp",
  stream: "/partner-kit/medialife/videos/creator-anime-community.webp",
} as const;

/** A glass segmented control (ToggleGroup): the group, and each item. */
export const segGroup = "glass gap-1 rounded-full p-1";
export const segItem =
  "h-9 gap-1.5 rounded-full px-3.5 text-sm text-white/75 hover:bg-white/[0.06] hover:text-white data-[state=on]:bg-transparent data-[state=on]:text-[var(--partner)] data-[state=on]:glass-pill";
