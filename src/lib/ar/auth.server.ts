import process from "node:process";

// Internal tools (/admin: analytics, client links, endcap builder) sit behind one
// shared password. It is read from AR_ADMIN_PASSWORD (a Netlify env var) and a
// successful login sets a signed, HttpOnly cookie that lasts 14 days.
//
// The signature is an HMAC of the expiry with AR_SESSION_SECRET (falls back to
// a key derived from the password, so changing the password logs everyone out).

export const ADMIN_COOKIE = "ar_admin";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function adminPassword(): string | null {
  const p = process.env.AR_ADMIN_PASSWORD;
  return p && p.trim() ? p.trim() : null;
}

function secret(): string {
  return process.env.AR_SESSION_SECRET || `ar-admin:${adminPassword() ?? "unset"}`;
}

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function adminConfigured(): boolean {
  return adminPassword() !== null;
}

export function checkPassword(candidate: string): boolean {
  const p = adminPassword();
  return !!p && safeEqual(candidate.trim(), p);
}

/** A fresh session token: "<expiry ms>.<signature>". */
export async function issueToken(now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = String(now + TTL_MS);
  return { token: `${exp}.${await hmac(exp)}`, maxAge: Math.floor(TTL_MS / 1000) };
}

export async function verifyToken(token: string | null | undefined): Promise<boolean> {
  if (!token || !adminConfigured()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp));
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** For API route handlers: true when the request carries a valid admin cookie. */
export async function isAdminRequest(request: Request): Promise<boolean> {
  return verifyToken(readCookie(request, ADMIN_COOKIE));
}

/** For API route handlers: a 401 JSON response, or null when the caller is an admin. */
export async function requireAdmin(request: Request): Promise<Response | null> {
  if (await isAdminRequest(request)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
