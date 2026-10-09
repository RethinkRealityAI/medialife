import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  FileText,
  MessageSquare,
  PackageOpen,
  PencilLine,
  Send,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { FilePreview, FileTile } from "@/components/hub/app/file-tile";
import { Kpi } from "@/components/hub/app/kpi";
import { ProductThumb, WaitingChip } from "@/components/hub/app/product-card";
import { TriggerBlock } from "@/components/hub/app/qr-download";
import { ScanBars } from "@/components/hub/app/scan-bars";
import { StageTimeline } from "@/components/hub/app/stage-track";
import { EmptyState, Page, Panel, Pill, Section, TimeAgo } from "@/components/hub/app/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { decideProof, getProductDetail, postMessage } from "@/lib/hub/creator.functions";
import {
  EXPERIENCE_KINDS,
  EXPERIENCE_STATUS,
  SKUS,
  compact,
  fileUrl,
  isImage,
  money,
  pct,
  shortDate,
  stageOf,
  triggerUrl,
  type HubFile,
  type Message,
  type Proof,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/products/$productId")({
  loader: async ({ params }) => {
    if (!/^[A-Za-z0-9]{6,60}$/.test(params.productId)) throw notFound();
    const detail = await getProductDetail({ data: { id: params.productId } });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.product.name ?? "Product"} · Creator Hub | MEDIALIFE` }],
  }),
  notFoundComponent: ProductNotFound,
  component: ProductPage,
});

type Detail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

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

function ProductPage() {
  const d = Route.useLoaderData();
  const { product } = d;
  const stage = stageOf(product.stage);
  const showSales = product.stage === "live" || d.sales.units > 0;
  const kit = d.files.filter(
    (f) => (f.kind === "collateral" || f.kind === "mockup") && f.productId === product.id,
  );

  const sections = [
    { id: "progress", label: "Progress" },
    { id: "approval", label: "Design" },
    { id: "experience", label: "Experience" },
    { id: "trigger", label: "QR & NFC" },
    { id: "kit", label: "Launch kit" },
    ...(showSales ? [{ id: "sales", label: "Sales" }] : []),
    { id: "messages", label: "Messages" },
  ];

  return (
    <Page className="pt-4 lg:pt-6">
      <Link
        to="/creator-hub/products"
        className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden /> All products
      </Link>

      <header className="mt-4 flex items-start gap-4 sm:gap-5 @2xl/inset:items-center">
        <ProductThumb
          product={product}
          className="size-20 rounded-xl sm:size-24 @2xl/inset:size-28"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {SKUS[product.sku].name}
            {product.campaign ? ` · ${product.campaign}` : ""}
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-balance sm:text-3xl">
            {product.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone={product.stage === "live" ? "live" : "primary"}>{stage.name}</Pill>
            {product.stage !== "live" ? <WaitingChip product={product} /> : null}
          </div>
          {product.stage !== "live" && product.nextStep ? (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="text-foreground">Next:</span> {product.nextStep}
            </p>
          ) : null}
        </div>
      </header>

      <nav
        aria-label="On this page"
        className="sticky top-14 z-20 -mx-4 mt-6 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {sections.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                className="inline-flex h-11 items-center border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">
        <Section id="progress" title="Progress" description="Seven stages from brief to on sale.">
          <Panel className="p-5 sm:p-6">
            <StageTimeline product={product} />
          </Panel>
        </Section>

        <Section id="approval" title="Design approval">
          <DesignApproval detail={d} />
        </Section>

        <Section
          id="experience"
          title="Experience"
          description="What opens when a fan scans or taps this product."
        >
          <ExperienceBlock detail={d} />
        </Section>

        <Section id="trigger" title="QR code & NFC">
          <Panel className="@container p-5 sm:p-6">
            <TriggerBlock
              url={triggerUrl(d.origin, product.trigger.code)}
              name={product.name}
              method={product.trigger.method}
              placement={product.trigger.placement}
            />
            <div className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm text-muted-foreground">Scans, last 14 days</h3>
                <span className="text-sm">
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
              {d.scans.total || product.stage === "live" ? (
                <ScanBars byDay={d.scans.byDay} days={14} className="mt-3" />
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Scans show up here once fans have the product in their hands.
                </p>
              )}
            </div>
          </Panel>
        </Section>

        <Section
          id="kit"
          title="Launch kit for this product"
          description="Mockups and promo files from the team. Use them anywhere."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/creator-hub/launch-kit">Full launch kit</Link>
            </Button>
          }
        >
          {product.commerce.shopUrl ? (
            <Panel className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">Shop link</div>
                <a
                  href={product.commerce.shopUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {product.commerce.shopUrl.replace(/^https?:\/\//, "")}
                </a>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={product.commerce.shopUrl} target="_blank" rel="noreferrer">
                  Open shop <ExternalLink aria-hidden />
                </a>
              </Button>
            </Panel>
          ) : null}
          {kit.length ? (
            <ul className="grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @5xl/inset:grid-cols-4">
              {kit.map((f) => (
                <FileTile key={f.id} file={f} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Promo files for this product arrive before launch: mockups, posters and social posts.
            </p>
          )}
        </Section>

        {showSales ? (
          <Section id="sales" title="Sales">
            <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
              <Kpi label="Units sold" icon={ShoppingBag} value={compact(d.sales.units)} />
              <Kpi
                label="Net revenue"
                value={money(d.sales.net, product.currency)}
                explain="What fans paid for this product, after discounts and refunds, before tax and shipping."
              />
              <Kpi label="Your earnings" value={money(d.sales.earned, product.currency)} emphasis />
              <Kpi label="Your share" value={pct(d.revenueShare)} hint="of net revenue" />
            </div>
          </Section>
        ) : null}

        <Section
          id="messages"
          title="Messages"
          description="Talk to the team about this product. We usually reply within a business day."
        >
          <Thread productId={product.id} thread={d.thread} />
        </Section>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Design approval
   --------------------------------------------------------------------------- */

function ProofArt({
  file,
  proof,
  large = false,
}: {
  file: HubFile | undefined;
  proof: Proof;
  large?: boolean;
}) {
  if (!file) {
    return (
      <div className="grid grid-cols-1 aspect-[4/3] place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        File not available
      </div>
    );
  }
  if (isImage(file.mime)) {
    return (
      <a
        href={fileUrl(file)}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <FilePreview
          file={file}
          className={large ? "aspect-[4/3] max-h-[70vh]" : "aspect-square"}
        />
        <span className="sr-only">Open design version {proof.version} full size</span>
      </a>
    );
  }
  return (
    <a
      href={fileUrl(file)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border p-4 hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <FileText className="size-8 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="text-sm text-muted-foreground">Open the proof (opens in a new tab)</span>
      </span>
    </a>
  );
}

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

function DesignApproval({ detail }: { detail: Detail }) {
  const { product, files } = detail;
  const proofs = product.proofs;
  const latest = proofs[proofs.length - 1];
  const earlier = proofs.slice(0, -1).reverse();
  const fileOf = (p: Proof) => files.find((f) => f.id === p.fileId);

  if (!latest) {
    const past = ["sampling", "production", "shipping", "live"].includes(product.stage);
    return (
      <Panel className="p-5 text-sm leading-relaxed text-muted-foreground">
        {past
          ? "This design was approved before proofs moved into the hub."
          : "No design to review yet. Once your artwork is in, we prepare a proof and it shows up here for you to approve or change. Nothing is made until you approve."}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        className={cn("overflow-hidden", latest.decision === "pending" && "border-amber-400/45")}
      >
        <div className="grid grid-cols-1 gap-0 @4xl/inset:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="p-4 sm:p-5">
            <ProofArt file={fileOf(latest)} proof={latest} large />
          </div>
          <div className="flex flex-col gap-4 border-t border-border p-5 @4xl/inset:border-t-0 @4xl/inset:border-l">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                Version {latest.version}
              </span>
              <DecisionPill proof={latest} />
            </div>
            <div className="text-xs text-muted-foreground">Sent {shortDate(latest.createdAt)}</div>
            {latest.note ? (
              <figure className="rounded-lg border border-border bg-white/[0.03] p-4">
                <figcaption className="text-xs text-muted-foreground">
                  Note from MEDIALIFE
                </figcaption>
                <blockquote className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">
                  {latest.note}
                </blockquote>
              </figure>
            ) : null}

            {latest.decision === "pending" ? (
              <ProofDecision productId={product.id} proof={latest} />
            ) : (
              <div
                className={cn(
                  "rounded-lg border p-4 text-sm",
                  latest.decision === "approved"
                    ? "border-emerald-400/40 bg-emerald-400/[0.06]"
                    : "border-accent/40 bg-accent/[0.06]",
                )}
                role="status"
              >
                <p className="font-medium">
                  {latest.decision === "approved"
                    ? `You approved version ${latest.version}`
                    : `You asked for changes to version ${latest.version}`}
                  {latest.decidedAt ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {shortDate(latest.decidedAt)}
                    </span>
                  ) : null}
                </p>
                {latest.feedback ? (
                  <p className="mt-2 leading-relaxed whitespace-pre-line text-muted-foreground">
                    “{latest.feedback}”
                  </p>
                ) : null}
                <p className="mt-2 text-muted-foreground">
                  {latest.decision === "approved"
                    ? "Next we make a physical sample and test the trigger on real phones."
                    : `We're working on version ${latest.version + 1}. It'll appear here when it's ready.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      {earlier.length ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group -ml-3">
              Earlier versions ({earlier.length})
              <ChevronDown
                className="transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-3">
              {earlier.map((p) => (
                <li key={p.id}>
                  <Panel className="flex gap-4 p-4">
                    <div className="w-24 shrink-0 sm:w-32">
                      <ProofArt file={fileOf(p)} proof={p} />
                    </div>
                    <div className="min-w-0 space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Version {p.version}</span>
                        <DecisionPill proof={p} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Sent {shortDate(p.createdAt)}
                        {p.decidedAt ? ` · answered ${shortDate(p.decidedAt)}` : ""}
                      </div>
                      {p.note ? <p className="text-muted-foreground">MEDIALIFE: {p.note}</p> : null}
                      {p.feedback ? (
                        <p className="whitespace-pre-line">You: “{p.feedback}”</p>
                      ) : null}
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function ProofDecision({ productId, proof }: { productId: string; proof: Proof }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [busy, setBusy] = useState<"approved" | "changes" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "changes") changesRef.current?.focus();
  }, [mode]);

  async function decide(decision: "approved" | "changes") {
    if (decision === "changes" && !feedback.trim()) {
      setError("Tell us what to change so we can get it right.");
      changesRef.current?.focus();
      return;
    }
    setBusy(decision);
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
      setBusy(null);
    }
  }

  return (
    <div className="mt-auto space-y-3">
      <p className="text-sm text-muted-foreground">
        Take a close look. Nothing is produced until you approve.
      </p>
      {mode === "idle" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="h-11 flex-1" disabled={!!busy}>
                <BadgeCheck aria-hidden /> Approve design
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve version {proof.version}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Nothing is produced until you approve. Approving v{proof.version} starts sampling.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <label htmlFor="approve-note" className="text-sm font-medium">
                  Anything to add?{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="approve-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Not yet</AlertDialogCancel>
                <AlertDialogAction onClick={() => decide("approved")}>
                  Approve v{proof.version}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={!!busy}
            onClick={() => setMode("changes")}
          >
            <PencilLine aria-hidden /> Request changes
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          noValidate
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
            rows={5}
            maxLength={2000}
            required
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="h-11 flex-1" disabled={!!busy}>
              <Send aria-hidden /> {busy === "changes" ? "Sending…" : "Send changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              disabled={!!busy}
              onClick={() => setMode("idle")}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {busy === "approved" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Approving…
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Experience
   --------------------------------------------------------------------------- */

function ExperienceBlock({ detail }: { detail: Detail }) {
  const e = detail.experience;
  if (!e) {
    return (
      <Panel className="p-5 text-sm leading-relaxed text-muted-foreground">
        The experience is chosen in the brief: an AR moment, a mini-game, an exclusive video or a
        reward. It'll be linked here once it's agreed.
      </Panel>
    );
  }
  const status = EXPERIENCE_STATUS[e.status];
  const tryUrl = e.previewUrl || e.url;
  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-1 @3xl/inset:grid-cols-[16rem_1fr]">
        <div className="relative aspect-[16/9] @3xl/inset:aspect-auto">
          {e.imageFileId ? (
            <img
              src={fileUrl({ creatorId: e.creatorId, id: e.imageFileId })}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "var(--gradient-ember)", opacity: 0.85 }}
            >
              <Sparkles className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white/90" />
            </div>
          )}
        </div>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-medium">{e.name}</h3>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <p className="text-sm text-muted-foreground">{EXPERIENCE_KINDS[e.kind]}</p>
          {e.description ? <p className="text-sm leading-relaxed">{e.description}</p> : null}
          {e.reward ? (
            <p className="text-sm">
              <span className="text-muted-foreground">What fans get: </span>
              {e.reward}
            </p>
          ) : null}
          {tryUrl ? (
            <Button asChild variant="outline">
              <a href={tryUrl} target="_blank" rel="noreferrer">
                Try it <ExternalLink aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
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
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => setMessages(thread), [thread]);

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
    requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
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
    <Panel className="p-4 sm:p-5">
      {messages.length ? (
        <ol className="space-y-4" aria-live="polite">
          {messages.map((m, i) => {
            const mine = m.author === "creator";
            return (
              <li
                key={m.id}
                ref={i === messages.length - 1 ? endRef : undefined}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
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
                        ? "rounded-tr-sm bg-primary/15 text-foreground"
                        : "rounded-tl-sm border border-border bg-white/[0.04]",
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
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <MessageSquare className="size-5 shrink-0" aria-hidden />
          No messages yet. Ask the team anything about this product.
        </div>
      )}

      <form onSubmit={send} className="mt-5 border-t border-border pt-4">
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
          rows={3}
          maxLength={4000}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Ctrl + Enter to send
          </span>
          <Button type="submit" disabled={busy || !body.trim()} className="ml-auto">
            <Send aria-hidden /> {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
