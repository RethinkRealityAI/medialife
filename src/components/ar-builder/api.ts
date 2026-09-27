import type { AssetListItem, InitUploadBody } from "@/lib/ar/assets";
import type { AssetMeta, Project } from "@/lib/ar/project";
import { templateUrl, type Issue, type ProjectSummary } from "@/lib/ar/projects";

// Browser-side calls to the builder's HTTP endpoints (see src/lib/ar/assets.ts).
// Every non-GET carries "x-ar-admin: 1"; the server refuses it otherwise.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown = null,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers: { "x-ar-admin": "1", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "You seem to be offline.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      res.status === 401
        ? "Your session ended. Sign in again."
        : ((body as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

export const assetsQueryKey = ["ar-builder", "assets"] as const;
export const projectsQueryKey = ["ar-builder", "projects"] as const;

export async function fetchAssets(): Promise<AssetListItem[]> {
  return (await call<{ assets: AssetListItem[] }>("/api/ar/admin/assets")).assets;
}

export type DeleteAssetResult =
  { ok: true } | { ok: false; usedBy: { slug: string; name: string }[] };

export async function deleteAssetRequest(id: string, force = false): Promise<DeleteAssetResult> {
  try {
    await call(`/api/ar/admin/assets/${id}${force ? "?force=1" : ""}`, { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return {
        ok: false,
        usedBy: (e.body as { usedBy?: { slug: string; name: string }[] })?.usedBy ?? [],
      };
    }
    throw e;
  }
}

export async function initUploadRequest(body: InitUploadBody) {
  return call<{ id: string; chunkSize: number; chunks: number }>("/api/ar/admin/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function completeUploadRequest(id: string) {
  return call<AssetMeta>(`/api/ar/admin/assets/${id}/complete`, { method: "POST" });
}

export type SaveResponse =
  | { ok: true; updatedAt: number; issues: Issue[]; summary: ProjectSummary }
  | { ok: false; error: "conflict"; updatedAt: number }
  | { ok: false; error: "not-found" | "invalid" | "unauthorized" | "network"; message: string };

/** Autosave. `keepalive` lets the request finish after the tab closes (body ≤ 64 KB). */
export async function saveDraftRequest(
  slug: string,
  draft: Project,
  base: number,
  opts: { force?: boolean; keepalive?: boolean } = {},
): Promise<SaveResponse> {
  const body = JSON.stringify({ draft, base, force: !!opts.force });
  try {
    const r = await call<SaveResponse>(`/api/ar/admin/project/${slug}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
      keepalive: !!opts.keepalive && body.length < 60_000,
    });
    return r;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 409) return e.body as SaveResponse;
      if (e.status === 401) return { ok: false, error: "unauthorized", message: e.message };
      if (e.status === 404)
        return { ok: false, error: "not-found", message: "This endcap was deleted." };
      if (e.status === 0) return { ok: false, error: "network", message: e.message };
      return { ok: false, error: "invalid", message: e.message };
    }
    return { ok: false, error: "network", message: "Couldn't reach the server." };
  }
}

/** A template's project JSON, or null when it isn't there (yet). */
export async function fetchTemplate(id: string): Promise<unknown | null> {
  try {
    const res = await fetch(templateUrl(id), { cache: "no-cache" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The Client links page, set up to make a personal link to this endcap. */
export const clientLinkHref = (slug: string) =>
  `/admin/links?demo=${encodeURIComponent(`x:${slug}`)}`;

/** Draft preview in a new tab (?notrack=1 keeps the team's own visits out of analytics). */
export const draftPreviewHref = (slug: string) => `/x/${slug}?draft=1&notrack=1`;

/** Absolute share link for a slug. */
export const shareUrl = (slug: string) =>
  typeof window === "undefined" ? `/x/${slug}` : `${window.location.origin}/x/${slug}`;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API blocked (http, iframe): fall back to a hidden textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
