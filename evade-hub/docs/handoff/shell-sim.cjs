// Shell simulator run for the EVADE hub (built app at /evade/hub/ on :8772). Phone: 390x844 iPhone UA + fake front
// camera (a still face). Desktop: 1280x800. Shots to /mnt/project-files/evade-hub/progress/shell-*.png
//   node shell-sim.cjs phone|locked|desktop|selfie|photo
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = '/mnt/project-files/evade-hub/progress';
const BASE = 'http://localhost:8772/evade/hub/';
const FACE = process.env.FACE_Y4M || path.join(__dirname, 'face.y4m'); // a still face photo looped to 960x720 y4m (never commit it)
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const which = process.argv[2] || 'phone';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function launch({ phone = true, cam = false, locked = false } = {}) {
  const args = ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'];
  if (cam) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FACE}`);
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone, userAgent: phone ? IPHONE : undefined,
    permissions: cam ? ['camera', 'accelerometer', 'gyroscope', 'magnetometer'] : [],
  });
  if (cam) await ctx.addInitScript(() => {
    const md = navigator.mediaDevices; const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => { if (c && typeof c.video === 'object') { delete c.video.facingMode; delete c.video.deviceId; } return orig(c); };
  });
  if (locked) await ctx.route('**/evade/arcade/games.json', async (route) => {
    const r = await route.fetch(); const j = await r.json(); j.testing = false;
    await route.fulfill({ response: r, body: JSON.stringify(j), headers: { ...r.headers(), 'content-type': 'application/json' } });
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  return { browser, page, logs };
}
const shot = async (page, name) => { const p = path.join(OUT, `shell-${name}.png`); await page.screenshot({ path: p, timeout: 120000 }); log('shot', p); };
const wait = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
const errs = (logs) => logs.filter((l) => /^\[(error|pageerror|http)/.test(l) && !/GPU stall|performance warning/i.test(l));
const startApp = async (page) => {
  await wait(page, () => { const b = document.querySelector('.cbx-start'); return b && !b.disabled; });
};
const pressStart = async (page) => {
  await page.evaluate(() => document.querySelector('.cbx-start').click());
  await wait(page, () => window.__cbx && window.__cbx.started && window.__cbx.debug().entered);
};
const openArcade = (page) => page.evaluate(() => window.dispatchEvent(new CustomEvent('evade:open-arcade')));

(async () => {
  if (which === 'phone' || which === 'desktop') {
    const phone = which === 'phone';
    const { browser, page, logs } = await launch({ phone });
    await page.goto(BASE + '?test', { waitUntil: 'load' });
    await sleep(400);
    await shot(page, `${which}-00-splash-loading`);
    await startApp(page);
    await sleep(2500);
    await shot(page, `${which}-01-splash`);
    await pressStart(page);
    await sleep(4000);
    await shot(page, `${which}-02-after-start`);
    // menu
    await page.evaluate(() => document.querySelector('.cbx-menu-btn, [data-cmd=menu], button[aria-label*="enu"]')?.click());
    await sleep(900);
    await shot(page, `${which}-03-menu`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.cbx-sheet button')].find((x) => /back/i.test(x.textContent)); b?.click(); });
    await sleep(600);
    await openArcade(page);
    await wait(page, () => document.querySelector('.ev-cab'));
    await sleep(1800);
    await shot(page, `${which}-04-arcade`);
    if (phone) {
      await page.evaluate(() => document.querySelector('.ev-arc .ev-cabs')?.scrollIntoView());
      await sleep(600);
      await shot(page, `${which}-04b-arcade-machines`);
    }
    await page.evaluate(() => document.querySelector('.ev-cab').click());
    await sleep(1200);
    await shot(page, `${which}-05-card`);
    log('errors', JSON.stringify(errs(logs).slice(0, 15), null, 1));
    await browser.close();
  } else if (which === 'locked') {
    const { browser, page, logs } = await launch({ phone: true, locked: true });
    await page.goto(BASE + '?test&arcade', { waitUntil: 'load' });
    await startApp(page);
    await pressStart(page);
    await wait(page, () => document.querySelector('.ev-cab'));
    await sleep(1500);
    await page.evaluate(() => document.querySelector('.ev-arc .ev-cabs')?.scrollIntoView());
    await sleep(500);
    await shot(page, 'locked-01-arcade');
    const n = await page.evaluate(() => document.querySelectorAll('.ev-cab.is-locked').length);
    log('locked cabinets', n);
    await page.evaluate(() => document.querySelector('.ev-cab.is-locked')?.click());
    await sleep(1200);
    await shot(page, 'locked-02-card');
    log('errors', JSON.stringify(errs(logs).slice(0, 15), null, 1));
    await browser.close();
  } else if (which === 'selfie' || which === 'photo') {
    const { browser, page, logs } = await launch({ phone: true, cam: true });
    await page.goto(BASE + '?test&desktop', { waitUntil: 'load' });
    await startApp(page);
    await pressStart(page);
    await wait(page, (w) => window.__cbx.internals.modes.get(w === 'selfie' ? 'face' : 'photo').constructor.name !== 'Object', which, 120000).catch(() => log('real mode not loaded'));
    log('mode class', await page.evaluate((w) => window.__cbx.internals.modes.get(w === 'selfie' ? 'face' : 'photo').constructor.name, which));
    if (which === 'selfie') {
      await page.evaluate(() => window.__cbx.setMode('face'));
      await wait(page, () => window.__cbx.debug().mode === 'face' && window.__cbx.debug().entered, null, 180000);
      const found = await wait(page, () => window.__cbx.internals.modes.get('face').faceFound, null, 120000).then(() => true).catch(() => false);
      log('face found', found);
      await sleep(4000);
      await shot(page, 'selfie-01-full-bobo');
      for (const l of ['fizz', 'gold', 'cat']) {
        await page.evaluate((l) => [...document.querySelectorAll('.cbc-seg button')].find((b) => b.dataset.id === l).click(), l);
        await sleep(3500);
        await shot(page, `selfie-02-${l}`);
      }
      const fx = await page.evaluate(() => { const m = window.__cbx.internals.modes.get('face'); return { look: m.look, keys: m.diag.attachmentKeys, occ: !!m.root.getObjectByName('face-occluder') }; });
      log('fx', JSON.stringify(fx));
      // a frame + filter, then the photo
      await page.evaluate(() => { const g = document.querySelectorAll('.cbc-strip-group'); g[0].children[1].click(); g[1].children[2].click(); });
      await sleep(1200);
      await shot(page, 'selfie-03-arcade-eclipse');
      await page.evaluate(() => { const g = document.querySelectorAll('.cbc-strip-group'); g[0].children[0].click(); g[1].children[0].click(); });
      await page.evaluate(() => [...document.querySelectorAll('.cbc-seg button')].find((b) => b.dataset.id === 'full').click());
      await sleep(2500);
      await page.evaluate(() => document.querySelector('.cbx-shutter').click());
      await sleep(1500);
      await shot(page, 'selfie-04-countdown');
      await wait(page, () => window.__cbx.internals.modes.get('face').state === 'review', null, 120000);
      await sleep(1500);
      await shot(page, 'selfie-05-review');
      const b64 = await page.evaluate(async () => {
        const b = window.__cbx.internals.modes.get('face').diag.lastPhoto; const buf = new Uint8Array(await b.arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s);
      });
      fs.writeFileSync(path.join(OUT, 'shell-selfie-06-photo.jpg'), Buffer.from(b64, 'base64'));
      log('photo saved');
    } else {
      await page.evaluate(() => window.__cbx.setMode('photo'));
      await wait(page, () => window.__cbx.debug().mode === 'photo' && window.__cbx.debug().entered, null, 180000);
      await sleep(2500);
      await shot(page, 'photo-01-welcome');
      await page.evaluate(() => { const b = [...document.querySelectorAll('.cbx-sheet button, .cbx button')].find((x) => /Bobo.s frame/.test(x.textContent)); b?.click(); });
      await wait(page, () => window.__cbx.internals.modes.get('photo').faceFound, null, 120000).catch(() => log('no face'));
      await sleep(3500);
      await shot(page, 'photo-02-selfie');
    }
    log('errors', JSON.stringify(errs(logs).slice(0, 20), null, 1));
    await browser.close();
  }
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
