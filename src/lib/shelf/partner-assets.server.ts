import { initUploadSchema, json } from "@/lib/ar/assets.server";
import { caller } from "@/lib/hub/files.server";
import { hubNs } from "@/lib/hub/store.server";

// Partner teams upload shelf images (a creator's logo, a print) into the same
// public asset store the shelf page reads from (/api/ar/asset/<id>). Images
// only, a signed-in partner team member, and the x-hub header (CSRF), like the
// rest of the hub's write endpoints. The admin library still lists them; each
// carries a "partner-<id>" tag so the team can tell where it came from.

export async function partnerUploadGuard(
  request: Request,
): Promise<{ partnerId: string } | Response> {
  const c = await caller(hubNs(request), request);
  if (!c || c.kind !== "user" || !c.partner) return json({ error: "unauthorized" }, 401);
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && request.headers.get("x-hub") !== "1")
    return json({ error: "missing x-hub header" }, 403);
  return { partnerId: c.partner.id };
}

/** The init body a partner may send: images only, our tags only. */
export function partnerInitBody(body: unknown, partnerId: string) {
  const parsed = initUploadSchema.safeParse(body);
  if (!parsed.success || parsed.data.kind !== "image") return null;
  const tag = `p-${partnerId}`.slice(0, 24).replace(/-+$/, "");
  const tags = (parsed.data.tags ?? []).filter((t) => t === "thumb");
  const { thumb: _t, mobile: _m, ...rest } = parsed.data;
  return { ...rest, tags: [...tags, tag] };
}
