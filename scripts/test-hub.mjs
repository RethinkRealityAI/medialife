/**
 * Creator Hub checks: order normalisation (Shopify), earnings maths, and the
 * account primitives (password hashing, sessions, one-time tokens, rate limits,
 * email-link origins). No test runner needed: each file is bundled with esbuild
 * (already installed with Vite) and run with node's assert.
 *
 * Usage:  npm run test:hub
 *
 * The auth checks write to a throwaway directory, never to .data/.
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "scripts", "hub-tests");
const tmp = await mkdtemp(path.join(tmpdir(), "hub-tests-"));
let failed = false;

try {
  for (const name of ["commerce", "auth"]) {
    const outfile = path.join(tmp, `${name}.mjs`);
    await build({
      entryPoints: [path.join(dir, `${name}.test.ts`)],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      logLevel: "warning",
      alias: {
        "@": path.join(root, "src"),
        "@tanstack/react-start/server": path.join(dir, "stub-start.ts"),
      },
      external: ["@netlify/blobs"],
    });
    const sandbox = await mkdtemp(path.join(tmp, `${name}-data-`));
    const r = spawnSync(process.execPath, [outfile, sandbox], { stdio: "inherit", cwd: sandbox });
    if (r.status !== 0) failed = true;
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
