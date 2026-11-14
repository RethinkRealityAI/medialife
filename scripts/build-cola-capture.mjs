/**
 * Builds the Cola Run code for the browser test lab.
 *
 *   mattercraft/cola-run/CaptureCore.ts  (source of truth, also used by the
 *                                        Mattercraft component as-is)
 *     → public/evade/cola-run-lab/assets/capture-core.js
 *
 *   mattercraft/cola-run/OrbHuntGame.ts  (the real Mattercraft game, unchanged)
 *   + mattercraft/cola-run/CollectorHubMode.ts (+ HubCore.ts: Bobo's Hideout)
 *     + mattercraft/lab-shim/zcomponent.ts (stands in for @zcomponent/*)
 *     → public/evade/cola-run-lab/assets/orb-hunt-game.js
 *
 * Usage:  node scripts/build-cola-capture.mjs          rebuild
 *         node scripts/build-cola-capture.mjs --check  fail if a lab copy is stale
 */
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shim = path.join(root, "mattercraft/lab-shim/zcomponent.ts");

/** Every @zcomponent/* import resolves to the lab shim; three stays external (importmap). */
const zcomponentShim = {
  name: "zcomponent-shim",
  setup(b) {
    b.onResolve({ filter: /^@zcomponent\// }, () => ({ path: shim }));
    // Mattercraft spells three's add-ons three/examples/jsm/…; the lab's importmap has three/addons/.
    b.onResolve({ filter: /^three\/examples\/jsm\// }, (a) => ({
      path: a.path.replace(/^three\/examples\/jsm\//, "three/addons/"),
      external: true,
    }));
    b.onResolve({ filter: /^three(\/.*)?$/ }, (a) => ({ path: a.path, external: true }));
  },
};

const jobs = [
  {
    src: "mattercraft/cola-run/CaptureCore.ts",
    out: "public/evade/cola-run-lab/assets/capture-core.js",
    opts: { entryPoints: [path.join(root, "mattercraft/cola-run/CaptureCore.ts")], bundle: false },
  },
  {
    src: "mattercraft/cola-run/OrbHuntGame.ts",
    out: "public/evade/cola-run-lab/assets/orb-hunt-game.js",
    opts: {
      stdin: {
        contents:
          'export { OrbHuntGame } from "./cola-run/OrbHuntGame";\n' +
          'export { CollectorHubMode } from "./cola-run/CollectorHubMode";\n' +
          'export { LabContext } from "./lab-shim/zcomponent";\n',
        resolveDir: path.join(root, "mattercraft"),
        sourcefile: "lab-entry.ts",
        loader: "ts",
      },
      bundle: true,
      plugins: [zcomponentShim],
    },
  },
];

let stale = false;
for (const j of jobs) {
  const r = await build({
    ...j.opts,
    format: "esm",
    target: "es2020",
    write: false,
    legalComments: "none",
    banner: {
      js: `// GENERATED from ${j.src} by scripts/build-cola-capture.mjs. Don't edit.`,
    },
  });
  const code = r.outputFiles[0].text;
  const out = path.join(root, j.out);
  const name = path.basename(out);
  if (process.argv.includes("--check")) {
    const have = await readFile(out, "utf8").catch(() => "");
    if (have !== code) {
      console.error(`${name} is stale: run node scripts/build-cola-capture.mjs`);
      stale = true;
    } else console.log(`${name} matches ${path.basename(j.src)}`);
  } else {
    await writeFile(out, code);
    console.log(`wrote ${path.relative(root, out)} (${(code.length / 1024).toFixed(1)} KB)`);
  }
}
if (stale) process.exit(1);
