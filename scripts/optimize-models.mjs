/**
 * Turns raw generated GLBs into web-ready product models.
 *
 * Two passes, in this order:
 *
 * 1. **Repair.** Generated models arrive with projection artefacts baked into
 *    the base colour atlas — black smears where the source photo's silhouette
 *    edge bled across island borders. On the model those land along the hem,
 *    cuffs and neckline. The albedo is supposed to be blank fabric, so any
 *    texel far darker than plausible fabric shading is an artefact: lifting the
 *    black point removes them and leaves the real shading alone.
 *
 * 2. **Optimise.** glTF-Transform, same recipe as the AiroHub asset pipeline:
 *    meshopt-compressed geometry and WebP textures. A raw Meshy GLB is 3–9 MB;
 *    this lands them in the low hundreds of KB.
 *
 *   node scripts/optimize-models.mjs [--force] [--only tee,plush]
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const run = promisify(execFile);
const RAW_DIR = path.resolve("assets-src/models");
const OUT_DIR = path.resolve("public/creators/assets/models");

const force = process.argv.includes("--force");
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(",") : null;

/**
 * Lift the black point of a base colour map.
 *
 * `floor` is where pure black lands, 0–255. Legitimate fabric shading in these
 * atlases sits around 140–245, and the artefacts sit under 50, so a floor
 * around 110 erases them while barely touching real shading. The slope keeps
 * the white point where it was.
 */
async function repairBaseColor(buffer, { floor = 110 } = {}) {
  const slope = (255 - floor) / 255;
  return sharp(buffer)
    .linear(slope, floor)
    // A light median pass knocks out the single-texel speckle the smears leave
    // behind without softening the atlas into mush.
    .median(3)
    .toBuffer();
}

const io = new NodeIO();

/** Rewrite every base colour texture in a GLB through the repair pass. */
async function repairModel(srcPath, tmpPath) {
  const doc = await io.read(srcPath);
  const repaired = new Set();
  let count = 0;

  for (const material of doc.getRoot().listMaterials()) {
    const tex = material.getBaseColorTexture();
    if (!tex || repaired.has(tex)) continue;
    repaired.add(tex);
    const image = tex.getImage();
    if (!image) continue;
    try {
      const out = await repairBaseColor(Buffer.from(image));
      tex.setImage(new Uint8Array(out));
      tex.setMimeType("image/png");
      count++;
    } catch (err) {
      console.warn(`  ! could not repair a texture: ${err.message}`);
    }
    // Metallic-roughness maps carry the same garbage, and a metal texel in a
    // dark studio renders as a mirror of nothing. None of this catalogue is
    // metal, so the channel is dropped outright.
    material.setMetallicRoughnessTexture(null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.82);
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
  const tmp = path.join(RAW_DIR, `.${id}.repaired.glb`);

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
    const fixed = await repairModel(src, tmp);
    await run(
      "npx",
      [
        "gltf-transform",
        "optimize",
        tmp,
        dest,
        "--compress", "meshopt",
        "--texture-compress", "webp",
        "--texture-size", "1024",
        "--simplify", "true",
        "--simplify-ratio", "0.7",
        // Locked borders stop simplification tearing holes in open shells such
        // as a hem, a cuff or a neckline.
        "--simplify-lock-border", "true",
        "--join", "true",
        "--flatten", "true",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const after = (await fs.stat(dest)).size;
    const pct = (100 * (1 - after / before)).toFixed(0);
    console.log(
      `✓ ${id}: ${(before / 1048576).toFixed(2)} MB → ${(after / 1024).toFixed(0)} KB (-${pct}%), ${fixed} texture(s) repaired`,
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
