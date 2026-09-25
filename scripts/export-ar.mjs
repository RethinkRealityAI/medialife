#!/usr/bin/env node
// Regenerate the native AR files (GLB for Android Scene Viewer, USDZ for iOS Quick Look) and a
// poster for every theme of the activated-retail demos, by exporting each theme from the live
// page in headless Chromium with public/vendor/ar-kit/ar-export.js.
//
//   node scripts/export-ar.mjs                      # both demos, every theme
//   node scripts/export-ar.mjs roblox evade         # one demo, some themes
//
// Writes public/<demo>/activated-retail/ar/<theme>.{glb,usdz,jpg}. Commit them.
// Needs Playwright with Chromium (npx playwright install chromium, if it isn't there).
// Slow in software WebGL (several minutes per theme); much faster on a machine with a GPU.
// Run it after changing a demo's graphics, merch or fixture, or its AR will be out of date.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const DEMOS = {
  roblox: { themes: ["roblox", "skyrift", "evade"], unlockKey: "ml-preview-unlocked-3c8fd957" },
  "monkey-quest": { themes: ["game", "film"], unlockKey: "ml-preview-unlocked-f69c35b8" },
};
// the left tower's texture name per theme: how we know a theme's graphics have loaded
const TOWER = {
  roblox: "rbx_towerL",
  skyrift: "sky_towerL",
  evade: "ev_towerL",
  game: "mqg_towerL",
  film: "mqf_towerL",
};
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".usdz": "model/vnd.usdz+zip",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const out =
        process.env.AR_OUT_DIR && p.startsWith("/__out/")
          ? path.resolve(process.env.AR_OUT_DIR)
          : null;
      const root = out ?? ROOT;
      const file = path.join(root, path.normalize(out ? p.slice("/__out".length) : p));
      if (!file.startsWith(root)) throw new Error("outside");
      const s = await stat(file);
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
        "content-length": s.size,
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

let chromium;
try {
  // require() so a global install found through NODE_PATH works too
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error(
    "Playwright isn't installed: npm i -D playwright && npx playwright install chromium",
  );
  process.exit(1);
}
const [demoArg, ...themeArgs] = process.argv.slice(2);
const jobs = Object.entries(DEMOS)
  .filter(([d]) => !demoArg || d === demoArg)
  .map(([d, cfg]) => [d, cfg, themeArgs.length ? themeArgs : cfg.themes]);
if (!jobs.length) {
  console.error(`Unknown demo "${demoArg}". One of: ${Object.keys(DEMOS).join(", ")}`);
  process.exit(1);
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
try {
  for (const [demo, cfg, themes] of jobs) {
    // AR_OUT_DIR writes somewhere else, to try the script without touching the committed files
    // (served at /__out/ so the poster is still rendered from the GLB just written)
    const outDir = process.env.AR_OUT_DIR
      ? path.resolve(process.env.AR_OUT_DIR, demo)
      : path.join(ROOT, demo, "activated-retail", "ar");
    await mkdir(outDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript((k) => {
      window.__FASTENTER = 1;
      window.__NOTOUR = 1;
      localStorage.setItem(k, "1");
      localStorage.setItem("ml-ar-notrack", "1");
    }, cfg.unlockKey);
    page.on("pageerror", (e) => console.warn("  page error:", e.message));
    await page.goto(`${base}/${demo}/activated-retail/index.html`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
    for (const theme of themes) {
      const t0 = Date.now();
      process.stdout.write(`${demo}/${theme}: `);
      await page.evaluate((id) => window.__app.setTheme(id), theme);
      await page.waitForFunction(
        (n) => (window.__app.refs.towerL.material.map?.image?.src || "").includes(n),
        TOWER[theme],
        { timeout: 180000 },
      );
      if (theme === "evade")
        await page.waitForFunction(
          () => window.__app.evade.built && window.__app.evade.variants.every(([, v]) => v.visible),
          null,
          { timeout: 180000 },
        );
      await page.waitForTimeout(4000); // merch swaps and the live screen settle
      const out = await page.evaluate(async () => {
        const { exportARFiles } = await import("/vendor/ar-kit/ar-export.js");
        const { glb, usdz } = await exportARFiles(window.__app.display, { maxTexture: 2048 });
        const b64 = (buf) => {
          const u = new Uint8Array(buf);
          let s = "";
          for (let i = 0; i < u.length; i += 0x8000)
            s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          return btoa(s);
        };
        return { glb: b64(glb), usdz: b64(usdz) };
      });
      const glb = Buffer.from(out.glb, "base64"),
        usdz = Buffer.from(out.usdz, "base64");
      await writeFile(path.join(outDir, `${theme}.glb`), glb);
      await writeFile(path.join(outDir, `${theme}.usdz`), usdz);
      process.stdout.write(
        `glb ${(glb.length / 1e6).toFixed(1)} MB, usdz ${(usdz.length / 1e6).toFixed(1)} MB`,
      );

      // poster: the /ar/ page's own 3D view of the new GLB
      const pp = await browser.newPage({
        viewport: { width: 600, height: 900 },
        deviceScaleFactor: 2,
      });
      await pp.emulateMedia({ reducedMotion: "reduce" });
      await pp.addInitScript(() => localStorage.setItem("ml-ar-notrack", "1"));
      const model = process.env.AR_OUT_DIR
        ? `/__out/${demo}/${theme}`
        : `/${demo}/activated-retail/ar/${theme}`;
      await pp.goto(`${base}/ar/index.html?m=${encodeURIComponent(model)}`, {
        waitUntil: "domcontentloaded",
      });
      await pp.click("#view3d");
      await pp.waitForSelector("#stage canvas", { timeout: 300000 });
      await pp.evaluate(() => document.querySelector("#stage .hint")?.remove());
      await pp.waitForTimeout(3000);
      const box = await (await pp.$("#stage")).boundingBox();
      await writeFile(
        path.join(outDir, `${theme}.jpg`),
        await pp.screenshot({ clip: box, type: "jpeg", quality: 82, timeout: 120000 }),
      );
      await pp.close();
      console.log(`, poster · ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
