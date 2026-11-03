import { useCallback, useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  ExternalLink,
  FileInput,
  Megaphone,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton, well } from "@/components/admin/kit";
import { errorMessage } from "@/components/admin/creators/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UGC_PLATFORM_LABELS,
  UGC_PLATFORMS,
  UGC_STATUS_LABELS,
  UGC_STATUS_TONES,
  UGC_SUBMISSION_STATUS_LABELS,
  ugcHandleUrl,
  type ShippingAddress,
  type UgcCampaignStatus,
  type UgcPlatform,
  type UgcStatus,
  type UgcSubmissionStatus,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

// Pieces every /admin/ugc screen shares: status pills, handle links, the
// section nav and the bulk-result helpers. Built on the admin kit
// (src/components/admin/kit.tsx) so the UGC Hub reads as part of /admin.

/* ── Pills ────────────────────────────────────────────────────────────────── */

type PillTone = "slate" | "sky" | "violet" | "amber" | "emerald" | "rose";

const PILL: Record<PillTone, string> = {
  slate: "from-white/[0.1] to-white/[0.03] text-white/75 ring-white/15",
  sky: "from-sky-400/25 to-sky-400/[0.06] text-sky-200 ring-sky-400/35",
  violet: "from-violet-400/25 to-violet-400/[0.06] text-violet-200 ring-violet-400/35",
  amber: "from-amber-400/25 to-amber-400/[0.06] text-amber-200 ring-amber-400/40",
  emerald: "from-emerald-400/25 to-emerald-400/[0.06] text-emerald-200 ring-emerald-400/35",
  rose: "from-red-400/25 to-red-400/[0.06] text-red-200 ring-red-400/40",
};

export function TonePill({
  tone,
  children,
  dot = true,
  className,
  title,
}: {
  tone: PillTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br px-2.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        PILL[tone],
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-current shadow-[0_0_6px_currentColor]"
        />
      ) : null}
      {children}
    </span>
  );
}

export function UgcStatusPill({ status, className }: { status: UgcStatus; className?: string }) {
  return (
    <TonePill tone={UGC_STATUS_TONES[status]} className={className}>
      {UGC_STATUS_LABELS[status]}
    </TonePill>
  );
}

export const SUBMISSION_TONES: Record<UgcSubmissionStatus, PillTone> = {
  uploading: "slate",
  "in-review": "violet",
  "changes-requested": "amber",
  approved: "emerald",
  posted: "emerald",
  rejected: "slate",
};

export function SubmissionPill({ status }: { status: UgcSubmissionStatus }) {
  return (
    <TonePill tone={SUBMISSION_TONES[status]}>{UGC_SUBMISSION_STATUS_LABELS[status]}</TonePill>
  );
}

const CAMPAIGN_TONES: Record<UgcCampaignStatus, PillTone> = {
  draft: "slate",
  live: "emerald",
  closed: "sky",
};
const CAMPAIGN_LABELS: Record<UgcCampaignStatus, string> = {
  draft: "Draft",
  live: "Live",
  closed: "Closed",
};

export function CampaignPill({ status }: { status: UgcCampaignStatus }) {
  return <TonePill tone={CAMPAIGN_TONES[status]}>{CAMPAIGN_LABELS[status]}</TonePill>;
}

/* ── Platforms ────────────────────────────────────────────────────────────── */

export const PLATFORM_SHORT: Record<UgcPlatform, string> = {
  roblox: "Roblox",
  instagram: "IG",
  youtube: "YT",
  discord: "Discord",
  x: "X",
  tiktok: "TikTok",
  twitch: "Twitch",
};

const isPlatform = (p: string | null | undefined): p is UgcPlatform =>
  !!p && (UGC_PLATFORMS as readonly string[]).includes(p);

/** The main platform's handle as a link, with the other platforms as small chips. */
export function MainHandle({
  mainPlatform,
  platforms,
  handles,
  className,
  plain,
}: {
  mainPlatform: string | null;
  platforms: string[];
  handles: Partial<Record<UgcPlatform, string>> | undefined;
  className?: string;
  /** No links (inside another link, e.g. a phone card). */
  plain?: boolean;
}) {
  const ps = platforms.filter(isPlatform);
  const main = isPlatform(mainPlatform) ? mainPlatform : (ps[0] ?? null);
  if (!main) return <span className="text-xs text-muted-foreground/70">No platforms</span>;
  const others = ps.filter((p) => p !== main);
  const handle = handles?.[main];
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      <span className="shrink-0 rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/[0.1] ring-inset">
        {PLATFORM_SHORT[main]}
      </span>
      {handle ? (
        plain ? (
          <span className="min-w-0 truncate text-xs text-white/80">
            {handle.replace(/^https?:\/\/(www\.)?/i, "")}
          </span>
        ) : (
          <HandleLink platform={main} handle={handle} className="text-xs" />
        )
      ) : null}
      {others.map((p) => {
        const h = handles?.[p];
        const url = h && !plain ? ugcHandleUrl(p, h) : null;
        const cls =
          "rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-white/[0.06] ring-inset";
        return url ? (
          <a
            key={p}
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`${UGC_PLATFORM_LABELS[p]}: ${h}`}
            className={cn(cls, "hover:text-white")}
          >
            {PLATFORM_SHORT[p]}
          </a>
        ) : (
          <span key={p} className={cls} title={h ? `${UGC_PLATFORM_LABELS[p]}: ${h}` : undefined}>
            {PLATFORM_SHORT[p]}
          </span>
        );
      })}
    </div>
  );
}

export function HandleLink({
  platform,
  handle,
  className,
}: {
  platform: UgcPlatform;
  handle: string;
  className?: string;
}) {
  const url = ugcHandleUrl(platform, handle);
  const label = handle.replace(/^https?:\/\/(www\.)?/i, "");
  if (!url)
    return (
      <span className={cn("min-w-0 truncate", className)} title={handle}>
        {label}
      </span>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 truncate text-sky-300 hover:underline",
        className,
      )}
      title={`Open ${UGC_PLATFORM_LABELS[platform]}`}
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

/** The audience band for the main platform (what the form asked). */
export function mainAudience(c: {
  mainPlatform: string | null;
  platforms: string[];
  audiences?: Partial<Record<UgcPlatform, string>>;
}): string | null {
  const main = isPlatform(c.mainPlatform) ? c.mainPlatform : c.platforms.find(isPlatform);
  return (main && c.audiences?.[main]) || null;
}

/* ── Section nav ──────────────────────────────────────────────────────────── */

const SECTIONS: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: "/admin/ugc", label: "Pipeline", icon: Users, exact: true },
  { to: "/admin/ugc/review", label: "Review", icon: Clapperboard },
  { to: "/admin/ugc/shipping", label: "Shipping", icon: Truck },
  { to: "/admin/ugc/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/admin/ugc/import", label: "Import", icon: FileInput },
];

/** The UGC Hub's own sections, as a slim bar above each page. */
export function UgcNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/$/, "");
  const at = (s: (typeof SECTIONS)[number]) =>
    s.exact
      ? pathname === s.to || pathname.startsWith(`${s.to}/creators`)
      : pathname === s.to || pathname.startsWith(`${s.to}/`);
  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8">
      <nav
        aria-label="UGC Hub sections"
        className="glass-strong -mx-0.5 flex gap-1 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((s) => {
          const active = at(s);
          return (
            <Link
              key={s.to}
              to={s.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-white/65 transition-colors hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--partner)]",
                active && "glass-pill text-white [&>svg]:text-[var(--partner)]",
              )}
            >
              <s.icon className="size-4" aria-hidden />
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ── Bulk results ─────────────────────────────────────────────────────────── */

export type RowResult = {
  ok: boolean;
  error?: string;
  id?: string;
  creatorId?: string | null;
  email?: string;
  devLink?: string;
  emailed?: boolean;
};

/**
 * Runs a bulk action that answers { results: [...] }: toasts how many worked,
 * reloads the route's data and hands back the results (null when it threw).
 */
export function useBulk() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <R extends RowResult>(
      key: string,
      fn: () => Promise<{ results: R[] }>,
      verb: string,
    ): Promise<R[] | null> => {
      setPending(key);
      try {
        const { results } = await fn();
        const ok = results.filter((r) => r.ok).length;
        const bad = results.length - ok;
        if (ok && !bad) toast.success(`${verb} ${ok === 1 ? "1 creator" : `${ok} creators`}`);
        else if (ok) toast.warning(`${verb} ${ok}; ${bad} couldn't be: ${firstError(results)}`);
        else toast.error(firstError(results) ?? "That didn't work. Try again.");
        await router.invalidate();
        return results;
      } catch (err) {
        toast.error(errorMessage(err));
        return null;
      } finally {
        setPending(null);
      }
    },
    [router],
  );
  return { pending, run, busy: pending !== null };
}

const firstError = (rs: RowResult[]) => rs.find((r) => !r.ok)?.error ?? null;

/** After an approval on localhost/previews: the join links that would have been emailed. */
export function JoinLinksDialog({
  links,
  onClose,
}: {
  links: { name: string; email: string; devLink: string }[];
  onClose: () => void;
}) {
  return (
    <Dialog open={links.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Join links</DialogTitle>
          <DialogDescription>
            Email isn't set up here (no RESEND_API_KEY), so nothing was sent. These are the links
            the join emails would carry. Each works once, for 7 days.
          </DialogDescription>
        </DialogHeader>
        <ul className={cn("divide-y divide-white/[0.06] text-sm", well)} data-testid="join-links">
          {links.map((l) => (
            <li key={l.email} className="flex items-center gap-3 py-2 pr-1 pl-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.name}</div>
                <a
                  href={l.devLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mono block truncate text-[11px] text-sky-300 hover:underline"
                >
                  {l.devLink}
                </a>
              </div>
              <CopyButton text={l.devLink} label="Copy join link" toastText="Join link copied" />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

/** 42 → "0:42", 125 → "2:05". */
export function formatSeconds(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s)) return null;
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function addressLines(a: ShippingAddress | null | undefined): string[] {
  if (!a) return [];
  return [
    a.name,
    a.line1,
    a.line2,
    [a.city, a.region, a.postalCode].filter(Boolean).join(", "),
    a.country,
  ].filter((l) => l && l.trim());
}

/** ms → "yyyy-mm-dd" for <input type="date"> in local time. */
export function toDateInput(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "yyyy-mm-dd" → the end of that day, local time (a deadline means "by the end of"). */
export function fromDateInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0).getTime();
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Saves text as a download (CSV exports). */
export async function saveText(text: string, filename: string, type = "text/csv") {
  const { saveBlob } = await import("@/lib/hub/download-client");
  saveBlob(new Blob([text], { type }), filename);
}

/** Pages with nothing loaded yet. */
export function PageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-5 px-4 pt-4 pb-6 sm:px-6 lg:px-8">
      <div className="h-32 animate-pulse rounded-3xl bg-white/[0.04]" />
      <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />
      ))}
    </div>
  );
}
