import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { ADMIN_COOKIE, verifyToken } from "./auth.server";
import { slugSchema } from "./project";
import {
  createProject,
  deleteProject,
  duplicateProject,
  hasUnpublishedChanges,
  listProjects,
  publishProject,
  readProject,
  renameProject,
  summarize,
  unpublishProject,
} from "./projects.server";
import { namespaceFromRequest } from "./store.server";

// Server functions for /admin/builder. Draft autosave goes through
// PUT /api/ar/admin/project/<slug> instead, so a last save can be sent with
// fetch keepalive while the tab closes.

async function adminNs() {
  if (!(await verifyToken(getCookie(ADMIN_COOKIE)))) throw new Error("unauthorized");
  return namespaceFromRequest(getRequest());
}

const slugOnly = z.object({ slug: slugSchema });

export const listProjectsFn = createServerFn({ method: "GET" }).handler(async () => {
  return listProjects(await adminNs());
});

export const getProjectFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().max(60) }))
  .handler(async ({ data }) => {
    const doc = await readProject(await adminNs(), data.slug);
    if (!doc) return null;
    return { doc, summary: summarize(doc), hasUnpublishedChanges: hasUnpublishedChanges(doc) };
  });

export const slugAvailableFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().max(60) }))
  .handler(async ({ data }) => {
    const ns = await adminNs();
    if (!slugSchema.safeParse(data.slug).success) return { available: false, valid: false };
    return { available: !(await readProject(ns, data.slug)), valid: true };
  });

export const createProjectFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().max(60),
      name: z.string().trim().min(1).max(80),
      client: z.string().trim().max(80).optional(),
      /** template JSON fetched by the browser; blank project when absent */
      source: z.unknown().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const r = await createProject(await adminNs(), data);
    return r.ok ? { ok: true as const, slug: r.doc.slug } : r;
  });

export const duplicateProjectFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => duplicateProject(await adminNs(), data.slug));

export const renameProjectFn = createServerFn({ method: "POST" })
  .validator(z.object({ from: slugSchema, to: z.string().max(60) }))
  .handler(async ({ data }) => {
    const r = await renameProject(await adminNs(), data.from, data.to);
    return r.ok ? { ok: true as const, slug: r.doc.slug, updatedAt: r.doc.updatedAt } : r;
  });

export const deleteProjectFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => deleteProject(await adminNs(), data.slug));

const assetPath = z.string().regex(/^\/api\/ar\/asset\/[a-z0-9]{10,40}$/);

export const publishProjectFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: slugSchema,
      ar: z.discriminatedUnion("mode", [
        z.object({
          mode: z.literal("new"),
          glb: assetPath,
          usdz: assetPath,
          generatedAt: z.number().int().positive(),
        }),
        z.object({ mode: z.literal("keep") }),
        z.object({ mode: z.literal("none") }),
      ]),
      thumb: assetPath.nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const r = await publishProject(await adminNs(), data.slug, { ar: data.ar, thumb: data.thumb });
    return r.ok ? { ok: true as const, doc: r.doc, summary: r.summary } : r;
  });

export const unpublishProjectFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => unpublishProject(await adminNs(), data.slug));
