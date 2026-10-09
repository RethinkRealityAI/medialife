import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminDeleteProduct } from "@/lib/hub/admin.functions";
import {
  SKUS,
  STAGES,
  earningsByProduct,
  money,
  pct,
  shortDate,
  stageIndex,
  type Product,
  type StageId,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { Panel } from "../kit";
import { FileThumb } from "./files-kit";
import { ProductEditor } from "./product-editor";
import {
  ActivationPanel,
  AssetsPanel,
  ProofsPanel,
  StagePanel,
  StageStepper,
  ThreadPanel,
} from "./product-panels";
import type { CreatorDetail } from "./types";
import { Pill, ghostBtn, outlineBtn, useRun } from "./ui";

const STAGE_TONE: Record<StageId, "muted" | "primary" | "watch" | "accent" | "live"> = {
  brief: "muted",
  artwork: "primary",
  approval: "watch",
  sampling: "accent",
  production: "accent",
  shipping: "accent",
  live: "live",
};

export function StagePill({ stage }: { stage: StageId }) {
  return <Pill tone={STAGE_TONE[stage]}>{STAGES[stageIndex(stage)].name}</Pill>;
}

function Hero({
  data,
  product,
  className,
}: {
  data: CreatorDetail;
  product: Product;
  className?: string;
}) {
  const f = data.files.find((x) => x.id === product.imageFileId);
  if (f) return <FileThumb file={f} className={className} />;
  return (
    <div
      className={cn(
        "grid aspect-square place-items-center rounded-md border border-border bg-white/[0.03] text-muted-foreground",
        className,
      )}
    >
      <Package className="size-5" aria-hidden />
    </div>
  );
}

function WaitingOn({ p }: { p: Product }) {
  if (p.stage === "live") return <span className="text-xs text-muted-foreground">–</span>;
  return p.waitingOn === "creator" ? (
    <span className="text-xs text-amber-300">Creator</span>
  ) : (
    <span className="text-xs text-muted-foreground">MEDIALIFE</span>
  );
}

export function ProductsTab({
  data,
  productId,
  onProduct,
}: {
  data: CreatorDetail;
  productId: string | undefined;
  onProduct: (id: string | undefined) => void;
}) {
  const [creating, setCreating] = useState(false);
  const product = data.products.find((p) => p.id === productId);
  return (
    <>
      {product ? (
        <ProductWorkspace data={data} product={product} onProduct={onProduct} />
      ) : (
        <ProductList data={data} onOpen={onProduct} onNew={() => setCreating(true)} />
      )}
      <ProductEditor
        data={data}
        product={null}
        open={creating}
        onOpenChange={setCreating}
        onSaved={(p) => onProduct(p.id)}
      />
    </>
  );
}

function ProductList({
  data,
  onOpen,
  onNew,
}: {
  data: CreatorDetail;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const sales = useMemo(() => earningsByProduct(data.orders), [data.orders]);
  const products = data.products;
  const waitingOnCreator = products.filter(
    (p) => p.stage !== "live" && p.waitingOn === "creator",
  ).length;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-medium tracking-tight">Products ({products.length})</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {products.length
              ? `${products.filter((p) => p.stage === "live").length} live · ${products.filter((p) => p.stage !== "live").length} in the pipeline${waitingOnCreator ? ` · ${waitingOnCreator} waiting on the creator` : ""}`
              : "Create the first product to start the brief."}
          </p>
        </div>
        <Button size="sm" onClick={onNew}>
          <Plus aria-hidden />
          New product
        </Button>
      </div>
      {!products.length ? (
        <div className="border-t border-border px-4 py-12 text-center">
          <Package className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            No products yet.{" "}
            {data.creator.interests.skus.length
              ? `They asked about: ${data.creator.interests.skus.map((s) => SKUS[s].short.toLowerCase()).join(", ")}.`
              : ""}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {products.map((p) => {
            const s = sales.get(p.id);
            const scans = data.scans[p.id]?.total ?? 0;
            const pendingProof = p.proofs.some((x) => x.decision === "pending");
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5 @4xl/inset:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto]"
                >
                  <Hero data={data} product={p} className="size-12" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {SKUS[p.sku].short}
                      {p.campaign ? ` · ${p.campaign}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 @4xl/inset:hidden">
                      <StagePill stage={p.stage} />
                      {pendingProof ? (
                        <Pill tone="watch" dot={false}>
                          Proof out
                        </Pill>
                      ) : null}
                    </div>
                  </div>
                  <div className="hidden min-w-0 @4xl/inset:block">
                    <StageStepper product={p} />
                  </div>
                  <dl className="col-span-2 col-start-2 grid grid-cols-3 gap-x-3 text-xs @4xl/inset:col-span-1 @4xl/inset:col-start-auto @4xl/inset:grid-cols-2 @6xl/inset:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Waiting on</dt>
                      <dd>
                        <WaitingOn p={p} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {p.stage === "live" ? "Price" : "ETA"}
                      </dt>
                      <dd className="tabular-nums">
                        {p.stage === "live"
                          ? p.price != null
                            ? money(p.price, p.currency)
                            : "–"
                          : p.eta
                            ? shortDate(p.eta)
                            : "–"}
                      </dd>
                    </div>
                    <div className="@4xl/inset:hidden @6xl/inset:block">
                      <dt className="text-muted-foreground">Sold · scans</dt>
                      <dd className="tabular-nums">
                        {(s?.units ?? 0).toLocaleString()} · {scans.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                  <ChevronRight
                    className="row-start-1 size-4 text-muted-foreground col-start-3 @4xl/inset:col-start-5"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ProductWorkspace({
  data,
  product,
  onProduct,
}: {
  data: CreatorDetail;
  product: Product;
  onProduct: (id: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sales = earningsByProduct(data.orders).get(product.id);
  const exp = data.experiences.find((e) => e.id === product.experienceId);
  const share = product.revenueShare ?? data.creator.revenueShare;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn("-ml-2 text-muted-foreground", ghostBtn)}
          onClick={() => onProduct(undefined)}
        >
          <ChevronLeft aria-hidden />
          All products
        </Button>
        {data.products.length > 1 ? (
          <Select value={product.id} onValueChange={(v) => onProduct(v)}>
            <SelectTrigger className="h-8 w-60 text-xs" aria-label="Switch product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {STAGES[stageIndex(p.stage)].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <Panel className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <Hero data={data} product={product} className="size-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="text-xl font-medium tracking-tight">{product.name}</h2>
            <StagePill stage={product.stage} />
            {product.stage !== "live" ? (
              <Pill tone={product.waitingOn === "creator" ? "watch" : "muted"} dot={false}>
                Waiting on {product.waitingOn === "creator" ? "creator" : "MEDIALIFE"}
              </Pill>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {SKUS[product.sku].name}
            {product.campaign ? ` · ${product.campaign}` : ""}
          </div>
          {product.nextStep && product.stage !== "live" ? (
            <p className="mt-1.5 text-sm">
              <span className="text-muted-foreground">Next: </span>
              {product.nextStep}
            </p>
          ) : null}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Fact
              label="Price"
              value={product.price != null ? money(product.price, product.currency) : "Not set"}
            />
            <Fact
              label="Share"
              value={`${pct(share, (share * 100) % 1 ? 1 : 0)}${product.revenueShare == null ? " (default)" : ""}`}
            />
            <Fact label="ETA" value={product.eta ? shortDate(product.eta) : "–"} />
            <Fact
              label="Run"
              value={product.units != null ? `${product.units.toLocaleString()} units` : "–"}
            />
            <Fact
              label="Sold"
              value={`${(sales?.units ?? 0).toLocaleString()} · ${money(sales?.net ?? 0, product.currency)} net`}
            />
            <Fact label="Experience" value={exp?.name ?? "None"} />
          </dl>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className={outlineBtn}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden />
            Edit details
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8 text-muted-foreground", ghostBtn)}
                aria-label="More actions"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => setDeleting(true)}
                className="text-destructive focus:bg-destructive/15 focus:text-destructive"
              >
                <Trash2 aria-hidden /> Delete product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Panel>

      <div className="grid items-start gap-4 @5xl/inset:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <StagePanel data={data} product={product} />
          <ProofsPanel data={data} product={product} />
          <AssetsPanel data={data} product={product} />
        </div>
        <div className="min-w-0 space-y-4">
          <ThreadPanel data={data} product={product} />
          <ActivationPanel data={data} product={product} />
          <CommercePanel product={product} onEdit={() => setEditing(true)} />
        </div>
      </div>

      <ProductEditor data={data} product={product} open={editing} onOpenChange={setEditing} />
      <DeleteProductDialog
        open={deleting}
        onOpenChange={setDeleting}
        creatorId={data.creator.id}
        product={product}
        onDeleted={() => onProduct(undefined)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function CommercePanel({ product, onEdit }: { product: Product; onEdit: () => void }) {
  const c = product.commerce;
  const empty = !c.shopUrl && !c.shopifyProductIds.length && !c.skus.length;
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium tracking-tight">Store & order matching</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Incoming orders are credited by Shopify product id, then SKU.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-muted-foreground", ghostBtn)}
          onClick={onEdit}
        >
          <Pencil aria-hidden />
          Edit
        </Button>
      </div>
      {empty ? (
        <p className="mt-3 text-sm text-amber-200/90">
          Nothing linked yet: Shopify orders for this product won't be credited to the creator.
        </p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          {c.shopUrl ? (
            <div>
              <dt className="text-xs text-muted-foreground">Shop</dt>
              <dd className="truncate">
                <a
                  href={c.shopUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 hover:underline"
                >
                  {c.shopUrl}
                </a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">Shopify product ids</dt>
            <dd className="mono text-xs">{c.shopifyProductIds.join(", ") || "–"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">SKUs</dt>
            <dd className="mono text-xs break-all">{c.skus.join(", ") || "–"}</dd>
          </div>
        </dl>
      )}
    </Panel>
  );
}

function DeleteProductDialog({
  open,
  onOpenChange,
  creatorId,
  product,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorId: string;
  product: Product;
  onDeleted: () => void;
}) {
  const { pending, run } = useRun();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from the creator's hub and its activation link stops working. Products
            with orders can't be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={outlineBtn}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!!pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              const r = await run(
                "del",
                () => adminDeleteProduct({ data: { creatorId, productId: product.id } }),
                `Deleted ${product.name}`,
              );
              onOpenChange(false);
              if (r) onDeleted();
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Delete product
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
