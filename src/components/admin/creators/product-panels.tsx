import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ImageIcon, Loader2, Send, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminAddProof,
  adminPostMessage,
  adminSaveProduct,
  adminSetStage,
} from "@/lib/hub/admin.functions";
import {
  COLLATERAL_KINDS,
  STAGES,
  TRIGGER_METHODS,
  fileUrl,
  isImage,
  shortDate,
  stageIndex,
  triggerUrl,
  type CollateralKind,
  type HubFile,
  type Product,
  type StageId,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../format";
import { Panel, PanelTitle } from "../kit";
import { QrCode } from "../qr";
import { FileThumb, FileTile, UploadButton } from "./files-kit";
import { productInput } from "./product-editor";
import { QrDialog, UrlPill } from "./qr-dialog";
import type { CreatorDetail } from "./types";
import { Ago, CheckRow, Field, Pill, ghostBtn, useRun } from "./ui";

/* ---------------------------------------------------------------------------
   Stage
   --------------------------------------------------------------------------- */

/** Fits the stepper's narrow columns. */
const STAGE_SHORT: Record<StageId, string> = {
  brief: "Brief",
  artwork: "Artwork",
  approval: "Approval",
  sampling: "Sample",
  production: "Production",
  shipping: "Shipping",
  live: "Live",
};

export function StageStepper({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected?: StageId;
  onSelect?: (s: StageId) => void;
}) {
  const cur = stageIndex(product.stage);
  const reached = useMemo(() => {
    const m = new Map<StageId, number>();
    for (const h of product.history) m.set(h.stage, h.at);
    return m;
  }, [product.history]);
  // a read-only stepper sits inside clickable rows, so it can't be made of buttons
  const Tag = onSelect ? "button" : "span";
  return (
    <ol className="grid grid-cols-7 gap-1">
      {STAGES.map((s, i) => {
        const done = i < cur;
        const now = i === cur;
        const sel = selected === s.id && selected !== product.stage;
        const at = reached.get(s.id);
        return (
          <li key={s.id} className="min-w-0">
            <Tag
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(s.id) } : {})}
              className={cn(
                "group block w-full min-w-0 text-left outline-none",
                onSelect && "cursor-pointer",
              )}
              title={`${s.name}: ${s.blurb}`}
              aria-current={now ? "step" : undefined}
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-colors",
                  done ? "bg-sky-400/70" : now ? "bg-emerald-400" : "bg-white/10",
                  sel && "bg-amber-300 ring-2 ring-amber-300/30",
                  onSelect &&
                    "group-hover:ring-2 group-hover:ring-white/15 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block truncate text-[10.5px] leading-tight",
                  now
                    ? "font-medium text-foreground"
                    : sel
                      ? "text-amber-200"
                      : "text-muted-foreground",
                )}
              >
                {STAGE_SHORT[s.id]}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground/70 tabular-nums">
                {at && i <= cur ? shortDate(at).replace(/, \d{4}$/, "") : " "}
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

export function StagePanel({ data, product }: { data: CreatorDetail; product: Product }) {
  const uid = useId();
  const { pending, run } = useRun();
  const [stage, setStage] = useState<StageId>(product.stage);
  const [note, setNote] = useState("");
  const [waitingOn, setWaitingOn] = useState(product.waitingOn);
  const [nextStep, setNextStep] = useState(product.nextStep);
  const [notify, setNotify] = useState(true);
  // reset when the stored product changes (saved here or elsewhere)
  useEffect(() => {
    setStage(product.stage);
    setNote("");
    setWaitingOn(product.waitingOn);
    setNextStep(product.nextStep);
  }, [product.stage, product.waitingOn, product.nextStep, product.updatedAt]);

  const moving = stage !== product.stage;
  const dirty = moving || waitingOn !== product.waitingOn || nextStep !== product.nextStep;
  const target = STAGES[stageIndex(stage)];
  const history = [...product.history].reverse();

  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        title="Stage"
        sub={`In ${STAGES[stageIndex(product.stage)].name} since ${shortDate(product.stageUpdatedAt)}. Click a stage to move it.`}
      />
      <div className="mt-4">
        <StageStepper product={product} selected={stage} onSelect={setStage} />
      </div>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            "stage",
            () =>
              adminSetStage({
                data: {
                  creatorId: data.creator.id,
                  productId: product.id,
                  stage,
                  note: note.trim(),
                  waitingOn,
                  nextStep: nextStep.trim(),
                  notify: moving && notify,
                },
              }),
            moving ? `Moved to ${target.name}` : "Next step saved",
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <Field label="Stage" htmlFor={`${uid}-stage`}>
            <Select value={stage} onValueChange={(v) => setStage(v as StageId)}>
              <SelectTrigger id={`${uid}-stage`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s, i) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.id === product.stage ? " · now" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={moving ? `Note for the creator about ${target.name}` : "Note"}
            htmlFor={`${uid}-note`}
            optional
            hint={moving ? `Blank uses: “${target.blurb}”` : "Only sent with a stage change."}
          >
            <Input
              id={`${uid}-note`}
              value={note}
              maxLength={500}
              disabled={!moving}
              placeholder={moving ? target.blurb : ""}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <Field label="Waiting on" htmlFor={`${uid}-wait`}>
            <Select
              value={waitingOn}
              onValueChange={(v) => setWaitingOn(v as Product["waitingOn"])}
            >
              <SelectTrigger id={`${uid}-wait`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medialife">MEDIALIFE</SelectItem>
                <SelectItem value="creator">The creator</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Next step"
            htmlFor={`${uid}-next`}
            hint={
              waitingOn === "creator"
                ? "Shown to the creator as their to-do."
                : "Shown to the creator as what happens next."
            }
          >
            <Input
              id={`${uid}-next`}
              value={nextStep}
              maxLength={300}
              onChange={(e) => setNextStep(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {moving ? (
            <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
              Email the creator about the move
            </CheckRow>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={!dirty || !!pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {moving ? `Move to ${target.name}` : "Save next step"}
          </Button>
        </div>
      </form>
      {history.length ? (
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Stage history ({history.length})
          </summary>
          <ol className="mt-2 space-y-1.5">
            {history.map((h, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span
                  className="w-24 shrink-0 text-muted-foreground tabular-nums"
                  suppressHydrationWarning
                  title={formatDateTime(h.at)}
                >
                  {shortDate(h.at)}
                </span>
                <span className="font-medium">{STAGES[stageIndex(h.stage)]?.name ?? h.stage}</span>
                {h.note ? <span className="min-w-0 text-muted-foreground">{h.note}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Proofs
   --------------------------------------------------------------------------- */

const DECISION = {
  pending: { tone: "watch", label: "Waiting for creator" },
  approved: { tone: "live", label: "Approved" },
  changes: { tone: "danger", label: "Changes requested" },
} as const;

export function ProofsPanel({ data, product }: { data: CreatorDetail; product: Product }) {
  const uid = useId();
  const { pending, run } = useRun();
  const [file, setFile] = useState<HubFile | null>(null);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const byId = new Map(data.files.map((f) => [f.id, f]));
  const next = (product.proofs[product.proofs.length - 1]?.version ?? 0) + 1;
  const proofs = [...product.proofs].reverse();
  // a proof file uploaded earlier but never sent
  const unsent = data.files.filter(
    (f) =>
      f.kind === "proof" &&
      f.productId === product.id &&
      !product.proofs.some((p) => p.fileId === f.id),
  );
  const staged = file ?? null;

  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        title="Design proofs"
        sub="The creator approves or asks for changes. Nothing is made until they approve."
      />
      <div className="mt-3 rounded-lg border border-dashed border-border p-3">
        <div className="text-sm font-medium">Send design v{next}</div>
        {staged ? (
          <form
            className="mt-2 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(
                "proof",
                () =>
                  adminAddProof({
                    data: {
                      creatorId: data.creator.id,
                      productId: product.id,
                      fileId: staged.id,
                      note: note.trim(),
                      notify,
                    },
                  }),
                `Design v${next} sent for approval`,
              );
              if (r) {
                setFile(null);
                setNote("");
              }
            }}
          >
            <div className="flex items-start gap-3">
              <FileThumb file={staged} className="size-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" title={staged.name}>
                  {staged.name}
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Choose a different file
                </button>
              </div>
            </div>
            <Field label="Note to the creator" htmlFor={`${uid}-note`} optional>
              <Textarea
                id={`${uid}-note`}
                rows={2}
                className="min-h-0"
                maxLength={2000}
                value={note}
                placeholder="What changed, what to look at"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
                Email the creator
              </CheckRow>
              <Button type="submit" size="sm" disabled={!!pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                Send v{next} for approval
              </Button>
            </div>
            {stageIndex(product.stage) < stageIndex("approval") ? (
              <p className="text-xs text-muted-foreground">
                Sending moves the product to Design approval.
              </p>
            ) : null}
          </form>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UploadButton
              creatorId={data.creator.id}
              kind="proof"
              category="proof"
              productId={product.id}
              label="Upload proof"
              onUploaded={(f) => setFile(f)}
            />
            {unsent.length ? (
              <Select
                value=""
                onValueChange={(id) => setFile(unsent.find((f) => f.id === id) ?? null)}
              >
                <SelectTrigger
                  className="h-8 w-auto max-w-64 text-xs"
                  aria-label="Use an uploaded proof"
                >
                  <SelectValue placeholder={`Or use an uploaded file (${unsent.length})`} />
                </SelectTrigger>
                <SelectContent>
                  {unsent.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <span className="text-xs text-muted-foreground">An image or PDF, up to 50 MB</span>
          </div>
        )}
      </div>

      {proofs.length ? (
        <ul className="mt-4 divide-y divide-border">
          {proofs.map((pr) => {
            const f = byId.get(pr.fileId);
            const d = DECISION[pr.decision];
            return (
              <li key={pr.id} className="flex gap-3 py-3">
                {f ? (
                  <a href={fileUrl(f)} target="_blank" rel="noreferrer" className="shrink-0">
                    <FileThumb file={f} className="size-16" />
                  </a>
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
                    <ImageIcon className="size-5" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">v{pr.version}</span>
                    <Pill tone={d.tone}>{d.label}</Pill>
                    <Ago
                      ts={pr.createdAt}
                      prefix="sent "
                      className="text-xs text-muted-foreground"
                    />
                  </div>
                  {pr.note ? <p className="mt-1 text-sm text-muted-foreground">{pr.note}</p> : null}
                  {pr.feedback ? (
                    <blockquote className="mt-1.5 border-l-2 border-amber-400/50 pl-2.5 text-sm">
                      “{pr.feedback}”
                      {pr.decidedAt ? (
                        <Ago ts={pr.decidedAt} className="ml-1.5 text-xs text-muted-foreground" />
                      ) : null}
                    </blockquote>
                  ) : pr.decision === "approved" && pr.decidedAt ? (
                    <p className="mt-1 text-xs text-emerald-300">
                      <Ago ts={pr.decidedAt} prefix="Approved " />
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No proofs sent yet.</p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Mockups & collateral
   --------------------------------------------------------------------------- */

export function AssetsPanel({ data, product }: { data: CreatorDetail; product: Product }) {
  const { pending, run } = useRun();
  const [collateralKind, setCollateralKind] = useState<CollateralKind>("social");
  const files = data.files.filter(
    (f) => f.productId === product.id && (f.kind === "mockup" || f.kind === "collateral"),
  );
  const mockups = files.filter((f) => f.kind === "mockup");
  const collateral = files.filter((f) => f.kind === "collateral");

  const heroAction = (f: HubFile) =>
    isImage(f.mime) ? (
      f.id === product.imageFileId ? (
        <span
          className="inline-flex size-7 items-center justify-center text-amber-300"
          title="Hero image"
        >
          <Star className="size-4 fill-current" aria-hidden />
          <span className="sr-only">Hero image</span>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7 text-muted-foreground", ghostBtn)}
          disabled={!!pending}
          title="Use as the hero image"
          aria-label={`Use ${f.name} as the hero image`}
          onClick={() =>
            void run(
              f.id,
              () => adminSaveProduct({ data: productInput(product, { imageFileId: f.id }) }),
              "Hero image updated",
            )
          }
        >
          {pending === f.id ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Star aria-hidden />
          )}
        </Button>
      )
    ) : null;

  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        title="Mockups & launch collateral"
        sub="Shared with the creator on this product: mockups, posters, social assets, QR artwork."
      />
      <div className="@container/files mt-4 space-y-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Mockups ({mockups.length})</h3>
            <UploadButton
              creatorId={data.creator.id}
              kind="mockup"
              category="mockup"
              productId={product.id}
              multiple
              label="Upload mockups"
            />
          </div>
          <FileGrid files={mockups} empty="No mockups yet." action={heroAction} />
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Collateral ({collateral.length})</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={collateralKind}
                onValueChange={(v) => setCollateralKind(v as CollateralKind)}
              >
                <SelectTrigger className="h-8 w-40 text-xs" aria-label="Collateral type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COLLATERAL_KINDS) as CollateralKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {COLLATERAL_KINDS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <UploadButton
                creatorId={data.creator.id}
                kind="collateral"
                category={collateralKind}
                productId={product.id}
                multiple
                label="Upload"
              />
            </div>
          </div>
          <FileGrid
            files={collateral}
            empty="No collateral yet. Posters and social assets go here for launch."
            caption={(f) => COLLATERAL_KINDS[f.category as CollateralKind] ?? f.category}
            action={heroAction}
          />
        </div>
      </div>
    </Panel>
  );
}

export function FileGrid({
  files,
  empty,
  caption,
  action,
}: {
  files: HubFile[];
  empty: string;
  caption?: (f: HubFile) => React.ReactNode;
  action?: (f: HubFile) => React.ReactNode;
}) {
  if (!files.length) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-2.5 @md/files:grid-cols-3 @2xl/files:grid-cols-4 @4xl/files:grid-cols-6">
      {files.map((f) => (
        <FileTile key={f.id} file={f} caption={caption?.(f)} actions={action?.(f)} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Activation
   --------------------------------------------------------------------------- */

export function ActivationPanel({ data, product }: { data: CreatorDetail; product: Product }) {
  const [qr, setQr] = useState(false);
  const url = triggerUrl(data.origin, product.trigger.code);
  const scans = data.scans[product.id];
  const exp = data.experiences.find((e) => e.id === product.experienceId);
  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle title="Activation" sub={TRIGGER_METHODS[product.trigger.method].label} />
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => setQr(true)}
          className="shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Show the QR code"
          aria-label="Show the QR code"
        >
          <QrCode value={url} className="size-20 rounded" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <UrlPill url={url} />
          <div className="text-xs text-muted-foreground">
            {product.trigger.placement || "Placement not set"}
          </div>
          <div className="text-xs">
            Opens:{" "}
            {exp ? (
              <span className="font-medium">{exp.name}</span>
            ) : (
              <span className="text-muted-foreground">no experience yet</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {(scans?.total ?? 0).toLocaleString()}
            </span>{" "}
            scans
            {scans?.lastAt ? <Ago ts={scans.lastAt} prefix=" · last " /> : null}
          </div>
        </div>
      </div>
      <QrDialog
        open={qr}
        onOpenChange={setQr}
        url={url}
        title={`QR for ${product.name}`}
        description="Print-ready. The NFC tag opens the same link."
        file={`${product.trigger.code}-qr`}
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Thread
   --------------------------------------------------------------------------- */

export function ThreadPanel({ data, product }: { data: CreatorDetail; product: Product }) {
  const uid = useId();
  const { pending, run } = useRun();
  const thread = data.threads[product.id] ?? [];
  const [name, setName] = useState(data.admin.manager.name || "MEDIALIFE");
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [thread.length]);

  return (
    <Panel className="flex flex-col p-4 sm:p-5">
      <PanelTitle
        title="Messages"
        sub={`With ${data.creator.profile.displayName || "the creator"} about this product`}
      />
      <div className="mt-3 max-h-[26rem] min-h-16 space-y-2.5 overflow-y-auto pr-1">
        {!thread.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          thread.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[90%] rounded-lg border px-3 py-2 text-sm",
                m.author === "medialife"
                  ? "ml-auto border-sky-400/25 bg-sky-400/[0.07]"
                  : "border-border bg-white/[0.03]",
              )}
            >
              <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {m.name}
                  {m.author === "creator" ? " (creator)" : ""}
                </span>
                <Ago ts={m.at} />
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      <form
        className="mt-3 grid gap-2 border-t border-border pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim() || !name.trim()) return;
          const r = await run(
            "msg",
            () =>
              adminPostMessage({
                data: {
                  creatorId: data.creator.id,
                  productId: product.id,
                  name: name.trim(),
                  body: body.trim(),
                  notify,
                },
              }),
            "Message sent",
          );
          if (r) setBody("");
        }}
      >
        <Textarea
          id={`${uid}-body`}
          aria-label="Reply"
          rows={3}
          className="min-h-0"
          maxLength={4000}
          placeholder="Write a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            htmlFor={`${uid}-name`}
          >
            As
            <Input
              id={`${uid}-name`}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="h-7 w-36 text-xs"
            />
          </label>
          <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify} className="text-xs">
            Email the creator
          </CheckRow>
          <Button
            type="submit"
            size="sm"
            className="ml-auto"
            disabled={!body.trim() || !name.trim() || !!pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Send
          </Button>
        </div>
      </form>
    </Panel>
  );
}
