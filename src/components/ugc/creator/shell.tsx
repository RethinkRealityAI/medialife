/**
 * The UGC Hub app frame. Desktop: a left sidebar (nav, the campaign with its
 * countdown, help, the account). Phones: a floating glass tab bar with Home,
 * Brief, Upload, Assets and "More" (Perks, Profile, help, sign out). A slim
 * glass top bar on both carries the page title and the account menu.
 *
 * Also here, because every page needs them: the paused-account and offline
 * banners, the route progress line, and the one-time approval confetti.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  CirclePause,
  ClipboardList,
  FolderOpen,
  Gift,
  House,
  LifeBuoy,
  LogOut,
  Menu,
  UploadCloud,
  UserRound,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GlassTabBar } from "@/components/glass/tab-bar";
import { HubLink } from "@/components/hub/app/hub-link";
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
import { Toaster } from "@/components/ui/sonner";
import { countdownLabel, deadlineTone } from "@/components/ugc/shared/format";
import { CreatorStatusChip } from "@/components/ugc/shared/status-chip";
import { signOutUgc } from "@/lib/ugc/auth.functions";
import type { UgcHome } from "./types";
import { UGC, UGC_ROUTES } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { HubTag, Lockup } from "./brand";
import { FirstApprovalConfetti } from "./confetti";
import { UgcTheme } from "./kit";

type NavItem = { to: string; label: string; icon: LucideIcon; badge?: string | number };

const BASE: NavItem[] = [
  { to: UGC_ROUTES.home, label: "Home", icon: House },
  { to: UGC_ROUTES.brief, label: "Brief", icon: ClipboardList },
  { to: UGC_ROUTES.upload, label: "Upload", icon: UploadCloud },
  { to: UGC_ROUTES.assets, label: "Assets", icon: FolderOpen },
  { to: UGC_ROUTES.perks, label: "Perks", icon: Gift },
  { to: UGC_ROUTES.profile, label: "Profile", icon: UserRound },
];
const TABS = [UGC_ROUTES.home, UGC_ROUTES.brief, UGC_ROUTES.upload, UGC_ROUTES.assets];
const MORE = [UGC_ROUTES.perks, UGC_ROUTES.profile];

function isOn(pathname: string, to: string) {
  const p = pathname.replace(/\/+$/, "") || "/";
  return to === UGC_ROUTES.home ? p === UGC_ROUTES.home : p === to || p.startsWith(`${to}/`);
}

async function doSignOut() {
  try {
    await signOutUgc();
  } catch {
    toast.error("Couldn't sign out. Check your connection and try again.");
    return;
  }
  window.location.assign(UGC_ROUTES.signIn);
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function UgcShell({ home, children }: { home: UgcHome; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  const online = useOnline();
  const [moreOpen, setMoreOpen] = useState(false);
  const c = home.creator;
  const name = c.creatorName || c.name || c.email;
  const counts = home.submissionCounts;
  const uploadBadge = (counts["changes-requested"] ?? 0) + (counts.approved ?? 0);
  const nav = BASE.map((n) =>
    n.to === UGC_ROUTES.brief && home.briefUpdated
      ? { ...n, badge: "New" }
      : n.to === UGC_ROUTES.upload && uploadBadge
        ? { ...n, badge: uploadBadge }
        : n.to === UGC_ROUTES.perks && home.perks.length
          ? { ...n, badge: home.perks.length }
          : n,
  );
  const current = nav.find((n) => isOn(pathname, n.to)) ?? null;
  const byTo = (to: string) => nav.find((n) => n.to === to)!;

  return (
    <div className="relative min-h-dvh bg-[#05080a] text-foreground">
      <UgcTheme />
      <a
        href="#ugc-main"
        className="sr-only z-[70] rounded-lg bg-[#f6c344] px-4 py-2.5 font-semibold text-black focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* Route progress: a thin bar while a page's data loads. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-[linear-gradient(90deg,#19affe,#ff37ae)] transition-[opacity,transform] duration-500 motion-reduce:transition-none",
          loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
        )}
      />
      {/* Ambient light, top right, like the landing page hero. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(50%_40%_at_85%_0%,rgb(63_230_224/0.09),transparent_70%),radial-gradient(40%_35%_at_0%_100%,rgb(25_175_254/0.05),transparent_70%)]"
      />

      <Sidebar nav={nav} current={current} home={home} name={name} />

      <div className="relative min-w-0 md:pl-64 lg:pl-72">
        <header className="glass-strong sticky top-0 z-30 flex h-14 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 sm:px-6 lg:px-10">
          <HubLink
            to={UGC_ROUTES.home}
            className="-ml-1 flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-[#3fe6e0] md:hidden"
            aria-label="UGC Hub home"
          >
            <Lockup compact />
          </HubLink>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {current ? (
              <>
                <span aria-hidden className="hidden h-4 w-px bg-white/15 max-md:block" />
                <current.icon
                  className="hidden size-4 shrink-0 text-[#3fe6e0] md:block"
                  aria-hidden
                />
                <span className="truncate text-sm font-medium">{current.label}</span>
              </>
            ) : null}
          </div>
          <DeadlineChip deadline={home.campaign?.deadline ?? null} />
          <AccountMenu name={name} email={c.email} status={c.status} />
        </header>

        <div aria-live="polite" className="contents">
          {c.status === "paused" ? (
            <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3 text-sm sm:px-6 lg:px-10">
              <p className="mx-auto flex max-w-6xl items-start gap-2.5 text-[#c9d1d8]">
                <CirclePause className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden />
                <span>
                  <strong className="font-semibold text-foreground">Your spot is paused.</strong>{" "}
                  You can read everything, but uploads are off for now. Questions? Email{" "}
                  <a className="underline underline-offset-4" href={`mailto:${UGC.supportEmail}`}>
                    {UGC.supportEmail}
                  </a>
                  .
                </span>
              </p>
            </div>
          ) : null}
          {!online ? (
            <div className="border-b border-amber-400/30 bg-amber-400/[0.08] px-4 py-2.5 text-sm sm:px-6 lg:px-10">
              <p className="mx-auto flex max-w-6xl items-center gap-2.5 text-amber-100">
                <WifiOff className="size-4 shrink-0 text-amber-300" aria-hidden />
                You're offline. Uploads pause and carry on when you're back.
              </p>
            </div>
          ) : null}
        </div>

        <main id="ugc-main" tabIndex={-1} className="relative min-w-0 outline-none">
          {children}
        </main>
      </div>

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
              highlight: to === UGC_ROUTES.upload && current?.to !== to,
            };
          }),
          {
            key: "more",
            label: "More",
            icon: Menu,
            onClick: () => setMoreOpen(true),
            expanded: moreOpen,
            active: !!current && MORE.includes(current.to as (typeof MORE)[number]),
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
          className="glass-strong rounded-t-[28px] border-white/10 px-4 pt-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="flex items-center gap-3">
              <Monogram name={name} className="size-10 text-sm" />
              <span className="min-w-0">
                <span className="block truncate text-base">{name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {c.email}
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
                      "relative flex min-h-24 flex-col justify-between gap-3 rounded-2xl border p-4 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#3fe6e0]",
                      on
                        ? "border-[#3fe6e0]/45 bg-[#3fe6e0]/[0.08]"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
                    )}
                  >
                    <item.icon className="size-5 text-[#3fe6e0]" aria-hidden />
                    {item.label}
                    {item.badge ? (
                      <NavBadge value={item.badge} className="absolute top-3 right-3" />
                    ) : null}
                  </HubLink>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={`mailto:${UGC.supportEmail}`}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-medium hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
            >
              <LifeBuoy className="size-4 text-muted-foreground" aria-hidden />
              Get help
            </a>
            <button
              type="button"
              onClick={doSignOut}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <FirstApprovalConfetti
        creatorId={c.id}
        approved={(counts.approved ?? 0) + (counts.posted ?? 0) > 0}
      />
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </div>
  );
}

function NavBadge({ value, className }: { value: string | number; className?: string }) {
  const text = typeof value === "number";
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums",
        text
          ? "bg-[#f6c344] text-[#1a1203]"
          : "bg-[#3fe6e0]/15 text-[#bff7f4] ring-1 ring-[#3fe6e0]/40 ring-inset",
        className,
      )}
    >
      {value}
      {text ? <span className="sr-only"> need you</span> : null}
    </span>
  );
}

function Sidebar({
  nav,
  current,
  home,
  name,
}: {
  nav: NavItem[];
  current: NavItem | null;
  home: UgcHome;
  name: string;
}) {
  const campaign = home.campaign;
  const left = countdownLabel(campaign?.deadline ?? null);
  return (
    <aside
      aria-label="UGC Hub"
      className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.07] bg-[linear-gradient(180deg,#081015,#05080a)] md:flex lg:w-72"
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-white/[0.07] px-4">
        <HubLink
          to={UGC_ROUTES.home}
          className="flex min-h-11 min-w-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
          aria-label="UGC Hub home"
        >
          <Lockup />
        </HubLink>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <HubTag className="mb-3 ml-3" />
        <ul className="space-y-1">
          {nav.map((item) => {
            const on = current?.to === item.to;
            return (
              <li key={item.to}>
                <HubLink
                  to={item.to}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "group flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[#3fe6e0]",
                    on
                      ? "bg-[linear-gradient(90deg,rgb(63_230_224/0.16),transparent)] font-medium text-foreground shadow-[inset_2px_0_0_0_#3fe6e0]"
                      : "text-[#c9d1d8] hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-[18px] shrink-0",
                      on ? "text-[#3fe6e0]" : "text-muted-foreground group-hover:text-foreground",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? <NavBadge value={item.badge} /> : null}
                </HubLink>
              </li>
            );
          })}
        </ul>

        {campaign ? (
          <HubLink
            to={UGC_ROUTES.brief}
            className="group relative mt-6 block overflow-hidden rounded-2xl border border-white/10 bg-[#071014] focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
          >
            {campaign.coverUrl ? (
              <img
                src={campaign.coverUrl}
                alt=""
                className="h-24 w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
              />
            ) : (
              <span className="block h-24 bg-[radial-gradient(ellipse_at_top,rgb(63_230_224/0.25),transparent_70%)]" />
            )}
            <span className="absolute inset-x-0 top-0 h-24 bg-gradient-to-t from-[#071014] to-transparent" />
            <span className="relative -mt-6 block px-3.5 pb-3.5">
              <span className="block font-mono text-[10px] tracking-[0.18em] text-[#3fe6e0] uppercase">
                Current brief
              </span>
              <span className="mt-1 line-clamp-2 block text-sm leading-snug font-semibold">
                {campaign.title}
              </span>
              {left ? (
                <span
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 text-xs tabular-nums",
                    deadlineTone(campaign.deadline) === "late"
                      ? "text-rose-300"
                      : deadlineTone(campaign.deadline) === "soon"
                        ? "text-amber-300"
                        : "text-muted-foreground",
                  )}
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {left}
                </span>
              ) : null}
            </span>
          </HubLink>
        ) : null}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <a
          href={`mailto:${UGC.supportEmail}`}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
        >
          <LifeBuoy className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{UGC.supportEmail}</span>
        </a>
        <div className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2">
          <Monogram name={name} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {home.creator.email}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}

function DeadlineChip({ deadline }: { deadline: number | null }) {
  const label = countdownLabel(deadline);
  if (!label) return null;
  const tone = deadlineTone(deadline);
  return (
    <HubLink
      to={UGC_ROUTES.brief}
      aria-label={`Content deadline: ${label}`}
      className={cn(
        "hidden h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-[#3fe6e0] sm:inline-flex",
        tone === "late"
          ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
          : tone === "soon"
            ? "border-amber-400/45 bg-amber-400/10 text-amber-200"
            : "border-white/10 bg-white/[0.04] text-[#c9d1d8] hover:text-foreground",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </HubLink>
  );
}

function AccountMenu({
  name,
  email,
  status,
}: {
  name: string;
  email: string;
  status: UgcHome["creator"]["status"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 rounded-full p-1 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
          aria-label="Account menu"
        >
          <Monogram name={name} className="size-8" />
          <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-64 rounded-2xl border-white/10">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
          <CreatorStatusChip status={status} className="mt-2" />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-10">
          <a href={UGC_ROUTES.profile}>
            <UserRound className="size-4" aria-hidden /> Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-10">
          <a href={`mailto:${UGC.supportEmail}`}>
            <LifeBuoy className="size-4" aria-hidden /> Get help
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={doSignOut} className="min-h-10">
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
