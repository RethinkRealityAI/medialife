import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { ADMIN_COOKIE, verifyToken } from "@/lib/ar/auth.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

import { lootAction, lootExport, lootLookup, lootOverview, lootSaveSettings } from "./admin.server";

// Server functions behind /admin/lootbreak. Every one needs the admin session.

async function adminNs() {
  if (!(await verifyToken(getCookie(ADMIN_COOKIE)))) throw new Error("unauthorized");
  return namespaceFromRequest(getRequest());
}

const codeArg = z.string().trim().min(4).max(40);

export const lootOverviewFn = createServerFn({ method: "GET" }).handler(async () =>
  lootOverview(await adminNs()),
);

export const lootExportFn = createServerFn({ method: "GET" }).handler(async () =>
  lootExport(await adminNs()),
);

export const lootLookupFn = createServerFn({ method: "POST" })
  .validator(z.object({ code: codeArg }))
  .handler(async ({ data }) => lootLookup(await adminNs(), data.code));

export const lootActionFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: codeArg,
      action: z.enum(["redeem", "unredeem", "void", "reactivate", "verify", "unverify"]),
      note: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => lootAction(await adminNs(), data.code, data.action, data.note));

export const lootSaveSettingsFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      active: z.boolean(),
      rewards: z.array(z.object({ tier: z.number(), percent: z.number() })).max(6),
      questEnabled: z.boolean(),
      questPercent: z.number(),
      follow: z.array(z.object({ label: z.string().max(40), url: z.string().max(400) })).max(5),
      storyTags: z.string().max(120),
      shopUrl: z.string().max(400),
      shopLabel: z.string().max(30),
      prefix: z.string().max(6),
      expiryDays: z.number(),
      terms: z.string().max(300),
    }),
  )
  .handler(async ({ data }) => lootSaveSettings(await adminNs(), data));
