// Dumps the runtime geometry (exactly as three.js GLTFLoader builds it, meshopt/quantization decoded) of each GLB
// so atlas.py can make a non-overlapping paint atlas for it. Needs the site served on :8080 (public/).
//   node extract.mjs <outdir> <glb url> [<glb url> ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [, , out, ...urls] = process.argv;
const html = `<!doctype html><script type="importmap">{"imports":{"three":"/roblox/creators/vendor/three/build/three.module.js","three/addons/":"/roblox/creators/vendor/three/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.dump = async (url) => {
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder); const g = await gl.loadAsync(url); const prims = [];
  g.scene.traverse((o) => { if (!o.isMesh) return; const a = g.parser.associations.get(o); if (!a || a.meshes === undefined) return;
    const geo = o.geometry, P = geo.attributes.position, pos = []; for (let i = 0; i < P.count; i++) pos.push(P.getX(i), P.getY(i), P.getZ(i));
    const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: P.count }, (_, i) => i);
    prims.push({ key: 'm' + a.meshes + 'p' + (a.primitives || 0), name: o.name, mat: o.material.name, skinned: !!o.isSkinnedMesh, uv: !!geo.attributes.uv, pos, idx }); });
  return prims;
};
window.ready = true;
</script>`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.route('http://localhost:8080/__extract.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));
await page.goto('http://localhost:8080/__extract.html'); await page.waitForFunction(() => window.ready);
for (const u of urls) {
  const prims = await page.evaluate((u) => window.dump(u), u);
  const name = u.split('/').pop().replace(/\.glb.*/, '');
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify({ url: u, prims }));
  console.log(name, prims.map((p) => `${p.key} ${p.name}/${p.mat} v${p.pos.length / 3} t${p.idx.length / 3}${p.uv ? '' : ' noUV'}${p.skinned ? ' skin' : ''}`).join(' | '));
}
await browser.close();
