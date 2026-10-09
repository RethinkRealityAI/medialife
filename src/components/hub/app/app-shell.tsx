/**
 * The Creator Hub app frame.
 *
 * Desktop: a left sidebar (the shadcn sidebar, like the Roblox portal) and a
 * slim top bar. Phones: no sidebar at all — a bottom tab bar with the four
 * places a creator goes most, and "More" for the rest. The top bar on both
 * carries the page title, the manager chip, the "Needs you" button (it opens
 * the Needs-you drawer) and the account menu.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Coins,
  House,
  ImageUp,
  LifeBuoy,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Package,
  Radio,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

import { NeedsYouProvider, useNeedsYou } from "./needs-you";
import { Monogram } from "./ui";
import type { ActionItem } from "./workspace";

type NavTo =
  | "/creator-hub/dashboard"
  | "/creator-hub/products"
  | "/creator-hub/artwork"
  | "/creator-hub/experiences"
  | "/creator-hub/launch-kit"
  | "/creator-hub/live"
  | "/creator-hub/earnings"
  | "/creator-hub/account";

type NavItem = { to: NavTo; label: string; icon: LucideIcon; badge?: string };

const NAV: NavItem[] = [
  { to: "/creator-hub/dashboard", label: "Home", icon: House },
  { to: "/creator-hub/products", label: "Products", icon: Package },
  { to: "/creator-hub/artwork", label: "Artwork", icon: ImageUp },
  { to: "/creator-hub/experiences", label: "Experiences", icon: Sparkles },
  { to: "/creator-hub/launch-kit", label: "Launch kit", icon: BriefcaseBusiness },
  { to: "/creator-hub/live", label: "Go live", icon: Radio, badge: "New" },
  { to: "/creator-hub/earnings", label: "Earnings", icon: Coins },
  { to: "/creator-hub/account", label: "Account", icon: UserRound },
];

const TABS: NavTo[] = [
  "/creator-hub/dashboard",
  "/creator-hub/products",
  "/creator-hub/launch-kit",
  "/creator-hub/earnings",
];
const MORE: NavTo[] = [
  "/creator-hub/live",
  "/creator-hub/artwork",
  "/creator-hub/experiences",
  "/creator-hub/account",
];
const byTo = (to: NavTo) => NAV.find((n) => n.to === to)!;

function useCurrent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`)) ?? null;
}

/**
 * A link to any hub path. Uses the router when it knows the path (client-side
 * navigation) and is a plain link otherwise — /creator-hub/live is built by
 * another page owner, so it isn't in this file's route types.
 */
export function HubLink({
  to,
  className,
  children,
  onNavigate,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
  "aria-current"?: "page" | undefined;
}) {
  const router = useRouter();
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onNavigate?.();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void router.navigate({ href: to });
      }}
    >
      {children}
    </a>
  );
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

export type ShellManager = { name: string; email: string; discord: string } | null;

export function HubAppShell({
  creator,
  manager,
  needs,
  children,
}: {
  creator: ShellCreator;
  manager: ShellManager;
  needs: ActionItem[];
  children: ReactNode;
}) {
  return (
    <NeedsYouProvider items={needs}>
      <Shell creator={creator} manager={manager} needsCount={needs.length}>
        {children}
      </Shell>
    </NeedsYouProvider>
  );
}

function Shell({
  creator,
  manager,
  needsCount,
  children,
}: {
  creator: ShellCreator;
  manager: ShellManager;
  needsCount: number;
  children: ReactNode;
}) {
  const current = useCurrent();
  const [moreOpen, setMoreOpen] = useState(false);
  const name = creator.displayName || creator.email;
  const loading = useRouterState({ select: (s) => s.status === "pending" });

  return (
    <SidebarProvider>
      <a
        href="#hub-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Route progress: a thin bar while a page's data loads. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-primary transition-[opacity,transform] duration-500",
          loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
        )}
      />

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
                        <HubLink
                          to={item.to}
                          aria-current={current?.to === item.to ? "page" : undefined}
                        >
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                        </HubLink>
                      </SidebarMenuButton>
                      {item.to === "/creator-hub/dashboard" && needsCount > 0 ? (
                        <SidebarMenuBadge className="rounded-full bg-amber-400/15 text-amber-300">
                          {needsCount}
                          <span className="sr-only"> things need you</span>
                        </SidebarMenuBadge>
                      ) : item.badge ? (
                        <SidebarMenuBadge className="rounded-full bg-accent/15 text-[10px] text-[oklch(0.82_0.14_350)]">
                          {item.badge}
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
          <ManagerChip manager={manager} approved={creator.status === "approved"} />
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
                <HubLink
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
                      <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] leading-none font-semibold text-background">
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
                </HubLink>
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
                  <HubLink
                    to={to}
                    onNavigate={() => setMoreOpen(false)}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      current?.to === to && "bg-white/5 text-primary",
                    )}
                  >
                    <item.icon className="size-5 text-muted-foreground" aria-hidden />
                    {item.label}
                    {item.badge ? (
                      <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-[oklch(0.82_0.14_350)]">
                        {item.badge}
                      </span>
                    ) : null}
                  </HubLink>
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
      className="grid size-8 shrink-0 place-items-center rounded-md"
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

/** "Your manager": a chip that opens their card. */
function ManagerChip({ manager, approved }: { manager: ShellManager; approved: boolean }) {
  const label = manager?.name || "Your manager";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-full border border-border py-0.5 pr-0.5 pl-0.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:pr-3"
          aria-label={manager ? `Your manager: ${label}` : "Your manager"}
        >
          {manager ? (
            <Monogram name={label} className="size-7 text-[10px]" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full border border-dashed border-border">
              <LifeBuoy className="size-3.5" aria-hidden />
            </span>
          )}
          <span className="hidden lg:inline">Your manager</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        {manager ? (
          <>
            <div className="flex items-center gap-3">
              <Monogram name={label} className="size-10 text-sm" />
              <div className="min-w-0">
                <div className="truncate font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">Your manager at MEDIALIFE</div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Questions about a product, a date or a payout? Message them on a product, or reach out
              directly.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {manager.email ? (
                <a
                  href={`mailto:${manager.email}`}
                  className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{manager.email}</span>
                </a>
              ) : null}
              {manager.discord ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
                  <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="sr-only">Discord:</span>
                  <span className="truncate">{manager.discord}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Discord</span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">Your manager</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {approved
                ? "We're assigning your manager now. They'll introduce themselves by email."
                : "Your manager will be assigned when you're approved."}
            </p>
            <a
              href={`mailto:${HUB.supportEmail}`}
              className="mt-3 flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:border-primary/50"
            >
              <Mail className="size-4 text-muted-foreground" aria-hidden /> {HUB.supportEmail}
            </a>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NeedsYouButton({ count }: { count: number }) {
  const { open } = useNeedsYou();
  return (
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
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
          <span className="font-semibold tabular-nums">{count}</span>
          <span className="hidden sm:inline">need{count === 1 ? "s" : ""} you</span>
        </>
      ) : (
        <span className="hidden sm:inline">All clear</span>
      )}
    </button>
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
