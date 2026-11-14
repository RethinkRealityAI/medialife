import type {
  Creation,
  CreationStatus,
  Paintable,
  SceneItem,
  SceneItemKind,
} from "@/lib/spray/model";

// The admin page's calls to the Spray Bobo API (src/routes/api.spray.*.ts). Same-origin, so the
// /admin cookie goes along; every write also carries the x-spray header the server asks for.

export type AdminPaintable = Paintable & { targetData: unknown[] };

export class SprayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const write = !!init.method && init.method !== "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: { ...(write ? { "x-spray": "1" } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new SprayApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    const msg = body.error ?? `Something went wrong (error ${res.status}).`;
    // isUnauthorized() in the admin kit looks for this word
    throw new SprayApiError(res.status === 401 ? "unauthorized" : msg, res.status);
  }
  return body;
}

export const sprayKeys = {
  sets: ["spray", "sets"] as const,
  creations: ["spray", "creations"] as const,
};

export const listSets = () =>
  call<{ sets: AdminPaintable[] }>("/api/spray/admin/sets").then((r) => r.sets);

/** Create (id null) or update a paintable: the multipart form savePaintable() reads. */
export const savePaintable = (id: string | null, form: FormData) =>
  call<{ paintable: AdminPaintable }>(
    id ? `/api/spray/admin/sets/${id}` : "/api/spray/admin/sets",
    { method: "POST", body: form },
  ).then((r) => r.paintable);

export const setPaintableStatus = (id: string, status: "live" | "draft") =>
  call<{ paintable: AdminPaintable }>(`/api/spray/admin/sets/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  }).then((r) => r.paintable);

export const deletePaintable = (id: string) =>
  call<{ ok: true }>(`/api/spray/admin/sets/${id}`, { method: "DELETE" });

export const listCreations = () =>
  call<{ creations: Creation[] }>("/api/spray/admin/creations").then((r) => r.creations);

export const updateCreation = (
  id: string,
  patch: { status?: CreationStatus; event?: string | null },
) =>
  call<{ creation: Creation }>(`/api/spray/admin/creations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => r.creation);

export const deleteCreation = (id: string) =>
  call<{ ok: true }>(`/api/spray/admin/creations/${id}`, { method: "DELETE" });

export const shareUrl = (id: string) =>
  `${typeof location !== "undefined" ? location.origin : ""}/sb/${id}`;

// ---- the scene editor (src/components/scene-editor): files go up in ≤4 MB pieces (SCENE_CHUNK on
// the server), because a Netlify function takes at most 6 MB per request.
const SCENE_CHUNK = 4 * 1024 * 1024;

export async function uploadSceneAsset(
  id: string,
  file: Blob,
  kind: SceneItemKind,
  onProgress?: (fraction: number) => void,
): Promise<{ file: string; bytes: number }> {
  const parts = Math.max(1, Math.ceil(file.size / SCENE_CHUNK));
  let upload = "";
  for (let part = 0; part < parts; part++) {
    const form = new FormData();
    form.set("file", file.slice(part * SCENE_CHUNK, (part + 1) * SCENE_CHUNK), "piece");
    form.set("kind", kind);
    form.set("size", String(file.size));
    form.set("part", String(part));
    if (upload) form.set("upload", upload);
    const r = await call<
      { done: false; upload: string } | { done: true; file: string; bytes: number }
    >(`/api/spray/admin/sets/${id}/asset`, { method: "POST", body: form });
    onProgress?.((part + 1) / parts);
    if (r.done) return { file: r.file, bytes: r.bytes };
    upload = r.upload;
  }
  throw new SprayApiError("The upload didn't finish. Try again.", 0);
}

export const saveScene = (id: string, scene: SceneItem[], heightMm?: number) =>
  call<{ paintable: AdminPaintable }>(`/api/spray/admin/sets/${id}/scene`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scene, heightMm }),
  }).then((r) => r.paintable);
