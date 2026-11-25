/**
 * The Client Hub frame: a sidebar on desktop, a thumb-reach tab bar and a
 * "More" sheet on phones (same bones as the Partner Hub), in the client's
 * accent colour. Flat colours only.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  Clapperboard,
  FolderOpen,
  Library,
  Gauge,
  House,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  Shirt,
  Sparkles,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ClientMark, Initials } from "@/components/client/ui";
import { GlassTabBar } from "@/components/glass/tab-bar";
import { HubLink } from "@/components/hub/app/hub-link";
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
import type { PublicClient } from "@/lib/client/hub.functions";
import { CLIENT_BASE, type ClientFeature } from "@/lib/client/model";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  exact?: boolean;
  feature?: ClientFeature | ClientFeature[];
};

const NAV: NavItem[] = [
  { to: CLIENT_BASE, label: "Home", icon: House, exact: true },
  {
    to: `${CLIENT_BASE}/content`,
    label: "Content library",
    short: "Content",
    icon: Library,
    feature: ["uploads", "videos", "files"],
  },
  {
    to: `${CLIENT_BASE}/ugc`,
    label: "UGC creators",
    short: "UGC",
    icon: Clapperboard,
    feature: "ugc",
  },
  { to: `${CLIENT_BASE}/updates`, label: "Updates", icon: Megaphone, feature: "updates" },
  { to: `${CLIENT_BASE}/merch`, label: "Merch", icon: Shirt, feature: "merch" },
  { to: `${CLIENT_BASE}/videos`, label: "Videos", icon: Video, feature: "videos" },
  { to: `${CLIENT_BASE}/files`, label: "Files", icon: FolderOpen, feature: "files" },
  {
    to: `${CLIENT_BASE}/experiences`,
    label: "Experiences",
    icon: Sparkles,
    feature: "experiences",
  },
  {
    to: `${CLIENT_BASE}/insights`,
    label: "Numbers",
    icon: Gauge,
    feature: ["collector", "giveaways"],
  },
  { to: `${CLIENT_BASE}/team`, label: "Team", icon: Users },
];
/** Phones: four tabs and More. */
const TAB_PATHS = [
  CLIENT_BASE,
  `${CLIENT_BASE}/content`,
  `${CLIENT_BASE}/ugc`,
  `${CLIENT_BASE}/updates`,
];

export function navFor(features: Record<ClientFeature, boolean>) {
  return NAV.filter((n) => {
    if (!n.feature) return true;
    const f = Array.isArray(n.feature) ? n.feature : [n.feature];
    return f.some((x) => features[x]);
  });
}

function useCurrent(nav: NavItem[]) {
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/$/, "");
  return (
    [...nav]
      .reverse()
      .find((n) =>
        n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
      ) ?? null
  );
}

async function doSignOut(medialife: boolean) {
  if (medialife) {
    window.location.assign("/admin/clients");
    return;
  }
  try {
    await signOut();
  } catch {
    toast.error("Couldn't sign out. Check your connection and try again.");
    return;
  }
  window.location.assign(`${CLIENT_BASE}/sign-in`);
}

function brandVars(b: PublicClient["brand"]): Record<string, string> {
  return {
    "--client": b.accent,
    "--client-ink": b.ink,
    "--primary": b.accent,
    "--primary-foreground": b.ink,
    "--ring": b.accent,
  };
}

/** Dialogs and menus render outside the shell, so the colours go on <html> too. */
function useRootBrand(b: PublicClient["brand"]) {
  useEffect(() => {
    const root = document.documentElement;
    const vars = brandVars(b);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [b]);
}

export function ClientShell({
  client,
  me,
  children,
}: {
  client: PublicClient;
  me: { name: string; email: string; role: string; medialife: boolean };
  children: ReactNode;
}) {
  const nav = navFor(client.features);
  const current = useCurrent(nav);
  const tabs = TAB_PATHS.map((to) => nav.find((n) => n.to === to)).filter((n): n is NavItem => !!n);
  const more = nav.filter((n) => !tabs.includes(n));
  const [moreOpen, setMoreOpen] = useState(false);
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  useRootBrand(client.brand);
  const hubName = `${client.name} Hub`;

  return (
    <SidebarProvider style={brandVars(client.brand) as React.CSSProperties}>
      <a
        href="#client-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-[var(--client)] transition-[opacity,transform] duration-500",
          loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
        )}
      />

      <Sidebar collapsible="icon" className="border-r border-border" aria-label={hubName}>
        <SidebarHeader className="border-b border-border">
          <Link
            to="/client-hub"
            className="flex items-center gap-2.5 rounded-md px-2 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <ClientMark name={client.name} logo={client.logo} />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-semibold tracking-tight">
                {client.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">with MEDIALIFE</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu className="gap-1">
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={current?.to === item.to}
                        tooltip={item.label}
                        className="h-10 rounded-lg data-[active=true]:bg-white/[0.06] data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-[inset_2px_0_0_0_var(--client)] [&[data-active=true]>svg]:text-[var(--client)]"
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
          {client.contact.email ? (
            <SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
              <a
                href={`mailto:${client.contact.email}`}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LifeBuoy className="size-4" aria-hidden />
                Questions: {client.contact.email}
              </a>
            </SidebarGroup>
          ) : null}
        </SidebarContent>
        <SidebarFooter className="border-t border-border">
          <div className="flex items-center gap-2.5 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Initials name={me.name} />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-medium">{me.name}</span>
              <span className="block truncate text-xs text-muted-foreground capitalize">
                {me.medialife ? "Viewing as MEDIALIFE" : me.role}
              </span>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="@container/inset min-w-0">
        {me.medialife ? (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[var(--client)] px-4 py-1.5 text-center text-xs font-medium text-[var(--client-ink)]">
            You're seeing the {client.name} hub as their team sees it.
            <a href={`/admin/clients/${client.id}`} className="underline underline-offset-2">
              Manage it in admin
            </a>
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur sm:gap-3">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Link to="/client-hub" className="-ml-1 md:hidden" aria-label={`${hubName} home`}>
            <ClientMark name={client.name} logo={client.logo} />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{current?.label ?? hubName}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full p-0.5 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="Account menu"
              >
                <Initials name={me.name} />
                <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-medium">{me.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {me.medialife ? "MEDIALIFE admin" : me.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/client-hub/team">
                  <Users className="size-4" aria-hidden /> Team and account
                </Link>
              </DropdownMenuItem>
              {client.contact.email ? (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${client.contact.email}`}>
                    <LifeBuoy className="size-4" aria-hidden /> Contact MEDIALIFE
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => doSignOut(me.medialife)}>
                <LogOut className="size-4" aria-hidden />{" "}
                {me.medialife ? "Back to admin" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main id="client-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </SidebarInset>

      <GlassTabBar
        tabs={[
          ...tabs.map((item) => ({
            key: item.to,
            label: item.short ?? item.label,
            icon: item.icon,
            to: item.to,
            active: current?.to === item.to,
          })),
          {
            key: "more",
            label: "More",
            icon: Menu,
            onClick: () => setMoreOpen(true),
            expanded: moreOpen,
            active: !!current && more.includes(current),
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
          className="rounded-t-[28px] border-white/10 bg-[#0d1017] px-4 pt-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-3">
              <Initials name={me.name} />
              <span className="min-w-0">
                <span className="block truncate text-base">{me.name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {hubName}
                </span>
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">More pages and your account</SheetDescription>
          </SheetHeader>
          <ul className="mt-4 grid grid-cols-1 gap-1">
            {more.map((item) => (
              <li key={item.to}>
                <HubLink
                  to={item.to}
                  onNavigate={() => setMoreOpen(false)}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    current?.to === item.to && "bg-white/5 text-[var(--client)]",
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
                onClick={() => doSignOut(me.medialife)}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LogOut className="size-5 text-muted-foreground" aria-hidden />{" "}
                {me.medialife ? "Back to admin" : "Sign out"}
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
