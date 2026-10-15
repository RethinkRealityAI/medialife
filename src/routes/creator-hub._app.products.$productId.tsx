import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Coins,
  ExternalLink,
  FileText,
  Info,
  LayoutDashboard,
  ListChecks,
  Maximize2,
  MessageSquare,
  PackageOpen,
  Palette,
  Percent,
  PencilLine,
  Play,
  QrCode,
  Receipt,
  ScanLine,
  Send,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { ExperiencePreview } from "@/components/hub/app/experience-preview";
import { FileGallery } from "@/components/hub/app/gallery";
import { Kpi } from "@/components/hub/app/kpi";
import { LIGHTBOX_CONTENT } from "@/components/hub/app/lightbox";
import { HubTab, HubTabs, Tile, surface, type TabDef } from "@/components/hub/app/look";
import { WaitingChip, waitingOnYou } from "@/components/hub/app/product-card";
import { TriggerCard } from "@/components/hub/app/qr-download";
import { ScanBars } from "@/components/hub/app/scan-bars";
import { StageTimeline, StageTrack } from "@/components/hub/app/stage-track";
import {
  Card,
  EmptyState,
  Facts,
  Page,
  PageHeader,
  Pill,
  TimeAgo,
  cardActionClass,
} from "@/components/hub/app/ui";
import { PRODUCT_TABS, productImage, type ProductTab } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { decideProof, getProductDetail, postMessage } from "@/lib/hub/creator.functions";
import {
  COLLATERAL_KINDS,
  EXPERIENCE_KINDS,
  EXPERIENCE_STATUS,
  SKUS,
  TRIGGER_METHODS,
  compact,
  fileUrl,
  isImage,
  money,
  pct,
  shortDate,
  stageOf,
  triggerUrl,
  type CollateralKind,
  type HubFile,
  type Message,
  type Proof,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/products/$productId")({
  validateSearch: z.object({
    tab: z.enum(PRODUCT_TABS).optional().catch(undefined),
    review: z.boolean().optional().catch(undefined),
  }),
  loader: async ({ params }) => {
    if (!/^[A-Za-z0-9]{6,60}$/.test(params.productId)) throw notFound();
    const detail = await getProductDetail({ data: { id: params.productId } });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.product.name ?? "Product"} · Creator Hub | MEDIALIFE` }],
  }),
  pendingComponent: ProductSkeleton,
  notFoundComponent: ProductNotFound,
  component: ProductPage,
});

type Detail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

const TAB_LOOK: Record<ProductTab, { label: string; icon: TabDef<ProductTab>["icon"] }> = {
  overview: { label: "Overview", icon: LayoutDashboard },
  design: { label: "Design", icon: Palette },
  experience: { label: "Experience & QR", icon: QrCode },
  kit: { label: "Launch kit", icon: BriefcaseBusiness },
  sales: { label: "Sales", icon: ShoppingBag },
  messages: { label: "Messages", icon: MessageSquare },
};

/** Messages from the team since the creator last wrote: the "unread" count. */
function unreadCount(thread: Message[]) {
  let n = 0;
  for (let i = thread.length - 1; i >= 0 && thread[i].author === "medialife"; i--) n++;
  return n;
}

function ProductNotFound() {
  return (
    <Page>
      <EmptyState
        icon={PackageOpen}
        title="We couldn't find that product"
        action={
          <Button asChild variant="outline">
            <Link to="/creator-hub/products">
              <ArrowLeft aria-hidden /> All products
            </Link>
          </Button>
        }
      >
        It may have been removed, or the link is from another account.
      </EmptyState>
    </Page>
  );
}

function ProductSkeleton() {
  return (
    <Page className="lg:pt-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-52 rounded-3xl" />
      <Skeleton className="mt-5 h-14 w-full rounded-[22px]" />
      <div className="mt-4 grid grid-cols-1 gap-4 @4xl/inset:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </Page>
  );
}

function ProductPage() {
  const d = Route.useLoaderData();
  const { tab = "overview", review } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { product } = d;
  const stage = stageOf(product.stage);
  const latest = product.proofs[product.proofs.length - 1];
  const pending = latest?.decision === "pending";
  const unread = unreadCount(d.thread);
  const [proofOpen, setProofOpen] = useState<string | null>(null);

  // ?review=1 (from "Review design") opens the proof straight away.
  useEffect(() => {
    if (review && latest) setProofOpen(latest.id);
  }, [review, latest]);

  const setTab = (t: ProductTab) =>
    navigate({
      search: (p) => ({ ...p, tab: t === "overview" ? undefined : t }),
      replace: true,
      resetScroll: false,
    });

  const closeProof = (o: boolean) => {
    if (o) return;
    setProofOpen(null);
    if (review)
      navigate({ search: (p) => ({ ...p, review: undefined }), replace: true, resetScroll: false });
  };

  return (
    <Page className="lg:pt-6">
      <Link
        to="/creator-hub/products"
        className="inline-flex items-center gap-1.5 rounded-full px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden /> All products
      </Link>

      <PageHeader
        className="mt-3"
        image={productImage(product)}
        imageClassName="opacity-100"
        eyebrow={`${SKUS[product.sku].name}${product.campaign ? ` · ${product.campaign}` : ""}`}
        title={product.name}
        description={
          <>
            <span className="flex flex-wrap items-center gap-2">
              <WaitingChip product={product} className="bg-black/50 backdrop-blur" />
              {product.stage !== "live" && product.eta ? (
                <span className="text-xs text-white/75">On sale ~ {shortDate(product.eta)}</span>
              ) : null}
            </span>
            <StageTrack stage={product.stage} className="mt-4 max-w-md" />
          </>
        }
        actions={
          pending ? (
            <Button size="lg" onClick={() => setProofOpen(latest.id)} className="rounded-full">
              <BadgeCheck aria-hidden /> Review design v{latest.version}
            </Button>
          ) : product.stage === "live" && product.commerce.shopUrl ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full bg-black/30 backdrop-blur"
            >
              <a href={product.commerce.shopUrl} target="_blank" rel="noreferrer">
                Open shop page <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              onClick={() => setTab("messages")}
              className="rounded-full bg-black/30 backdrop-blur"
            >
              <MessageSquare aria-hidden /> Message the team
            </Button>
          )
        }
      />

      <HubTabs<ProductTab>
        label="Product sections"
        value={tab}
        onChange={setTab}
        tabs={PRODUCT_TABS.map((t) => ({
          id: t,
          label: TAB_LOOK[t].label,
          icon: TAB_LOOK[t].icon,
          badge:
            t === "design" && pending ? (
              <span className="size-2 rounded-full bg-amber-400" aria-label="(needs you)" />
            ) : t === "messages" && unread ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--partner)] px-1 text-[10px] font-semibold text-[var(--partner-ink)] tabular-nums">
                {unread}
                <span className="sr-only"> new from the team</span>
              </span>
            ) : undefined,
        }))}
      >
        <HubTab value="overview">
          <Overview detail={d} onTab={setTab} />
        </HubTab>
        <HubTab value="design">
          <DesignTab detail={d} onOpen={(id) => setProofOpen(id)} />
        </HubTab>
        <HubTab value="experience">
          <ExperienceTab detail={d} />
        </HubTab>
        <HubTab value="kit">
          <KitTab detail={d} />
        </HubTab>
        <HubTab value="sales">
          <SalesTab detail={d} />
        </HubTab>
        <HubTab value="messages">
          <Thread productId={product.id} thread={d.thread} />
        </HubTab>
      </HubTabs>

      <ProofLightbox
        detail={d}
        proofId={proofOpen}
        onProofChange={setProofOpen}
        onOpenChange={closeProof}
      />
      <span className="sr-only" aria-live="polite">
        {stage.name}
      </span>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Overview
   --------------------------------------------------------------------------- */

function Overview({ detail: d, onTab }: { detail: Detail; onTab: (t: ProductTab) => void }) {
  const p = d.product;
  const live = p.stage === "live";
  const e = d.experience;
  return (
    <div className="grid grid-cols-1 gap-4 @4xl/inset:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Progress" icon={ListChecks} tone="blue" labelledBy="ov-progress">
        <StageTimeline product={p} />
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        {live ? (
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Sold" icon={ShoppingBag} tone="violet" value={compact(d.sales.units)} />
            <Kpi
              label="Earned"
              icon={Coins}
              tone="mint"
              value={money(d.sales.earned, p.currency)}
              emphasis
            />
            <Kpi label="Scans" icon={ScanLine} tone="pink" value={compact(d.scans.total)} />
          </div>
        ) : null}
        <Card title="At a glance" icon={Info} tone="ice" labelledBy="ov-glance">
          <Facts
            rows={[
              ...(!live && p.nextStep ? [["Next", p.nextStep] as [string, string]] : []),
              ["Who's on it", live ? "On sale" : waitingOnYou(p) ? "You" : "MEDIALIFE"],
              [
                live ? "On sale since" : "Expected on sale",
                live ? shortDate(p.stageUpdatedAt) : p.eta ? shortDate(p.eta) : "Date to be set",
              ],
              ["Retail price", p.price ? money(p.price, p.currency) : "To be set"],
              ...(p.units
                ? [["First run", `${p.units.toLocaleString("en-US")} units`] as [string, string]]
                : []),
              ["Your share", pct(d.revenueShare)],
              ["Opens with", TRIGGER_METHODS[p.trigger.method].label],
            ]}
          />
        </Card>
        <Card
          title="Experience"
          icon={Sparkles}
          tone="violet"
          labelledBy="ov-exp"
          action={
            <button type="button" onClick={() => onTab("experience")} className={cardActionClass}>
              Experience & QR
            </button>
          }
        >
          {e ? (
            <button
              type="button"
              onClick={() => onTab("experience")}
              className={cn(
                surface,
                "flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-[var(--partner)]/50 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
              )}
            >
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]"
                style={{ background: "var(--gradient-ember-btn)" }}
              >
                <Sparkles className="size-5 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {EXPERIENCE_KINDS[e.kind]} · {EXPERIENCE_STATUS[e.status].label}
                </div>
              </div>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chosen in the brief, and linked here once it's agreed.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Design
   --------------------------------------------------------------------------- */

function DecisionPill({ proof }: { proof: Proof }) {
  if (proof.decision === "approved")
    return (
      <Pill tone="live" icon={BadgeCheck}>
        Approved
      </Pill>
    );
  if (proof.decision === "changes")
    return (
      <Pill tone="accent" icon={PencilLine}>
        Changes requested
      </Pill>
    );
  return <Pill tone="watch">Waiting for you</Pill>;
}

function ProofImage({ file, className }: { file: HubFile | undefined; className?: string }) {
  if (file && isImage(file.mime)) {
    return <img src={fileUrl(file)} alt="" className={cn("object-contain", className)} />;
  }
  return (
    <span
      className={cn("grid place-items-center bg-white/[0.03] text-muted-foreground", className)}
    >
      <FileText className="size-8" aria-hidden />
    </span>
  );
}

function DesignTab({ detail: d, onOpen }: { detail: Detail; onOpen: (proofId: string) => void }) {
  const proofs = d.product.proofs;
  const latest = proofs[proofs.length - 1];
  const fileOf = (p: Proof) => d.files.find((f) => f.id === p.fileId);

  if (!latest) {
    const past = ["sampling", "production", "shipping", "live"].includes(d.product.stage);
    return (
      <EmptyState
        icon={PencilLine}
        title={past ? "Approved before the hub" : "No design to review yet"}
      >
        {past
          ? "This design was approved before proofs moved into the hub."
          : "Once your artwork is in, we prepare a proof and it shows up here for you to approve or change. Nothing is made until you approve."}
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 @4xl/inset:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <button
        type="button"
        onClick={() => onOpen(latest.id)}
        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[conic-gradient(at_50%_50%,#121218_25%,#17171f_0_50%,#121218_0_75%,#17171f_0)] bg-[length:24px_24px] shadow-[0_20px_40px_-24px_rgb(0_0_0/0.9)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Open design version ${latest.version} full screen`}
      >
        <ProofImage file={fileOf(latest)} className="mx-auto h-64 w-full sm:h-80" />
        <span className="glass absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white">
          <Maximize2 className="size-3.5" aria-hidden /> Full screen
        </span>
      </button>
      <Card
        title={`Version ${latest.version}`}
        icon={Palette}
        tone="violet"
        labelledBy="design-latest"
        action={<DecisionPill proof={latest} />}
      >
        <p className="text-xs text-muted-foreground">Sent {shortDate(latest.createdAt)}</p>
        {latest.note ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed">
            <span className="block text-xs text-muted-foreground">From MEDIALIFE</span>
            {latest.note}
          </p>
        ) : null}
        {latest.decision === "pending" ? (
          <div className="mt-auto pt-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Nothing is produced until you approve.
            </p>
            <Button className="h-11 w-full rounded-full" onClick={() => onOpen(latest.id)}>
              <BadgeCheck aria-hidden /> Review and decide
            </Button>
          </div>
        ) : (
          <DecisionResult proof={latest} />
        )}
        {proofs.length > 1 ? (
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground">All versions</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {[...proofs].reverse().map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="flex items-center gap-2 rounded-lg border border-border p-1 pr-2.5 text-xs hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ProofImage file={fileOf(p)} className="size-9 rounded-md" />v{p.version}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function DecisionResult({ proof }: { proof: Proof }) {
  return (
    <div
      className={cn(
        "mt-4 rounded-lg border p-3 text-sm",
        proof.decision === "approved"
          ? "border-emerald-400/40 bg-emerald-400/[0.06]"
          : "border-accent/40 bg-accent/[0.06]",
      )}
      role="status"
    >
      <p className="font-medium">
        {proof.decision === "approved"
          ? `You approved version ${proof.version}`
          : `You asked for changes to version ${proof.version}`}
        {proof.decidedAt ? (
          <span className="font-normal text-muted-foreground"> · {shortDate(proof.decidedAt)}</span>
        ) : null}
      </p>
      {proof.feedback ? (
        <p className="mt-1.5 leading-relaxed whitespace-pre-line text-muted-foreground">
          “{proof.feedback}”
        </p>
      ) : null}
      <p className="mt-1.5 text-muted-foreground">
        {proof.decision === "approved"
          ? "Next we make a physical sample and test the trigger on real phones."
          : `We're working on version ${proof.version + 1}. It'll appear here when it's ready.`}
      </p>
    </div>
  );
}

/** The proof, full screen, with the version switcher and the decision. */
function ProofLightbox({
  detail: d,
  proofId,
  onProofChange,
  onOpenChange,
}: {
  detail: Detail;
  proofId: string | null;
  onProofChange: (id: string) => void;
  onOpenChange: (o: boolean) => void;
}) {
  const proofs = d.product.proofs;
  const proof = proofs.find((p) => p.id === proofId) ?? proofs[proofs.length - 1];
  const latest = proofs[proofs.length - 1];
  if (!proof) return null;
  const file = d.files.find((f) => f.id === proof.fileId);
  const decidable = proof.id === latest?.id && proof.decision === "pending";

  return (
    <Dialog open={!!proofId} onOpenChange={onOpenChange}>
      <DialogContent className={LIGHTBOX_CONTENT}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border py-3 pr-14 pl-4 sm:pl-5">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-medium">
              {d.product.name} · design
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sent {shortDate(proof.createdAt)}
            </DialogDescription>
          </div>
          {proofs.length > 1 ? (
            <div
              role="group"
              aria-label="Version"
              className="flex gap-1 rounded-lg border border-border p-0.5 sm:ml-auto"
            >
              {proofs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === proof.id}
                  onClick={() => onProofChange(p.id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    p.id === proof.id
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  v{p.version}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-1">
          <div className="grid min-h-0 place-items-center bg-[conic-gradient(at_50%_50%,#121218_25%,#17171f_0_50%,#121218_0_75%,#17171f_0)] bg-[length:24px_24px] p-3 sm:p-6">
            {file && isImage(file.mime) ? (
              <img
                key={file.id}
                src={fileUrl(file)}
                alt={`Design version ${proof.version}`}
                className="max-h-full max-w-full rounded-md object-contain shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
              />
            ) : file ? (
              <Button asChild variant="outline">
                <a href={fileUrl(file)} target="_blank" rel="noreferrer">
                  <FileText aria-hidden /> Open the proof ({file.name})
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">File not available.</p>
            )}
          </div>
          <div className="max-h-[48dvh] overflow-y-auto border-t border-border p-4 sm:p-5 md:max-h-none md:border-t-0 md:border-l">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                Version {proof.version}
              </span>
              <DecisionPill proof={proof} />
            </div>
            {proof.note ? (
              <p className="mt-3 rounded-lg border border-border bg-white/[0.03] p-3 text-sm leading-relaxed">
                <span className="block text-xs text-muted-foreground">From MEDIALIFE</span>
                {proof.note}
              </p>
            ) : null}
            {decidable ? (
              <ProofDecision key={proof.id} productId={d.product.id} proof={proof} />
            ) : proof.decision !== "pending" ? (
              <DecisionResult proof={proof} />
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                A newer version replaced this one.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProofDecision({ productId, proof }: { productId: string; proof: Proof }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "changes">("idle");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changesRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === "changes") changesRef.current?.focus();
    if (mode === "approve") confirmRef.current?.focus();
  }, [mode]);

  async function decide(decision: "approved" | "changes") {
    if (decision === "changes" && !feedback.trim()) {
      setError("Tell us what to change so we can get it right.");
      changesRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await decideProof({
        data: {
          productId,
          proofId: proof.id,
          decision,
          feedback: decision === "changes" ? feedback.trim() : note.trim(),
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        setError(r.error);
        return;
      }
      toast.success(
        decision === "approved"
          ? `Version ${proof.version} approved. We'll start your sample.`
          : "Thanks. Your changes are with the team.",
      );
      await router.invalidate();
    } catch {
      toast.error("Couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "approve") {
    return (
      <div className="mt-4 space-y-3 rounded-lg border border-primary/40 bg-primary/[0.06] p-3 motion-safe:animate-in motion-safe:fade-in-0">
        <p className="text-sm font-medium">Approve version {proof.version}?</p>
        <p className="text-sm text-muted-foreground">
          Nothing is produced until you approve. Approving v{proof.version} starts sampling.
        </p>
        <label htmlFor="approve-note" className="block text-sm">
          Anything to add? <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="approve-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
        />
        <div className="flex gap-2">
          <Button
            ref={confirmRef}
            className="flex-1"
            disabled={busy}
            onClick={() => decide("approved")}
          >
            {busy ? "Approving…" : `Approve v${proof.version}`}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
            Not yet
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "changes") {
    return (
      <form
        noValidate
        className="mt-4 space-y-2 motion-safe:animate-in motion-safe:fade-in-0"
        onSubmit={(e) => {
          e.preventDefault();
          void decide("changes");
        }}
      >
        <label htmlFor="changes" className="text-sm font-medium">
          What should we change?
        </label>
        <Textarea
          id="changes"
          ref={changesRef}
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            if (error) setError(null);
          }}
          rows={4}
          maxLength={2000}
          aria-invalid={!!error}
          aria-describedby={error ? "changes-error" : "changes-hint"}
          placeholder="e.g. Make the pine greener, and move the QR code to the back."
        />
        {error ? (
          <p id="changes-error" className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : (
          <p id="changes-hint" className="text-xs text-muted-foreground">
            Be as specific as you like. We'll send a new version.
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            <Send aria-hidden /> {busy ? "Sending…" : "Send changes"}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-muted-foreground">
        Take a close look. Nothing is produced until you approve.
      </p>
      <Button className="h-11 w-full" onClick={() => setMode("approve")}>
        <BadgeCheck aria-hidden /> Approve design
      </Button>
      <Button variant="outline" className="h-11 w-full" onClick={() => setMode("changes")}>
        <PencilLine aria-hidden /> Request changes
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Experience & QR
   --------------------------------------------------------------------------- */

function ExperienceTab({ detail: d }: { detail: Detail }) {
  const e = d.experience;
  const [preview, setPreview] = useState(false);
  const p = d.product;
  return (
    <div className="grid grid-cols-1 gap-4 @4xl/inset:grid-cols-2">
      <Card title="Experience" icon={Sparkles} tone="violet" labelledBy="exp-card">
        {e ? (
          <>
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]"
                style={{ background: "var(--gradient-ember-btn)" }}
              >
                <Sparkles className="size-5 text-white" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{e.name}</h3>
                  <Pill tone={EXPERIENCE_STATUS[e.status].tone}>
                    {EXPERIENCE_STATUS[e.status].label}
                  </Pill>
                </div>
                <p className="text-xs text-muted-foreground">{EXPERIENCE_KINDS[e.kind]}</p>
              </div>
            </div>
            {e.description ? (
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {e.description}
              </p>
            ) : null}
            {e.reward ? (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Fans get: </span>
                {e.reward}
              </p>
            ) : null}
            {e.previewUrl || e.url ? (
              <div className="mt-auto pt-4">
                <Button onClick={() => setPreview(true)} className="rounded-full">
                  <Play aria-hidden /> Preview on your phone
                </Button>
              </div>
            ) : null}
            <ExperiencePreview experience={e} open={preview} onOpenChange={setPreview} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chosen in the brief: an AR moment, a 3D model, a video, a game or a reward. Linked here
            once it's agreed.
          </p>
        )}
      </Card>
      <Card
        title="QR code & NFC"
        icon={QrCode}
        tone="ice"
        labelledBy="qr-card"
        className="@container"
      >
        <TriggerCard
          url={triggerUrl(d.origin, p.trigger.code)}
          name={p.name}
          method={p.trigger.method}
          placement={p.trigger.placement}
        />
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Scans, last 14 days</span>
            <span>
              <span className="font-medium tabular-nums">{compact(d.scans.total)}</span>{" "}
              <span className="text-muted-foreground">all-time</span>
              {d.scans.lastAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  · last <TimeAgo ts={d.scans.lastAt} />
                </span>
              ) : null}
            </span>
          </div>
          {d.scans.total || p.stage === "live" ? (
            <ScanBars byDay={d.scans.byDay} days={14} className="mt-2" />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Scans show up here once fans have the product in their hands.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Launch kit & sales
   --------------------------------------------------------------------------- */

function KitTab({ detail: d }: { detail: Detail }) {
  const router = useRouter();
  const p = d.product;
  const kit = d.files.filter(
    (f) => (f.kind === "collateral" || f.kind === "mockup") && f.productId === p.id,
  );
  const label = (f: HubFile) =>
    f.kind === "mockup"
      ? COLLATERAL_KINDS.mockup
      : (COLLATERAL_KINDS[f.category as CollateralKind] ?? COLLATERAL_KINDS.other);
  return (
    <div className="space-y-4">
      <div className={cn(surface, "flex flex-col gap-3 p-4 sm:flex-row sm:items-center")}>
        <Tile icon={BriefcaseBusiness} tone="amber" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="text-muted-foreground">Shop link</div>
          {p.commerce.shopUrl ? (
            <a
              href={p.commerce.shopUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-medium underline-offset-4 hover:underline"
            >
              {p.commerce.shopUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span>Arrives at launch</span>
          )}
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/creator-hub/launch-kit" search={{ product: p.id }}>
            Posts & full launch kit
          </Link>
        </Button>
      </div>
      {kit.length ? (
        <FileGallery files={kit} label={label} onDeleted={() => router.invalidate()} />
      ) : (
        <EmptyState icon={BriefcaseBusiness} title="Promo files arrive before launch">
          Mockups, posters and social posts for this product land here.
        </EmptyState>
      )}
    </div>
  );
}

function SalesTab({ detail: d }: { detail: Detail }) {
  const p = d.product;
  if (p.stage !== "live" && !d.sales.units) {
    return (
      <EmptyState icon={ShoppingBag} title="Sales start on launch day">
        Units, revenue and your earnings for this product appear here from its first order.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        <Kpi
          label="Units sold"
          icon={ShoppingBag}
          tone="violet"
          value={compact(d.sales.units)}
          hint={`${d.sales.orders} orders`}
        />
        <Kpi
          label="Net revenue"
          icon={Receipt}
          tone="blue"
          value={money(d.sales.net, p.currency)}
          explain="What fans paid for this product, after discounts and refunds, before tax and shipping."
        />
        <Kpi
          label="Your earnings"
          icon={Coins}
          tone="mint"
          value={money(d.sales.earned, p.currency)}
          emphasis
        />
        <Kpi
          label="Your share"
          icon={Percent}
          tone="amber"
          value={pct(d.revenueShare)}
          hint="of net revenue"
        />
      </div>
      <Button asChild variant="outline" className="rounded-full">
        <Link to="/creator-hub/earnings">All earnings and orders</Link>
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Messages
   --------------------------------------------------------------------------- */

type ShownMessage = Message & { sending?: boolean };

function Thread({ productId, thread }: { productId: string; thread: Message[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ShownMessage[]>(thread);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => setMessages(thread), [thread]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    const temp: ShownMessage = {
      id: `tmp-${Date.now()}`,
      author: "creator",
      name: "You",
      body: text,
      at: Date.now(),
      sending: true,
    };
    setMessages((m) => [...m, temp]);
    setBody("");
    setBusy(true);
    try {
      const r = await postMessage({ data: { productId, body: text } });
      if (!r.ok) throw new Error(r.error);
      setMessages((m) => m.map((x) => (x.id === temp.id ? r.message : x)));
      void router.invalidate();
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setBody(text);
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't send your message. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn(surface, "flex flex-col overflow-hidden")}>
      {messages.length ? (
        <ol
          ref={listRef}
          className="max-h-[52vh] min-h-40 space-y-4 overflow-y-auto p-4 sm:p-5"
          aria-live="polite"
        >
          {messages.map((m) => {
            const mine = m.author === "creator";
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] @3xl/inset:max-w-[70%]", mine && "text-right")}>
                  <div className="mb-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {mine ? "You" : m.name || "MEDIALIFE"}
                    </span>
                    {!mine && !/medialife/i.test(m.name) ? " · MEDIALIFE" : ""} ·{" "}
                    {m.sending ? "Sending…" : <TimeAgo ts={m.at} />}
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed whitespace-pre-line",
                      mine
                        ? "rounded-tr-sm bg-[linear-gradient(135deg,color-mix(in_oklab,var(--partner)_30%,transparent),color-mix(in_oklab,var(--partner-2)_25%,transparent))] text-foreground ring-1 ring-[var(--partner)]/25 ring-inset"
                        : "rounded-tl-sm border border-white/10 bg-white/[0.05]",
                      m.sending && "opacity-60",
                    )}
                  >
                    {m.body}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Tile icon={MessageSquare} tone="ice" />
          No messages yet. Ask the team anything; we usually reply within a business day.
        </div>
      )}
      <form
        onSubmit={send}
        className="flex items-end gap-2 border-t border-white/10 bg-black/20 p-3"
      >
        <label htmlFor="message" className="sr-only">
          Write a message to the team
        </label>
        <Textarea
          id="message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(e);
          }}
          placeholder="Write a message…"
          rows={2}
          maxLength={4000}
          className="min-h-11 resize-none rounded-xl"
        />
        <Button
          type="submit"
          disabled={busy || !body.trim()}
          className="h-11 rounded-full"
          aria-label="Send message"
        >
          <Send aria-hidden />{" "}
          <span className="hidden sm:inline">{busy ? "Sending…" : "Send"}</span>
        </Button>
      </form>
    </div>
  );
}
