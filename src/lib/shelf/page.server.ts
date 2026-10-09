import type { ShelfConfig } from "./config";

// Serving the Creator Merch Shelf page (public/merch-shelf/index.html, a static
// app) from the SSR routes /shelf and /shelf/<slug>: fetch it from our own
// origin (cached a minute per instance), then inject <title>, link-preview meta
// and, for a published shelf, the config at its <!--SHELF_CONFIG--> marker.

const PAGE_PATH = "/merch-shelf/index.html";
const MARKER = "<!--SHELF_CONFIG-->";
const PAGE_TTL_MS = 60_000;

export const SHELF_OG_DESCRIPTION =
  "Your merch, activated. Tap any product to see what fans experience.";
/** Link-preview image when a shelf has no snapshot yet (the site's own card). */
const FALLBACK_OG_IMAGE = "/og.png";

let pageCache: { origin: string; at: number; html: string } | null = null;

export async function shelfPageHtml(request: Request): Promise<string | null> {
  const origin = new URL(request.url).origin;
  if (pageCache && pageCache.origin === origin && Date.now() - pageCache.at < PAGE_TTL_MS)
    return pageCache.html;
  try {
    const res = await fetch(new URL(PAGE_PATH, request.url), {
      headers: { accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!/<head[\s>]/i.test(html)) return null;
    pageCache = { origin, at: Date.now(), html };
    return html;
  } catch {
    return null;
  }
}

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** JSON that is safe inside a <script> element. */
export const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** "PixelPine's activated merch · MEDIALIFE" (a bare "YOUR NAME" reads as the demo). */
export function shelfTitle(creatorName: string | null | undefined): string {
  const n = (creatorName ?? "").trim();
  if (!n || n.toUpperCase() === "YOUR NAME") return "Your activated merch · MEDIALIFE";
  return `${n}'s activated merch · MEDIALIFE`;
}

export function headTags(opts: {
  origin: string;
  path: string;
  title: string;
  /** site path of the og image, e.g. "/api/ar/asset/<id>"; null = the fallback card */
  image: string | null;
  /** a published shelf: window.__SHELF / __SHELF_SLUG */
  shelf?: { config: ShelfConfig; slug: string } | null;
}): string {
  const { origin, title } = opts;
  const image = origin + (opts.image ?? FALLBACK_OG_IMAGE);
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(SHELF_OG_DESCRIPTION)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(SHELF_OG_DESCRIPTION)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="MEDIALIFE">`,
    `<meta property="og:url" content="${escapeHtml(origin + opts.path)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    opts.image ? `<meta property="og:image:width" content="1200">` : "",
    opts.image ? `<meta property="og:image:height" content="630">` : "",
    `<meta property="og:image:alt" content="${escapeHtml(title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(SHELF_OG_DESCRIPTION)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<meta name="robots" content="noindex, nofollow, noarchive">`,
    opts.shelf
      ? `<script>window.__SHELF=${scriptJson(opts.shelf.config)};window.__SHELF_SLUG=${scriptJson(opts.shelf.slug)};</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Put `head` at the marker; without one, right after <head>. The page's own
 * <title>, description and og/twitter tags are dropped first (the first one wins).
 */
export function injectHead(html: string, head: string): string {
  // ours replace the page's own title / description / link-preview tags
  html = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(
      /<meta\s+(?:property|name)="(?:og:[a-z:_]+|twitter:[a-z:_]+|description)"[^>]*>\s*/gi,
      "",
    );
  if (html.includes(MARKER)) return html.replace(MARKER, () => head);
  return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${head}`);
}

export function shelfMessagePage(
  status: number,
  title: string,
  body: string,
  action: { href: string; label: string } = { href: "/shelf", label: "See a demo shelf" },
): Response {
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
  .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  a{display:inline-block;color:#fff;text-decoration:none;border:1px solid #2c2a36;border-radius:999px;padding:9px 18px;font-size:14px}
  a:hover,a:focus-visible{border-color:#3aa8ff;outline:none}
</style></head>
<body><main>
  <div class="mark" aria-hidden="true"><span></span></div>
  <div class="eyebrow">MEDIALIFE · Activated merch</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  <div class="row">
    <a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>
    <a href="https://medialife.ai/">Go to medialife.ai</a>
  </div>
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
