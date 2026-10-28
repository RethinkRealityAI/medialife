import { useId, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Box,
  Check,
  Download,
  FileUp,
  Loader2,
  PackageCheck,
  PackageOpen,
  Phone,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { formatDate } from "@/components/admin/format";
import { EmptyState, PageBody, PageHeader, Panel, well } from "@/components/admin/kit";
import { CheckRow, errorMessage, ghostBtn, outlineBtn } from "@/components/admin/creators/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminExportUgcShippingCsv,
  adminImportUgcTrackingCsv,
  adminMarkUgcPacked,
} from "@/lib/ugc/admin.functions";
import { parseTrackingCsv } from "@/lib/ugc/import";
import { cn } from "@/lib/utils";

import { MarkDeliveredDialog, MarkShippedDialog, type ShipTarget } from "./shipping-kit";
import type { PipelineCampaign, ShippingRow } from "./types";
import { TonePill, UgcStatusPill, addressLines, plural, saveText, useBulk } from "./ui";

export const SHIPPING_VIEWS = ["to-ship", "in-transit", "delivered", "all"] as const;
export type ShippingView = (typeof SHIPPING_VIEWS)[number];
const VIEW_LABEL: Record<ShippingView, string> = {
  "to-ship": "To ship",
  "in-transit": "In transit",
  delivered: "Delivered",
  all: "All",
};

const stageOf = (r: ShippingRow): Exclude<ShippingView, "all"> =>
  r.shipment?.deliveredAt ? "delivered" : r.shipment?.shippedAt ? "in-transit" : "to-ship";

export function ShippingPage({
  rows,
  campaigns,
  view,
  campaignId,
  onView,
  onCampaign,
}: {
  rows: ShippingRow[];
  campaigns: (PipelineCampaign & { items?: string[] })[];
  view: ShippingView;
  campaignId: string;
  onView: (v: ShippingView) => void;
  onCampaign: (id: string) => void;
}) {
  const bulk = useBulk();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const itemsByCampaign = new Map(campaigns.map((c) => [c.id, c.items ?? []]));
  // Same fallback as the CSV export: the shipment's own items, else the campaign's package.
  const packageOf = (r: ShippingRow) =>
    (r.shipment?.items.length
      ? r.shipment.items
      : (r.campaignId && itemsByCampaign.get(r.campaignId)) || []
    ).join(" + ");
  const [ship, setShip] = useState<(ShipTarget & { campaignId: string | null }) | null>(null);
  const [deliver, setDeliver] = useState<ShippingRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const counts = useMemo(() => {
    const c: Record<ShippingView, number> = {
      "to-ship": 0,
      "in-transit": 0,
      delivered: 0,
      all: rows.length,
    };
    for (const r of rows) c[stageOf(r)]++;
    return c;
  }, [rows]);
  const shown = rows.filter((r) => view === "all" || stageOf(r) === view);
  const picked = shown.filter((r) => selected.has(r.creatorId));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const pick = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const missing = rows.filter((r) => stageOf(r) === "to-ship" && !r.address).length;

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await adminExportUgcShippingCsv({ data: { campaignId: campaignId || undefined } });
      if (!r.count) {
        toast.info("Nothing to export: every package has shipped.");
        return;
      }
      await saveText(r.csv, r.filename);
      toast.success(
        `Exported ${plural(r.count, "package")}${r.missingAddress.length ? `; ${r.missingAddress.length} without an address` : ""}`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Shipping"
        icon={Truck}
        tone="sky"
        description="Approved creators waiting for their package. Export a CSV for your fulfilment tool, then add tracking one by one or in bulk."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className={`h-9 bg-black/30 backdrop-blur ${outlineBtn}`}
              onClick={() => setImporting(true)}
            >
              <FileUp aria-hidden />
              Import tracking CSV
            </Button>
            <Button size="sm" className="h-9" onClick={exportCsv} disabled={exporting}>
              {exporting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              Export CSV
            </Button>
          </>
        }
      />
      <PageBody>
        {missing ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-400/35 bg-[linear-gradient(90deg,rgb(251_191_36/0.12),rgb(251_191_36/0.03))] px-4 py-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-medium">
                {plural(missing, "creator has", "creators have")} no address yet.
              </span>{" "}
              <span className="text-muted-foreground">
                They can add it in their profile, or you can on their page.
              </span>
            </span>
          </div>
        ) : null}
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
            <div
              role="group"
              aria-label="Show"
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {SHIPPING_VIEWS.map((v) => {
                const on = v === view;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      onView(v);
                      setSelected(new Set());
                    }}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition-colors ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--partner)]",
                      on
                        ? "bg-[color-mix(in_oklab,var(--partner)_22%,transparent)] text-white ring-[color-mix(in_oklab,var(--partner)_55%,transparent)]"
                        : "bg-white/[0.04] text-white/75 ring-white/[0.1] hover:bg-white/[0.08] hover:text-white",
                    )}
                  >
                    {VIEW_LABEL[v]}
                    <span
                      className={cn(
                        "tabular-nums",
                        on
                          ? ""
                          : v === "to-ship" && counts[v]
                            ? "font-semibold text-sky-300"
                            : "opacity-60",
                      )}
                    >
                      {counts[v]}
                    </span>
                  </button>
                );
              })}
            </div>
            {campaigns.length > 1 ? (
              <Select
                value={campaignId || "__any"}
                onValueChange={(v) => onCampaign(v === "__any" ? "" : v)}
              >
                <SelectTrigger
                  className="h-10 w-full rounded-xl bg-black/30 sm:w-60"
                  aria-label="Campaign"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Current campaign</SelectItem>
                  <SelectSeparator />
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {picked.length ? (
            <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-t border-[color-mix(in_oklab,var(--partner)_35%,transparent)] bg-[color-mix(in_oklab,var(--partner-ink)_88%,transparent)] px-3 py-2.5 backdrop-blur-xl sm:px-4">
              <span className="mr-1 text-sm font-medium tabular-nums">
                {picked.length} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                className={outlineBtn}
                disabled={
                  bulk.busy || !picked.some((r) => !r.shipment?.packedAt && !r.shipment?.shippedAt)
                }
                onClick={async () => {
                  await bulk.run(
                    "packed",
                    () =>
                      adminMarkUgcPacked({
                        data: {
                          creatorIds: picked.map((r) => r.creatorId),
                          campaignId: campaignId || undefined,
                        },
                      }),
                    "Marked packed:",
                  );
                  setSelected(new Set());
                }}
              >
                <Box aria-hidden />
                Mark packed
              </Button>
              <Button
                size="sm"
                disabled={bulk.busy || !picked.some((r) => !r.shipment?.deliveredAt)}
                onClick={() => setDeliver(picked.filter((r) => !r.shipment?.deliveredAt))}
              >
                <PackageCheck aria-hidden />
                Mark delivered
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("ml-auto", ghostBtn)}
                onClick={() => setSelected(new Set())}
              >
                <X aria-hidden />
                Clear
              </Button>
            </div>
          ) : null}

          {!shown.length ? (
            <div className="border-t border-white/[0.06] p-4">
              <EmptyState
                icon={view === "to-ship" ? PackageCheck : PackageOpen}
                tone={view === "to-ship" && rows.length ? "mint" : "slate"}
                title={
                  !rows.length
                    ? "Nobody to ship to yet"
                    : view === "to-ship"
                      ? "Every package has shipped"
                      : `Nothing ${VIEW_LABEL[view].toLowerCase()}`
                }
                action={
                  !rows.length ? (
                    <Button asChild>
                      <Link to="/admin/ugc" search={{ status: "applied" }}>
                        Review sign-ups
                      </Link>
                    </Button>
                  ) : null
                }
              >
                {!rows.length ? "Creators show up here once you approve them." : null}
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="hidden border-t border-white/[0.06] @4xl/inset:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">Packages</caption>
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-[11px] font-medium tracking-wide text-white/55 uppercase">
                      <th scope="col" className="w-11 py-2.5 pr-1 pl-5">
                        <Checkbox
                          checked={allPicked ? true : picked.length ? "indeterminate" : false}
                          onCheckedChange={(v) =>
                            setSelected(
                              v === true ? new Set(shown.map((r) => r.creatorId)) : new Set(),
                            )
                          }
                          aria-label="Select all shown"
                        />
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-normal">
                        Creator
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-normal">
                        Ship to
                      </th>
                      <th
                        scope="col"
                        className="hidden px-3 py-2.5 font-normal @6xl/inset:table-cell"
                      >
                        Package
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-normal">
                        Tracking
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-normal">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {shown.map((r) => (
                      <tr
                        key={r.creatorId}
                        className={cn(
                          "align-top",
                          selected.has(r.creatorId) &&
                            "bg-[color-mix(in_oklab,var(--partner)_7%,transparent)]",
                        )}
                      >
                        <td className="py-3.5 pr-1 pl-5">
                          <Checkbox
                            checked={selected.has(r.creatorId)}
                            onCheckedChange={(v) => pick(r.creatorId, v === true)}
                            aria-label={`Select ${r.creatorName || r.name}`}
                          />
                        </td>
                        <td className="max-w-[15rem] px-3 py-3">
                          <CreatorCell r={r} />
                        </td>
                        <td className="max-w-[18rem] px-3 py-3">
                          <AddressCell r={r} />
                        </td>
                        <td className="hidden max-w-[14rem] px-3 py-3 text-xs text-white/75 @6xl/inset:table-cell">
                          {packageOf(r) || r.campaignTitle || "–"}
                        </td>
                        <td className="px-3 py-3">
                          <TrackingCell r={r} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <RowActions
                            r={r}
                            onShip={() => setShip(shipTarget(r))}
                            onDeliver={() => setDeliver([r])}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06] @4xl/inset:hidden">
                {shown.map((r) => (
                  <li
                    key={r.creatorId}
                    className={cn(
                      "flex gap-3 px-4 py-4",
                      selected.has(r.creatorId) &&
                        "bg-[color-mix(in_oklab,var(--partner)_7%,transparent)]",
                    )}
                  >
                    <Checkbox
                      checked={selected.has(r.creatorId)}
                      onCheckedChange={(v) => pick(r.creatorId, v === true)}
                      aria-label={`Select ${r.creatorName || r.name}`}
                      className="mt-0.5 size-5"
                    />
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <CreatorCell r={r} />
                      <div className={cn("p-3", well)}>
                        <AddressCell r={r} />
                      </div>
                      <TrackingCell r={r} />
                      <RowActions
                        r={r}
                        onShip={() => setShip(shipTarget(r))}
                        onDeliver={() => setDeliver([r])}
                        align="start"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </PageBody>
      <MarkShippedDialog
        target={ship}
        campaignId={ship?.campaignId}
        onClose={() => setShip(null)}
      />
      <MarkDeliveredDialog
        targets={deliver.map((r) => ({ creatorId: r.creatorId, name: r.creatorName || r.name }))}
        campaignId={campaignId || undefined}
        onClose={() => setDeliver([])}
        onDone={() => setSelected(new Set())}
      />
      <TrackingCsvDialog
        open={importing}
        onClose={() => setImporting(false)}
        campaignId={campaignId}
      />
    </>
  );
}

const shipTarget = (r: ShippingRow) => ({
  creatorId: r.creatorId,
  name: r.creatorName || r.name,
  carrier: r.shipment?.carrier,
  tracking: r.shipment?.tracking,
  campaignId: r.campaignId,
});

function CreatorCell({ r }: { r: ShippingRow }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/admin/ugc/creators/$creatorId"
          params={{ creatorId: r.creatorId }}
          search={{ tab: "shipping" }}
          className="truncate font-medium hover:underline"
        >
          {r.creatorName || r.name}
        </Link>
        {r.status === "paused" ? <UgcStatusPill status="paused" /> : null}
      </div>
      <div className="truncate text-xs text-muted-foreground">{r.email}</div>
      {r.campaignTitle ? (
        <div className="truncate text-xs text-muted-foreground/80">{r.campaignTitle}</div>
      ) : null}
    </div>
  );
}

function AddressCell({ r }: { r: ShippingRow }) {
  const lines = addressLines(r.address);
  return (
    <div className="min-w-0 text-xs leading-relaxed">
      {lines.length ? (
        <address className="not-italic">
          {lines.map((l, i) => (
            <span key={i} className={cn("block", i === 0 && "font-medium text-white/90")}>
              {l}
            </span>
          ))}
        </address>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-amber-200">
          <AlertTriangle className="size-3.5" aria-hidden />
          No address yet
        </span>
      )}
      {r.phone ? (
        <a
          href={`tel:${r.phone}`}
          className="mt-1 inline-flex items-center gap-1.5 text-muted-foreground hover:text-white"
        >
          <Phone className="size-3" aria-hidden />
          {r.phone}
        </a>
      ) : null}
    </div>
  );
}

function TrackingCell({ r }: { r: ShippingRow }) {
  const sh = r.shipment;
  const stage = stageOf(r);
  return (
    <div className="min-w-0 space-y-1 text-xs">
      <TonePill
        tone={
          stage === "delivered"
            ? "emerald"
            : stage === "in-transit"
              ? "sky"
              : sh?.packedAt
                ? "violet"
                : "slate"
        }
      >
        {stage === "delivered"
          ? "Delivered"
          : stage === "in-transit"
            ? "In transit"
            : sh?.packedAt
              ? "Packed"
              : "Not packed"}
      </TonePill>
      {sh?.shippedAt ? (
        <div className="text-muted-foreground">
          {sh.carrier ? `${sh.carrier} · ` : ""}
          {sh.trackingUrl ? (
            <a
              href={sh.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="mono text-sky-300 hover:underline"
            >
              {sh.tracking}
            </a>
          ) : (
            <span className="mono">{sh.tracking || "no tracking"}</span>
          )}
          <span className="block" suppressHydrationWarning>
            Shipped {formatDate(sh.shippedAt)}
            {sh.deliveredAt ? ` · delivered ${formatDate(sh.deliveredAt)}` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RowActions({
  r,
  onShip,
  onDeliver,
  align = "end",
}: {
  r: ShippingRow;
  onShip: () => void;
  onDeliver: () => void;
  align?: "start" | "end";
}) {
  const sh = r.shipment;
  if (sh?.deliveredAt)
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-emerald-300",
          align === "end" && "justify-end",
        )}
      >
        <Check className="size-3.5" aria-hidden />
        Done
      </span>
    );
  return (
    <div className={cn("flex flex-wrap gap-2", align === "end" ? "justify-end" : "justify-start")}>
      {sh?.shippedAt ? (
        <>
          <Button size="sm" variant="ghost" className={ghostBtn} onClick={onShip}>
            Edit
          </Button>
          <Button size="sm" variant="outline" className={outlineBtn} onClick={onDeliver}>
            <PackageCheck aria-hidden />
            Delivered
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          onClick={onShip}
          disabled={r.status === "paused"}
          title={r.status === "paused" ? "Paused creators can't be shipped to" : undefined}
        >
          <Truck aria-hidden />
          Mark shipped
        </Button>
      )}
    </div>
  );
}

function TrackingCsvDialog({
  open,
  onClose,
  campaignId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
}) {
  const uid = useId();
  const bulk = useBulk();
  const [csv, setCsv] = useState("");
  const [notify, setNotify] = useState(true);
  const [results, setResults] = useState<{ email?: string; ok: boolean; error?: string }[] | null>(
    null,
  );
  const parsed = useMemo(() => parseTrackingCsv(csv), [csv]);
  const close = () => {
    onClose();
    setCsv("");
    setResults(null);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import tracking numbers</DialogTitle>
          <DialogDescription>
            One package per line: <span className="mono text-xs">email,carrier,tracking</span> (a
            header row and a fourth <span className="mono text-xs">url</span> column are optional).
            Each creator is marked shipped.
          </DialogDescription>
        </DialogHeader>
        {results ? (
          <ul
            className={cn("max-h-72 divide-y divide-white/[0.06] overflow-y-auto text-sm", well)}
            data-testid="tracking-results"
          >
            {results.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                {r.ok ? (
                  <Check className="size-4 text-emerald-300" aria-hidden />
                ) : (
                  <X className="size-4 text-red-300" aria-hidden />
                )}
                <span className="mono min-w-0 flex-1 truncate text-xs">
                  {r.email || "(no email)"}
                </span>
                <span className={cn("text-xs", r.ok ? "text-emerald-200" : "text-red-200")}>
                  {r.ok ? "Shipped" : r.error}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <Textarea
              id={`${uid}-csv`}
              aria-label="Tracking CSV"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={7}
              className="mono text-xs"
              placeholder={"email,carrier,tracking\nsam@example.com,USPS,9400111899223817"}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-sky-300 hover:underline">
                <FileUp className="size-4" aria-hidden />
                Choose a CSV file
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setCsv(await f.text());
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-muted-foreground">
                {parsed.length ? plural(parsed.length, "row") : "No rows yet"}
              </span>
            </div>
            <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
              Email each creator their tracking link
            </CheckRow>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {results ? "Done" : "Cancel"}
          </Button>
          {!results ? (
            <Button
              disabled={bulk.busy || !parsed.length}
              onClick={async () => {
                const r = await bulk.run(
                  "tracking",
                  () =>
                    adminImportUgcTrackingCsv({
                      data: { csv, notify, campaignId: campaignId || undefined },
                    }),
                  "Marked shipped:",
                );
                if (r) setResults(r);
              }}
            >
              {bulk.busy ? <Loader2 className="animate-spin" aria-hidden /> : <Truck aria-hidden />}
              Mark {parsed.length ? plural(parsed.length, "package") : "packages"} shipped
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
