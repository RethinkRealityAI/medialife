import { createFileRoute } from "@tanstack/react-router";

import { adminGuard, json } from "@/lib/ar/assets.server";
import { isAdminRequest } from "@/lib/ar/auth.server";
import { publicDemoContent, readDemoContent, saveDemoDraft } from "@/lib/ar/demo-content.server";
import { isDemoId } from "@/lib/ar/demo-tours";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Tour-copy overrides for the live demos (/roblox/activated-retail, /monkey-quest/…).
//   GET              public: the published overrides, or {} — the pages fetch this at load
//   GET ?draft=1     with the admin cookie: the draft, plus draft: true (never cached)
//   PUT              admin ("x-ar-admin: 1"): autosave the draft {draft, base?, force?}

export const Route = createFileRoute("/api/ar/demo-content/$demo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isDemoId(params.demo)) return json({ error: "unknown demo" }, 404);
        const ns = namespaceFromRequest(request);
        const wantsDraft = new URL(request.url).searchParams.get("draft") === "1";
        const doc = await readDemoContent(ns, params.demo);
        if (wantsDraft) {
          // the CDN can't see the cookie, so no ?draft=1 answer is ever cached
          const admin = await isAdminRequest(request);
          return Response.json(admin ? { ...doc.draft, draft: true } : publicDemoContent(doc), {
            headers: {
              "cache-control": "private, no-store",
              "netlify-cdn-cache-control": "no-store",
            },
          });
        }
        return Response.json(publicDemoContent(doc), {
          headers: {
            "cache-control": "public, max-age=0, must-revalidate",
            "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=600",
            "netlify-cache-tag": `demo-${params.demo}`,
            "netlify-vary": "query=draft",
          },
        });
      },
      PUT: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        if (!isDemoId(params.demo)) return json({ error: "unknown demo" }, 404);
        const text = await request.text();
        if (text.length > 64 * 1024) return json({ error: "too large" }, 413);
        let body: { draft?: unknown; base?: unknown; force?: unknown };
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const r = await saveDemoDraft(namespaceFromRequest(request), params.demo, body.draft, {
          base: typeof body.base === "number" ? body.base : undefined,
          force: body.force === true,
        });
        if (r.ok) return json(r);
        return json(r, r.error === "conflict" ? 409 : 422);
      },
    },
  },
});
