/**
 * The Creator Hub app frame.
 *
 * Desktop: a left sidebar (the shadcn sidebar) with the current page lit in the
 * accent, and a slim glass top bar. Phones: no sidebar — a floating glass tab
 * bar with the four places a creator goes most, and "More" for the rest. The
 * top bar on both carries the page title, the manager chip, the "Needs you"
 * button (it opens the Needs-you drawer) and the account menu.
 */
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Coins,
  FileSignature,
  FolderOpen,
  House,
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

import { GlassTabBar } from "@/components/glass/tab-bar";
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

import { HubLink } from "./hub-link";
import { Tile, type Tone } from "./look";
import { NeedsYouProvider, useNeedsYou } from "./needs-you";
import { Monogram } from "./ui";
import type { ActionItem } from "./workspace";

export { HubLink } from "./hub-link";

type NavTo =
  | "/creator-hub/dashboard"
  | "/creator-hub/products"
  | "/creator-hub/assets"
  | "/creator-hub/experiences"
  | "/creator-hub/launch-kit"
  | "/creator-hub/live"
  | "/creator-hub/earnings"
  | "/creator-hub/account";

type NavItem = { to: NavTo; label: string; icon: LucideIcon; tone: Tone; badge?: string };

const NAV: NavItem[] = [
  { to: "/creator-hub/dashboard", label: "Home", icon: House, tone: "ice" },
  { to: "/creator-hub/products", label: "Products", icon: Package, tone: "blue" },
  { to: "/creator-hub/assets", label: "Assets", icon: FolderOpen, tone: "violet" },
  { to: "/creator-hub/experiences", label: "Experiences", icon: Sparkles, tone: "pink" },
  { to: "/creator-hub/launch-kit", label: "Launch kit", icon: BriefcaseBusiness, tone: "amber" },
  { to: "/creator-hub/live", label: "Go live", icon: Radio, tone: "pink", badge: "New" },
  { to: "/creator-hub/earnings", label: "Earnings", icon: Coins, tone: "mint" },
  { to: "/creator-hub/account", label: "Account", icon: UserRound, tone: "ice" },
];

const TABS: NavTo[] = [
  "/creator-hub/dashboard",
  "/creator-hub/products",
  "/creator-hub/launch-kit",
  "/creator-hub/earnings",
];
const MORE: NavTo[] = [
  "/creator-hub/live",
  "/creator-hub/assets",
  "/creator-hub/experiences",
  "/creator-hub/account",
];
const byTo = (to: NavTo) => NAV.find((n) => n.to === to)!;

function useCurrent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`)) ?? null;
}

/** Pages reached from elsewhere (not in the nav) still get a title in the top bar. */
const OTHER_TITLES: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/creator-hub/agreement", label: "Agreement", icon: FileSignature },
];

function useTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = useCurrent();
  return current ?? OTHER_TITLES.find((o) => pathname.startsWith(o.to)) ?? null;
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

/** The active nav item: an accent wash, a lit edge and an accent icon. */
const ACTIVE_ITEM =
  "h-10 rounded-xl data-[active=true]:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--partner)_24%,transparent),transparent)] data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-[inset_2px_0_0_0_var(--partner)] [&[data-active=true]>svg]:text-[var(--partner)]";

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
  const title = useTitle();
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
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left transition-[opacity,transform] duration-500 motion-reduce:transition-none",
          loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
        )}
        style={{ background: "var(--gradient-ember)" }}
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
                        className={ACTIVE_ITEM}
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
                        <SidebarMenuBadge className="top-2.5 rounded-full bg-amber-400 font-semibold text-background">
                          {needsCount}
                          <span className="sr-only"> things need you</span>
                        </SidebarMenuBadge>
                      ) : item.badge ? (
                        <SidebarMenuBadge className="top-2.5 rounded-full bg-[linear-gradient(135deg,oklch(0.72_0.16_240/0.25),oklch(0.68_0.26_350/0.3))] text-[10px] font-semibold text-[oklch(0.88_0.1_350)] ring-1 ring-[oklch(0.68_0.26_350/0.4)] ring-inset">
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
              className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-muted-foreground transition-colors hover:border-[var(--partner)]/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Tile icon={LifeBuoy} tone="ice" size="sm" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Need a hand?</span>
                <span className="block truncate">{HUB.supportEmail}</span>
              </span>
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
        <header className="glass-strong sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 rounded-none border-x-0 border-t-0 px-4 sm:gap-3">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Link
            to="/creator-hub/dashboard"
            className="-ml-1 flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            aria-label="Creator Hub home"
          >
            <LogoMark />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {title ? (
              <title.icon
                className="hidden size-4 shrink-0 text-[var(--partner)] sm:block"
                aria-hidden
              />
            ) : null}
            <span className="block truncate text-sm font-medium">
              {title?.label ?? "Creator Hub"}
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

      {/* Phones: a floating glass tab bar within thumb reach. */}
      <GlassTabBar
        tabs={[
          ...TABS.map((to) => {
            const item = byTo(to);
            return {
              key: to,
              label: item.label,
              icon: item.icon,
              to,
              active: current?.to === to,
            };
          }),
          {
            key: "more",
            label: "More",
            icon: Menu,
            onClick: () => setMoreOpen(true),
            expanded: moreOpen,
            active: !!current && MORE.includes(current.to),
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
          <SheetHeader className="p-0 text-left">
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
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {MORE.map((to) => {
              const item = byTo(to);
              const on = current?.to === to;
              return (
                <li key={to}>
                  <HubLink
                    to={to}
                    onNavigate={() => setMoreOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex h-full flex-col gap-2.5 rounded-2xl border p-3.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      on
                        ? "glass-pill border-[var(--partner)]/45 text-foreground"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
                    )}
                  >
                    <Tile icon={item.icon} tone={item.tone} size="sm" />
                    {item.label}
                    {item.badge ? (
                      <span className="absolute top-3 right-3 rounded-full bg-[oklch(0.68_0.26_350/0.2)] px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.88_0.1_350)]">
                        {item.badge}
                      </span>
                    ) : null}
                  </HubLink>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={`mailto:${HUB.supportEmail}`}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-medium hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <LifeBuoy className="size-4 text-muted-foreground" aria-hidden />
              Get help
            </a>
            <button
              type="button"
              onClick={doSignOut}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

/** The MEDIALIFE orb. */
function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-white/10",
        className,
      )}
    >
      <img src="/favicon.svg" alt="" className="size-full" />
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
        <img src="/brand/medialife-wordmark.webp" alt="MEDIALIFE" className="h-3.5 w-auto" />
        <span className="mt-1 block truncate text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
          Creator Hub
        </span>
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
          className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:pr-3"
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
      <PopoverContent align="end" className="glass-strong w-72 rounded-2xl p-4">
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
                  className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm hover:border-[var(--partner)]/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Mail className="size-4 shrink-0 text-[var(--partner)]" aria-hidden />
                  <span className="truncate">{manager.email}</span>
                </a>
              ) : null}
              {manager.discord ? (
                <div className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm">
                  <MessageCircle className="size-4 shrink-0 text-[#a5b4fc]" aria-hidden />
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
              className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm hover:border-[var(--partner)]/50"
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
          ? "border-amber-400/45 bg-amber-400/10 text-amber-200 shadow-[0_0_24px_-8px_rgb(251_191_36/0.6)] hover:bg-amber-400/15"
          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
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
      <DropdownMenuContent align="end" className="glass-strong w-60 rounded-2xl">
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
