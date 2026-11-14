import { createHash, randomBytes } from "node:crypto";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { namedStore, namespaceFromRequest, type ArStore } from "@/lib/ar/store.server";

import {
  ID_RE,
  LUM_H,
  LUM_W,
  PAINT_H,
  PAINT_W,
  REPORTS_TO_HIDE,
  SCENE_MAX_BYTES,
  SCENE_MAX_ITEMS,
  type Creation,
  type CreationStatus,
  type Paintable,
  type PaintableTarget,
  type PublicCreation,
  type SceneItem,
  type SceneItemKind,
  MAX_DECALS,
  type CreationDecal,
} from "./model";

// Spray Bobo CMS storage + API logic. Netlify Blobs (local files in dev), split by host namespace like
// the other tools (prod / preview / dev), so testing on a deploy preview never touches medialife.ai:
//
//   spray-<ns>        JSON: paintables/<id>, creations/<id>
//   spray-files-<ns>  bytes: sets/<id>/<file>, creations/<id>.png
//
// Who may do what:
//   - anyone: live paintables (GET /api/spray/sets), their files, a creation by its link unless hidden,
//     reporting a creation
//   - admins (the /admin cookie, AR_ADMIN_PASSWORD) + the x-spray header on writes: everything else

const store = (req: Request) => namedStore(`spray-${namespaceFromRequest(req)}`);
const files = (req: Request) => namedStore(`spray-files-${namespaceFromRequest(req)}`);

export const noStore = { "cache-control": "no-store" };
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...headers } });

export async function adminRead(req: Request): Promise<Response | null> {
  return (await isAdminRequest(req)) ? null : json({ error: "unauthorized" }, 401);
}
export async function adminWrite(req: Request): Promise<Response | null> {
  if (!(await isAdminRequest(req))) return json({ error: "unauthorized" }, 401);
  if (req.headers.get("x-spray") !== "1") return json({ error: "missing x-spray header" }, 403);
  return null;
}

const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newId(n = 10): string {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += B62[b[i] % 62];
  return s;
}

// ---------------------------------------------------------------- built-in paintables (the EVADE keychain)
const KC = "/evade/keychain-ar/image-targets/";
const ART = "/evade/spray-bobo/art/";
const kcTarget = (
  name: string,
  side: "front" | "back",
  flip: 1 | -1,
  width: number,
  height: number,
  xf: PaintableTarget["xf"] = null,
): PaintableTarget => ({
  name,
  side,
  flip,
  xf,
  width,
  height,
  score: null,
  luminance: `${KC}${name}_luminance.jpg`,
  image: `${KC}${name}.jpg`,
});
export const BUILTINS: Paintable[] = [
  {
    id: "bobo",
    name: "Bobo (cat charm)",
    client: "EVADE",
    status: "live",
    builtin: true,
    heightMm: 80.1,
    targets: [
      kcTarget("kc-bobo", "front", 1, 1682, 2244),
      kcTarget("kc-bobo-l", "back", -1, 1682, 2244),
    ],
    files: {
      print: `${KC}kc-bobo.jpg`,
      mask: `${ART}cat-mask.png`,
      lines: `${ART}cat-lines.png`,
      outline: `${ART}cat-outline.json`,
      thumb: `${KC}kc-bobo_thumbnail.jpg`,
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "can",
    name: "Eclipse can charm",
    client: "EVADE",
    status: "live",
    builtin: true,
    heightMm: 59.8,
    targets: [
      kcTarget("kc-can", "front", 1, 1200, 1600),
      kcTarget("kc-can-back", "back", 1, 1200, 1600, {
        x: -1e-5,
        y: -0.001866,
        rz: 0.05112,
        s: 0.95658,
      }),
    ],
    files: {
      print: `${KC}kc-can.jpg`,
      mask: `${ART}can-mask.png`,
      lines: `${ART}can-lines.png`,
      outline: `${ART}can-outline.json`,
      thumb: `${KC}kc-can_thumbnail.jpg`,
    },
    createdAt: 0,
    updatedAt: 0,
  },
];

// ---------------------------------------------------------------- paintables
async function readAll<T>(st: ArStore, prefix: string): Promise<T[]> {
  const keys = await st.list(prefix);
  const out = await Promise.all(keys.map((k) => st.getJSON<T>(k)));
  return out.filter((x): x is Awaited<T> & T => !!x);
}

export async function listPaintables(req: Request, all: boolean): Promise<Paintable[]> {
  const own = await readAll<Paintable>(await store(req), "paintables/");
  own.sort((a, b) => b.updatedAt - a.updatedAt);
  const list = [...(await Promise.all(BUILTINS.map((b) => withSceneOverlay(req, b)))), ...own];
  return all ? list : list.filter((p) => p.status === "live");
}

export async function getPaintable(req: Request, id: string): Promise<Paintable | null> {
  const b = BUILTINS.find((p) => p.id === id);
  if (b) return withSceneOverlay(req, b);
  if (!ID_RE.test(id)) return null;
  return (await store(req)).getJSON<Paintable>(`paintables/${id}`);
}

/** The 8th Wall engine's image-target JSON for one target (same format as @8thwall/image-target-cli). */
export function targetData(t: PaintableTarget, at = 0) {
  return {
    imagePath: t.luminance,
    metadata: null,
    name: t.name,
    type: "PLANAR",
    properties: {
      left: 0,
      top: 0,
      width: t.width,
      height: t.height,
      isRotated: false,
      originalWidth: t.width,
      originalHeight: t.height,
    },
    resources: { luminanceImage: t.luminance.split("/").pop(), thumbnailImage: null },
    created: at,
    updated: at,
  };
}

export const withTargetData = (p: Paintable) => ({
  ...p,
  targetData: p.targets.map((t) => targetData(t, p.updatedAt)),
});

// ---- image checks: the admin page converts; the server makes sure it got what the engine needs
type Img = { type: "jpeg" | "png"; w: number; h: number };
export function sniff(b: Uint8Array): Img | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { type: "png", w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { type: "jpeg", h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

const MB = 1024 * 1024;
async function bytesOf(f: FormDataEntryValue | null, max: number): Promise<Uint8Array | null> {
  if (!f || typeof f === "string") return null;
  if (f.size > max) throw new Error(`${f.name || "file"} is over ${Math.round(max / MB)} MB`);
  return new Uint8Array(await f.arrayBuffer());
}
function need(b: Uint8Array | null, what: string, type: Img["type"], w?: number, h?: number) {
  if (!b) throw new Error(`${what} is missing`);
  const s = sniff(b);
  if (!s || s.type !== type) throw new Error(`${what} must be a ${type.toUpperCase()}`);
  if (w && h && (s.w !== w || s.h !== h))
    throw new Error(`${what} must be ${w}x${h} (got ${s.w}x${s.h})`);
  if (!w && Math.abs(s.w / s.h - 0.75) > 0.01)
    throw new Error(`${what} must be 3:4 (got ${s.w}x${s.h})`);
  return s;
}

const fileUrl = (id: string, name: string, rev: number) =>
  `/api/spray/file/sets/${id}/${name}?v=${rev}`;

/**
 * Create or update a paintable from the admin page's form:
 *   meta: JSON { name, client, status, heightMm, targets: [{ side, flip, score }] }
 *   t0_lum, t1_lum, ... (480x640 JPEG), t0_img, ... (3:4 JPEG): each side's tracked + colour picture
 *   mask (768x1024 PNG), lines (768x1024 PNG, optional), outline (JSON text), thumb (JPEG)
 * On update, any file left out keeps the stored one.
 */
export async function savePaintable(req: Request, id: string | null) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart form data" }, 400);
  }
  let meta: {
    name?: string;
    client?: string;
    status?: string;
    heightMm?: number;
    targets?: { side?: string; flip?: number; score?: number | null; keep?: number }[];
  };
  try {
    meta = JSON.parse(String(form.get("meta") ?? "{}"));
  } catch {
    return json({ error: "meta is not JSON" }, 400);
  }
  const st = await store(req);
  const fs = await files(req);
  const old = id ? await st.getJSON<Paintable>(`paintables/${id}`) : null;
  if (id && BUILTINS.some((b) => b.id === id))
    return json({ error: "built-in paintables are read-only" }, 400);
  if (id && !old) return json({ error: "not found" }, 404);
  const pid = id ?? newId(10);
  const now = Date.now();
  const rev = now;
  const name = String(meta.name ?? old?.name ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return json({ error: "give it a name" }, 400);
  const heightMm = Number(meta.heightMm ?? old?.heightMm ?? 0);
  if (!(heightMm >= 10 && heightMm <= 3000))
    return json({ error: "height must be 10 to 3000 mm" }, 400);
  const tMeta = (meta.targets ?? []).slice(0, 4);
  if (!tMeta.length) return json({ error: "add at least one tracking picture" }, 400);

  const writes: [string, Uint8Array, string][] = [];
  try {
    const targets: PaintableTarget[] = [];
    for (let i = 0; i < tMeta.length; i++) {
      const m = tMeta[i];
      const lum = await bytesOf(form.get(`t${i}_lum`), 2 * MB);
      const img = await bytesOf(form.get(`t${i}_img`), 4 * MB);
      const prev = m.keep != null ? old?.targets[m.keep] : undefined;
      let width: number, height: number, luminance: string, image: string;
      if (lum || img || !prev) {
        need(lum, `Side ${i + 1} tracking picture`, "jpeg", LUM_W, LUM_H);
        const s = need(img, `Side ${i + 1} colour picture`, "jpeg");
        width = s.w;
        height = s.h;
        writes.push([`sets/${pid}/t${i}_luminance.jpg`, lum!, "image/jpeg"]);
        writes.push([`sets/${pid}/t${i}.jpg`, img!, "image/jpeg"]);
        luminance = fileUrl(pid, `t${i}_luminance.jpg`, rev);
        image = fileUrl(pid, `t${i}.jpg`, rev);
      } else {
        ({ width, height, luminance, image } = prev);
        if (m.keep !== i) throw new Error("re-upload the pictures when reordering sides");
      }
      targets.push({
        name: `sp-${pid}-${i}`,
        side: m.side === "back" ? "back" : "front",
        flip: m.flip === -1 ? -1 : 1,
        xf: null,
        width,
        height,
        score:
          typeof m.score === "number"
            ? Math.max(0, Math.min(100, Math.round(m.score)))
            : (prev?.score ?? null),
        luminance,
        image,
      });
    }
    const mask = await bytesOf(form.get("mask"), 3 * MB);
    const lines = await bytesOf(form.get("lines"), 3 * MB);
    const thumb = await bytesOf(form.get("thumb"), 1 * MB);
    const outlineTxt = form.get("outline");
    if (!old || mask) need(mask, "Canvas overlay", "png", PAINT_W, PAINT_H);
    if (lines) need(lines, "Outline lines", "png", PAINT_W, PAINT_H);
    if (!old || thumb) {
      if (!thumb || sniff(thumb)?.type !== "jpeg") throw new Error("thumbnail missing");
    }
    let outline: Uint8Array | null = null;
    if (typeof outlineTxt === "string" && outlineTxt) {
      const o = JSON.parse(outlineTxt) as { points?: unknown };
      const pts = o.points;
      if (
        !Array.isArray(pts) ||
        pts.length < 3 ||
        pts.length > 4000 ||
        !pts.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((v) => typeof v === "number" && v >= -0.01 && v <= 1.01),
        )
      )
        throw new Error("outline must be 3+ points in 0..1");
      outline = new TextEncoder().encode(JSON.stringify({ points: pts }));
    } else if (!old) throw new Error("outline missing");
    if (mask) writes.push([`sets/${pid}/mask.png`, mask, "image/png"]);
    if (lines) writes.push([`sets/${pid}/lines.png`, lines, "image/png"]);
    if (thumb) writes.push([`sets/${pid}/thumb.jpg`, thumb, "image/jpeg"]);
    if (outline) writes.push([`sets/${pid}/outline.json`, outline, "application/json"]);

    const clearLines = form.get("lines_clear") === "1";
    const rec: Paintable = {
      id: pid,
      name,
      client:
        String(meta.client ?? old?.client ?? "EVADE")
          .trim()
          .slice(0, 60) || "EVADE",
      status: meta.status === "live" ? "live" : "draft",
      builtin: false,
      heightMm,
      targets,
      files: {
        print: targets[0].image,
        mask: mask ? fileUrl(pid, "mask.png", rev) : old!.files.mask,
        lines: lines
          ? fileUrl(pid, "lines.png", rev)
          : clearLines
            ? null
            : (old?.files.lines ?? null),
        outline: outline ? fileUrl(pid, "outline.json", rev) : old!.files.outline,
        thumb: thumb ? fileUrl(pid, "thumb.jpg", rev) : old!.files.thumb,
      },
      ...(old?.scene ? { scene: old.scene } : {}),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    for (const [k, b, type] of writes) await fs.setBytes(k, b, { type });
    await st.setJSON(`paintables/${pid}`, rec);
    return json({ paintable: withTargetData(rec) }, id ? 200 : 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

export async function setPaintableStatus(req: Request, id: string, status: string) {
  if (BUILTINS.some((b) => b.id === id))
    return json({ error: "built-in paintables are read-only" }, 400);
  const st = await store(req);
  const p = await st.getJSON<Paintable>(`paintables/${id}`);
  if (!p) return json({ error: "not found" }, 404);
  p.status = status === "live" ? "live" : "draft";
  p.updatedAt = Date.now();
  await st.setJSON(`paintables/${id}`, p);
  return json({ paintable: withTargetData(p) });
}

export async function deletePaintable(req: Request, id: string) {
  if (BUILTINS.some((b) => b.id === id))
    return json({ error: "built-in paintables are read-only" }, 400);
  const st = await store(req);
  const fs = await files(req);
  if (!(await st.getJSON(`paintables/${id}`))) return json({ error: "not found" }, 404);
  const used = (await readAll<Creation>(st, "creations/")).some((c) => c.paintable === id);
  if (used)
    return json({ error: "it has creations: set it to draft instead, or delete those first" }, 409);
  for (const k of await fs.list(`sets/${id}/`)) await fs.del(k);
  for (const k of await fs.list(`scene/${id}/`)) await fs.del(k);
  await st.del(`paintables/${id}`);
  return json({ ok: true });
}

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  json: "application/json",
};
/** Public: a paintable's file (only for paintables that exist; drafts too, their ids are unguessable). */
export async function serveSetFile(req: Request, splat: string) {
  if (splat.startsWith("scene/")) return serveSceneAsset(req, splat);
  const m = /^sets\/([A-Za-z0-9]{6,40})\/([a-z0-9_]+\.(jpg|png|json))$/.exec(splat);
  if (!m) return new Response("not found", { status: 404 });
  const b = await (await files(req)).getBytes(`sets/${m[1]}/${m[2]}`);
  if (!b) return new Response("not found", { status: 404 });
  return new Response(b, {
    headers: {
      "content-type": TYPES[m[3]],
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

// ---------------------------------------------------------------- creations
const pub = (c: Creation, p: Paintable | null): PublicCreation => ({
  id: c.id,
  paintable: c.paintable,
  image: c.image,
  primer: c.primer,
  linesOn: c.linesOn,
  colours: c.colours,
  decals: c.decals ?? [],
  coverage: c.coverage,
  createdAt: c.createdAt,
  name: p?.name ?? null,
});

/** The `decals` form field: a JSON list of CreationDecal. Anything malformed is dropped, never an error. */
function parseDecals(raw: FormDataEntryValue | null): CreationDecal[] {
  if (typeof raw !== "string" || !raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: CreationDecal[] = [];
  for (const d of list.slice(0, MAX_DECALS)) {
    if (!d || typeof d !== "object") continue;
    const { id, u, v, w, r, f } = d as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) continue;
    const n = [u, v, w, r].map(Number);
    if (!n.every(Number.isFinite)) continue;
    out.push({
      id,
      u: Math.max(-0.5, Math.min(1.5, n[0])),
      v: Math.max(-0.5, Math.min(1.5, n[1])),
      w: Math.max(0.02, Math.min(2, n[2])),
      r: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, n[3])),
      f: f === -1 ? -1 : 1,
    });
  }
  return out;
}

export async function createCreation(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart form data" }, 400);
  }
  try {
    const pid = String(form.get("paintable") ?? "");
    const p = await getPaintable(req, pid);
    if (!p) return json({ error: "unknown paintable" }, 400);
    const img = await bytesOf(form.get("paint"), 6 * MB);
    need(img, "Painting", "png", PAINT_W, PAINT_H);
    const colours = String(form.get("colours") ?? "")
      .split(",")
      .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
      .slice(0, 12);
    const ev = String(form.get("event") ?? "")
      .trim()
      .slice(0, 80);
    const decals = parseDecals(form.get("decals"));
    const id = newId(10);
    const now = Date.now();
    const c: Creation = {
      id,
      paintable: p.id,
      image: `/api/spray/creations/${id}/image`,
      primer: form.get("primer") !== "0",
      linesOn: form.get("linesOn") !== "0",
      colours,
      decals,
      coverage: Math.max(0, Math.min(1, Number(form.get("coverage")) || 0)),
      event: ev || null,
      source: form.get("source") === "ar" ? "ar" : "studio",
      status: "unlisted",
      reports: 0,
      ownerId: null,
      views: 0,
      createdAt: now,
      updatedAt: now,
    };
    await (await files(req)).setBytes(`creations/${id}.png`, img!, { type: "image/png" });
    await (await store(req)).setJSON(`creations/${id}`, c);
    return json({ creation: c, share: `/sb/${id}` }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

async function liveCreation(req: Request, id: string) {
  if (!ID_RE.test(id)) return null;
  const c = await (await store(req)).getJSON<Creation>(`creations/${id}`);
  return c;
}

/** Public: one creation by its link, with its paintable (so the viewer needs one request). */
export async function publicCreation(req: Request, id: string) {
  const c = await liveCreation(req, id);
  const admin = await isAdminRequest(req);
  if (!c) return json({ error: "not found" }, 404);
  if (c.status === "hidden" && !admin) return json({ error: "taken down" }, 410);
  const p = await getPaintable(req, c.paintable);
  if (!p) return json({ error: "not found" }, 404);
  // count views (best effort, not for admins)
  if (!admin)
    store(req)
      .then((st) =>
        st.update<Creation>(`creations/${id}`, (cur) =>
          cur ? { ...cur, views: (cur.views || 0) + 1 } : cur!,
        ),
      )
      .catch(() => {});
  return json(
    { creation: pub(c, p), paintable: withTargetData(p), status: admin ? c.status : undefined },
    200,
    { "cache-control": "private, max-age=10" },
  );
}

export async function creationImage(req: Request, id: string) {
  const c = await liveCreation(req, id);
  if (!c || (c.status === "hidden" && !(await isAdminRequest(req))))
    return new Response("not found", { status: 404 });
  const b = await (await files(req)).getBytes(`creations/${id}.png`);
  if (!b) return new Response("not found", { status: 404 });
  return new Response(b, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function reportCreation(req: Request, id: string) {
  const c = await liveCreation(req, id);
  if (!c) return json({ error: "not found" }, 404);
  const ip = (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") ||
    ""
  )
    .split(",")[0]
    .trim();
  const who = createHash("sha256").update(`${id}:${ip}`).digest("base64url").slice(0, 16);
  await (
    await store(req)
  ).update<Creation & { reporters?: string[] }>(`creations/${id}`, (cur) => {
    if (!cur) return cur!;
    const reporters = cur.reporters ?? [];
    if (reporters.includes(who)) return cur;
    const reports = (cur.reports || 0) + 1;
    return {
      ...cur,
      reporters: [...reporters, who].slice(-50),
      reports,
      // a few separate people reporting takes the link down until the team has looked
      status: reports >= REPORTS_TO_HIDE && cur.status !== "featured" ? "hidden" : cur.status,
      updatedAt: Date.now(),
    };
  });
  return json({ ok: true });
}

export async function listCreations(req: Request) {
  const all = await readAll<Creation & { reporters?: string[] }>(await store(req), "creations/");
  all.sort((a, b) => b.createdAt - a.createdAt);
  return all.map(({ reporters: _r, ...c }) => c);
}

export async function updateCreation(req: Request, id: string) {
  let body: { status?: string; event?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const ok: CreationStatus[] = ["unlisted", "featured", "hidden"];
  if (!(await liveCreation(req, id))) return json({ error: "not found" }, 404);
  const c = await (
    await store(req)
  ).update<Creation>(`creations/${id}`, (cur) => {
    if (!cur) return cur!;
    const next = { ...cur, updatedAt: Date.now() };
    if (body.status && ok.includes(body.status as CreationStatus)) {
      next.status = body.status as CreationStatus;
      if (next.status !== "hidden") next.reports = 0;
    }
    if (body.event !== undefined) next.event = body.event ? String(body.event).slice(0, 80) : null;
    return next;
  });
  if (!c) return json({ error: "not found" }, 404);
  return json({ creation: c });
}

export async function deleteCreation(req: Request, id: string) {
  if (!ID_RE.test(id)) return json({ error: "not found" }, 404);
  await (await files(req)).del(`creations/${id}.png`);
  await (await store(req)).del(`creations/${id}`);
  return json({ ok: true });
}

// ---------------------------------------------------------------- the scene (models, pictures, video)
//
// Things placed around the print (see SceneItem in model.ts for the coordinate system). Files:
//
//   spray-files-<ns>  scene/<paintable>/<name>.<ext>/m      JSON meta { kind, type, size, parts, done }
//                     scene/<paintable>/<name>.<ext>/0000   the bytes, in ≤4 MB pieces
//   spray-<ns>        scene/<builtin id>                      { scene, updatedAt } for the built-in charms
//
// Uploads come in ≤4 MB pieces (a Netlify function takes at most 6 MB per request): the first piece is
// checked by its header bytes and gets a name, later pieces name it. Files are served (with Range, for
// phones playing MP4) at /api/spray/file/scene/<paintable>/<name>.<ext>; names are random and never
// reused, so they cache forever.

export const SCENE_CHUNK = 4 * 1024 * 1024;
const SCENE_NAME_RE = /^[a-z0-9]{12}\.(glb|mp4|webp|png|jpg)$/;
const SCENE_EXT: Record<SceneItemKind, string[]> = {
  model: ["glb"],
  image: ["png", "jpg", "webp"],
  video: ["mp4"],
};
const SCENE_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  mp4: "video/mp4",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
};
const ORPHAN_MS = 24 * 60 * 60 * 1000;

/**
 * Why the fans' pages can't show this GLB (null: fine). They load models with GLTFLoader + meshopt only,
 * so Draco meshes and KTX2 (Basis) textures are refused. Reads the JSON chunk right after the header.
 */
export function glbUnsupported(b: Uint8Array): string | null {
  if (b.length < 20) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > b.length) return null; // "JSON"
  let used: string[] = [];
  try {
    const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as {
      extensionsUsed?: string[];
      extensionsRequired?: string[];
    };
    used = [...(j.extensionsUsed ?? []), ...(j.extensionsRequired ?? [])];
  } catch {
    return "That model file is damaged. Export it again as a .glb.";
  }
  if (used.includes("KHR_draco_mesh_compression"))
    return "This model uses Draco compression, which phones here can't open. Export it again without Draco (Meshopt compression is fine).";
  if (used.includes("KHR_texture_basisu"))
    return "This model uses KTX2 textures, which phones here can't open. Export it again with PNG or JPEG textures.";
  return null;
}

type SceneAssetMeta = {
  kind: SceneItemKind;
  ext: string;
  size: number;
  parts: number;
  done: boolean;
  createdAt: number;
};
type SceneOverlay = { scene: SceneItem[]; updatedAt: number };

const sceneKey = (pid: string, name: string) => `scene/${pid}/${name}`;
const sceneMetaKey = (pid: string, name: string) => `${sceneKey(pid, name)}/m`;
const scenePartKey = (pid: string, name: string, n: number) =>
  `${sceneKey(pid, name)}/${String(n).padStart(4, "0")}`;
export const sceneFileUrl = (pid: string, name: string) => `/api/spray/file/scene/${pid}/${name}`;

/** A built-in charm with its stored scene, if one was saved. */
async function withSceneOverlay(req: Request, b: Paintable): Promise<Paintable> {
  const o = await (await store(req)).getJSON<SceneOverlay>(`scene/${b.id}`);
  return o?.scene ? { ...b, scene: o.scene } : b;
}

/**
 * What a file's first bytes say it is, as a file extension (null: none we take).
 * GLB: "glTF", version 2, and the length in the header matches the file. MP4: an "ftyp" box (not the
 * HEIC / AVIF still-picture brands, which use the same box). Pictures: PNG, JPEG, WebP.
 */
export function sniffSceneAsset(b: Uint8Array, size: number): string | null {
  if (b.length < 12) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  if (tag(0) === "glTF")
    return dv.getUint32(4, true) === 2 && dv.getUint32(8, true) === size ? "glb" : null;
  if (tag(4) === "ftyp") {
    const brand = tag(8);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1|avif|avis|crx )$/.test(brand)) return null;
    return "mp4";
  }
  if (tag(0) === "RIFF" && tag(8) === "WEBP") return "webp";
  const img = sniff(b);
  if (img) return img.type === "png" ? "png" : "jpg";
  return null;
}

const KIND_WORD: Record<SceneItemKind, string> = {
  model: "a 3D model (.glb)",
  image: "a PNG, JPEG or WebP picture",
  video: "an MP4 video",
};

/**
 * Admin: upload one scene file, in pieces of at most SCENE_CHUNK bytes. Multipart fields:
 *   file   this piece's bytes
 *   kind   "model" | "image" | "video"
 *   size   the whole file's size in bytes
 *   part   0-based piece number (default 0)
 *   upload the name the server gave on piece 0 (pieces 1+)
 * Answers { done: false, upload, part, parts } until the last piece, then
 * { done: true, file: "/api/spray/file/scene/...", bytes } (201).
 */
export async function uploadSceneAsset(req: Request, id: string) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart form data" }, 400);
  }
  const p = await getPaintable(req, id);
  if (!p) return json({ error: "not found" }, 404);
  const kind = String(form.get("kind") ?? "") as SceneItemKind;
  if (!(kind in SCENE_EXT)) return json({ error: "kind must be model, image or video" }, 400);
  const size = Number(form.get("size"));
  const max = SCENE_MAX_BYTES[kind];
  if (!Number.isInteger(size) || size < 12) return json({ error: "size is missing" }, 400);
  if (size > max)
    return json(
      { error: `That file is over ${Math.round(max / MB)} MB. Make it smaller first.` },
      413,
    );
  const parts = Math.ceil(size / SCENE_CHUNK);
  const part = Number(form.get("part") ?? 0);
  if (!Number.isInteger(part) || part < 0 || part >= parts)
    return json({ error: "bad piece number" }, 400);
  const f = form.get("file");
  if (!f || typeof f === "string") return json({ error: "file is missing" }, 400);
  const expected = part < parts - 1 ? SCENE_CHUNK : size - SCENE_CHUNK * (parts - 1);
  if (f.size !== expected) return json({ error: "this piece is the wrong size" }, 400);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const fs = await files(req);

  let name: string;
  let meta: SceneAssetMeta;
  if (part === 0) {
    const ext = sniffSceneAsset(bytes, size);
    if (!ext || !SCENE_EXT[kind].includes(ext))
      return json({ error: `That file isn't ${KIND_WORD[kind]}.` }, 415);
    const why = ext === "glb" ? glbUnsupported(bytes) : null;
    if (why) return json({ error: why }, 415);
    name = `${newId(12).toLowerCase()}.${ext}`;
    meta = { kind, ext, size, parts, done: false, createdAt: Date.now() };
  } else {
    name = String(form.get("upload") ?? "");
    if (!SCENE_NAME_RE.test(name)) return json({ error: "unknown upload" }, 404);
    const m = await fs.getJSON<SceneAssetMeta>(sceneMetaKey(p.id, name));
    if (!m || m.done || m.size !== size || m.kind !== kind)
      return json({ error: "unknown upload" }, 404);
    meta = m;
  }
  await fs.setBytes(scenePartKey(p.id, name, part), bytes, { type: "application/octet-stream" });
  if (part === parts - 1) {
    const have = new Set(await fs.list(`${sceneKey(p.id, name)}/`));
    for (let n = 0; n < parts; n++)
      if (!have.has(scenePartKey(p.id, name, n)))
        return json({ error: `piece ${n + 1} of ${parts} is missing` }, 409);
    meta = { ...meta, done: true };
  }
  await fs.setJSON(sceneMetaKey(p.id, name), meta);
  if (!meta.done) return json({ done: false, upload: name, part, parts });
  return json({ done: true, file: sceneFileUrl(p.id, name), bytes: size }, 201);
}

/** A single "bytes=" range clamped to the file; null for none; "invalid" for one we can't serve. */
function sceneRange(header: string | null, size: number) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (!m[2] || suffix === 0) return "invalid" as const;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid" as const;
  return { start, end };
}

/** Public: a scene file, streamed piece by piece, with Range support and a long cache. */
async function serveSceneAsset(req: Request, splat: string) {
  const m = /^scene\/([A-Za-z0-9]{3,40})\/([a-z0-9]{12}\.(glb|mp4|webp|png|jpg))$/.exec(splat);
  if (!m) return new Response("not found", { status: 404 });
  const [, pid, name, ext] = m;
  const fs = await files(req);
  const meta = await fs.getJSON<SceneAssetMeta>(sceneMetaKey(pid, name));
  if (!meta?.done) return new Response("not found", { status: 404 });
  const etag = `"${name}"`;
  const headers: Record<string, string> = {
    "content-type": SCENE_TYPES[ext],
    "cache-control": "public, max-age=31536000, immutable",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "content-length, content-range, accept-ranges, etag",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    etag,
  };
  if (req.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  const range = sceneRange(req.headers.get("range"), meta.size);
  if (range === "invalid")
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${meta.size}` },
    });
  const start = range ? range.start : 0;
  const end = range ? range.end : meta.size - 1;
  headers["content-length"] = String(end - start + 1);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${meta.size}`;
  const first = Math.floor(start / SCENE_CHUNK);
  const last = Math.floor(end / SCENE_CHUNK);
  let n = first;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const buf = await fs.getBytes(scenePartKey(pid, name, n));
      if (!buf) {
        controller.error(new Error(`scene file ${name}: piece ${n} missing`));
        return;
      }
      const from = n === first ? start - n * SCENE_CHUNK : 0;
      const to = n === last ? end - n * SCENE_CHUNK + 1 : buf.byteLength;
      controller.enqueue(new Uint8Array(buf, from, to - from));
      n++;
      if (n > last) controller.close();
    },
  });
  return new Response(body, { status: range ? 206 : 200, headers });
}

const finite = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const wrapDeg = (v: number) => {
  const w = ((((v + 180) % 360) + 360) % 360) - 180;
  return round3(w === -180 && v > 0 ? 180 : w);
};

/** The scene file name an item's file path points at, if it is one of this paintable's. */
function sceneNameOf(pid: string, file: string): string | null {
  const pre = `/api/spray/file/scene/${pid}/`;
  if (!file.startsWith(pre)) return null;
  const name = file.slice(pre.length);
  return SCENE_NAME_RE.test(name) ? name : null;
}

/** Checks one item strictly; returns it cleaned up, or throws a plain message. */
function cleanSceneItem(raw: unknown, i: number, pid: string): SceneItem {
  const at = `Item ${i + 1}`;
  if (!raw || typeof raw !== "object") throw new Error(`${at} is not an object`);
  const r = raw as Record<string, unknown>;
  const kind = r.kind as SceneItemKind;
  if (!(kind in SCENE_EXT)) throw new Error(`${at}: kind must be model, image or video`);
  if (typeof r.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id))
    throw new Error(`${at}: bad id`);
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
  if (typeof r.file !== "string") throw new Error(`${at}: file is missing`);
  const fname = sceneNameOf(pid, r.file);
  if (!fname) throw new Error(`${at}: the file must be one uploaded to this paintable`);
  if (!SCENE_EXT[kind].includes(fname.split(".")[1]))
    throw new Error(`${at}: the file doesn't match its kind`);
  const vec = (v: unknown, lo: number, hi: number, what: string) => {
    if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => finite(x, lo, hi)))
      throw new Error(`${at}: ${what}`);
    return v as [number, number, number];
  };
  const pos = vec(r.pos, -2000, 2000, "position must be within 2000 mm of the print");
  const rot = vec(r.rot, -36000, 36000, "rotation must be three numbers in degrees");
  if (!finite(r.size, 1, 3000)) throw new Error(`${at}: height must be 1 to 3000 mm`);
  let aspect: number | null = null;
  if (kind !== "model") {
    if (!finite(r.aspect, 0.05, 20)) throw new Error(`${at}: picture shape (aspect) is missing`);
    aspect = round3(r.aspect as number);
  } else if (r.aspect != null) throw new Error(`${at}: models have no aspect`);
  let clip: string | null = null;
  if (r.clip != null) {
    if (kind !== "model" || typeof r.clip !== "string" || !r.clip || r.clip.length > 200)
      throw new Error(`${at}: bad animation name`);
    clip = r.clip;
  }
  if (typeof r.sound !== "boolean" || typeof r.visible !== "boolean")
    throw new Error(`${at}: sound and visible must be true or false`);
  return {
    id: r.id,
    kind,
    name: name || (kind === "model" ? "Model" : kind === "image" ? "Picture" : "Video"),
    file: sceneFileUrl(pid, fname),
    pos: pos.map(round3) as [number, number, number],
    rot: rot.map(wrapDeg) as [number, number, number],
    size: round3(r.size as number),
    aspect,
    clip,
    sound: kind === "video" ? r.sound : false,
    visible: r.visible,
  };
}

/**
 * Admin: save a paintable's scene. JSON { scene: SceneItem[], heightMm?: number }. Every field is
 * checked; files must be finished uploads of this paintable. heightMm (10..3000) corrects the real
 * print size (CMS paintables only: the built-in charms' size is fixed in code). Files no item uses
 * any more are deleted (and unsaved uploads older than a day).
 */
export async function saveScene(req: Request, id: string) {
  let body: { scene?: unknown; heightMm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const p = await getPaintable(req, id);
  if (!p) return json({ error: "not found" }, 404);
  if (!Array.isArray(body.scene)) return json({ error: "scene must be a list" }, 400);
  if (body.scene.length > SCENE_MAX_ITEMS)
    return json({ error: `at most ${SCENE_MAX_ITEMS} items` }, 400);
  let heightMm = p.heightMm;
  if (body.heightMm != null) {
    if (!finite(body.heightMm, 10, 3000))
      return json({ error: "print height must be 10 to 3000 mm" }, 400);
    heightMm = round3(body.heightMm as number);
    if (p.builtin && heightMm !== p.heightMm)
      return json({ error: "the built-in charms' print size can't be changed" }, 400);
  }
  const fs = await files(req);
  let scene: SceneItem[];
  try {
    scene = body.scene.map((r, i) => cleanSceneItem(r, i, p.id));
    if (new Set(scene.map((s) => s.id)).size !== scene.length)
      throw new Error("two items have the same id");
    const names = [...new Set(scene.map((s) => sceneNameOf(p.id, s.file)!))];
    for (const n of names) {
      const m = await fs.getJSON<SceneAssetMeta>(sceneMetaKey(p.id, n));
      if (!m?.done)
        throw new Error("One of the files was removed or never finished uploading. Add it again.");
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const st = await store(req);
  const now = Date.now();
  let saved: Paintable;
  if (p.builtin) {
    await st.setJSON(`scene/${p.id}`, { scene, updatedAt: now } satisfies SceneOverlay);
    saved = { ...p, scene };
  } else {
    saved = await st.update<Paintable>(`paintables/${p.id}`, (cur) => ({
      ...(cur ?? p),
      scene,
      heightMm,
      updatedAt: now,
    }));
  }

  // tidy up: files of items that were removed, and abandoned uploads
  const keep = new Set(scene.map((s) => sceneNameOf(p.id, s.file)));
  const was = new Set((p.scene ?? []).map((s) => sceneNameOf(p.id, s.file)));
  const stored = new Map<string, string[]>();
  for (const k of await fs.list(`scene/${p.id}/`)) {
    const n = k.split("/")[2];
    if (n) stored.set(n, [...(stored.get(n) ?? []), k]);
  }
  for (const [n, keys] of stored) {
    if (keep.has(n)) continue;
    let drop = was.has(n);
    if (!drop) {
      const m = await fs.getJSON<SceneAssetMeta>(sceneMetaKey(p.id, n));
      drop = !m || now - m.createdAt > ORPHAN_MS;
    }
    if (drop) for (const k of keys) await fs.del(k);
  }
  return json({ paintable: withTargetData(saved) });
}
