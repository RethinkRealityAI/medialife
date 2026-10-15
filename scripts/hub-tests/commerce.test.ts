// Order normalisation (Shopify webhooks) and the earnings maths. Run with `npm run test:hub`.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { normaliseShopify, verifyShopifyHmac } from "@/lib/hub/commerce.server";
import { summarizeEarnings, earningsByProduct, lineEarning, type Order } from "@/lib/hub/model";

const index = {
  "pid:111": { creatorId: "c1", productId: "p1" },
  "sku:tee-blk-m": { creatorId: "c2", productId: "p2" },
};

const order = {
  id: 9001,
  name: "#9001",
  created_at: "2026-10-01T10:00:00Z",
  currency: "USD",
  financial_status: "partially_refunded",
  cancelled_at: null,
  shipping_address: { country_code: "CA" },
  line_items: [
    {
      id: 1,
      product_id: 111,
      sku: "KC-1",
      title: "Keychain",
      quantity: 2,
      price: "18.00",
      discount_allocations: [{ amount: "3.60" }],
    },
    {
      id: 2,
      product_id: 222,
      sku: "TEE-BLK-M",
      title: "Tee",
      quantity: 1,
      price: "39.00",
      total_discount: "0.00",
    },
    { id: 3, product_id: 333, sku: "OTHER", title: "Unknown hoodie", quantity: 1, price: "60.00" },
  ],
  refunds: [{ refund_line_items: [{ line_item_id: 1, quantity: 1, subtotal: "16.20" }] }],
};

const n = normaliseShopify(order as never, index, "shop.medialife.ai")!;
assert.equal(n.status, "partially-refunded");
assert.equal(n.country, "CA");
assert.deepEqual(n.lines[0].match, { creatorId: "c1", productId: "p1" });
assert.equal(n.lines[0].unitPrice, 1800);
assert.equal(n.lines[0].discount, 360);
assert.equal(n.lines[0].refunded, 1620);
assert.equal(n.lines[0].refundedQty, 1);
assert.deepEqual(
  n.lines[1].match,
  { creatorId: "c2", productId: "p2" },
  "sku match is case-insensitive",
);
assert.equal(n.lines[2].match, null, "unknown product is unmatched");

// pending orders are ignored until paid; test orders always
assert.equal(
  normaliseShopify({ ...order, financial_status: "pending" } as never, index, "s"),
  null,
);
assert.equal(normaliseShopify({ ...order, test: true } as never, index, "s"), null);
// cancelled orders are recorded as cancelled
assert.equal(
  normaliseShopify(
    { ...order, financial_status: "voided", cancelled_at: "2026-10-02T00:00:00Z" } as never,
    index,
    "s",
  )!.status,
  "cancelled",
);

// HMAC
process.env.SHOPIFY_WEBHOOK_SECRET = "s3cret";
const raw = JSON.stringify(order);
const good = createHmac("sha256", "s3cret").update(raw).digest("base64");
assert.equal(verifyShopifyHmac(raw, good), true);
assert.equal(verifyShopifyHmac(raw + " ", good), false);
assert.equal(verifyShopifyHmac(raw, null), false);

// Earnings: net = 2*1800 - 360 - 1620 = 1620; 20% => 324
const DAY = 86_400_000;
const now = Date.parse("2026-10-09T00:00:00Z");
const o = (id: string, ageDays: number, status: Order["status"], lines: Order["lines"]): Order => ({
  id,
  creatorId: "c1",
  source: "shopify",
  channel: "s",
  externalId: id,
  number: id,
  createdAt: now - ageDays * DAY,
  currency: "USD",
  status,
  country: null,
  lines,
});
const L = (qty: number, unit: number, discount = 0, refunded = 0, refundedQty = 0) => ({
  productId: "p1",
  name: "K",
  sku: "",
  qty,
  unitPrice: unit,
  discount,
  refunded,
  refundedQty,
  share: 0.2,
});
assert.equal(lineEarning(L(2, 1800, 360, 1620, 1)), 324);
const orders = [
  o("old", 45, "paid", [L(1, 1000)]), // matured: 200
  o("new", 5, "paid", [L(3, 1000, 500)]), // pending: 500
  o("cxl", 50, "cancelled", [L(10, 1000)]), // ignored
  o("ref", 40, "refunded", [L(1, 1000, 0, 1000, 1)]), // 0
];
const s = summarizeEarnings(
  orders,
  [
    {
      id: "x",
      creatorId: "c1",
      amount: 150,
      currency: "USD",
      periodLabel: "",
      paidAt: now,
      reference: "",
    },
  ],
  now,
  30,
);
assert.equal(s.orders, 3);
assert.equal(s.units, 4);
assert.equal(s.earned, 700);
assert.equal(s.pending, 500);
assert.equal(s.paid, 150);
assert.equal(s.available, 50);
assert.equal(earningsByProduct(orders).get("p1")!.units, 4);
console.log("commerce + earnings: all assertions passed");
