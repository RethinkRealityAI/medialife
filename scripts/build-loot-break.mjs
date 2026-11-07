/**
 * Builds LOOT BREAK (TBH: Task Bar Hero) for the browser test lab.
 *
 *   mattercraft/loot-break/LootBreakGame.ts  (the Mattercraft component, as-is)
 *     + mattercraft/lab-shim/zcomponent.ts   (stands in for @zcomponent/*)
 *     → public/labs/loot-break/assets/loot-break-game.js
 *
 * Usage:  node scripts/build-loot-break.mjs          rebuild
 *         node scripts/build-loot-break.mjs --check  fail if the lab copy is stale
 */
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shim = path.join(root, "mattercraft/lab-shim/zcomponent.ts");
const out = path.join(root, "public/labs/loot-break/assets/loot-break-game.js");

/** Every @zcomponent/* import resolves to the lab shim; three stays external (importmap). */
const zcomponentShim = {
  name: "zcomponent-shim",
  setup(b) {
    b.onResolve({ filter: /^@zcomponent\// }, () => ({ path: shim }));
    b.onResolve({ filter: /^three\/examples\/jsm\// }, (a) => ({
      path: a.path.replace(/^three\/examples\/jsm\//, "three/addons/"),
      external: true,
    }));
    b.onResolve({ filter: /^three(\/.*)?$/ }, (a) => ({ path: a.path, external: true }));
  },
};

const r = await build({
  stdin: {
    contents:
      'export { LootBreakGame, TIERS } from "./loot-break/LootBreakGame";\n' +
      'export { LabContext } from "./lab-shim/zcomponent";\n',
    resolveDir: path.join(root, "mattercraft"),
    sourcefile: "lab-entry.ts",
    loader: "ts",
  },
  bundle: true,
  plugins: [zcomponentShim],
  format: "esm",
  target: "es2020",
  write: false,
  legalComments: "none",
  banner: {
    js: "// GENERATED from mattercraft/loot-break/LootBreakGame.ts by scripts/build-loot-break.mjs. Don't edit.",
  },
});
const code = r.outputFiles[0].text;

if (process.argv.includes("--check")) {
  const have = await readFile(out, "utf8").catch(() => "");
  if (have !== code) {
    console.error("loot-break-game.js is stale: run node scripts/build-loot-break.mjs");
    process.exit(1);
  }
  console.log("loot-break-game.js matches LootBreakGame.ts");
} else {
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, code);
  console.log(`wrote ${path.relative(root, out)} (${(code.length / 1024).toFixed(1)} KB)`);
}
