import type { Creation, CreationStatus, Paintable } from "@/lib/spray/model";

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
