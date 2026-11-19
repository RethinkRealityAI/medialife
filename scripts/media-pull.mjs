#!/usr/bin/env node
// List or download files from the MEDIALIFE Media Library (/admin/media).
// The library is the source of truth for videos and content the team uploads:
// agents pull from here instead of asking for links.
//
// Needs MEDIA_API_TOKEN (read-only bearer token, also set on Netlify).
//
//   node scripts/media-pull.mjs                         # list everything
//   node scripts/media-pull.mjs type=video client=EVADE # filtered list
//   node scripts/media-pull.mjs type=video --download out/videos
//
// Filters are the catalogue's own query params: q, tags, type, client,
// collection, purpose, public, ai, orientation. Downloads prefer the public URL
// and fall back to the authenticated download URL for private files.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const BASE = process.env.MEDIA_BASE_URL || "https://medialife.ai";
const token = process.env.MEDIA_API_TOKEN?.trim();
if (!token) {
  console.error("MEDIA_API_TOKEN is not set. Ask an admin for the read-only token.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dl = args.indexOf("--download");
const outDir = dl >= 0 ? args[dl + 1] || "media-pull" : null;
const params = new URLSearchParams(
  args.filter((a, i) => a.includes("=") && i !== dl + 1).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);

const auth = { authorization: `Bearer ${token}` };
const res = await fetch(`${BASE}/api/media/index.json?${params}`, { headers: auth });
if (!res.ok) {
  console.error(`Catalogue answered ${res.status}. ${res.status === 401 ? "Token missing or not deployed yet." : ""}`);
  process.exit(1);
}
const body = await res.json();
const items = body.assets ?? body.items ?? body;

for (const a of items) {
  const dims = a.width ? `${a.width}x${a.height}` : "";
  const dur = a.durationSeconds ? `${Math.round(a.durationSeconds)}s` : "";
  console.log(
    [a.id, a.type, dims, dur, a.client ?? "", a.collection ?? "", a.title, a.publicUrl ?? "(private)"]
      .filter(Boolean)
      .join(" | "),
  );
}
console.error(`${items.length} item(s)`);

if (outDir) {
  await mkdir(outDir, { recursive: true });
  for (const a of items) {
    const url = a.publicUrl
      ? new URL(a.publicUrl, BASE)
      : new URL(a.downloadUrl, BASE);
    const r = await fetch(url, { headers: a.publicUrl ? {} : auth });
    if (!r.ok) {
      console.error(`skip ${a.id}: ${r.status}`);
      continue;
    }
    const file = join(outDir, `${a.id}-${a.filename}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    console.error(`saved ${file}`);
  }
}
