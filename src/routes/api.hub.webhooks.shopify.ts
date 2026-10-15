import { createFileRoute } from "@tanstack/react-router";

import { normaliseShopify, storeOrder, verifyShopifyHmac } from "@/lib/hub/commerce.server";
import { commerceIndex } from "@/lib/hub/data.server";
import { hubNs } from "@/lib/hub/store.server";

// Shopify → Creator Hub. Subscribe the store's orders/paid, orders/updated and
// orders/cancelled webhooks (JSON) to https://medialife.ai/api/hub/webhooks/shopify
// and set SHOPIFY_WEBHOOK_SECRET to the signing secret Shopify shows. Every
// request is HMAC-verified against the raw body; orders are stored per creator
// and idempotently (see src/lib/hub/commerce.server.ts).

const MAX_BODY = 2 * 1024 * 1024;
const TOPICS = new Set([
  "orders/create",
  "orders/paid",
  "orders/updated",
  "orders/cancelled",
  "orders/fulfilled",
]);

export const Route = createFileRoute("/api/hub/webhooks/shopify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > MAX_BODY) return new Response(null, { status: 413 });
        if (!verifyShopifyHmac(raw, request.headers.get("x-shopify-hmac-sha256"))) {
          return new Response("invalid signature", { status: 401 });
        }
        const topic = request.headers.get("x-shopify-topic") ?? "";
        // Acknowledge topics we don't handle, so Shopify doesn't retry them.
        if (!TOPICS.has(topic)) return new Response(null, { status: 200 });

        const ns = hubNs(request);
        let payload: Parameters<typeof normaliseShopify>[0];
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("invalid JSON", { status: 400 });
        }
        const shop = request.headers.get("x-shopify-shop-domain") ?? "Shopify";
        const order = normaliseShopify(payload, await commerceIndex(ns), shop);
        if (!order) return new Response(null, { status: 200 });
        try {
          const result = await storeOrder(ns, order);
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          // a 5xx makes Shopify retry the delivery, which is what we want
          console.error("[creator-hub] shopify order failed", err);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
