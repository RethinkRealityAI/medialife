import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { publicProject, type Project } from "@/lib/ar/project";
import { readProject } from "@/lib/ar/projects.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// A published builder endcap: the static engine page
// (public/activated-retail/engine/index.html) with the project injected at its
// <!--AR_PROJECT--> marker, so the endcap renders without another request.
// ?draft=1 with an admin session serves the unpublished draft (never cached).

const ENGINE_PATH = "/activated-retail/engine/index.html";
const MARKER = "<!--AR_PROJECT-->";
const ENGINE_TTL_MS = 60_000;

let engineCache: { origin: string; at: number; html: string } | null = null;

async function engineHtml(request: Request): Promise<string | null> {
  const origin = new URL(request.url).origin;
  if (engineCache && engineCache.origin === origin && Date.now() - engineCache.at < ENGINE_TTL_MS)
    return engineCache.html;
  try {
    const res = await fetch(new URL(ENGINE_PATH, request.url), {
      headers: { accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!/<head[\s>]/i.test(html)) return null;
    engineCache = { origin, at: Date.now(), html };
    return html;
  } catch {
    return null;
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** JSON that is safe inside a <script> element. */
const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

function headFor(project: Project, slug: string, origin: string, thumb: string | null) {
  // brand lockup first: `name` is the team's internal label for the pitch
  const title = `${project.brand.lockup || project.name} · Activated Retail`;
  const desc = project.brand.splashSub || "An interactive activated-retail endcap.";
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(desc)}">`,
    `<meta property="og:type" content="website">`,
    thumb ? `<meta property="og:image" content="${escapeHtml(origin + thumb)}">` : "",
    thumb ? `<meta name="twitter:card" content="summary_large_image">` : "",
    `<meta name="robots" content="noindex, nofollow, noarchive">`,
    `<script>window.__AR_PROJECT = ${scriptJson(project)}; window.__AR_SLUG = ${scriptJson(slug)};</script>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function inject(html: string, head: string): string {
  if (html.includes(MARKER)) return html.replace(MARKER, () => head);
  // no marker: right after <head>, before anything that could read the project
  return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${head}`);
}

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${escapeHtml(title)} · MEDIALIFE</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100svh;display:grid;place-items:center;background:#0b0a10;color:#f3f2f7;
    font:16px/1.5 "Space Grotesk",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;box-sizing:border-box}
  main{max-width:420px;text-align:center}
  .mark{width:44px;height:44px;border-radius:10px;margin:0 auto 22px;display:grid;place-items:center;
    background:linear-gradient(135deg,#3aa8ff,#ff3d9a)}
  .mark span{width:14px;height:14px;border-radius:50%;background:rgba(11,10,16,.85)}
  .eyebrow{font:500 11px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.2em;text-transform:uppercase;color:#9a97a8}
  h1{font-weight:500;font-size:24px;letter-spacing:-.02em;margin:10px 0 8px}
  p{color:#a9a6b8;margin:0 0 22px}
  a{display:inline-block;color:#fff;text-decoration:none;border:1px solid #2c2a36;border-radius:999px;padding:9px 18px;font-size:14px}
  a:hover,a:focus-visible{border-color:#3aa8ff;outline:none}
</style></head>
<body><main>
  <div class="mark" aria-hidden="true"><span></span></div>
  <div class="eyebrow">MEDIALIFE · Activated retail</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  <a href="https://medialife.ai/">Go to medialife.ai</a>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

export const Route = createFileRoute("/x/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const ns = namespaceFromRequest(request);
        const doc = await readProject(ns, params.slug);
        const wantsDraft = url.searchParams.get("draft") === "1";
        const draft = wantsDraft && !!doc && (await isAdminRequest(request));

        const source = draft ? doc!.draft : doc?.published;
        if (!doc || !source) {
          return page(
            404,
            "This endcap isn't available",
            "The link may be out of date, or the endcap was taken offline. Ask the person who shared it for a new link.",
          );
        }
        const html = await engineHtml(request);
        if (!html) {
          return page(
            503,
            "This endcap is loading slowly",
            "We couldn't load it just now. Please try again in a minute.",
          );
        }
        const project = publicProject(source);
        // an admin previewing a draft doesn't need the password screen
        if (draft) project.access = {};
        const out = inject(html, headFor(project, doc.slug, url.origin, doc.thumb));
        return new Response(out, {
          // any ?draft=1 response stays out of the CDN: the cache key can't see the cookie
          headers: wantsDraft
            ? {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "private, no-store",
                "netlify-cdn-cache-control": "no-store",
              }
            : {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "public, max-age=0, must-revalidate",
                "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=600",
                // one cached copy per endcap, whatever ?c= / ?to= a client link adds
                "netlify-vary": "query=draft",
                // lets a future publish purge exactly this page
                "netlify-cache-tag": `x-${doc.slug}`,
              },
        });
      },
    },
  },
});
