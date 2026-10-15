/**
 * The Partner Hub frame. Same bones as the Creator Hub (a sidebar on desktop,
 * a thumb-reach tab bar on phones) with the partner's accent colour, so it
 * reads as their space.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  FolderOpen,
  House,
  Link2,
  LifeBuoy,
  LogOut,
  Menu,
  Sparkles,
  Store,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GlassTabBar } from "@/components/glass/tab-bar";
import { HubLink } from "@/components/hub/app/app-shell";
import { Monogram } from "@/components/hub/app/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/hub/auth.functions";
import { kitLogo } from "@/lib/hub/collateral";
import { HUB } from "@/lib/hub/model";
import { PARTNER_BASE } from "@/lib/hub/partners";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };

export const PARTNER_NAV: NavItem[] = [
  { to: PARTNER_BASE, label: "Home", icon: House, exact: true },
  { to: `${PARTNER_BASE}/creators`, label: "Creators", icon: UsersRound },
  { to: `${PARTNER_BASE}/collateral`, label: "Collateral", icon: FolderOpen },
  { to: `${PARTNER_BASE}/playbook`, label: "Playbook", icon: BookOpen },
  { to: `${PARTNER_BASE}/shelves`, label: "Merch shelves", icon: Store },
  { to: `${PARTNER_BASE}/links`, label: "Links & demos", icon: Link2 },
  { to: `${PARTNER_BASE}/team`, label: "Team", icon: Users },
];
/** Phones: four tabs and More. The shelf builder is the star, so it stands out. */
const TAB_PATHS = [
  PARTNER_BASE,
  `${PARTNER_BASE}/creators`,
  `${PARTNER_BASE}/shelves`,
  `${PARTNER_BASE}/collateral`,
];
const TABS = TAB_PATHS.map((to) => PARTNER_NAV.find((n) => n.to === to)!);
const MORE = PARTNER_NAV.filter((n) => !TAB_PATHS.includes(n.to));
const SHORT: Record<string, string> = { "Merch shelves": "Shelves" };

function useCurrent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/$/, "");
  return (
    [...PARTNER_NAV]
      .reverse()
      .find((n) =>
        n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
      ) ?? null
  );
}

async function doSignOut() {
  try {
    await signOut();
  } catch {
    toast.error("Couldn't sign out. Check your connection and try again.");
    return;
  }
  window.location.assign("/creator-hub/sign-in?next=%2Fpartner-hub");
}

/**
 * The partner's colours as CSS variables. Buttons, focus rings and accents take
 * the partner's colour, so the hub feels like theirs.
 */
function brandVars(b: ShellPartner["brand"]): Record<string, string> {
  return {
    "--partner": b.accent,
    "--partner-2": b.primary,
    "--partner-ink": b.ink,
    "--primary": b.accent,
    "--primary-foreground": b.ink,
    "--ring": b.accent,
  };
}

/** Dialogs and menus render outside the shell, so the colours go on <html> too. */
function useRootBrand(b: ShellPartner["brand"]) {
  useEffect(() => {
    const root = document.documentElement;
    const vars = brandVars(b);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [b]);
}

export type ShellPartner = {
  name: string;
  kit: string;
  brand: { primary: string; accent: string; ink: string };
};

export function PartnerShell({
  partner,
  me,
  hasCreatorProfile,
  children,
}: {
  partner: ShellPartner;
  me: { name: string; email: string; role: string };
  hasCreatorProfile: boolean;
  children: ReactNode;
}) {
  const current = useCurrent();
  const [moreOpen, setMoreOpen] = useState(false);
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  const name = me.name || me.email;
  useRootBrand(partner.brand);

  return (
    <SidebarProvider style={brandVars(partner.brand) as React.CSSProperties}>
      <a
        href="#partner-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-[var(--partner)] transition-[opacity,transform] duration-500",
          loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
        )}
      />

      <Sidebar collapsible="icon" className="border-r border-border" aria-label="Partner Hub">
        <SidebarHeader className="border-b border-border">
          <Link
            to="/partner-hub"
            className="flex items-center gap-2.5 rounded-md px-2 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <PartnerMark kit={partner.kit} />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-semibold tracking-tight">
                {partner.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                MEDIALIFE Partner Hub
              </span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu className="gap-1">
                  {PARTNER_NAV.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={current?.to === item.to}
                        tooltip={item.label}
                        className="h-10 rounded-lg data-[active=true]:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--partner)_22%,transparent),transparent)] data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-[inset_2px_0_0_0_var(--partner)] [&[data-active=true]>svg]:text-[var(--partner)]"
                      >
                        <HubLink
                          to={item.to}
                          aria-current={current?.to === item.to ? "page" : undefined}
                        >
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                        </HubLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
            <a
              href={`mailto:${HUB.supportEmail}`}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <LifeBuoy className="size-4" aria-hidden />
              Help: {HUB.supportEmail}
            </a>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-border">
          <div className="flex items-center gap-2.5 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Monogram name={name} />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground capitalize">
                {me.role}
              </span>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="@container/inset min-w-0">
        <header className="glass-strong sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 rounded-none border-x-0 border-t-0 px-4 sm:gap-3">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Link to="/partner-hub" className="-ml-1 md:hidden" aria-label="Partner Hub home">
            <PartnerMark kit={partner.kit} />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {current?.label ?? "Partner Hub"}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full p-0.5 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="Account menu"
              >
                <Monogram name={name} />
                <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-medium">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/partner-hub/team">
                  <Users className="size-4" aria-hidden /> Team and account
                </Link>
              </DropdownMenuItem>
              {hasCreatorProfile ? (
                <DropdownMenuItem asChild>
                  <a href="/creator-hub/dashboard">
                    <Sparkles className="size-4" aria-hidden /> Your Creator Hub
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <a href={`mailto:${HUB.supportEmail}`}>
                  <LifeBuoy className="size-4" aria-hidden /> Get help
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={doSignOut}>
                <LogOut className="size-4" aria-hidden /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main id="partner-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </SidebarInset>

      <GlassTabBar
        tabs={[
          ...TABS.map((item) => ({
            key: item.to,
            label: SHORT[item.label] ?? item.label,
            icon: item.icon,
            to: item.to,
            active: current?.to === item.to,
            highlight: item.to === `${PARTNER_BASE}/shelves`,
          })),
          {
            key: "more",
            label: "More",
            icon: Menu,
            onClick: () => setMoreOpen(true),
            expanded: moreOpen,
            active: !!current && MORE.includes(current),
          },
        ]}
        renderLink={({ to, className, children, ...rest }) => (
          <HubLink to={to} className={className} aria-current={rest["aria-current"]}>
            {children}
          </HubLink>
        )}
      />

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="glass-strong rounded-t-[28px] px-4 pt-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-3">
              <Monogram name={name} />
              <span className="min-w-0">
                <span className="block truncate text-base">{name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {partner.name}
                </span>
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">More pages and your account</SheetDescription>
          </SheetHeader>
          <ul className="mt-4 grid grid-cols-1 gap-1">
            {MORE.map((item) => (
              <li key={item.to}>
                <HubLink
                  to={item.to}
                  onNavigate={() => setMoreOpen(false)}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    current?.to === item.to && "bg-white/5 text-[var(--partner)]",
                  )}
                >
                  <item.icon className="size-5 text-muted-foreground" aria-hidden />
                  {item.label}
                </HubLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={doSignOut}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LogOut className="size-5 text-muted-foreground" aria-hidden /> Sign out
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

/** The partner's logo mark, or a mark in their colours when there's no logo. */
export function PartnerMark({ kit, className }: { kit: string; className?: string }) {
  const logo = kitLogo(kit);
  if (logo) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--partner-ink)] ring-1 ring-[var(--partner)]/35",
          className,
        )}
      >
        <img src={logo.mark} alt="" className="size-6 object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid size-9 shrink-0 place-items-center rounded-xl", className)}
      style={{ background: "linear-gradient(135deg, var(--partner), var(--partner-2))" }}
    >
      <span className="size-3 rounded-full bg-background/85" />
    </span>
  );
}
