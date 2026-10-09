/**
 * The Creator Hub app frame.
 *
 * Desktop: a left sidebar (the shadcn sidebar, like the Roblox portal) and a
 * slim top bar. Phones: no sidebar at all — a bottom tab bar with the four
 * places a creator goes most, and "More" for the rest. The top bar on both
 * carries the page title, the "Needs you" count and the account menu.
 */
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Coins,
  House,
  ImageUp,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/hub/auth.functions";
import { CREATOR_STATUS, HUB, type CreatorStatus } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { Monogram } from "./ui";

type NavTo =
  | "/creator-hub/dashboard"
  | "/creator-hub/products"
  | "/creator-hub/artwork"
  | "/creator-hub/experiences"
  | "/creator-hub/launch-kit"
  | "/creator-hub/earnings"
  | "/creator-hub/account";

type NavItem = { to: NavTo; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: "/creator-hub/dashboard", label: "Home", icon: House },
  { to: "/creator-hub/products", label: "Products", icon: Package },
  { to: "/creator-hub/artwork", label: "Artwork", icon: ImageUp },
  { to: "/creator-hub/experiences", label: "Experiences", icon: Sparkles },
  { to: "/creator-hub/launch-kit", label: "Launch kit", icon: BriefcaseBusiness },
  { to: "/creator-hub/earnings", label: "Earnings", icon: Coins },
  { to: "/creator-hub/account", label: "Account", icon: UserRound },
];

const TABS: NavTo[] = [
  "/creator-hub/dashboard",
  "/creator-hub/products",
  "/creator-hub/launch-kit",
  "/creator-hub/earnings",
];
const MORE: NavTo[] = ["/creator-hub/artwork", "/creator-hub/experiences", "/creator-hub/account"];
const byTo = (to: NavTo) => NAV.find((n) => n.to === to)!;

function useCurrent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`)) ?? null;
}

async function doSignOut() {
  try {
    await signOut();
  } catch {
    toast.error("Couldn't sign out. Check your connection and try again.");
    return;
  }
  // A full load drops every cached loader, so nothing of this account lingers.
  window.location.assign("/creator-hub/sign-in");
}

export type ShellCreator = {
  displayName: string;
  status: CreatorStatus;
  agency: string | null;
  email: string;
  avatar: string | null;
};

export function HubAppShell({
  creator,
  needsCount,
  children,
}: {
  creator: ShellCreator;
  needsCount: number;
  children: ReactNode;
}) {
  const current = useCurrent();
  const [moreOpen, setMoreOpen] = useState(false);
  const name = creator.displayName || creator.email;

  return (
    <SidebarProvider>
      <a
        href="#hub-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <Sidebar collapsible="icon" className="border-r border-border" aria-label="Creator Hub">
        <SidebarHeader className="border-b border-border">
          <Lockup />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu className="gap-1">
                  {NAV.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={current?.to === item.to}
                        tooltip={item.label}
                        className="h-9"
                      >
                        <Link to={item.to}>
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.to === "/creator-hub/dashboard" && needsCount > 0 ? (
                        <SidebarMenuBadge className="rounded-full bg-amber-400/15 text-amber-300">
                          {needsCount}
                          <span className="sr-only"> things need you</span>
                        </SidebarMenuBadge>
                      ) : null}
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
            <Avatar name={name} src={creator.avatar} />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm leading-tight font-medium">{name}</span>
              <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <StatusDot status={creator.status} />
                {CREATOR_STATUS[creator.status].label}
              </span>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="@container/inset min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:gap-3">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Link
            to="/creator-hub/dashboard"
            className="-ml-1 flex items-center gap-2 rounded-md md:hidden"
            aria-label="Creator Hub home"
          >
            <LogoMark />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {current?.label ?? "Creator Hub"}
            </span>
          </div>
          <NeedsYouButton count={needsCount} />
          <AccountMenu name={name} email={creator.email} avatar={creator.avatar} />
        </header>

        <main id="hub-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </SidebarInset>

      {/* Phones: thumb-reach tab bar. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((to) => {
            const item = byTo(to);
            const active = current?.to === to;
            return (
              <li key={to}>
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:bg-white/5 focus-visible:outline-none",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <item.icon className="size-5" aria-hidden />
                    {to === "/creator-hub/dashboard" && needsCount > 0 ? (
                      <span className="absolute -top-1.5 -right-2.5 grid grid-cols-1 h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] leading-none font-semibold text-background">
                        {needsCount}
                        <span className="sr-only"> things need you</span>
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:bg-white/5 focus-visible:outline-none",
                current && MORE.includes(current.to) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-5" aria-hidden />
              More
              {current && MORE.includes(current.to) ? (
                <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              ) : null}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-border px-4 pt-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-3">
              <Avatar name={name} src={creator.avatar} />
              <span className="min-w-0">
                <span className="block truncate text-base">{name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {CREATOR_STATUS[creator.status].label}
                  {creator.agency ? ` · ${creator.agency}` : ""}
                </span>
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">More pages and your account</SheetDescription>
          </SheetHeader>
          <ul className="mt-4 grid grid-cols-1 gap-1">
            {MORE.map((to) => {
              const item = byTo(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      current?.to === to && "bg-white/5 text-primary",
                    )}
                  >
                    <item.icon className="size-5 text-muted-foreground" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <a
                href={`mailto:${HUB.supportEmail}`}
                className="flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LifeBuoy className="size-5 text-muted-foreground" aria-hidden />
                Get help
              </a>
            </li>
            <li className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={doSignOut}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <LogOut className="size-5" aria-hidden />
                Sign out
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

function LogoMark() {
  return (
    <span
      aria-hidden
      className="grid grid-cols-1 size-8 shrink-0 place-items-center rounded-md"
      style={{ background: "var(--gradient-ember)" }}
    >
      <span className="size-3 rounded-full bg-background/85" />
    </span>
  );
}

function Lockup() {
  return (
    <Link
      to="/creator-hub/dashboard"
      className="flex items-center gap-2.5 rounded-md px-2 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <LogoMark />
      <span className="min-w-0 group-data-[collapsible=icon]:hidden">
        <span className="block truncate text-sm leading-tight font-semibold tracking-tight">
          MEDIALIFE<sup className="text-[0.6em]">™</sup>
        </span>
        <span className="block truncate text-xs text-muted-foreground">Creator Hub</span>
      </span>
    </Link>
  );
}

function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        className={cn("size-8 shrink-0 rounded-full border border-border object-cover", className)}
      />
    );
  }
  return <Monogram name={name} className={className} />;
}

function StatusDot({ status }: { status: CreatorStatus }) {
  const tone = CREATOR_STATUS[status].tone;
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "live"
          ? "bg-emerald-400"
          : tone === "watch"
            ? "bg-amber-400"
            : tone === "primary"
              ? "bg-primary"
              : "bg-muted-foreground",
      )}
    />
  );
}

function NeedsYouButton({ count }: { count: number }) {
  return (
    <Link
      to="/creator-hub/dashboard"
      hash="needs-you"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        count > 0
          ? "border-amber-400/45 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
      aria-label={
        count > 0
          ? `${count} ${count === 1 ? "thing needs" : "things need"} you`
          : "Nothing needs you right now"
      }
    >
      <Bell className="size-4" aria-hidden />
      {count > 0 ? (
        <>
          <span className="tabular-nums font-semibold">{count}</span>
          <span className="hidden sm:inline">need{count === 1 ? "s" : ""} you</span>
        </>
      ) : (
        <span className="hidden sm:inline">All clear</span>
      )}
    </Link>
  );
}

function AccountMenu({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full p-0.5 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Account menu"
        >
          <Avatar name={name} src={avatar} />
          <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/creator-hub/account">
            <UserRound className="size-4" aria-hidden /> Account
          </Link>
        </DropdownMenuItem>
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
  );
}
