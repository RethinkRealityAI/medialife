// Render the exported GLB from several angles for review:
//   node scripts/build-evade-keychain/verify.mjs <outDir> [--no-transmission]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch } from './lib.mjs';

const outDir = process.argv[2] || 'keychain-shots';
const noT = process.argv.includes('--no-transmission');
fs.mkdirSync(outDir, { recursive: true });
const { server, origin } = await serve();
const browser = await launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e));
  await page.goto(`${origin}/tool/verify.html`);
  await page.waitForFunction(() => window.ready === true);
  const info = await page.evaluate(([u, n]) => window.load(u, n), ['/public/evade/keychain/evade-keychain.glb', noT]);
  console.log(JSON.stringify(info, null, 1));
  const cy = (info.min[1] + info.max[1]) / 2;
  const views = {
    front: { dir: [0, 0, 1], target: [0, cy, 0], dist: 0.36 },
    back: { dir: [0, 0, -1], target: [0, cy, 0], dist: 0.36 },
    threequarter: { dir: [0.75, 0.2, 0.65], target: [0, cy, 0], dist: 0.36 },
    hardware: { dir: [0.4, 0.15, 1], target: [0, -0.04, 0], dist: 0.14 },
    can_back: { dir: [0.25, 0, -1], target: [0.012, -0.1, 0], dist: 0.16, hide: 'Charm_Bobo' },
    edge: { dir: [0.9, 0.1, 0.45], target: [-0.01, -0.1, 0], dist: 0.17 },
  };
  for (const [name, v] of Object.entries(views)) for (const [bgName, bg] of [['dark', '#0d0f16'], ['light', '#eef0f4']]) {
    if (bgName === 'light' && !['front', 'threequarter', 'back'].includes(name)) continue;
    await page.setViewportSize({ width: 900, height: 1100 });
    await page.evaluate((a) => window.shot(a), { ...v, w: 900, h: 1100, bg });
    const file = path.join(outDir, `${name}_${bgName}${noT ? '_notrans' : ''}.png`);
    await page.locator('canvas').screenshot({ path: file });
    console.log('shot', file);
  }
} finally {
  await browser.close();
  server.close();
}
