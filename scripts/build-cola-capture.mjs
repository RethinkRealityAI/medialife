/**
 * Builds the Cola Run capture core for the browser test lab.
 *
 *   mattercraft/cola-run/CaptureCore.ts  (source of truth, also used by the
 *                                        Mattercraft component as-is)
 *     → public/evade/cola-run-lab/assets/capture-core.js
 *
 * Usage:  node scripts/build-cola-capture.mjs          rebuild
 *         node scripts/build-cola-capture.mjs --check  fail if the lab copy is stale
 */
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "mattercraft/cola-run/CaptureCore.ts");
const out = path.join(root, "public/evade/cola-run-lab/assets/capture-core.js");

const r = await build({
  entryPoints: [src],
  bundle: false,
  format: "esm",
  target: "es2020",
  write: false,
  legalComments: "none",
  banner: {
    js: "// GENERATED from mattercraft/cola-run/CaptureCore.ts by scripts/build-cola-capture.mjs. Don't edit.",
  },
});
const code = r.outputFiles[0].text;

if (process.argv.includes("--check")) {
  const have = await readFile(out, "utf8").catch(() => "");
  if (have !== code) {
    console.error("capture-core.js is stale: run node scripts/build-cola-capture.mjs");
    process.exit(1);
  }
  console.log("capture-core.js matches CaptureCore.ts");
} else {
  await writeFile(out, code);
  console.log(`wrote ${path.relative(root, out)} (${(code.length / 1024).toFixed(1)} KB)`);
}
