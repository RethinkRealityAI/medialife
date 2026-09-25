import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  assertAdmin,
  BUILTIN_DEMOS,
  LINK_STATS_DAYS,
  linkStats,
  listDemoOptions,
  readLinks,
} from "./analytics.server";
import { linkSchema, type ArLink } from "./events";
import { arStore, namespaceFromRequest } from "./store.server";

// Server functions behind /admin/links. Links live in arStore("links"), one
// record per code ("<code>.json"); the demo pages resolve them through the
// public GET /api/ar/link?c=CODE.

const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{2,40}$/, "2–40 lowercase letters, numbers, - or _");
const nameSchema = z.string().trim().min(1, "Add a name").max(80);
const noteSchema = z.string().trim().max(500);

function ns() {
  return namespaceFromRequest(getRequest());
}

export const listLinks = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const n = ns();
  const [links, stats, demos] = await Promise.all([readLinks(n), linkStats(n), listDemoOptions(n)]);
  return { ns: n, links, stats, statsDays: LINK_STATS_DAYS, demos };
});

export const createLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: codeSchema,
      name: nameSchema,
      demo: z.string().regex(/^[a-z0-9:_-]{1,64}$/),
      unlock: z.boolean(),
      note: noteSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const n = ns();
    if (!BUILTIN_DEMOS.some((d) => d.id === data.demo)) {
      const slug = data.demo.startsWith("x:") ? data.demo.slice(2) : "";
      const project = /^[a-z0-9-]+$/.test(slug)
        ? await (await arStore("projects", n)).getJSON(`${slug}.json`)
        : null;
      if (!project) return { ok: false as const, error: "demo" as const };
    }
    const store = await arStore("links", n);
    if (await store.getJSON(`${data.code}.json`))
      return { ok: false as const, error: "taken" as const };
    const link: ArLink = linkSchema.parse({
      code: data.code,
      name: data.name,
      demo: data.demo,
      unlock: data.unlock,
      ...(data.note ? { note: data.note } : {}),
      createdAt: Date.now(),
    });
    await store.setJSON(`${link.code}.json`, link);
    return { ok: true as const, link };
  });

export const updateLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: codeSchema,
      name: nameSchema.optional(),
      note: noteSchema.optional(),
      unlock: z.boolean().optional(),
      archived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const store = await arStore("links", ns());
    const current = linkSchema.safeParse(await store.getJSON(`${data.code}.json`));
    if (!current.success) return { ok: false as const, error: "missing" as const };
    const next: ArLink = { ...current.data };
    if (data.name !== undefined) next.name = data.name;
    if (data.unlock !== undefined) next.unlock = data.unlock;
    if (data.note !== undefined) {
      if (data.note) next.note = data.note;
      else delete next.note;
    }
    if (data.archived !== undefined) {
      if (data.archived) next.archived = true;
      else delete next.archived;
    }
    const link = linkSchema.parse(next);
    await store.setJSON(`${link.code}.json`, link);
    return { ok: true as const, link };
  });

export const deleteLink = createServerFn({ method: "POST" })
  .validator(z.object({ code: codeSchema }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const store = await arStore("links", ns());
    await store.del(`${data.code}.json`);
    return { ok: true as const };
  });
