// Rebuild public/evade/keychain/evade-keychain.glb:  node scripts/build-evade-keychain/build.mjs
// Runs scene.js in headless Chromium (three.js r180) and exports a binary glTF with GLTFExporter.
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { OUT_DIR, serve, launch } from './lib.mjs';

const QR_URL = 'https://evade.medialife.ai';
const acrylicMode = process.argv.includes('--blend') ? 'blend' : 'transmission';

const m = QRCode.create(QR_URL, { errorCorrectionLevel: 'M' }).modules;
const qr = { size: m.size, data: Array.from(m.data) };

const { server, origin } = await serve();
const browser = await launch();
try {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[page]', msg.text()));
  page.on('pageerror', (e) => console.error('[page error]', e));
  await page.goto(`${origin}/tool/build.html`);
  await page.waitForFunction(() => window.ready === true);
  const { b64, info } = await page.evaluate((args) => window.build(args), { qr, acrylicMode });
  const out = path.join(OUT_DIR, 'evade-keychain.glb');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`, JSON.stringify(info.points));
} finally {
  await browser.close();
  server.close();
}
