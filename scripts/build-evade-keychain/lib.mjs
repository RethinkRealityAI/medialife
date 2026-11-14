// Shared helpers: find three.js (r180, full package incl. GLTFExporter), serve files, launch Chromium.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const OUT_DIR = path.join(REPO, 'public/evade/keychain');
export const THREE_VERSION = '0.180.0';

// three.js package dir containing build/ and examples/jsm/. Uses node_modules/three if present,
// otherwise `npm pack`s the pinned version into a temp cache once.
export function threeDir() {
  const local = path.join(REPO, 'node_modules/three');
  if (fs.existsSync(path.join(local, 'examples/jsm/exporters/GLTFExporter.js'))) return local;
  const cache = path.join(os.tmpdir(), `evade-keychain-three-${THREE_VERSION}`);
  const pkg = path.join(cache, 'package');
  if (!fs.existsSync(path.join(pkg, 'examples/jsm/exporters/GLTFExporter.js'))) {
    fs.mkdirSync(cache, { recursive: true });
    execSync(`npm pack three@${THREE_VERSION} --silent`, { cwd: cache, stdio: 'inherit' });
    execSync(`tar xzf three-${THREE_VERSION}.tgz`, { cwd: cache });
  }
  return pkg;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary' };

// Static server: /three/* -> three package, /tool/* -> this folder, /* -> repo root.
export function serve() {
  const three = threeDir();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file;
    if (url.startsWith('/three/')) file = path.join(three, url.slice(7));
    else if (url.startsWith('/tool/')) file = path.join(HERE, url.slice(6));
    else file = path.join(REPO, url);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

export async function launch() {
  const { chromium } = require('playwright');
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
