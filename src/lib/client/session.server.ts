import { getCookie, getRequest } from "@tanstack/react-start/server";

import { isAdminRequest, readCookie } from "@/lib/ar/auth.server";
import { HUB_COOKIE, resolveSession, type HubUser } from "@/lib/hub/auth.server";
import { hubNs, type HubNamespace } from "@/lib/hub/store.server";

import type { Client, ClientRole } from "./model";
import { getClient } from "./store.server";

// Who is looking at the Client Hub.
//
//   - A member of a client's team: a hub account with `client` set. Sees only
//     that client.
//   - The MEDIALIFE team: the shared /admin cookie. Sees the client named by
//     the `client_view` cookie (set from /admin/clients), EVADE by default,
//     with admin rights, so the team sees and manages exactly what the client
//     sees.

export const VIEW_COOKIE = "client_view";
const DEFAULT_VIEW = "evade";

export type ClientViewer = {
  ns: HubNamespace;
  client: Client;
  role: ClientRole;
  /** null for the MEDIALIFE team. */
  user: HubUser | null;
  medialife: boolean;
  name: string;
  email: string;
};

export class ClientAuthError extends Error {
  constructor(public code: "signed-out" | "forbidden" = "signed-out") {
    super(code);
  }
}

async function resolve(
  ns: HubNamespace,
  request: Request,
  hubCookie: string | null | undefined,
  viewCookie: string | null | undefined,
): Promise<ClientViewer | null> {
  const s = await resolveSession(ns, hubCookie);
  const m = s?.user.client;
  if (s && m && !s.user.disabled) {
    const client = await getClient(ns, m.id);
    if (client && client.status === "active")
      return {
        ns,
        client,
        role: m.role,
        user: s.user,
        medialife: false,
        name: s.user.name || s.user.email.split("@")[0],
        email: s.user.email,
      };
  }
  if (await isAdminRequest(request)) {
    const id = viewCookie && /^[a-z0-9-]{1,40}$/.test(viewCookie) ? viewCookie : DEFAULT_VIEW;
    const client = (await getClient(ns, id)) ?? (await getClient(ns, DEFAULT_VIEW));
    if (client)
      return {
        ns,
        client,
        role: "admin",
        user: null,
        medialife: true,
        name: "MEDIALIFE team",
        email: "",
      };
  }
  return null;
}

/** Server functions: the viewer or null. */
export async function currentViewer(): Promise<ClientViewer | null> {
  const request = getRequest();
  const ns = hubNs(request);
  return resolve(ns, request, getCookie(HUB_COOKIE), getCookie(VIEW_COOKIE));
}

/** Server functions: the viewer, or throws. `admin` requires the team admin role. */
export async function requireClient(opts: { admin?: boolean } = {}): Promise<ClientViewer> {
  const v = await currentViewer();
  if (!v) throw new ClientAuthError("signed-out");
  if (opts.admin && v.role !== "admin") throw new ClientAuthError("forbidden");
  return v;
}

/** API routes (file streaming): the viewer for a raw request, or null. */
export async function viewerForRequest(request: Request): Promise<ClientViewer | null> {
  const ns = hubNs(request);
  return resolve(ns, request, readCookie(request, HUB_COOKIE), readCookie(request, VIEW_COOKIE));
}
