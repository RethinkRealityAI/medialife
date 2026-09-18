/**
 * Knock the background out of a product photo.
 *
 * Product shots arrive on white or near-white seamless with a soft contact
 * shadow. A hard luminance threshold eats the light parts of the product (the
 * can's chrome, a pale acrylic edge) and leaves a grey halo where the shadow
 * was, so this does not threshold: it flood-fills from the border, which only
 * removes background that is actually connected to the edge of the frame.
 *
 *   node scripts/cutout.mjs <in> <out.png> [--tolerance 30] [--feather 1.5] [--trim]
 *
 * Writes RGBA PNG. Pipe it through the usual webp/jpg step afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import sharp from "sharp";

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) {
  console.error(
    "usage: node scripts/cutout.mjs <in> <out.png> [--tolerance N] [--holes N] [--hole-min-area F] [--feather N] [--trim]",
  );
  process.exit(1);
}
const arg = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(rest[i + 1]);
};
// One threshold, applied to a flood fill rather than the whole frame. It has to
// be loose enough for the fill to walk through the contact shadow — a shadow is
// far from the paper colour, so a tight value strands it as a grey fringe — and
// tight enough that the fill stops at the product outline. Connectivity does the
// rest: an enclosed gap is only removed if it is reachable from the frame edge.
// 55 clears a soft contact shadow on white seamless without biting into
// low-saturation product parts. Chrome hardware is the thing that goes first if
// you push it: past about 80 the fill walks straight through a clasp. Tune per
// photo and look at the result over a dark surface before shipping it.
const TOL = arg("tolerance", 55);
const FEATHER = arg("feather", 1.5);
const TRIM = rest.includes("--trim");
// Background enclosed by the product — the gap inside a clasp ring — is not
// reachable from the frame edge, so the fill leaves it opaque and it shows as a
// pale blob on a dark surface. Colour alone cannot find it: that gap sits in
// shadow, which puts it FARTHER from the seamless than a bright part of the
// product, so any threshold that catches it eats the artwork first. Name the
// hole instead. Coordinates are fractions of width/height (0.5,0.13) or exact
// pixels (383,133), and the option repeats.
const SEED_ARGS = rest.map((v, i) => (v === "--seed" ? rest[i + 1] : null)).filter(Boolean);

const { data, info } = await sharp(inPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const at = (x, y) => (y * W + x) * 4;

// The background colour is whatever the corners agree on.
const corners = [
  [2, 2],
  [W - 3, 2],
  [2, H - 3],
  [W - 3, H - 3],
].map(([x, y]) => {
  const i = at(x, y);
  return [data[i], data[i + 1], data[i + 2]];
});
const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((n, p) => n + p[c], 0) / corners.length));
/** Mean per-channel distance from the sampled background colour. */
const dist = (i) =>
  (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])) / 3;
/** Loose enough to let the fill walk through the shadow to the product edge. */
const near = (i) => dist(i) <= TOL;

// Flood fill inward from the frame edge. Anything enclosed by the product —
// the gap inside a clasp, a hole in a charm — stays opaque unless it is
// connected to the outside, which is the whole point of doing it this way.
const outside = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) {
  stack.push([x, 0], [x, H - 1]);
}
for (let y = 0; y < H; y++) {
  stack.push([0, y], [W - 1, y]);
}
for (const a of SEED_ARGS) {
  const [sx, sy] = String(a).split(",").map(Number);
  const x = sx <= 1 ? Math.round(sx * W) : Math.round(sx);
  const y = sy <= 1 ? Math.round(sy * H) : Math.round(sy);
  if (x < 0 || y < 0 || x >= W || y >= H) {
    console.error(`  seed ${a} is outside the frame — ignored`);
    continue;
  }
  if (!near(at(x, y))) {
    console.error(`  seed ${a} is not within --tolerance of the background — ignored`);
    continue;
  }
  stack.push([x, y]);
}
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (outside[p]) continue;
  if (!near(p * 4)) continue;
  outside[p] = 1;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Feather the boundary so the edge is not a staircase.
const alpha = new Float32Array(W * H);
for (let p = 0; p < W * H; p++) alpha[p] = outside[p] ? 0 : 255;
if (FEATHER > 0) {
  const r = Math.max(1, Math.round(FEATHER));
  const blurred = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          sum += alpha[yy * W + xx];
          n++;
        }
      }
      blurred[y * W + x] = sum / n;
    }
  }
  // Only soften pixels at the boundary; leave the solid interior alone so the
  // product does not go translucent.
  for (let p = 0; p < W * H; p++) {
    if (blurred[p] > 4 && blurred[p] < 251) alpha[p] = blurred[p];
  }
}

const png = new PNG({ width: W, height: H });
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  png.data[i] = data[i];
  png.data[i + 1] = data[i + 1];
  png.data[i + 2] = data[i + 2];
  png.data[i + 3] = Math.round(alpha[p]);
}
let buf = PNG.sync.write(png);

if (TRIM) buf = await sharp(buf).trim({ threshold: 1 }).png().toBuffer();

writeFileSync(outPath, buf);
const kept = alpha.reduce((n, a) => n + (a > 8 ? 1 : 0), 0);
console.log(
  `${outPath}  ${W}x${H}  bg rgb(${bg})  kept ${((kept / (W * H)) * 100).toFixed(1)}% of pixels`,
);
