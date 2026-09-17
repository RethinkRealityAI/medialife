import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// Headers in netlify.toml only reach STATIC responses. Every HTML page here is
// rendered by this function, so security headers have to be applied on the way
// out or the pages that actually matter ship without them.
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  // camera=(self) is deliberate — the AR experiences need getUserMedia.
  "permissions-policy": "camera=(self), microphone=(), geolocation=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
};

// Everything under /roblox is unlisted: the creator program page carries
// commercial terms and the portal is a demo populated with mock pilot data.
// netlify.toml covers the static half of that path; this covers the SSR half.
// The portal routes also carry a robots meta tag, but a header is the half that
// works for a crawler that never renders. Keep this in sync with netlify.toml.
const UNLISTED_PREFIXES = ["/roblox"] as const;

function isUnlisted(pathname: string): boolean {
  return UNLISTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function withSecurityHeaders(response: Response, pathname?: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (pathname && isUnlisted(pathname)) {
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // A malformed URL must not cost us the security headers, so fall back to a
    // path that matches nothing rather than letting the parse throw.
    let pathname = "";
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      pathname = "";
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), pathname);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        pathname,
      );
    }
  },
};
