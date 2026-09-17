/**
 * Turns raw generated GLBs into web-ready product models.
 *
 * Two passes, in this order:
 *
 * 1. **Flatten the base colour.** A generated model's albedo is not the blank
 *    fabric the prompt asked for. Meshy bakes hallucinated detail into it --
 *    ghost lettering across the chest, seam smears along the hem, a colour cast
 *    from whatever the generator imagined the material to be -- however firmly
 *    the prompt says "completely blank, no print, no text, no logos".
 *
 *    None of that can ship on a product a creator is about to put their own
 *    artwork on. So the atlas is reduced to the one thing it is genuinely good
 *    for, which is the low-frequency shading of the folds: greyscale to drop the
 *    colour cast, a blur to erase the fine hallucinated detail while leaving the
 *    broad shading intact, then a remap into a narrow band near white so the
 *    colourway wash in product.js lands on clean fabric.
 *
 *    Metallic-roughness maps carry the same garbage, and a stray metal texel in
 *    a dark studio renders as a mirror of nothing. Nothing in this catalogue is
 *    metal, so that channel is dropped outright.
 *
 * 2. **Optimise.** glTF-Transform, same recipe as the AiroHub asset pipeline:
 *    meshopt-compressed geometry and WebP textures. A raw Meshy GLB is 2-4 MB;
 *    this lands them in the low hundreds of KB.
 *
 * Models authored elsewhere (the AiroHub hoodie and cap) already have clean
 * albedo plus real normal maps and are committed as-is -- they are not in
 * assets-src/ and this script never sees them.
 *
 *   node scripts/optimize-models.mjs [--force] [--only tee,plush]
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const run = promisify(execFile);
const RAW_DIR = path.resolve("assets-src/models");
const OUT_DIR = path.resolve("public/roblox/creators/assets/models");

const force = process.argv.includes("--force");
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(",") : null;

/**
 * Reduce a base colour atlas to shading alone.
 *
 * `sigma` is the blur radius in texels at 1024: large enough to erase baked
 * lettering and seam smears, small enough to leave the fold shading readable.
 * The remap puts pure black at `floor` and keeps the white point, so no texel
 * ever goes dark enough to read as dirt on a pale colourway.
 */
async function flattenBaseColor(buffer, { sigma = 7, floor = 150 } = {}) {
  return sharp(buffer)
    .greyscale()
    .blur(sigma)
    .linear((255 - floor) / 255, floor)
    .png()
    .toBuffer();
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

/** Rewrite every base colour texture in a GLB through the flatten pass. */
async function flattenModel(srcPath, tmpPath) {
  const doc = await io.read(srcPath);
  const done = new Set();
  let count = 0;

  for (const material of doc.getRoot().listMaterials()) {
    const tex = material.getBaseColorTexture();
    if (tex && !done.has(tex)) {
      done.add(tex);
      const image = tex.getImage();
      if (image) {
        try {
          const out = await flattenBaseColor(Buffer.from(image));
          tex.setImage(new Uint8Array(out)).setMimeType("image/png");
          count++;
        } catch (err) {
          console.warn(`  ! could not flatten a texture: ${err.message}`);
        }
      }
    }
    material.setMetallicRoughnessTexture(null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.88);
  }

  await io.write(tmpPath, doc);
  return count;
}

await fs.mkdir(OUT_DIR, { recursive: true });
let entries;
try {
  entries = (await fs.readdir(RAW_DIR)).filter((f) => f.endsWith(".glb"));
} catch {
  console.error(`No raw models at ${RAW_DIR} — nothing to do.`);
  process.exit(0);
}

const results = [];
for (const file of entries) {
  const id = path.basename(file, ".glb");
  if (only && !only.includes(id)) continue;

  const src = path.join(RAW_DIR, file);
  const dest = path.join(OUT_DIR, file);
  const tmp = path.join(RAW_DIR, `.${id}.flat.glb`);

  if (!force) {
    try {
      const [rawStat, outStat] = await Promise.all([fs.stat(src), fs.stat(dest)]);
      if (outStat.mtimeMs > rawStat.mtimeMs) {
        console.log(`= ${id}: up to date`);
        results.push({ id, bytes: outStat.size, skipped: true });
        continue;
      }
    } catch {
      /* not built yet */
    }
  }

  const before = (await fs.stat(src)).size;
  try {
    const flattened = await flattenModel(src, tmp);
    await run(
      "npx",
      [
        "gltf-transform",
        "optimize",
        tmp,
        dest,
        "--compress",
        "meshopt",
        "--texture-compress",
        "webp",
        "--texture-size",
        "1024",
        "--simplify",
        "true",
        "--simplify-ratio",
        "0.75",
        // Locked borders stop simplification tearing holes in open shells such
        // as a hem, a cuff or a neckline.
        "--simplify-lock-border",
        "true",
        "--join",
        "true",
        "--flatten",
        "true",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const after = (await fs.stat(dest)).size;
    const pct = (100 * (1 - after / before)).toFixed(0);
    console.log(
      `✓ ${id}: ${(before / 1048576).toFixed(2)} MB → ${(after / 1024).toFixed(0)} KB (-${pct}%), ${flattened} texture(s) flattened`,
    );
    results.push({ id, bytes: after });
  } catch (err) {
    console.error(`✗ ${id}: ${(err.stderr || err.message || "").slice(0, 400)}`);
    process.exitCode = 1;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

const total = results.reduce((sum, r) => sum + r.bytes, 0);
console.log(`\n${results.length} models, ${(total / 1024).toFixed(0)} KB total.`);
