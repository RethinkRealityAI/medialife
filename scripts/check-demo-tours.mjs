// Checks that the tour defaults the admin shows (src/lib/ar/demo-tours.ts) match the
// TOUR arrays inside the live demo pages, stop for stop: same ids, same order, same
// title, text and AR flag. The pages are the source of truth (their inline TOUR is
// the fallback clients see); edit a page, then update demo-tours.ts to match.
//
//   node scripts/check-demo-tours.mjs          fails (exit 1) on any drift
//   node scripts/check-demo-tours.mjs --print  prints what the pages contain, as JSON
//
// Node 22.18+ runs the TypeScript module directly (type stripping).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TOURS } from "../src/lib/ar/demo-tours.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The page's TOUR array. Evaluated, not parsed by hand: the step callbacks are never called. */
export function pageTour(demo) {
  const html = readFileSync(join(root, "public", demo, "activated-retail", "index.html"), "utf8");
  const start = html.indexOf("const TOUR = [");
  if (start < 0) throw new Error(`${demo}: no "const TOUR = [" in the page`);
  const end = html.indexOf("\n];", start);
  const literal = html.slice(start + "const TOUR = ".length, end + 2);
  const steps = new Function(`return (${literal});`)();
  return steps.map((s) => ({ id: s.id, t: s.t, b: s.b, ar: !!s.ar }));
}

if (process.argv.includes("--print")) {
  const out = Object.fromEntries(Object.keys(DEMO_TOURS).map((d) => [d, pageTour(d)]));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

let failed = 0;
for (const [demo, def] of Object.entries(DEMO_TOURS)) {
  const page = pageTour(demo);
  const problems = [];
  const ids = page.map((s) => s.id);
  const want = def.steps.map((s) => s.id);
  if (ids.join() !== want.join())
    problems.push(`stop ids differ: page [${ids}] vs demo-tours.ts [${want}]`);
  if (new Set(ids).size !== ids.length || ids.some((id) => !id))
    problems.push("every stop needs a unique id");
  for (const s of def.steps) {
    const p = page.find((x) => x.id === s.id);
    if (!p) continue;
    for (const k of ["t", "b", "ar"]) {
      if (p[k] !== s.default[k])
        problems.push(
          `${s.id}.${k}: page ${JSON.stringify(p[k])} vs demo-tours.ts ${JSON.stringify(s.default[k])}`,
        );
    }
  }
  if (problems.length) {
    failed++;
    console.error(`✗ ${demo}\n  - ${problems.join("\n  - ")}`);
  } else {
    console.log(`✓ ${demo}: ${page.length} stops match`);
  }
}
process.exit(failed ? 1 : 0);
