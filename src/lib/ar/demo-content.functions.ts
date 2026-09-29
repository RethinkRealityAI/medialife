import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { ADMIN_COOKIE, verifyToken } from "./auth.server";
import {
  publishDemoContent,
  readDemoContent,
  resetDemoDraft,
  unpublishDemoContent,
} from "./demo-content.server";
import { DEMO_IDS, type DemoId } from "./demo-tours";
import { namespaceFromRequest } from "./store.server";

// Server functions for /admin/demos. Draft autosave goes through
// PUT /api/ar/demo-content/<demo> instead, so the last save can use fetch keepalive.

async function adminNs() {
  if (!(await verifyToken(getCookie(ADMIN_COOKIE)))) throw new Error("unauthorized");
  return namespaceFromRequest(getRequest());
}

const demoOnly = z.object({ demo: z.enum(DEMO_IDS as [DemoId, ...DemoId[]]) });

export const getDemoContentFn = createServerFn({ method: "GET" })
  .validator(demoOnly)
  .handler(async ({ data }) => readDemoContent(await adminNs(), data.demo));

export const publishDemoContentFn = createServerFn({ method: "POST" })
  .validator(demoOnly)
  .handler(async ({ data }) => publishDemoContent(await adminNs(), data.demo));

export const unpublishDemoContentFn = createServerFn({ method: "POST" })
  .validator(demoOnly)
  .handler(async ({ data }) => unpublishDemoContent(await adminNs(), data.demo));

export const resetDemoDraftFn = createServerFn({ method: "POST" })
  .validator(demoOnly.extend({ to: z.enum(["published", "defaults"]) }))
  .handler(async ({ data }) => resetDemoDraft(await adminNs(), data.demo, data.to));
