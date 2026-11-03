import { timingSafeEqual } from "node:crypto";
import process from "node:process";

import { isAdminRequest } from "@/lib/ar/auth.server";

// Who may read and write the Media Library.
//
//   - The team: the shared /admin cookie (AR_ADMIN_PASSWORD). Reads and writes.
//   - Agents and scripts: `Authorization: Bearer <MEDIA_API_TOKEN>`. Reads only
//     (the catalogue, files, thumbnails). The token is never accepted by any
//     endpoint that changes something, whatever the method.
//   - Anyone: public files at /m/<id>/<name>, nothing else.

export type MediaCaller = { kind: "admin" } | { kind: "token" };

export const noStore = { "cache-control": "no-store" };
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...headers } });

/** The read-only API token, when one is configured (at least 24 characters). */
function apiToken(): string | null {
  const t = process.env.MEDIA_API_TOKEN?.trim();
  return t && t.length >= 24 ? t : null;
}

export const mediaTokenConfigured = () => apiToken() !== null;

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m ? m[1] : null;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when the request carries the configured read-only token. */
export function hasMediaToken(request: Request): boolean {
  const want = apiToken();
  const got = bearer(request);
  return !!want && !!got && safeEqual(got, want);
}

/** The team or a token holder; null when neither. */
export async function mediaReader(request: Request): Promise<MediaCaller | null> {
  if (await isAdminRequest(request)) return { kind: "admin" };
  if (hasMediaToken(request)) return { kind: "token" };
  return null;
}

const UNAUTHORIZED = {
  error: "unauthorized",
  help: "Sign in at /admin/login, or send Authorization: Bearer <MEDIA_API_TOKEN> (read-only).",
};

/** For GET/HEAD endpoints: the caller, or a 401 (with WWW-Authenticate) when there's none. */
export async function readGuard(request: Request): Promise<MediaCaller | Response> {
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return json({ error: "method not allowed" }, 405);
  const c = await mediaReader(request);
  if (!c)
    return json(UNAUTHORIZED, 401, { "www-authenticate": 'Bearer realm="media", charset="UTF-8"' });
  return c;
}

/**
 * For endpoints that change something: the admin cookie, and the x-media
 * header on anything but GET (a cross-site form can't send it). A bearer token
 * alone is refused here, read-only by design.
 */
export async function writeGuard(request: Request): Promise<Response | null> {
  if (!(await isAdminRequest(request))) {
    if (hasMediaToken(request))
      return json(
        { error: "The media API token is read-only. Sign in as an admin to change files." },
        403,
      );
    return json(UNAUTHORIZED, 401);
  }
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && request.headers.get("x-media") !== "1")
    return json({ error: "missing x-media header" }, 403);
  return null;
}
