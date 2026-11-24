// Renders Bobo (catbobo.glb) with three.js in headless Chromium to a transparent PNG: a render of the real model,
// not generative. Used for public/img/bobo/bobo-sit.webp and cutout.webp (die-cut + face hole added with PIL, see
// docs/handoff/shell.md). Serve the site public/ on :8772, then:
//   node render-bobo.cjs out.png "clip=sit&t=0.15&yaw=0.22&w=1400&h=1600"
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [,, out, q] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 1500 } });
  await p.route('**/__render.html*', r => r.fulfill({ path: path.join(__dirname,'render-bobo.html'), contentType: 'text/html' }));
  await p.route('**/__three/**', r => { const f = '/home/user/medialife/node_modules/three/' + new URL(r.request().url()).pathname.replace('/__three/',''); r.fulfill({ path: f, contentType: 'text/javascript' }); });
  p.on('console', m => console.log('console', m.text()));
  p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8772/__render.html?' + (q||''));
  await p.waitForFunction('window.done', null, { timeout: 60000 });
  console.log(await p.evaluate('JSON.stringify({clips: window.clips, box: window.box})'));
  const data = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
