import { createFileRoute } from "@tanstack/react-router";

import { ingestKeyOk, ingestSchema, normaliseIngest, storeOrder } from "@/lib/hub/commerce.server";
import { hubNs } from "@/lib/hub/store.server";

// Orders from any channel without a native integration (TikTok Shop, a
// marketplace, a convention booth, a Zapier / Make flow).
//
//   POST /api/hub/orders
//   Authorization: Bearer <HUB_INGEST_KEY>
//   { channel, externalId, number?, createdAt (ISO), currency, status?, country?,
//     lines: [{ sku | productId, title?, qty, unitPrice (cents), discount?, refunded?, refundedQty? }] }
//
// Re-sending the same channel + externalId updates the order (refunds, cancels).

export const Route = createFileRoute("/api/hub/orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!ingestKeyOk(request.headers.get("authorization"))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        let body: unknown;
        try {
          body = JSON.parse(await request.text());
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = ingestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid order", issues: parsed.error.issues.slice(0, 10) },
            { status: 422 },
          );
        }
        const ns = hubNs(request);
        const result = await storeOrder(ns, await normaliseIngest(ns, parsed.data));
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
