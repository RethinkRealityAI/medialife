import { createFileRoute } from "@tanstack/react-router";

import { arStore, namespaceFromRequest } from "@/lib/ar/store.server";

// Test logs from the EVADE keychain AR page (/evade/keychain-ar/): which camera profile and lens were
// used, the stream the phone gave, frame rates, and when and from how far each image target was found
// and lost. The page sends one record per session (POST, sendBeacon), and overwrites it as the session
// goes on. Nothing personal: device model and browser from the user agent, no IP, no camera images.
//
// GET lists the records, newest first, so the results can be read back without asking the tester.
// Reading is open on deploy previews and local dev only (test data); on medialife.ai it is refused.

const MAX_BODY = 96 * 1024;

export const Route = createFileRoute("/api/ar/kc-diag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        if (text.length > MAX_BODY) return new Response(null, { status: 413 });
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(text);
        } catch {
          return new Response(null, { status: 400 });
        }
        const sid = typeof body?.sid === "string" ? body.sid : "";
        if (!/^[a-z0-9-]{6,40}$/.test(sid)) return new Response(null, { status: 400 });
        const store = await arStore("kcdiag", namespaceFromRequest(request));
        await store.setJSON(`s/${sid}`, {
          ...body,
          receivedAt: Date.now(),
          userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
        });
        return new Response(null, { status: 204 });
      },
      GET: async ({ request }) => {
        const ns = namespaceFromRequest(request);
        if (ns === "prod") return new Response("Not available here", { status: 403 });
        const url = new URL(request.url);
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "40", 10) || 40, 1), 200);
        const store = await arStore("kcdiag", ns);
        const keys = await store.list("s/");
        const rows = (await Promise.all(keys.map((k) => store.getJSON<Record<string, unknown>>(k)))).filter(Boolean) as Record<string, unknown>[];
        rows.sort((a, b) => Number(b.receivedAt ?? 0) - Number(a.receivedAt ?? 0));
        return new Response(JSON.stringify({ ns, count: rows.length, sessions: rows.slice(0, limit) }, null, 1), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
