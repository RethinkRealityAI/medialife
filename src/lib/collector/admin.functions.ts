import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { ADMIN_COOKIE, verifyToken } from "@/lib/ar/auth.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

import {
  collectorOverview,
  createBatch,
  deleteAlert,
  MAX_BATCH,
  sendAlert,
  setBatchStatus,
} from "./admin.server";
import { ALERT_KINDS } from "./model";

// Server functions behind /admin/collector. Every one needs the admin session.

async function adminNs() {
  if (!(await verifyToken(getCookie(ADMIN_COOKIE)))) throw new Error("unauthorized");
  return namespaceFromRequest(getRequest());
}

export const collectorOverviewFn = createServerFn({ method: "GET" }).handler(async () =>
  collectorOverview(await adminNs()),
);

export const sendAlertFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      room: z.string().max(30),
      kind: z.enum(ALERT_KINDS as [string, ...string[]]),
      title: z.string().trim().min(1, "Add a title").max(60),
      body: z.string().trim().max(180),
      linkLabel: z.string().trim().max(24).optional(),
      linkUrl: z.string().trim().max(400).optional(),
    }),
  )
  .handler(async ({ data }) =>
    sendAlert(await adminNs(), { ...data, kind: data.kind as (typeof ALERT_KINDS)[number] }),
  );

export const deleteAlertFn = createServerFn({ method: "POST" })
  .validator(z.object({ room: z.string().max(30), id: z.string().max(40) }))
  .handler(async ({ data }) => {
    await deleteAlert(await adminNs(), data.room, data.id);
    return { ok: true };
  });

export const createBatchFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      room: z.string().max(30),
      product: z.string().max(30),
      label: z.string().max(80),
      count: z.number().int().min(1).max(MAX_BATCH),
      experienceUrl: z.string().url().max(400),
    }),
  )
  .handler(async ({ data }) => createBatch(await adminNs(), data));

export const setBatchStatusFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ key: z.string().regex(/^[2-9A-Z]{2}$/), status: z.enum(["active", "paused"]) }),
  )
  .handler(async ({ data }) => {
    await setBatchStatus(await adminNs(), data.key, data.status);
    return { ok: true };
  });
