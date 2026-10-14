/**
 * Builds a partner's co-branded collateral (PNG graphics and a one-pager PDF)
 * from HTML templates, in the partner's colours with MEDIALIFE's marks.
 *
 *   node scripts/build-partner-kit.mjs snowday
 *
 * Writes to public/partner-kit/<kit>/. The photography in that folder (made
 * with Higgsfield, no text or logos in it) is the input; this script adds the
 * words, so copy changes never mean regenerating images.
 *
 * Needs a Chromium for Playwright: set PLAYWRIGHT_CORE to playwright-core's
 * index.mjs and CHROMIUM to the browser binary if they aren't installed where
 * the cloud dev container keeps them.
 */
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE ?? "/opt/node-tools/node_modules/playwright-core/index.mjs"
);

/* ---------------------------------------------------------------------------
   Kits. Copy here mirrors src/lib/hub/partners.ts (JOURNEY) — keep in step.
   --------------------------------------------------------------------------- */

const KITS = {
  snowday: {
    partner: "Snowday Media",
    partnerId: "snowday-media",
    landing: "https://medialife.ai/with/snowday-media",
    shelf: "https://medialife.ai/shelf?name=Your%20Name&invite=snowday-media",
    colors: {
      night: "#141634",
      navy: "#21254a",
      slate: "#405d96",
      periwinkle: "#5059ae",
      ice: "#96c8ec",
      violet: "#9270ff",
      cyan: "#5b8cff",
    },
  },
};

const STEPS = [
  [
    "Sign up and onboard",
    "Join the Creator Hub with our link and tell us about your channels. Ten minutes.",
  ],
  [
    "Sign the agreement",
    "Read and sign the program agreement right in the hub. Your IP stays yours.",
  ],
  [
    "Approve the campaign",
    "We design the merch and the experience. Nothing is made without your yes.",
  ],
  [
    "Production and distribution",
    "We make it, program every tag, run the store and ship every order.",
  ],
  ["Get paid", "Every sale and your share show up live. Paid out after the returns window."],
];

/* ---------------------------------------------------------------------------
   Templates
   --------------------------------------------------------------------------- */

const kitName = process.argv[2] ?? "snowday";
const kit = KITS[kitName];
if (!kit) {
  console.error(`Unknown kit "${kitName}". Known: ${Object.keys(KITS).join(", ")}`);
  process.exit(1);
}
const out = path.join(root, "public", "partner-kit", kitName);
mkdirSync(out, { recursive: true });
const img = (name) => pathToFileURL(path.join(out, name)).href;
const lockup = pathToFileURL(path.join(root, "public", "brand", "medialife-lockup.webp")).href;
const c = kit.colors;

const base = (w, h, body, extra = "") => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@700;800;900&family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:${c.night};color:#f4f6ff;font-family:Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.display{font-family:Bitter,Georgia,serif;font-weight:900;letter-spacing:-.01em;line-height:1.02}
.eyebrow{font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${c.ice}}
.co{display:flex;align-items:center;gap:22px}
.co img{height:52px;width:auto}
.co .x{font-family:Bitter,serif;font-weight:700;color:${c.ice};font-size:30px}
.co .p{font-family:Bitter,serif;font-weight:900;font-size:34px;color:#fff;letter-spacing:-.01em}
.grad{background:linear-gradient(100deg,${c.ice},${c.violet});-webkit-background-clip:text;background-clip:text;color:transparent}
.flake{position:absolute;color:${c.ice};opacity:.18;font-size:40px}
${extra}
</style></head><body>${body}</body></html>`;

const coBrand = (scale = 1) =>
  `<div class="co" style="transform:scale(${scale});transform-origin:left center"><img src="${lockup}" alt=""><span class="x">×</span><span class="p">${kit.partner}</span></div>`;

const steps = (cols) =>
  `<ol class="steps" style="grid-template-columns:repeat(${cols},1fr)">${STEPS.map(
    ([t, b], i) => `<li><span class="n">${i + 1}</span><h3>${t}</h3><p>${b}</p></li>`,
  ).join("")}</ol>`;

const stepsCss = `
.steps{list-style:none;padding:0;display:grid;gap:22px}
.steps li{position:relative;border-radius:26px;padding:30px 28px 28px;background:linear-gradient(180deg,rgba(150,200,236,.12),rgba(80,89,174,.10));border:1px solid rgba(150,200,236,.28);backdrop-filter:blur(6px)}
.steps .n{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;font-family:Bitter,serif;font-weight:900;font-size:28px;color:${c.night};background:linear-gradient(135deg,${c.ice},${c.violet});box-shadow:0 0 30px rgba(146,112,255,.45)}
.steps h3{font-family:Bitter,serif;font-weight:800;font-size:32px;line-height:1.1;margin:22px 0 10px}
.steps p{font-size:22px;line-height:1.4;color:#c9d3f2}`;

const TEMPLATES = {
  "journey-16x9.png": [
    1920,
    1080,
    base(
      1920,
      1080,
      `<div style="position:absolute;inset:0;background:url(${img("aurora-banner.webp")}) center/cover;opacity:.55"></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,22,52,.55),rgba(20,22,52,.92) 55%)"></div>
<div style="position:relative;padding:90px 110px;height:100%;display:flex;flex-direction:column">
  ${coBrand()}
  <div class="eyebrow" style="font-size:22px;margin-top:70px">Activated merch for creators</div>
  <h1 class="display" style="font-size:104px;margin-top:16px">Five steps. <span class="grad">We do the<br>heavy lifting.</span></h1>
  <p style="font-size:30px;color:#d7e0fa;margin-top:26px;max-width:1100px">From hello to getting paid, with MEDIALIFE designing, making, selling and shipping your activated merch.</p>
  <div style="margin-top:auto">${steps(5)}</div>
</div>`,
      stepsCss,
    ),
  ],
  "journey-4x5.png": [
    1080,
    1350,
    base(
      1080,
      1350,
      `<div style="position:absolute;left:0;right:0;top:170px;height:640px;background:url(${img("stream-diorama.webp")}) center/cover"></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,22,52,1) 12%,rgba(20,22,52,.15) 30%,rgba(20,22,52,.2) 42%,rgba(20,22,52,.97) 60%)"></div>
<div style="position:relative;padding:70px 64px;height:100%;display:flex;flex-direction:column">
  ${coBrand(0.85)}
  <h1 class="display" style="font-size:74px;margin-top:46px">How activated merch <span class="grad">works for you</span></h1>
  <ol class="steps2">${STEPS.map(([t, b], i) => `<li><span class="n">${i + 1}</span><div><h3>${t}</h3><p>${b}</p></div></li>`).join("")}</ol>
</div>`,
      `.steps2{list-style:none;padding:0;margin-top:auto;display:grid;gap:16px}
.steps2 li{display:flex;gap:22px;align-items:flex-start;border-radius:22px;padding:22px 24px;background:linear-gradient(90deg,rgba(150,200,236,.13),rgba(80,89,174,.08));border:1px solid rgba(150,200,236,.26)}
.steps2 .n{flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:50%;font-family:Bitter,serif;font-weight:900;font-size:26px;color:${c.night};background:linear-gradient(135deg,${c.ice},${c.violet})}
.steps2 h3{font-family:Bitter,serif;font-weight:800;font-size:30px;line-height:1.1}
.steps2 p{font-size:21px;line-height:1.35;color:#c9d3f2;margin-top:6px}`,
    ),
  ],
  "announce-16x9.png": [
    1920,
    1080,
    base(
      1920,
      1080,
      `<div style="position:absolute;inset:0;background:url(${img("hero-tap-hoodie.webp")}) right center/cover"></div>
<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,22,52,.96) 0%,rgba(20,22,52,.85) 38%,rgba(20,22,52,0) 66%)"></div>
<div style="position:relative;padding:96px 110px;height:100%;display:flex;flex-direction:column;max-width:1060px">
  ${coBrand()}
  <div class="eyebrow" style="font-size:22px;margin-top:auto">Now open for creators</div>
  <h1 class="display" style="font-size:132px;margin-top:18px">Your merch,<br><span class="grad">activated.</span></h1>
  <p style="font-size:34px;line-height:1.35;color:#d7e0fa;margin-top:30px;max-width:820px">Fans tap it with their phone and something happens: a secret scene, a reward, a moment with you. You approve everything. We make it, sell it and ship it.</p>
  <p style="font-size:26px;color:${c.ice};margin-top:40px;font-weight:700">Ask ${kit.partner} how to join →</p>
</div>`,
    ),
  ],
  "discord-banner-960x540.png": [
    960,
    540,
    base(
      960,
      540,
      `<div style="position:absolute;inset:0;background:url(${img("aurora-banner.webp")}) center/cover"></div>
<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,22,52,.92),rgba(20,22,52,.2) 70%)"></div>
<div style="position:relative;padding:54px 56px;height:100%;display:flex;flex-direction:column">
  ${coBrand(0.6)}
  <h1 class="display" style="font-size:64px;margin-top:auto">Activated<br><span class="grad">Merch Program</span></h1>
  <p style="font-size:19px;color:#d7e0fa;margin-top:14px">Merch your fans can experience.</p>
</div>`,
    ),
  ],
  "story-9x16.png": [
    1080,
    1920,
    base(
      1080,
      1920,
      `<div style="position:absolute;inset:0;background:url(${img("fan-unlock-story.webp")}) center/cover"></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,22,52,.9) 0%,rgba(20,22,52,0) 30%,rgba(20,22,52,0) 58%,rgba(20,22,52,.95) 84%)"></div>
<div style="position:relative;height:100%;padding:110px 80px 130px;display:flex;flex-direction:column">
  ${coBrand(0.9)}
  <div style="margin-top:auto">
    <h1 class="display" style="font-size:112px">Tap your merch.<br><span class="grad">Unlock the moment.</span></h1>
    <p style="font-size:38px;line-height:1.35;color:#d7e0fa;margin-top:30px">Activated merch for creators. You approve it, we make it, fans love it.</p>
    <p style="font-size:34px;color:${c.ice};margin-top:40px;font-weight:700">DM ${kit.partner} to get yours →</p>
  </div>
</div>`,
    ),
  ],
  "post-1x1.png": [
    1080,
    1080,
    base(
      1080,
      1080,
      `<div style="position:absolute;inset:0;background:url(${img("merch-flatlay.webp")}) center/cover"></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,22,52,.88) 0%,rgba(20,22,52,.25) 34%,rgba(20,22,52,.25) 62%,rgba(20,22,52,.92) 100%)"></div>
<div style="position:relative;height:100%;padding:64px 70px;display:flex;flex-direction:column">
  ${coBrand(0.8)}
  <div style="margin-top:auto">
    <h1 class="display" style="font-size:96px">Merch that<br><span class="grad">does something.</span></h1>
    <p style="font-size:30px;color:#d7e0fa;margin-top:18px">Hoodies, tees, caps, charms and stickers with a tap-to-unlock experience inside.</p>
  </div>
</div>`,
    ),
  ],
};

/* The one-pager: US Letter, printed or sent as a PDF. */
async function onePager() {
  const qrLanding = await QRCode.toDataURL(kit.landing, {
    margin: 1,
    width: 360,
    color: { dark: c.night, light: "#ffffff" },
  });
  const qrShelf = await QRCode.toDataURL(kit.shelf, {
    margin: 1,
    width: 360,
    color: { dark: c.night, light: "#ffffff" },
  });
  return base(
    816,
    1056,
    `<div class="page">
  <header style="position:relative;height:396px;overflow:hidden">
    <div style="position:absolute;inset:0;background:url(${img("hero-tap-hoodie.webp")}) 70% center/cover"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,22,52,.97) 0%,rgba(20,22,52,.85) 46%,rgba(20,22,52,.1) 80%)"></div>
    <div style="position:relative;padding:36px 44px;height:100%;display:flex;flex-direction:column">
      <div class="co"><img src="${lockup}" alt="" style="height:30px"><span class="x" style="font-size:18px">×</span><span class="p" style="font-size:20px">${kit.partner}</span></div>
      <div class="eyebrow" style="font-size:10px;margin-top:auto">Activated Merchandise Program</div>
      <h1 class="display" style="font-size:54px;margin-top:8px">Merch your fans<br><span class="grad">can experience.</span></h1>
      <p style="font-size:13.5px;line-height:1.5;color:#d7e0fa;margin-top:12px;max-width:390px">Premium merch with an NFC tag and QR code inside. Fans tap it with their phone and an immersive experience opens in the browser: no app, no download. A secret scene, a reward, a moment with you.</p>
    </div>
  </header>
  <section style="padding:26px 44px 0">
    <h2 class="display" style="font-size:24px">How it works</h2>
    <ol class="mini">${STEPS.map(([t, b], i) => `<li><span class="n">${i + 1}</span><b>${t}</b><span>${b}</span></li>`).join("")}</ol>
  </section>
  <section style="padding:22px 44px 0;display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card"><h3>What MEDIALIFE does</h3><ul><li>Designs the merch and the experience with you</li><li>Produces it and programs every tag and QR code</li><li>Runs the store, ships orders, handles returns</li><li>Shows every stage, order and payout in the Creator Hub</li></ul></div>
    <div class="card"><h3>What you do</h3><ul><li>Share your art, or references we design from</li><li>Approve designs: nothing is made without your yes</li><li>Tell your community when it launches</li><li>Earn your share of every sale, paid out from the hub</li></ul></div>
  </section>
  <section style="padding:22px 44px 0;display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="qr"><img src="${qrLanding}" alt=""><div><b>Start here</b><span>See how it works and apply in ten minutes.</span><i>${kit.landing.replace("https://", "")}</i></div></div>
    <div class="qr"><img src="${qrShelf}" alt=""><div><b>See it in 3D</b><span>A shop made for you, with the products and the tap-to-unlock demo.</span><i>medialife.ai/shelf</i></div></div>
  </section>
  <footer style="position:absolute;left:44px;right:44px;bottom:26px;display:flex;justify-content:space-between;font-size:10.5px;color:#9aa6cf"><span>Your IP stays yours · No upfront cost · You approve everything</span><span>Questions? Ask your ${kit.partner} contact.</span></footer>
</div>`,
    `@page{size:816px 1056px;margin:0}
.page{position:relative;width:816px;height:1056px;background:radial-gradient(120% 60% at 100% 0%,rgba(80,89,174,.35),transparent 60%),${c.night}}
.mini{list-style:none;padding:0;margin-top:12px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.mini li{border-radius:14px;padding:12px 11px;background:rgba(150,200,236,.09);border:1px solid rgba(150,200,236,.24);display:flex;flex-direction:column;gap:5px;font-size:10.5px;line-height:1.35;color:#c9d3f2}
.mini b{font-family:Bitter,serif;font-size:13px;line-height:1.15;color:#fff}
.mini .n{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;font-family:Bitter,serif;font-weight:900;font-size:12px;color:${c.night};background:linear-gradient(135deg,${c.ice},${c.violet})}
.card{border-radius:16px;padding:16px 18px;background:rgba(255,255,255,.04);border:1px solid rgba(150,200,236,.2)}
.card h3{font-family:Bitter,serif;font-size:16px;margin-bottom:8px;color:${c.ice}}
.card ul{padding-left:16px;font-size:12px;line-height:1.6;color:#d7e0fa}
.qr{display:flex;gap:14px;align-items:center;border-radius:16px;padding:14px;background:linear-gradient(90deg,rgba(150,200,236,.12),rgba(146,112,255,.10));border:1px solid rgba(150,200,236,.26)}
.qr img{width:96px;height:96px;border-radius:10px;background:#fff}
.qr div{display:flex;flex-direction:column;gap:4px;font-size:11.5px;line-height:1.4;color:#d7e0fa}
.qr b{font-family:Bitter,serif;font-size:16px;color:#fff}
.qr i{font-style:normal;color:${c.ice};font-weight:700;font-size:11px}`,
  );
}

/* ---------------------------------------------------------------------------
   Render
   --------------------------------------------------------------------------- */

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--allow-file-access-from-files"],
});
const tmp = path.join(out, ".render.html");
try {
  for (const [name, [w, h, html]] of Object.entries(TEMPLATES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, name) });
    await page.close();
    console.log("wrote", name);
  }
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  writeFileSync(tmp, await onePager());
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: path.join(out, "one-pager.pdf"),
    width: "816px",
    height: "1056px",
    printBackground: true,
  });
  // A preview for the Partner Hub's collateral page.
  await sharp(await page.screenshot())
    .webp({ quality: 82 })
    .toFile(path.join(out, "one-pager-preview.webp"));
  console.log("wrote one-pager.pdf");
} finally {
  await browser.close();
  try {
    unlinkSync(tmp);
  } catch {
    /* already gone */
  }
}
