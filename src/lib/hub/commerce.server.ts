import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { z } from "zod";

import {
  commerceIndex,
  getCreator,
  getProduct,
  logActivity,
  saveOrder,
  type CommerceRef,
} from "./data.server";
import { money, type Order, type OrderLine } from "./model";
import { KEYS, hubStore, type HubNamespace } from "./store.server";

// Orders into the Creator Hub.
//
// Two ways in:
//  1. Shopify webhooks (orders/paid, orders/updated, orders/cancelled) at
//     POST /api/hub/webhooks/shopify, verified with SHOPIFY_WEBHOOK_SECRET.
//  2. Any other channel (TikTok Shop, a marketplace, a Zapier/Make flow) at
//     POST /api/hub/orders with "Authorization: Bearer <HUB_INGEST_KEY>" and a
//     normalised order (ingestSchema below).
//
// Each order line is matched to a creator's product by Shopify product id or by
// SKU (set on the product in /admin/creators). One external order can contain
// several creators' products: it is split and stored once per creator, keyed by
// source + external id, so a re-delivered or updated webhook overwrites rather
// than double-counts. Lines that match nothing are kept under "unmatched" for
// the team to fix. No buyer names, emails or addresses are stored — only the
// country, for the regional breakdown.

/* ---------------------------------------------------------------------------
   Shopify
   --------------------------------------------------------------------------- */

export function shopifyConfigured() {
  return !!process.env.SHOPIFY_WEBHOOK_SECRET;
}

/** X-Shopify-Hmac-Sha256 is base64(HMAC-SHA256(secret, raw body)). */
export function verifyShopifyHmac(raw: string, header: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const digest = createHmac("sha256", secret).update(raw, "utf8").digest();
  const given = Buffer.from(header, "base64");
  return given.length === digest.length && timingSafeEqual(given, digest);
}

const cents = (v: unknown) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Prefer the shop-currency amount from a *_set field, so every order is in one currency. */
const shopMoney = (set: unknown, fallback: unknown) => {
  const amt = (set as { shop_money?: { amount?: string } } | undefined)?.shop_money?.amount;
  return cents(amt ?? fallback);
};

type ShopifyLine = {
  id: number;
  product_id: number | null;
  sku: string | null;
  title: string;
  name?: string;
  quantity: number;
  price: string;
  price_set?: unknown;
  total_discount?: string;
  total_discount_set?: unknown;
  discount_allocations?: Array<{ amount: string; amount_set?: unknown }>;
};

type ShopifyOrder = {
  id: number;
  name: string;
  created_at: string;
  processed_at?: string;
  currency: string;
  financial_status: string | null;
  cancelled_at: string | null;
  test?: boolean;
  source_name?: string;
  shipping_address?: { country_code?: string } | null;
  billing_address?: { country_code?: string } | null;
  line_items: ShopifyLine[];
  refunds?: Array<{
    refund_line_items?: Array<{
      line_item_id: number;
      quantity: number;
      subtotal: number | string;
      subtotal_set?: unknown;
    }>;
  }>;
};

/** Paid orders count. Pending/authorised ones arrive again as orders/paid. */
const COUNTED = new Set(["paid", "partially_refunded", "refunded"]);

export type NormalisedLine = {
  match: CommerceRef | null;
  title: string;
  sku: string;
  productKey: string;
  qty: number;
  unitPrice: number;
  discount: number;
  refunded: number;
  refundedQty: number;
};

export type NormalisedOrder = {
  source: Order["source"];
  channel: string;
  externalId: string;
  number: string;
  createdAt: number;
  currency: string;
  status: Order["status"];
  country: string | null;
  lines: NormalisedLine[];
};

export function normaliseShopify(
  o: ShopifyOrder,
  index: Record<string, CommerceRef>,
  shop: string,
): NormalisedOrder | null {
  if (o.test) return null;
  const counted = o.cancelled_at || COUNTED.has(o.financial_status ?? "");
  if (!counted) return null;

  const refundedByLine = new Map<number, { amount: number; qty: number }>();
  for (const r of o.refunds ?? []) {
    for (const rl of r.refund_line_items ?? []) {
      const cur = refundedByLine.get(rl.line_item_id) ?? { amount: 0, qty: 0 };
      cur.amount += shopMoney(rl.subtotal_set, rl.subtotal);
      cur.qty += rl.quantity;
      refundedByLine.set(rl.line_item_id, cur);
    }
  }

  const lines = o.line_items.map((l): NormalisedLine => {
    const pid = l.product_id ? `pid:${l.product_id}` : "";
    const sku = (l.sku ?? "").trim();
    const match = (pid && index[pid]) || (sku && index[`sku:${sku.toLowerCase()}`]) || null;
    const discount = l.discount_allocations?.length
      ? l.discount_allocations.reduce((s, d) => s + shopMoney(d.amount_set, d.amount), 0)
      : shopMoney(l.total_discount_set, l.total_discount);
    const refund = refundedByLine.get(l.id) ?? { amount: 0, qty: 0 };
    return {
      match,
      title: l.name ?? l.title,
      sku,
      productKey: l.product_id ? String(l.product_id) : "",
      qty: l.quantity,
      unitPrice: shopMoney(l.price_set, l.price),
      discount,
      refunded: refund.amount,
      refundedQty: refund.qty,
    };
  });

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const refundedQty = lines.reduce((s, l) => s + l.refundedQty, 0);
  const status: Order["status"] = o.cancelled_at
    ? "cancelled"
    : refundedQty >= totalQty && totalQty > 0
      ? "refunded"
      : refundedQty > 0 || o.financial_status === "partially_refunded"
        ? "partially-refunded"
        : "paid";

  return {
    source: "shopify",
    channel:
      o.source_name && o.source_name !== "web" && o.source_name !== "shopify_draft_order"
        ? `${shop} (${o.source_name})`
        : shop,
    externalId: String(o.id),
    number: o.name,
    createdAt: Date.parse(o.processed_at ?? o.created_at) || Date.now(),
    currency: o.currency,
    status,
    country: o.shipping_address?.country_code ?? o.billing_address?.country_code ?? null,
    lines,
  };
}

/* ---------------------------------------------------------------------------
   Generic ingest
   --------------------------------------------------------------------------- */

export function ingestKeyOk(header: string | null): boolean {
  const key = process.env.HUB_INGEST_KEY;
  if (!key || key.length < 24 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const ingestSchema = z.object({
  /** e.g. "TikTok Shop", "Whatnot", "Convention booth" */
  channel: z.string().trim().min(1).max(80),
  externalId: z.string().trim().min(1).max(120),
  number: z.string().trim().max(60).optional(),
  /** ISO timestamp */
  createdAt: z.string().datetime({ offset: true }),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["paid", "partially-refunded", "refunded", "cancelled"]).default("paid"),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  lines: z
    .array(
      z.object({
        /** Match by SKU (as set on the product), or by our product id. */
        sku: z.string().trim().max(80).optional(),
        productId: z
          .string()
          .regex(/^[A-Za-z0-9]{6,60}$/)
          .optional(),
        title: z.string().max(200).optional(),
        qty: z.number().int().min(1).max(100_000),
        /** Per-unit price in minor units (cents). */
        unitPrice: z.number().int().min(0),
        discount: z.number().int().min(0).default(0),
        refunded: z.number().int().min(0).default(0),
        refundedQty: z.number().int().min(0).default(0),
      }),
    )
    .min(1)
    .max(200),
});

export async function normaliseIngest(
  ns: HubNamespace,
  body: z.infer<typeof ingestSchema>,
): Promise<NormalisedOrder> {
  const index = await commerceIndex(ns);
  const byProductId = new Map(Object.values(index).map((r) => [r.productId, r]));
  return {
    source: "other",
    channel: body.channel,
    externalId: `${body.channel}-${body.externalId}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .slice(0, 120),
    number: body.number ?? body.externalId,
    createdAt: Date.parse(body.createdAt),
    currency: body.currency,
    status: body.status,
    country: body.country ?? null,
    lines: body.lines.map((l) => ({
      match:
        (l.productId && byProductId.get(l.productId)) ||
        (l.sku && index[`sku:${l.sku.toLowerCase()}`]) ||
        null,
      title: l.title ?? l.sku ?? l.productId ?? "Item",
      sku: l.sku ?? "",
      productKey: l.productId ?? "",
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discount,
      refunded: l.refunded,
      refundedQty: l.refundedQty,
    })),
  };
}

/* ---------------------------------------------------------------------------
   Storing: split per creator, idempotent
   --------------------------------------------------------------------------- */

export async function storeOrder(ns: HubNamespace, n: NormalisedOrder) {
  const id = `${n.source}-${n.externalId}`;
  const byCreator = new Map<string, NormalisedLine[]>();
  const unmatched: NormalisedLine[] = [];
  for (const l of n.lines) {
    if (!l.match) unmatched.push(l);
    else byCreator.set(l.match.creatorId, [...(byCreator.get(l.match.creatorId) ?? []), l]);
  }

  const store = await hubStore(ns);
  const stored: string[] = [];
  for (const [creatorId, lines] of byCreator) {
    const creator = await getCreator(ns, creatorId);
    if (!creator) continue;
    const isNew = !(await store.getJSON(KEYS.order(creatorId, id)));
    const orderLines: OrderLine[] = [];
    for (const l of lines) {
      const product = await getProduct(ns, creatorId, l.match!.productId);
      orderLines.push({
        productId: l.match!.productId,
        name: product?.name ?? l.title,
        sku: l.sku,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discount: l.discount,
        refunded: l.refunded,
        refundedQty: l.refundedQty,
        // the share in force when the order was placed; an update keeps it
        share: product?.revenueShare ?? creator.revenueShare,
      });
    }
    if (!isNew) {
      const prev = await store.getJSON<Order>(KEYS.order(creatorId, id));
      for (const ol of orderLines) {
        const was = prev?.lines.find((p) => p.productId === ol.productId);
        if (was) ol.share = was.share;
      }
    }
    const order: Order = {
      id,
      creatorId,
      source: n.source,
      channel: n.channel,
      externalId: n.externalId,
      number: n.number,
      createdAt: n.createdAt,
      currency: n.currency,
      status: n.status,
      country: n.country,
      lines: orderLines,
    };
    await saveOrder(ns, order);
    stored.push(creatorId);
    // Orders show on the dashboard as they arrive; only the first sale earns a
    // place in the activity feed, so approvals and stage changes don't scroll away.
    if (
      isNew &&
      n.status !== "cancelled" &&
      (await store.list(KEYS.orders(creatorId))).length === 1
    ) {
      const earned = orderLines.reduce(
        (s, l) =>
          s + Math.round(Math.max(0, l.unitPrice * l.qty - l.discount - l.refunded) * l.share),
        0,
      );
      await logActivity(ns, creatorId, {
        kind: "order",
        title: "Your first sale",
        body: `Order ${n.number}: ${orderLines.map((l) => `${l.qty} × ${l.name}`).join(", ")}. You earned ${money(earned, n.currency)}.`,
        at: n.createdAt,
      });
    }
  }

  if (unmatched.length) {
    await store.setJSON(KEYS.unmatched(id), {
      id,
      at: n.createdAt,
      channel: n.channel,
      number: n.number,
      lines: unmatched.map((l) => ({
        title: l.title,
        sku: l.sku,
        productId: l.productKey,
        qty: l.qty,
      })),
    });
  } else {
    await store.del(KEYS.unmatched(id));
  }
  return { id, creators: stored, unmatched: unmatched.length };
}
