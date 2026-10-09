/**
 * The Creator Merch Shelf's runtime (public/merch-shelf/, plain JS) can't import
 * src/lib/shelf/config.ts, so public/merch-shelf/default.json mirrors
 * DEFAULT_SHELF. This checks the two agree and that the JSON passes the schema.
 *
 * Usage:  npm run check:shelf            (exit 1 on drift)
 *         npm run check:shelf -- --write (rewrite default.json from the TS)
 */
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "public", "merch-shelf", "default.json");
const tmp = await mkdtemp(path.join(tmpdir(), "shelf-"));
try {
  const entry = path.join(tmp, "entry.ts");
  await writeFile(
    entry,
    `export { DEFAULT_SHELF, shelfConfigSchema } from ${JSON.stringify(path.join(root, "src/lib/shelf/config.ts"))};`,
  );
  const out = path.join(tmp, "out.mjs");
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    logLevel: "warning",
  });
  const { DEFAULT_SHELF, shelfConfigSchema } = await import(pathToFileURL(out).href);
  const expected = JSON.stringify(DEFAULT_SHELF, null, 2) + "\n";
  if (process.argv.includes("--write")) {
    await writeFile(jsonPath, expected);
    console.log("wrote public/merch-shelf/default.json");
  } else {
    const actual = await readFile(jsonPath, "utf8");
    const parsed = shelfConfigSchema.safeParse(JSON.parse(actual));
    if (!parsed.success) {
      console.error("default.json fails the schema:", parsed.error.issues[0]);
      process.exitCode = 1;
    } else if (actual !== expected) {
      console.error(
        "public/merch-shelf/default.json is out of step with DEFAULT_SHELF. Run: npm run check:shelf -- --write",
      );
      process.exitCode = 1;
    } else console.log("merch shelf default: in step");
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
