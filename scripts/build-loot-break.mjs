/**
 * Builds LOOT BREAK (TBH: Task Bar Hero) for the browser test lab.
 *
 *   mattercraft/loot-break/LootBreakGame.ts  (the Mattercraft component, as-is)
 *     + mattercraft/lab-shim/zcomponent.ts   (stands in for @zcomponent/*)
 *     → public/labs/loot-break/assets/loot-break-game.js
 *
 *   mattercraft/loot-break/index.src.html    (the splash screen; sprites come
 *     + the pixel art in LootBreakGame.ts      from the game file, never copied by hand)
 *     → mattercraft/loot-break/index.html      (the file that goes in Mattercraft)
 *     → public/labs/loot-break/splash.html     (the same page, with a fake loader
 *                                               standing in for index.ts, no analytics)
 *
 * Usage:  node scripts/build-loot-break.mjs          rebuild
 *         node scripts/build-loot-break.mjs --check  fail if the lab copy is stale
 */
import { build, transform } from "esbuild";
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
      'export { LabContext, Observable } from "./lab-shim/zcomponent";\n',
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

/* ── splash screen ── */
const gameSrc = await readFile(path.join(root, "mattercraft/loot-break/LootBreakGame.ts"), "utf8");
const artStart = gameSrc.indexOf("const PAL");
const artEnd = gameSrc.indexOf("\n};", gameSrc.indexOf("const SPRITES")) + 3;
const { code: artJs } = await transform(gameSrc.slice(artStart, artEnd), { loader: "ts" });
const art = new Function(`${artJs}; return { PAL, SPRITES };`)();
const keep = ["knight", "ranger", "sorcerer", "priest", "slime", "chest", "chestOpen", "coin"];
// One line per sprite, so no line is long enough to trip up an editor.
const artJson = `{\n\t\t\t\t"PAL": ${JSON.stringify(art.PAL)},\n\t\t\t\t"SPRITES": {\n${keep
  .map((k) => `\t\t\t\t\t${JSON.stringify(k)}: ${JSON.stringify(art.SPRITES[k])}`)
  .join(",\n")}\n\t\t\t\t}\n\t\t\t}`;
const splashSrc = await readFile(path.join(root, "mattercraft/loot-break/index.src.html"), "utf8");
const banner = "<!-- GENERATED from mattercraft/loot-break/index.src.html by scripts/build-loot-break.mjs. Edit the .src.html, not this file. -->\n";
// The two splash images are separate files, referenced next to index.html
// (Mattercraft: upload both to the project root, keeping these names). Earlier
// builds inlined them as data URIs, but a 30 KB line broke when pasted into
// the Mattercraft editor.
// Both are WebP (12 KB and 10 KB):
// - TBH logo: a crop of the official Steam capsule (art/tbh/). Swap it for
//   TBH's own logo file when it arrives.
// - "Activated by MEDIALIFE": the brand-kit badge (public/email/).
const IMAGES = {
  "tbh-logo.webp": "mattercraft/loot-break/art/tbh/tbh-logo.webp",
  "activated-by-medialife.webp": "mattercraft/loot-break/art/medialife/activated-by-medialife.webp",
};
const withArt = splashSrc
  .replace("__SPRITES__", artJson)
  .replaceAll("__TBH_LOGO__", "./tbh-logo.webp")
  .replaceAll("__ML_BADGE__", "./activated-by-medialife.webp");
const mcHtml = withArt.replace("<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + banner);
const LAB_BOOT = `<!-- Lab stand-in for index.ts: in Mattercraft, initialize() enables
		     #launchButton once the scene has loaded and hides the splash on tap. -->
		<script>
			addEventListener('DOMContentLoaded', function () {
				var b = document.getElementById('launchButton');
				var q = new URLSearchParams(location.search);
				if (!q.has('loading')) setTimeout(function () { b.disabled = false; }, 1800);
				b.addEventListener('click', function () {
					document.body.classList.add('zcomponent-launched');
					setTimeout(function () { location.href = './index.html'; }, 450);
				});
			});
		</script>`;
const labHtml = withArt
  .replace("<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + banner)
  .replace(/<!-- @lab:boot -->[\s\S]*?<!-- @lab:end -->/, LAB_BOOT)
  .replace(/[ \t]*<!-- @lab:analytics -->[\s\S]*?<!-- @lab:end -->\n?/g, "")
  .replace("<head>", '<head>\n\t\t<meta name="robots" content="noindex" />');
const mcClean = mcHtml.replace(/[ \t]*<!-- @lab:(boot|analytics|end) -->\n/g, "");

const outputs = [
  [out, code],
  [path.join(root, "mattercraft/loot-break/index.html"), mcClean],
  [path.join(root, "public/labs/loot-break/splash.html"), labHtml],
  // the lab serves the same images beside splash.html
  ...(await Promise.all(
    Object.entries(IMAGES).map(async ([name, src]) => [
      path.join(root, "public/labs/loot-break", name),
      await readFile(path.join(root, src)),
    ]),
  )),
];

if (process.argv.includes("--check")) {
  let stale = false;
  for (const [file, text] of outputs) {
    const have = await readFile(file).catch(() => Buffer.alloc(0));
    if (!have.equals(Buffer.isBuffer(text) ? text : Buffer.from(text))) {
      console.error(`${path.relative(root, file)} is stale: run node scripts/build-loot-break.mjs`);
      stale = true;
    } else console.log(`${path.relative(root, file)} is up to date`);
  }
  if (stale) process.exit(1);
} else {
  for (const [file, text] of outputs) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    console.log(`wrote ${path.relative(root, file)} (${(text.length / 1024).toFixed(1)} KB)`);
  }
}
