import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireHubAdmin } from "@/lib/hub/session.server";

import { deleteMedia, libraryData, updateMedia } from "./admin.server";
import { MEDIA, MEDIA_PURPOSES } from "./model";
import { seedMediaSample } from "./sample.server";

// The team side of the Media Library, for /admin/media. Every function checks
// the shared /admin cookie (throws HubAuthError "forbidden" otherwise). Reads
// return data; changes return { ok, … } or per-row results. Uploads go through
// the HTTP endpoints (upload-client.ts), not these.

const id = z.string().regex(/^[A-Za-z0-9]{6,60}$/);
const ids = z.array(id).min(1).max(2000);
const L = MEDIA.limits;
const str = (max: number) => z.string().max(max * 2);
const tags = z.array(z.string().max(L.tag * 2)).max(L.tagsPerAsset * 2);

export const adminMediaLibrary = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  return libraryData(ns);
});

const patchSchema = z.object({
  title: str(L.title).optional(),
  description: str(L.description).optional(),
  usageNotes: str(L.usageNotes).optional(),
  rights: str(L.rights).optional(),
  client: str(L.client).optional(),
  collection: str(L.collection).optional(),
  purpose: z.enum(MEDIA_PURPOSES).nullable().optional(),
  aiGenerated: z.boolean().optional(),
  public: z.boolean().optional(),
  setTags: tags.optional(),
  addTags: tags.optional(),
  removeTags: tags.optional(),
});

export const adminUpdateMedia = createServerFn({ method: "POST" })
  .validator(z.object({ ids, patch: patchSchema }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const r = await updateMedia(ns, data.ids, data.patch);
    const failed = r.results.filter((x) => !x.ok);
    return failed.length === r.results.length
      ? { ok: false as const, error: failed[0]?.error ?? "Nothing changed." }
      : { ok: true as const, ...r };
  });

export const adminDeleteMedia = createServerFn({ method: "POST" })
  .validator(z.object({ ids }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    return { ok: true as const, ...(await deleteMedia(ns, data.ids)) };
  });

export const adminSeedMediaSample = createServerFn({ method: "POST" })
  .validator(z.object({ reset: z.boolean().optional() }).optional())
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    if (ns === "prod")
      return {
        ok: false as const,
        error: "Sample media is only available on previews and localhost.",
      };
    return { ok: true as const, ...(await seedMediaSample(ns, { reset: data?.reset })) };
  });
