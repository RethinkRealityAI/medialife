/**
 * The phone tab bar every hub shares: a floating "liquid glass" pill that sits
 * a little above the bottom edge (clear of the home indicator), with the
 * current tab raised inside it. Hidden from md up, where the sidebar takes over.
 *
 * Accent colours come from --partner / --partner-2 (see src/styles.css), so the
 * Partner Hub shows the partner's colours and everything else shows MEDIALIFE's.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type GlassTab = {
  key: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  /** A tab that stands out even when not selected (e.g. a primary action). */
  highlight?: boolean;
  /** A link (rendered with `renderLink`) or a button. */
  to?: string;
  onClick?: () => void;
  /** For a button that opens a menu or sheet. */
  expanded?: boolean;
};

export type GlassLinkRenderer = (props: {
  to: string;
  className: string;
  "aria-current"?: "page";
  children: ReactNode;
}) => ReactNode;

/** Bottom padding pages need so their last content clears the bar. */
export const GLASS_TAB_BAR_CLEARANCE = "calc(env(safe-area-inset-bottom) + 6.5rem)";

export function GlassTabBar({
  tabs,
  label = "Main",
  renderLink,
  className,
}: {
  tabs: GlassTab[];
  label?: string;
  renderLink: GlassLinkRenderer;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("fixed inset-x-3 z-40 md:hidden", className)}
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
    >
      <ul className="glass-strong mx-auto flex max-w-lg items-stretch gap-1 rounded-[28px] p-1.5">
        {tabs.map((t) => {
          const cls = cn(
            "relative flex h-14 w-full flex-col items-center justify-center gap-1 rounded-[22px] px-1 text-[11px] font-medium transition-[color,background,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--partner)] motion-reduce:transition-none",
            t.active
              ? "glass-pill text-[var(--partner)]"
              : t.highlight
                ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_32%,transparent),color-mix(in_oklab,var(--partner-2)_26%,transparent))] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
                : "text-white/70 hover:text-white",
          );
          const body = (
            <>
              <t.icon className="size-[22px]" aria-hidden />
              <span className="max-w-full truncate">{t.label}</span>
            </>
          );
          return (
            <li key={t.key} className="min-w-0 flex-1">
              {t.to ? (
                renderLink({
                  to: t.to,
                  className: cls,
                  "aria-current": t.active ? "page" : undefined,
                  children: body,
                })
              ) : (
                <button
                  type="button"
                  onClick={t.onClick}
                  aria-haspopup={t.expanded !== undefined ? "dialog" : undefined}
                  aria-expanded={t.expanded}
                  className={cls}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
