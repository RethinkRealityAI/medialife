import { useQuery } from "@tanstack/react-query";
import {
  Box,
  CircleDot,
  DoorOpen,
  Eye,
  Flag,
  Gamepad2,
  Gift,
  LayoutDashboard,
  Link2,
  Lock,
  LockOpen,
  Mail,
  Map as MapIcon,
  MessageSquare,
  MousePointerClick,
  Package,
  Palette,
  Presentation,
  QrCode,
  Rocket,
  ShieldAlert,
  ShoppingCart,
  SkipForward,
  Smartphone,
  SunMoon,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionDetail } from "@/lib/ar/analytics.functions";
import type { SessionRow } from "@/lib/ar/analytics.server";
import type { StoredEvent } from "@/lib/ar/events";
import { cn } from "@/lib/utils";

import {
  deviceLabel,
  eventDetail,
  eventLabel,
  formatDateTime,
  formatDuration,
  formatOffset,
  isUnauthorized,
  place,
} from "../format";
import { Eyebrow } from "../kit";
import { HighlightChips } from "./chips";

const ICONS: Record<string, LucideIcon> = {
  session_start: CircleDot,
  link_resolved: Link2,
  gate_view: Lock,
  gate_unlock: LockOpen,
  gate_fail: ShieldAlert,
  enter: DoorOpen,
  tour_step: MapIcon,
  tour_finish: Flag,
  tour_skip: SkipForward,
  theme: Palette,
  light: SunMoon,
  mode: Eye,
  hotspot: MousePointerClick,
  product_open: Package,
  add_to_cart: ShoppingCart,
  cart_open: ShoppingCart,
  checkout: ShoppingCart,
  order: ShoppingCart,
  activation_open: Smartphone,
  activation_launch: Rocket,
  game_start: Gamepad2,
  game_end: Gamepad2,
  reward_redeem: Gift,
  ar_open: Box,
  ar_qr: QrCode,
  present_start: Presentation,
  present_stop: Presentation,
  cta_open: MessageSquare,
  lead_submit: Mail,
  custom_ip: Wand2,
  dash_open: LayoutDashboard,
};

// The moments a follow-up cares about get the accent.
const KEY_EVENTS = new Set([
  "product_open",
  "activation_open",
  "activation_launch",
  "game_start",
  "reward_redeem",
  "ar_open",
  "ar_qr",
  "cta_open",
  "lead_submit",
  "order",
]);

interface Step {
  at: number;
  n: string;
  label: string;
  detail: string | null;
  count: number;
}

/** Ordered steps; a run of tour steps collapses into one line. */
function toSteps(events: StoredEvent[], start: number): Step[] {
  const out: Step[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (e.n === "tour_step" && prev?.n === "tour_step") {
      prev.count++;
      const title = eventDetail(e);
      prev.label = `Tour: ${prev.count} steps`;
      prev.detail = [prev.detail, title?.replace(/^Step \d+: /, "")].filter(Boolean).join(" → ");
      continue;
    }
    out.push({
      at: e.ts - start,
      n: e.n,
      label: eventLabel(e.n),
      detail:
        e.n === "tour_step" ? (eventDetail(e)?.replace(/^Step \d+: /, "") ?? null) : eventDetail(e),
      count: 1,
    });
  }
  return out;
}

function referrer(ref: string | null): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return ref;
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export function SessionSheet({
  sessionKey,
  row,
  demoName,
  onOpenChange,
  onFilterClient,
}: {
  sessionKey: string | null;
  row: SessionRow | undefined;
  demoName: (id: string) => string;
  onOpenChange: (open: boolean) => void;
  onFilterClient: (clientId: string) => void;
}) {
  const q = useQuery({
    queryKey: ["ar-session", sessionKey],
    queryFn: () => getSessionDetail({ data: { key: sessionKey! } }),
    enabled: !!sessionKey,
    staleTime: 30_000,
  });
  const d = q.data;
  const s = d?.session;
  const title = d
    ? (d.client ?? "Direct visit")
    : (row?.client ?? (row ? "Direct visit" : "Visit"));
  const startedAt = s?.startedAt ?? row?.startedAt;
  const demo = d?.demo ?? (row ? demoName(row.demo) : null);
  const clientId = row?.clientId ?? (s?.link ? s.link : null);
  const steps = s ? toSteps(s.events, s.startedAt) : [];

  return (
    <Sheet open={!!sessionKey} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 pt-5 pb-4 text-left">
          <Eyebrow>Visit</Eyebrow>
          <SheetTitle className="pr-8 text-xl font-medium tracking-tight">{title}</SheetTitle>
          <SheetDescription>
            {[demo, startedAt ? formatDateTime(startedAt) : null].filter(Boolean).join(" · ")}
          </SheetDescription>
          {clientId && clientId !== "none" && d?.client ? (
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent hover:bg-white/[0.06] hover:text-foreground"
                onClick={() => onFilterClient(clientId)}
              >
                All visits from {d.client}
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {q.isError ? (
            <p className="text-sm text-destructive">
              {isUnauthorized(q.error)
                ? "Your session has ended. Reload the page and sign in again."
                : "Couldn't load this visit."}
            </p>
          ) : q.isPending ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-10 bg-white/[0.05]" />
                ))}
              </div>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-8 bg-white/[0.05]" />
              ))}
            </div>
          ) : !d || !s ? (
            <p className="text-sm text-muted-foreground">This visit no longer exists.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <Fact label="Engaged">{d.bounced ? "Bounced" : formatDuration(s.activeMs)}</Fact>
                <Fact label="Actions">{d.actions}</Fact>
                <Fact label="Device">{deviceLabel(s.device)}</Fact>
                <Fact label="Location">{place(s.geo)}</Fact>
                <Fact label="Screen">{s.screen ? s.screen.replace("x", " × ") : "Unknown"}</Fact>
                <Fact label="Came from">{referrer(s.ref) ?? "Typed or pasted link"}</Fact>
                {d.link ? (
                  <Fact label="Client link">
                    <span className="mono text-xs">?c={d.link.code}</span>
                    {d.link.state !== "active" ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">({d.link.state})</span>
                    ) : null}
                  </Fact>
                ) : null}
                {row && row.visitorVisits > 1 ? (
                  <Fact label="This browser">
                    Visit {row.visitNo} of {row.visitorVisits}
                  </Fact>
                ) : null}
              </dl>
              {row ? <HighlightChips highlights={row.highlights} className="mt-4" /> : null}

              <h3 className="mt-7 mb-3 text-sm font-medium">Journey</h3>
              <ol className="relative">
                {steps.map((st, i) => {
                  const Icon = ICONS[st.n] ?? CircleDot;
                  const key = KEY_EVENTS.has(st.n);
                  const last = i === steps.length - 1;
                  return (
                    <li key={i} className="relative flex gap-3 pb-3.5">
                      <span className="mono w-14 shrink-0 pt-1 text-right text-[11px] text-muted-foreground tabular-nums">
                        {formatOffset(st.at)}
                      </span>
                      <span className="relative flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "z-10 grid size-6 place-items-center rounded-full border",
                            key
                              ? "border-accent/50 bg-accent/15 text-accent"
                              : "border-border bg-card text-muted-foreground",
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        {!last ? (
                          <span aria-hidden className="absolute top-6 -bottom-3.5 w-px bg-border" />
                        ) : null}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <div className={cn("text-sm", key && "font-medium")}>{st.label}</div>
                        {st.detail ? (
                          <div className="mt-0.5 text-xs break-words text-muted-foreground">
                            {st.detail}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                Last activity {formatDateTime(s.lastAt)}. Times are from the start of the visit.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
