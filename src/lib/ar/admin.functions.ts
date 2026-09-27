import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  ADMIN_COOKIE,
  adminConfigured,
  checkPassword,
  issueToken,
  verifyToken,
} from "./auth.server";

// Server functions for the /admin area. Route guards call getAdminSession in
// beforeLoad; the login page calls adminLogin.

export const getAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  return {
    configured: adminConfigured(),
    authed: await verifyToken(getCookie(ADMIN_COOKIE)),
  };
});

export const adminLogin = createServerFn({ method: "POST" })
  .validator(z.object({ password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    if (!adminConfigured()) return { ok: false as const, error: "not-configured" as const };
    // a small fixed delay makes guessing slower without a rate-limit store
    await new Promise((r) => setTimeout(r, 400));
    if (!checkPassword(data.password)) return { ok: false as const, error: "wrong" as const };
    const { token, maxAge } = await issueToken();
    const secure = (getRequest()?.url ?? "").startsWith("https:");
    setCookie(ADMIN_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(ADMIN_COOKIE, { path: "/" });
  return { ok: true };
});
