const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8771';
const OUT = process.env.OUT || require('path').join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
async function launch({ video } = {}) {
  const args = ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'];
  if (video) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`);
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    permissions: video ? ['camera', 'accelerometer', 'gyroscope', 'magnetometer'] : [],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  if (video) await ctx.addInitScript(() => {
    const md = navigator.mediaDevices; const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => { if (c && typeof c.video === 'object') { delete c.video.facingMode; delete c.video.deviceId; } return orig(c); };
    let t = 0;
    setInterval(() => { t += 0.016; const beta = 60 + Math.sin(t * 0.7) * 3, gamma = Math.sin(t * 0.5) * 2, alpha = Math.sin(t * 0.3) * 4;
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha, beta, gamma, absolute: false }));
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 0, y: 0, z: 0 }, accelerationIncludingGravity: { x: 0, y: 9.81 * Math.sin(beta * Math.PI / 180), z: 9.81 * Math.cos(beta * Math.PI / 180) }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16 })); }, 16);
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  return { browser, page, logs };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (page, fn, arg, timeout = 180000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
const errorsOf = (logs) => logs.filter((l) => /^\[(error|pageerror|http)/.test(l));
module.exports = { launch, shot, sleep, waitFor, errorsOf, BASE, OUT };
