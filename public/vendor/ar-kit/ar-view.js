/* ar-kit/ar-view.js: a small, touch-friendly 3D view of an AR model (the fallback for
 * phones without AR and for desktops on /ar/).
 *
 *   const { mountViewer } = await import('/vendor/ar-kit/ar-view.js');
 *   await mountViewer(containerEl, '/roblox/activated-retail/ar/evade.glb');
 *
 * Needs the page's import map for 'three' and 'three/addons/'. Replaces the container's content.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' (' + res.status + ')');
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  return new Blob(chunks).arrayBuffer();
}

export async function mountViewer(container, glbUrl) {
  container.innerHTML = '<div class="load"><i></i></div>';
  const bar = container.querySelector('.load i');
  const buf = await fetchWithProgress(glbUrl, (f) => { bar.style.width = Math.round(f * 100) + '%'; });
  const gltf = await new GLTFLoader().parseAsync(buf, '');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.add(gltf.scene);

  // soft contact shadow so it doesn't float
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const sh = document.createElement('canvas');
  sh.width = sh.height = 128;
  const g = sh.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.35, size.z * 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }),
  );
  shadow.position.set(center.x, box.min.y + 0.002, center.z);
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
  const dist = Math.max(size.x, size.y) * 1.25 + size.z;
  camera.position.set(center.x - dist * 0.35, center.y + size.y * 0.15, center.z + dist);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center).setY(box.min.y + size.y * 0.45);
  controls.enableDamping = true;
  controls.minDistance = Math.max(size.x, size.y) * 0.35;
  controls.maxDistance = dist * 2.2;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enablePan = false;
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Drag to turn · pinch to zoom';
  container.appendChild(hint);
  controls.addEventListener('start', () => hint.remove(), { once: true });

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  addEventListener('pagehide', () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); }, { once: true });
  return { renderer, scene, camera, controls };
}
