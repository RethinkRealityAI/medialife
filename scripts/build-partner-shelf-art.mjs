/**
 * Builds the artwork printed on a partner's default merch shelf (the Partner
 * Hub's /partner-hub/shelves starts every partner with one): back prints for
 * the apparel, a chest mark, and sticker art. Transparent WebP, so the shelf
 * prints them as-is on any colourway.
 *
 *   node scripts/build-partner-shelf-art.mjs snowday
 *
 * Writes to public/partner-kit/<kit>/shelf/. Inputs are the kit's own
 * photography and the partner's logo (public/partner-kit/<kit>/brand/).
 * Needs Playwright's Chromium (see scripts/build-partner-kit.mjs).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE ?? "/opt/node-tools/node_modules/playwright-core/index.mjs"
);

const KITS = {
  snowday: {
    colors: {
      ice: "#96c8ec",
      frost: "#e9f6ff",
      slate: "#405d96",
      violet: "#9a7bff",
      navy: "#21254a",
    },
    aurora: "public/partner-kit/snowday/aurora-banner.webp",
    mark: "public/partner-kit/snowday/brand/snowflake-lg.webp",
    wordmark: "public/partner-kit/snowday/brand/wordmark.webp",
    name: "SNOWDAY MEDIA",
  },
};

const kitId = process.argv[2] ?? "snowday";
const kit = KITS[kitId];
if (!kit) throw new Error(`Unknown kit "${kitId}". Known: ${Object.keys(KITS).join(", ")}`);
const out = path.join(root, "public/partner-kit", kitId, "shelf");
mkdirSync(out, { recursive: true });

const dataUri = async (rel, width) => {
  const buf = await sharp(path.join(root, rel))
    .resize({ width, withoutEnlargement: false })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
};
const c = kit.colors;
const aurora = await dataUri(kit.aurora, 1600);
const mark = await dataUri(kit.mark, 700);
const wordmark = await dataUri(kit.wordmark, 1200);

const fonts = `<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@800;900&family=Figtree:wght@600;700;800&display=swap" rel="stylesheet">`;
const base = `*{margin:0;box-sizing:border-box}html,body{background:transparent}
body{font-family:Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
#art{position:relative;display:inline-block}`;

/** Each piece: [file, width, height, inner HTML + CSS]. */
const PIECES = [
  [
    "back-aurora",
    1000,
    1180,
    `<style>
      .ring{position:absolute;left:100px;top:150px;width:800px;height:800px;border-radius:50%;overflow:hidden;
        box-shadow:0 0 0 14px ${c.frost},0 0 0 26px ${c.slate},0 0 90px 10px rgba(150,200,236,.55)}
      .ring img{width:100%;height:100%;object-fit:cover;object-position:60% 40%;filter:saturate(1.2)}
      .flake{position:absolute;left:330px;top:370px;width:340px;filter:drop-shadow(0 0 30px rgba(233,246,255,.9))}
      svg{position:absolute;left:0;top:0}
      .pill{position:absolute;left:50%;top:1010px;transform:translateX(-50%);padding:22px 54px;border-radius:999px;
        background:${c.frost};color:${c.navy};font-weight:800;font-size:46px;letter-spacing:.2em;white-space:nowrap;
        box-shadow:0 0 40px rgba(150,200,236,.6)}
    </style>
    <div class="ring"><img src="${aurora}"></div>
    <img class="flake" src="${mark}">
    <svg width="1000" height="1180" viewBox="0 0 1000 1180">
      <defs><path id="arc" d="M 150 560 A 350 350 0 0 1 850 560"/></defs>
      <text font-family="Bitter" font-weight="900" font-size="74" letter-spacing="10" fill="${c.frost}"
        stroke="${c.navy}" stroke-width="6" paint-order="stroke">
        <textPath href="#arc" startOffset="50%" text-anchor="middle">${kit.name}</textPath>
      </text>
    </svg>
    <div class="pill">TAP TO UNLOCK</div>`,
  ],
  [
    "back-frost",
    1000,
    1270,
    `<style>
      .rings{position:absolute;left:500px;top:520px}
      .rings span{position:absolute;border-radius:50%;border:10px solid ${c.ice};transform:translate(-50%,-50%)}
      .flake{position:absolute;left:250px;top:240px;width:500px;filter:drop-shadow(0 0 40px rgba(150,200,236,.85))}
      .word{position:absolute;left:130px;top:900px;width:740px}
      .tag{position:absolute;left:0;right:0;top:1210px;text-align:center;color:${c.ice};font-weight:800;font-size:34px;letter-spacing:.32em}
    </style>
    <div class="rings">
      <span style="width:640px;height:640px;opacity:.55"></span>
      <span style="width:790px;height:790px;opacity:.32"></span>
      <span style="width:940px;height:940px;opacity:.16"></span>
    </div>
    <img class="flake" src="${mark}">
    <img class="word" src="${wordmark}">
    <div class="tag">ACTIVATED MERCH</div>`,
  ],
  [
    "back-snowday",
    1000,
    1100,
    `<style>
      .t{position:absolute;left:0;right:0;text-align:center;font-family:Bitter;font-weight:900;line-height:.86;
        font-size:300px;letter-spacing:-.02em;background:url(${aurora}) 55% 40%/cover;-webkit-background-clip:text;
        color:transparent;-webkit-text-stroke:6px ${c.frost};filter:drop-shadow(0 0 26px rgba(150,200,236,.55))}
      .flake{position:absolute;width:120px;filter:drop-shadow(0 0 16px rgba(233,246,255,.8))}
      .sub{position:absolute;left:0;right:0;top:880px;text-align:center;color:${c.frost};font-weight:800;
        font-size:56px;letter-spacing:.42em}
      .line{position:absolute;left:180px;right:180px;top:990px;height:6px;border-radius:3px;
        background:linear-gradient(90deg,transparent,${c.ice},${c.violet},transparent)}
    </style>
    <div class="t" style="top:120px">SNOW</div>
    <div class="t" style="top:470px">DAY</div>
    <img class="flake" src="${mark}" style="left:830px;top:60px">
    <img class="flake" src="${mark}" style="left:60px;top:720px;width:90px;opacity:.85">
    <div class="sub">MEDIA</div>
    <div class="line"></div>`,
  ],
  [
    "sticker",
    900,
    900,
    `<style>
      .disc{position:absolute;inset:40px;border-radius:50%;
        background:conic-gradient(from 210deg,${c.ice},${c.violet},#ff9ad5,${c.ice},${c.slate},${c.ice});
        box-shadow:inset 0 0 0 18px #fff,0 0 0 4px rgba(0,0,0,.05)}
      .inner{position:absolute;inset:110px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#2e3a7a,${c.navy} 70%)}
      .flake{position:absolute;left:250px;top:200px;width:400px;filter:drop-shadow(0 0 30px rgba(233,246,255,.9))}
      .name{position:absolute;left:0;right:0;top:620px;text-align:center;color:${c.frost};font-family:Bitter;
        font-weight:900;font-size:64px;letter-spacing:.06em}
    </style>
    <div class="disc"></div><div class="inner"></div>
    <img class="flake" src="${mark}">
    <div class="name">SNOWDAY</div>`,
  ],
  [
    "chest-flake",
    700,
    790,
    `<style>.flake{position:absolute;inset:0;width:700px;filter:drop-shadow(0 0 18px rgba(233,246,255,.6))}</style>
    <img class="flake" src="${mark}">`,
  ],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, w, h, body] of PIECES) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<!doctype html><html><head>${fonts}<style>${base}</style></head>
     <body><div id="art" style="width:${w}px;height:${h}px">${body}</div></body></html>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  const png = await page.locator("#art").screenshot({ omitBackground: true });
  const file = path.join(out, `${name}.webp`);
  await sharp(png).webp({ quality: 90, alphaQuality: 100 }).toFile(file);
  console.log("wrote", path.relative(root, file));
}
await browser.close();
