import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

import { isAdminRequest } from "@/lib/ar/auth.server";

import { HUB_COOKIE, createSession, resolveSession, type HubUser } from "./auth.server";
import { getCreator } from "./data.server";
import type { Creator } from "./model";
import { hubNs, type HubNamespace } from "./store.server";

// Session plumbing shared by every Creator Hub server function.

export async function currentUser(): Promise<{ ns: HubNamespace; user: HubUser } | null> {
  const ns = hubNs();
  const s = await resolveSession(ns, getCookie(HUB_COOKIE));
  return s ? { ns, user: s.user } : null;
}

export class HubAuthError extends Error {
  constructor(public code: "signed-out" | "no-creator" | "forbidden" = "signed-out") {
    super(code);
  }
}

/** The signed-in creator, or throws. Every creator-facing function starts here. */
export async function requireCreator(): Promise<{
  ns: HubNamespace;
  user: HubUser;
  creator: Creator;
}> {
  const s = await currentUser();
  if (!s) throw new HubAuthError("signed-out");
  const creator = await getCreator(s.ns, s.user.creatorId);
  if (!creator) throw new HubAuthError("no-creator");
  return { ...s, creator };
}

/** For admin functions: the shared /admin cookie (AR_ADMIN_PASSWORD). */
export async function requireHubAdmin(): Promise<HubNamespace> {
  const request = getRequest();
  if (!(await isAdminRequest(request))) throw new HubAuthError("forbidden");
  return hubNs(request);
}

export async function startSession(ns: HubNamespace, userId: string) {
  const request = getRequest();
  const { cookie, maxAge } = await createSession(
    ns,
    userId,
    request.headers.get("user-agent") ?? "",
  );
  setCookie(HUB_COOKIE, cookie, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:" || ns !== "dev",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie() {
  deleteCookie(HUB_COOKIE, { path: "/" });
}
