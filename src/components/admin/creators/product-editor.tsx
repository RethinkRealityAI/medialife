import { useEffect, useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { adminSaveProduct } from "@/lib/hub/admin.functions";
import {
  SKUS,
  SKU_IDS,
  TRIGGER_METHODS,
  isImage,
  pct,
  triggerUrl,
  type HubFile,
  type Product,
  type SkuId,
  type TriggerMethod,
} from "@/lib/hub/model";

import { QrCode } from "../qr";
import { FileThumb } from "./files-kit";
import { UrlPill } from "./qr-dialog";
import type { CreatorDetail } from "./types";
import { ChipsInput, Field, SectionLabel, centsToInput, ghostBtn, parseNum, useRun } from "./ui";

type SaveInput = Parameters<typeof adminSaveProduct>[0]["data"];

/** A stored product as adminSaveProduct input, with overrides: for one-field saves like the hero image. */
export function productInput(p: Product, patch: Partial<SaveInput> = {}): SaveInput {
  return {
    creatorId: p.creatorId,
    id: p.id,
    sku: p.sku,
    name: p.name,
    campaign: p.campaign,
    eta: p.eta,
    price: p.price == null ? null : p.price / 100,
    currency: p.currency,
    revenueShare: p.revenueShare,
    units: p.units,
    waitingOn: p.waitingOn,
    nextStep: p.nextStep,
    experienceId: p.experienceId,
    imageFileId: p.imageFileId,
    artworkIds: p.artworkIds,
    trigger: { method: p.trigger.method, placement: p.trigger.placement },
    commerce: {
      shopUrl: p.commerce.shopUrl,
      shopifyProductIds: p.commerce.shopifyProductIds,
      skus: p.commerce.skus,
    },
    ...patch,
  };
}

const NONE = "__none";

type Form = {
  sku: SkuId;
  name: string;
  campaign: string;
  eta: string;
  price: string;
  currency: string;
  share: string;
  units: string;
  experienceId: string;
  imageFileId: string;
  artworkIds: string[];
  method: TriggerMethod;
  placement: string;
  shopUrl: string;
  shopifyIds: string[];
  skus: string[];
};

function initialForm(p: Product | null, skuHint: SkuId | undefined): Form {
  return {
    sku: p?.sku ?? skuHint ?? "tee",
    name: p?.name ?? "",
    campaign: p?.campaign ?? "",
    eta: p?.eta ?? "",
    price: centsToInput(p?.price),
    currency: p?.currency ?? "USD",
    share: p?.revenueShare == null ? "" : String(Math.round(p.revenueShare * 1000) / 10),
    units: p?.units == null ? "" : String(p.units),
    experienceId: p?.experienceId ?? NONE,
    imageFileId: p?.imageFileId ?? NONE,
    artworkIds: p?.artworkIds ?? [],
    method: p?.trigger.method ?? "qr",
    placement: p?.trigger.placement ?? "",
    shopUrl: p?.commerce.shopUrl ?? "",
    shopifyIds: p?.commerce.shopifyProductIds ?? [],
    skus: p?.commerce.skus ?? [],
  };
}

/** "gid://shopify/Product/123" and admin URLs both come down to the number. */
const shopifyId = (s: string) => s.match(/(\d{1,20})\/?$/)?.[1] ?? s;

/**
 * Create or edit a product's details. Stage, proofs and messages live on the
 * product page itself; this is everything else adminSaveProduct takes.
 */
export function ProductEditor({
  data,
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  data: CreatorDetail;
  /** null to create */
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (p: Product) => void;
}) {
  const uid = useId();
  const { pending, run } = useRun();
  const creator = data.creator;
  const [f, setF] = useState<Form>(() => initialForm(product, creator.interests.skus[0]));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  useEffect(() => {
    if (open) {
      setF(initialForm(product, creator.interests.skus[0]));
      setErrors({});
    }
  }, [open, product, creator.interests.skus]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const heroFiles = useMemo(() => {
    const imgs = data.files.filter(
      (x) => (x.kind === "mockup" || x.kind === "proof") && isImage(x.mime),
    );
    const mine = imgs.filter((x) => product && x.productId === product.id);
    const others = imgs.filter((x) => !product || x.productId !== product.id);
    return { mine, others };
  }, [data.files, product]);
  const artwork = data.files.filter((x) => x.kind === "artwork");
  const hero = data.files.find((x) => x.id === f.imageFileId);

  function validate() {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Give the product a name";
    const price = parseNum(f.price);
    if (price !== null && (!Number.isFinite(price) || price < 0))
      e.price = "A price in dollars, e.g. 39";
    if (!/^[A-Z]{3}$/.test(f.currency)) e.currency = "3 letters, e.g. USD";
    const share = parseNum(f.share);
    if (share !== null && (!Number.isFinite(share) || share < 0 || share > 100)) e.share = "0–100";
    const units = parseNum(f.units);
    if (units !== null && (!Number.isInteger(units) || units < 0)) e.units = "A whole number";
    if (f.shopUrl.trim() && !/^https?:\/\/\S+$/i.test(f.shopUrl.trim()))
      e.shopUrl = "A full URL starting with https://";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    const share = parseNum(f.share);
    const input: SaveInput = {
      creatorId: creator.id,
      ...(product ? { id: product.id } : {}),
      sku: f.sku,
      name: f.name.trim(),
      campaign: f.campaign.trim(),
      eta: f.eta || null,
      price: parseNum(f.price),
      currency: f.currency,
      revenueShare: share === null ? null : Math.round(share * 10) / 1000,
      units: parseNum(f.units),
      waitingOn: product?.waitingOn ?? "medialife",
      nextStep: product?.nextStep ?? "",
      experienceId: f.experienceId === NONE ? null : f.experienceId,
      imageFileId: f.imageFileId === NONE ? null : f.imageFileId,
      artworkIds: f.artworkIds,
      trigger: { method: f.method, placement: f.placement.trim() },
      commerce: { shopUrl: f.shopUrl.trim(), shopifyProductIds: f.shopifyIds, skus: f.skus },
    };
    const r = await run(
      "save",
      () => adminSaveProduct({ data: input }),
      product ? "Product saved" : `Created ${input.name}`,
    );
    if (r && r.ok) {
      onSaved?.(r.product);
      onOpenChange(false);
    }
  }

  const link = product ? triggerUrl(data.origin, product.trigger.code) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>{product ? `Edit ${product.name}` : "New product"}</SheetTitle>
          <SheetDescription>
            {product
              ? "Details, pricing, the experience it opens, and how orders find it."
              : `For ${creator.profile.displayName || creator.profile.email}. It starts at the brief; the creator sees it straight away.`}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section className="grid gap-4 sm:grid-cols-2">
              <SectionLabel className="sm:col-span-2">Product</SectionLabel>
              <Field label="Type" htmlFor={`${uid}-sku`}>
                <Select value={f.sku} onValueChange={(v) => set("sku", v as SkuId)}>
                  <SelectTrigger id={`${uid}-sku`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKU_IDS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SKUS[s].name}
                        {creator.interests.skus.includes(s) ? " · requested" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Name" htmlFor={`${uid}-name`} error={errors.name}>
                <Input
                  id={`${uid}-name`}
                  value={f.name}
                  maxLength={120}
                  placeholder="Hidden Grove Tee"
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="Campaign / drop" htmlFor={`${uid}-campaign`} optional>
                <Input
                  id={`${uid}-campaign`}
                  value={f.campaign}
                  maxLength={120}
                  placeholder="Winter Drop 2026"
                  onChange={(e) => set("campaign", e.target.value)}
                />
              </Field>
              <Field
                label="Expected on sale"
                htmlFor={`${uid}-eta`}
                optional
                hint="An estimate the creator sees."
              >
                <Input
                  id={`${uid}-eta`}
                  type="date"
                  value={f.eta}
                  onChange={(e) => set("eta", e.target.value)}
                />
              </Field>
            </section>

            <section className="grid gap-4 sm:grid-cols-4">
              <SectionLabel className="sm:col-span-4">Pricing & run</SectionLabel>
              <Field
                label="Retail price"
                htmlFor={`${uid}-price`}
                error={errors.price}
                className="sm:col-span-1"
              >
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id={`${uid}-price`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={f.price}
                    placeholder={`${SKUS[f.sku].priceBand[0]}`}
                    onChange={(e) => set("price", e.target.value)}
                    className="pl-6 tabular-nums"
                  />
                </div>
              </Field>
              <Field label="Currency" htmlFor={`${uid}-cur`} error={errors.currency}>
                <Input
                  id={`${uid}-cur`}
                  value={f.currency}
                  maxLength={3}
                  className="mono uppercase"
                  onChange={(e) =>
                    set("currency", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
                  }
                />
              </Field>
              <Field label="Share override" htmlFor={`${uid}-share`} error={errors.share}>
                <div className="relative">
                  <Input
                    id={`${uid}-share`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.5}
                    value={f.share}
                    placeholder={String(Math.round(creator.revenueShare * 1000) / 10)}
                    onChange={(e) => set("share", e.target.value)}
                    className="pr-7 tabular-nums"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </Field>
              <Field label="Units in run" htmlFor={`${uid}-units`} error={errors.units}>
                <Input
                  id={`${uid}-units`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={f.units}
                  onChange={(e) => set("units", e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <p className="-mt-2 text-xs text-muted-foreground sm:col-span-4">
                Typical {SKUS[f.sku].short.toLowerCase()} price ${SKUS[f.sku].priceBand[0]}–$
                {SKUS[f.sku].priceBand[1]}. Leave the share blank to use the creator's{" "}
                {pct(creator.revenueShare, (creator.revenueShare * 100) % 1 ? 1 : 0)}.
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <SectionLabel className="sm:col-span-2">Experience & look</SectionLabel>
              <Field
                label="Experience it opens"
                htmlFor={`${uid}-exp`}
                hint={
                  !data.experiences.length
                    ? "No experiences yet. Add one in the Experiences tab."
                    : undefined
                }
              >
                <Select value={f.experienceId} onValueChange={(v) => set("experienceId", v)}>
                  <SelectTrigger id={`${uid}-exp`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None yet</SelectItem>
                    {data.experiences.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Hero image"
                htmlFor={`${uid}-hero`}
                hint="Shown on the product card. Upload mockups on the product page."
              >
                <div className="flex items-center gap-2">
                  {hero ? <FileThumb file={hero} className="size-9 shrink-0" /> : null}
                  <Select value={f.imageFileId} onValueChange={(v) => set("imageFileId", v)}>
                    <SelectTrigger id={`${uid}-hero`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {heroFiles.mine.length ? (
                        <SelectGroup>
                          <SelectLabel className="text-xs text-muted-foreground">
                            This product
                          </SelectLabel>
                          {heroFiles.mine.map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                      {heroFiles.others.length ? (
                        <SelectGroup>
                          <SelectLabel className="text-xs text-muted-foreground">
                            Other mockups & proofs
                          </SelectLabel>
                          {heroFiles.others.map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              </Field>
              {artwork.length ? (
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-medium">Creator artwork used</legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {artwork.map((a) => (
                      <ArtworkOption
                        key={a.id}
                        file={a}
                        checked={f.artworkIds.includes(a.id)}
                        onChange={(on) =>
                          set(
                            "artworkIds",
                            on ? [...f.artworkIds, a.id] : f.artworkIds.filter((x) => x !== a.id),
                          )
                        }
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <SectionLabel className="sm:col-span-2">Trigger</SectionLabel>
              <Field
                label="Method"
                htmlFor={`${uid}-method`}
                hint={TRIGGER_METHODS[f.method].blurb}
              >
                <Select value={f.method} onValueChange={(v) => set("method", v as TriggerMethod)}>
                  <SelectTrigger id={`${uid}-method`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRIGGER_METHODS) as TriggerMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {TRIGGER_METHODS[m].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Placement"
                htmlFor={`${uid}-place`}
                hint={`e.g. ${SKUS[f.sku].trigger}`}
              >
                <Input
                  id={`${uid}-place`}
                  value={f.placement}
                  maxLength={200}
                  onChange={(e) => set("placement", e.target.value)}
                />
              </Field>
              {link ? (
                <div className="flex items-center gap-3 sm:col-span-2">
                  <QrCode value={link} className="size-16 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      Activation link (the QR encodes it, the NFC tag opens it)
                    </div>
                    <UrlPill url={link} className="mt-1" />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  The activation link and QR code are made when you create the product.
                </p>
              )}
            </section>

            <section className="grid gap-4">
              <SectionLabel>Store & order matching</SectionLabel>
              <Field label="Shop URL" htmlFor={`${uid}-shop`} optional error={errors.shopUrl}>
                <Input
                  id={`${uid}-shop`}
                  type="url"
                  value={f.shopUrl}
                  maxLength={500}
                  placeholder="https://shop.medialife.ai/products/…"
                  onChange={(e) => set("shopUrl", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Shopify product ids"
                  htmlFor={`${uid}-pids`}
                  hint="Orders containing these products are credited here. Paste ids or product URLs."
                >
                  <ChipsInput
                    id={`${uid}-pids`}
                    mono
                    max={20}
                    value={f.shopifyIds}
                    onChange={(v) => set("shopifyIds", v.map(shopifyId))}
                    placeholder="e.g. 8012345678901"
                    validate={(s) =>
                      /^\d{1,20}$/.test(shopifyId(s)) ? null : "Shopify product ids are numbers"
                    }
                  />
                </Field>
                <Field
                  label="SKUs"
                  htmlFor={`${uid}-skus`}
                  hint="Variant SKUs, matched when there's no product id."
                >
                  <ChipsInput
                    id={`${uid}-skus`}
                    mono
                    value={f.skus}
                    onChange={(v) => set("skus", v)}
                    placeholder="e.g. PP-TEE-BLK-M"
                    validate={(s) => (s.length > 80 ? "80 characters at most" : null)}
                  />
                </Field>
              </div>
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              className={ghostBtn}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!!pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {product ? "Save product" : "Create product"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ArtworkOption({
  file,
  checked,
  onChange,
}: {
  file: HubFile;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-1.5 has-[button[data-state=checked]]:border-sky-400/50 has-[button[data-state=checked]]:bg-sky-400/[0.06]"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <FileThumb file={file} className="size-8 shrink-0" />
      <span className="min-w-0 truncate text-xs" title={file.name}>
        {file.name}
      </span>
    </label>
  );
}
