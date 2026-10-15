import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { publicOrigin } from "./auth.server";
import { listProducts } from "./data.server";
import { getOverlay, overlayPath, rotateOverlay, saveOverlay } from "./overlay.server";
import { requireCreator } from "./session.server";

// The creator's side of the Live Drop overlay (/creator-hub/live): settings,
// the secret browser-source URL, "send a test alert", "restart the goal".

async function view() {
  const { ns, creator } = await requireCreator();
  const rec = await getOverlay(ns, creator.id);
  const products = await listProducts(ns, creator.id);
  const { token, createdAt: _c, ...settings } = rec;
  return {
    settings,
    url: `${publicOrigin(getRequest(), ns)}${overlayPath(token)}`,
    path: overlayPath(token),
    approved: creator.status === "approved",
    products: products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, stage: p.stage })),
  };
}

export const getLiveOverlay = createServerFn({ method: "GET" }).handler(view);

export const updateLiveOverlay = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        enabled: z.boolean(),
        productId: z
          .string()
          .regex(/^[A-Za-z0-9]{6,60}$/)
          .nullable(),
        goal: z.number().int().min(0).max(1_000_000),
        headline: z.string().trim().max(60),
        qrTarget: z.enum(["shop", "activation"]),
        showQr: z.boolean(),
        showRevenue: z.boolean(),
        position: z.enum(["bottom", "top"]),
        accent: z.enum(["ember", "cyan", "magenta", "lime"]),
      })
      .partial(),
  )
  .handler(async ({ data }) => {
    const { ns, creator } = await requireCreator();
    if (data.productId) {
      const products = await listProducts(ns, creator.id);
      if (!products.some((p) => p.id === data.productId))
        return { ok: false as const, error: "Unknown product." };
    }
    await saveOverlay(ns, creator.id, data);
    return { ok: true as const, ...(await view()) };
  });

/** Starts counting toward the goal from now (a new stream, a new drop). */
export const restartLiveGoal = createServerFn({ method: "POST" }).handler(async () => {
  const { ns, creator } = await requireCreator();
  await saveOverlay(ns, creator.id, { goalStartedAt: Date.now() });
  return { ok: true as const, ...(await view()) };
});

/** Plays a fake order on the overlay within a few seconds, to check it in OBS. */
export const sendTestAlert = createServerFn({ method: "POST" }).handler(async () => {
  const { ns, creator } = await requireCreator();
  await saveOverlay(ns, creator.id, { testAt: Date.now() });
  return { ok: true as const };
});

/** A new secret URL; the old browser source stops working. */
export const rotateLiveOverlay = createServerFn({ method: "POST" }).handler(async () => {
  const { ns, creator } = await requireCreator();
  await rotateOverlay(ns, creator.id);
  return { ok: true as const, ...(await view()) };
});
