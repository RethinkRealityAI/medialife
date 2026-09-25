import { createFileRoute } from "@tanstack/react-router";

import { adminGuard, json } from "@/lib/ar/assets.server";
import { publicProject } from "@/lib/ar/project";
import { readProject, saveDraft } from "@/lib/ar/projects.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Admin: a project's draft.
//   GET → {draft, updatedAt}  (the draft as the preview renders it)
//   PUT {draft, base?, force?} → autosave. An HTTP route rather than a server
//       function so the editor can send its last save with fetch keepalive
//       while the tab closes.

export const Route = createFileRoute("/api/ar/admin/project/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        const doc = await readProject(namespaceFromRequest(request), params.slug);
        if (!doc) return json({ error: "not found" }, 404);
        return json({ draft: publicProject(doc.draft), updatedAt: doc.updatedAt });
      },
      PUT: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        const text = await request.text();
        if (text.length > 512 * 1024) return json({ error: "draft too large" }, 413);
        let body: { draft?: unknown; base?: unknown; force?: unknown };
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const r = await saveDraft(namespaceFromRequest(request), params.slug, body.draft, {
          base: typeof body.base === "number" ? body.base : undefined,
          force: body.force === true,
        });
        if (r.ok) return json(r);
        const status = r.error === "not-found" ? 404 : r.error === "conflict" ? 409 : 422;
        return json(r, status);
      },
    },
  },
});
