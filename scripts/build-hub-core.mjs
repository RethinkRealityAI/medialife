/**
 * Builds the Collector Hub core for the browser labs.
 *
 *   mattercraft/cola-run/HubCore.ts  (source of truth, also used by the
 *                                        Mattercraft component as-is)
 *     → public/labs/collector-hub/hub-core.js
 *
 * Usage:  node scripts/build-hub-core.mjs          rebuild
 *         node scripts/build-hub-core.mjs --check  fail if the lab copy is stale
 */
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "mattercraft/cola-run/HubCore.ts");
const out = path.join(root, "public/labs/collector-hub/hub-core.js");

const r = await build({
  entryPoints: [src],
  bundle: false,
  format: "esm",
  target: "es2020",
  write: false,
  legalComments: "none",
  banner: {
    js: "// GENERATED from mattercraft/cola-run/HubCore.ts by scripts/build-hub-core.mjs. Don't edit.",
  },
});
const code = r.outputFiles[0].text;

if (process.argv.includes("--check")) {
  const have = await readFile(out, "utf8").catch(() => "");
  if (have !== code) {
    console.error("hub-core.js is stale: run node scripts/build-hub-core.mjs");
    process.exit(1);
  }
  console.log("hub-core.js matches HubCore.ts");
} else {
  await writeFile(out, code);
  console.log(`wrote ${path.relative(root, out)} (${(code.length / 1024).toFixed(1)} KB)`);
}
