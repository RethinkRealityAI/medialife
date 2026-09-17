import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ACTIVE, PROGRAM } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal")({
  head: () => ({
    meta: [
      { title: "Creator Portal — Activated Merchandise Program | MEDIALIFE × Roblox" },
      {
        name: "description",
        content:
          "The partner portal for the MEDIALIFE × Roblox Activated Merchandise Program: apply, track a property through the pipeline, and read its commercial and engagement performance.",
      },
      // Unlisted, like the program page it sits beside. netlify.toml carries the
      // same rule for the static half of /roblox; this covers the SSR half.
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: PortalLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Shown as a pill on the right of the row. */
  badge?: string;
};

/** Grouped so the day-to-day work sits above the reference material. */
const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Program",
    items: [
      { to: "/roblox/portal", label: "Home", icon: LayoutDashboard },
      { to: "/roblox/portal/apply", label: "Apply", icon: FileText },
      {
        to: "/roblox/portal/submissions",
        label: "My submissions",
        icon: ClipboardList,
        badge: "4",
      },
      { to: "/roblox/portal/status", label: "Project status", icon: RouteIcon },
    ],
  },
  {
    group: "The pilot",
    items: [
      { to: "/roblox/portal/products", label: "Products", icon: Package },
      { to: "/roblox/portal/performance", label: "Performance", icon: BarChart3 },
      { to: "/roblox/portal/review", label: "Program review", icon: BadgeCheck, badge: "Day 62" },
    ],
  },
  {
    group: "Reference",
    items: [
      { to: "/roblox/portal/resources", label: "Resources", icon: BookOpen },
      { to: "/roblox/portal/guidelines", label: "Guidelines", icon: ShieldCheck },
      { to: "/roblox/portal/support", label: "Support", icon: LifeBuoy },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

function PortalLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Longest match wins, so /roblox/portal/apply does not also light up Home.
  const current = ALL_ITEMS.reduce<NavItem | null>((best, item) => {
    if (pathname !== item.to && !pathname.startsWith(`${item.to}/`)) return best;
    return !best || item.to.length > best.to.length ? item : best;
  }, null);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-border">
        <SidebarHeader className="border-b border-border">
          <Link
            to="/roblox/portal"
            className="flex items-center gap-2.5 px-2 py-2.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-md"
              style={{ background: "var(--gradient-ember)" }}
            >
              <span className="size-3 rounded-full bg-background/85" />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-semibold tracking-tight">
                MEDIALIFE<sup className="text-[0.6em]">™</sup> × Roblox
              </span>
              <span className="mono block truncate text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Creator portal
              </span>
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {NAV.map((group) => (
            <SidebarGroup key={group.group}>
              <SidebarGroupLabel className="mono text-[10px] tracking-[0.18em] uppercase">
                {group.group}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={current?.to === item.to}
                        tooltip={item.label}
                      >
                        <Link to={item.to}>
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                          {item.badge ? (
                            <span className="mono ml-auto rounded-full border border-border px-1.5 py-0.5 text-[9px] tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
            <PropertyMark />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-xs leading-tight font-medium">
                {ACTIVE.property}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {ACTIVE.studio}
              </span>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* A named container: the sidebar takes 264px, so a screen that keys off
          the viewport gets its breakpoints wrong by that much. */}
      <SidebarInset className="@container/inset min-w-0">
        <DemoBanner />

        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="min-w-0 flex-1">
            <span className="mono block text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              {PROGRAM.shortLabel} · {ACTIVE.property}
            </span>
            <span className="block truncate text-sm font-medium">{current?.label ?? "Portal"}</span>
          </div>
          <button
            type="button"
            aria-label="Notifications"
            className="relative grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Bell className="size-4" aria-hidden />
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
              style={{ background: "var(--color-accent)" }}
            />
          </button>
          <PropertyMark />
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** The pilot property's mark, falling back to a monogram if the logo is missing. */
function PropertyMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface">
      {ACTIVE.logo ? (
        <img src={ACTIVE.logo} alt="" width={32} height={32} className="size-full object-contain" />
      ) : (
        <span className="mono text-[11px] font-semibold">{ACTIVE.property.slice(0, 2)}</span>
      )}
    </span>
  );
}

/**
 * The portal is a working demo ahead of program authorisation, and every number
 * in it is modelled. Saying so once, permanently, at the top is the honest way
 * to show it to Roblox — and it is cheaper than caveating every screen.
 */
function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface/80 px-4 py-2 text-[11px] text-muted-foreground">
      <span
        className="mono rounded-full px-2 py-0.5 text-[9px] tracking-[0.16em] text-background uppercase"
        style={{ background: "var(--gradient-ember-btn)" }}
      >
        Demo mode
      </span>
      <span>
        Populated with mock pilot data. EVADE is a real licensed property; the figures, the other
        submissions and the review are modelled to show how the portal behaves once the program is
        authorised.
      </span>
    </div>
  );
}
