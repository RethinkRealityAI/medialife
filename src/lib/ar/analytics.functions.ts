import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  assertAdmin,
  buildDashboard,
  removeSampleData,
  sessionDetail,
  writeSampleData,
} from "./analytics.server";
import { namespaceFromRequest } from "./store.server";

// Server functions behind /admin/analytics. Everything is admin-only and
// returns pre-aggregated JSON (see analytics.server.ts).

export const getDashboard = createServerFn({ method: "GET" })
  .validator(
    z.object({
      range: z.enum(["today", "7d", "30d", "90d"]),
      demo: z
        .string()
        .regex(/^(all|[a-z0-9:_-]{1,64})$/)
        .default("all"),
      client: z.string().min(1).max(120).default("all"),
      tz: z.string().max(64).default("UTC"),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    return buildDashboard(namespaceFromRequest(getRequest()), data);
  });

export const getSessionDetail = createServerFn({ method: "GET" })
  .validator(
    z.object({ key: z.string().regex(/^\d{4}-\d{2}-\d{2}\/[0-9a-z]{6,12}-[0-9a-z]{4,16}$/) }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    return sessionDetail(namespaceFromRequest(getRequest()), data.key);
  });

/** Dev and deploy previews only: the server refuses in production. */
export const loadSampleData = createServerFn({ method: "POST" }).handler(async () => {
  await assertAdmin();
  return writeSampleData(namespaceFromRequest(getRequest()));
});

export const clearSampleData = createServerFn({ method: "POST" }).handler(async () => {
  await assertAdmin();
  return removeSampleData(namespaceFromRequest(getRequest()));
});
