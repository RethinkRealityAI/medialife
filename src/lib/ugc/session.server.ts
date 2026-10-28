import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

import { publicOrigin } from "@/lib/hub/auth.server";
import { requireHubAdmin } from "@/lib/hub/session.server";

import { UGC_COOKIE, createUgcSession, resolveUgcSession } from "./auth.server";
import type { UgcCreator } from "./model";
import { ugcNs, type UgcNamespace } from "./store.server";

// Session plumbing shared by every UGC Hub server function.

export class UgcAuthError extends Error {
  constructor(public code: "signed-out" | "forbidden" = "signed-out") {
    super(code);
  }
}

export async function currentUgc(): Promise<{ ns: UgcNamespace; creator: UgcCreator } | null> {
  const ns = ugcNs();
  const s = await resolveUgcSession(ns, getCookie(UGC_COOKIE));
  return s ? { ns, creator: s.creator } : null;
}

/** The signed-in UGC creator, or throws UgcAuthError("signed-out"). Every creator function starts here. */
export async function requireUgcCreator(): Promise<{ ns: UgcNamespace; creator: UgcCreator }> {
  const s = await currentUgc();
  if (!s) throw new UgcAuthError("signed-out");
  return s;
}

/** Admin functions: the shared /admin cookie. Throws HubAuthError("forbidden") otherwise. */
export const requireUgcAdmin = requireHubAdmin;

/** Origin for links in emails (pinned on production, see publicOrigin). */
export const linkOrigin = (ns: UgcNamespace) => publicOrigin(getRequest(), ns);

export async function startUgcSession(ns: UgcNamespace, creatorId: string) {
  const request = getRequest();
  const { cookie, maxAge } = await createUgcSession(
    ns,
    creatorId,
    request.headers.get("user-agent") ?? "",
  );
  setCookie(UGC_COOKIE, cookie, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:" || ns !== "dev",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearUgcCookie() {
  deleteCookie(UGC_COOKIE, { path: "/" });
}
