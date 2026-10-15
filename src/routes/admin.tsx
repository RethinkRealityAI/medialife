import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Handshake,
  House,
  Link2,
  LogOut,
  Menu,
  Presentation,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import { toneText, type Tone } from "@/components/admin/kit";
import { GLASS_TAB_BAR_CLEARANCE, GlassTabBar } from "@/components/glass/tab-bar";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { adminLogout, getAdminSession } from "@/lib/ar/admin.functions";
import { cn } from "@/lib/utils";

// Internal tools for the activated-retail demos. Everything under /admin needs
// the shared admin password (AR_ADMIN_PASSWORD); the login page is
// /admin/login (src/routes/admin_.login.tsx), outside this layout.

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Activated Retail · Internal | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const s = await getAdminSession();
    if (!s.authed) {
      throw redirect({ to: "/admin/login", search: { next: location.href } });
    }
  },
  component: AdminLayout,
});

type NavItem = { to: string; label: string; short?: string; icon: LucideIcon; tone: Tone };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ to: "/admin", label: "Home", icon: House, tone: "sky" }],
  },
  {
    label: "Programs",
    items: [
      { to: "/admin/creators", label: "Creators", icon: Users, tone: "sky" },
      { to: "/admin/partners", label: "Partners", icon: Handshake, tone: "violet" },
    ],
  },
  {
    label: "Demos & sales",
    items: [
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3, tone: "mint" },
      { to: "/admin/links", label: "Client links", short: "Links", icon: Link2, tone: "amber" },
      { to: "/admin/builder", label: "Endcap builder", icon: Boxes, tone: "rose" },
      { to: "/admin/shelves", label: "Merch shelves", icon: Store, tone: "sky" },
      { to: "/admin/demos", label: "Live demos", icon: Presentation, tone: "violet" },
    ],
  },
];
const NAV = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
/** The phone tab bar's destinations; the rest live behind "More". */
const TAB_BAR = ["/admin", "/admin/creators", "/admin/partners", "/admin/analytics"];

/** Home matches only itself; every other item also matches the pages under it. */
const isAt = (pathname: string, to: string) =>
  pathname === to || (to !== "/admin" && pathname.startsWith(`${to}/`));

/** Full-height editors keep the whole screen: no tab bar, no bottom padding. */
const isEditor = (pathname: string) => /^\/admin\/(shelves|builder)\/[^/]+/.test(pathname);

function AdminLayout() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/$/, "");
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  const current = NAV.find((n) => isAt(pathname, n.to));
  const editor = isEditor(pathname);

  async function logout() {
    await adminLogout();
    await router.navigate({ to: "/admin/login" });
  }

  return (
    <SidebarProvider>
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-[image:var(--gradient-ember)] transition-[opacity,transform] duration-500 motion-reduce:transition-none",
          loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
        )}
      />

      <Sidebar collapsible="icon" className="border-r border-white/[0.07]" aria-label="Admin">
        {/* --sidebar isn't a theme colour here, so the panel brings its own fill (frosted on phones, where it's a sheet). */}
        <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,oklch(0.115_0.014_280),oklch(0.085_0.008_280))] max-md:glass-strong max-md:rounded-r-3xl max-md:border-l-0!">
          <SidebarHeader className="border-b border-white/[0.07]">
            <Link
              to="/admin"
              className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <Mark />
              <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-sm leading-tight font-semibold tracking-tight">
                  MEDIALIFE<sup className="text-[0.6em]">™</sup>
                </span>
                <span className="block truncate text-xs text-muted-foreground">Team admin</span>
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <nav aria-label="Admin tools">
              {GROUPS.map((g) => (
                <SidebarGroup key={g.label}>
                  <SidebarGroupLabel className="text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">
                    {g.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1">
                      {g.items.map((item) => {
                        const active = current?.to === item.to;
                        return (
                          <SidebarMenuItem key={item.to}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={item.label}
                              className="h-10 rounded-xl text-white/75 hover:bg-white/[0.05] hover:text-white focus-visible:ring-[var(--partner)] data-[active=true]:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--partner)_22%,transparent),transparent)] data-[active=true]:font-medium data-[active=true]:text-white data-[active=true]:shadow-[inset_2px_0_0_0_var(--partner)]"
                            >
                              <Link to={item.to} aria-current={active ? "page" : undefined}>
                                <item.icon
                                  aria-hidden
                                  className={cn(toneText(item.tone), !active && "opacity-75")}
                                />
                                <span>{item.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </nav>
          </SidebarContent>
          <SidebarFooter className="border-t border-white/[0.07]">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={logout}
                  tooltip="Sign out"
                  className="h-10 rounded-xl text-white/70 hover:bg-white/[0.05] hover:text-white focus-visible:ring-[var(--partner)]"
                >
                  <LogOut aria-hidden />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </div>
      </Sidebar>

      <SidebarInset className="@container/inset relative isolate min-w-0">
        {/* Ambient colour behind the page, so the glass header and raised cards have something to sit on. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(55%_70%_at_15%_0%,color-mix(in_oklab,var(--partner)_13%,transparent),transparent_70%),radial-gradient(45%_60%_at_95%_0%,color-mix(in_oklab,var(--partner-2)_14%,transparent),transparent_70%)]"
        />
        <header className="glass-strong sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 rounded-none border-x-0! border-t-0! px-4">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Link
            to="/admin"
            className="-ml-1 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            aria-label="MEDIALIFE admin"
          >
            <Mark />
          </Link>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              <li className="hidden shrink-0 text-muted-foreground sm:block">
                {current?.group ?? "Admin"}
              </li>
              <li aria-hidden className="hidden text-white/25 sm:block">
                <ChevronRight className="size-3.5" />
              </li>
              <li className="flex min-w-0 items-center gap-2 font-medium">
                {current ? (
                  <current.icon
                    className={cn("size-4 shrink-0", toneText(current.tone))}
                    aria-hidden
                  />
                ) : null}
                <span className="truncate" aria-current="page">
                  {current?.label ?? "Internal"}
                </span>
              </li>
            </ol>
          </nav>
        </header>
        <main
          id="admin-main"
          tabIndex={-1}
          className={cn(
            "min-w-0 flex-1 outline-none",
            !editor && "max-md:pb-[var(--tabbar)] md:pb-8",
          )}
          style={{ "--tabbar": GLASS_TAB_BAR_CLEARANCE } as React.CSSProperties}
        >
          <Outlet />
        </main>
      </SidebarInset>
      {editor ? null : <AdminTabBar pathname={pathname} />}
    </SidebarProvider>
  );
}

/** Phones: the main destinations in a floating glass bar; "More" opens the full menu. */
function AdminTabBar({ pathname }: { pathname: string }) {
  const { openMobile, setOpenMobile } = useSidebar();
  const inMore = !TAB_BAR.some((to) => isAt(pathname, to));
  return (
    <GlassTabBar
      label="Admin"
      tabs={[
        ...TAB_BAR.map((to) => {
          const n = NAV.find((x) => x.to === to)!;
          return {
            key: to,
            to,
            label: n.short ?? n.label,
            icon: n.icon,
            active: isAt(pathname, to),
          };
        }),
        {
          key: "more",
          label: "More",
          icon: Menu,
          active: inMore && !openMobile ? true : undefined,
          expanded: openMobile,
          onClick: () => setOpenMobile(true),
        },
      ]}
      renderLink={({ to, className, children, ...rest }) => (
        <Link to={to} className={className} aria-current={rest["aria-current"]}>
          {children}
        </Link>
      )}
    />
  );
}

function Mark() {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_8px_18px_-8px_color-mix(in_oklab,var(--partner-2)_80%,black)]"
      style={{ background: "var(--gradient-ember)" }}
    >
      <span className="size-3 rounded-full bg-background/85" />
    </span>
  );
}
