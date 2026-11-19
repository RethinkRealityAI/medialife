// Bobo's Hideout, live in 3D inside its panel on the EVADE page.
// The room model is the same light core-room GLB as the homepage hero
// (public/home/ar/hub-lite.glb, meshopt-compressed). It only loads once the
// section is close, renders only while on screen, turns slowly by itself and
// can be dragged with a mouse (on touch screens a drag keeps scrolling the
// page). Until the first frame is drawn the panel shows its poster picture.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MODEL = "/home/ar/hub-lite.glb";
const panel = document.getElementById("hsRoom");

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

if (panel && webglOk()) {
  const near = new IntersectionObserver(
    (es) => {
      if (!es[0].isIntersecting) return;
      near.disconnect();
      boot().catch((e) => console.warn("[hideout-3d]", e));
    },
    { rootMargin: "400px 0px" },
  );
  near.observe(panel);
}

async function boot() {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const drag = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  if (!drag) canvas.style.touchAction = "pan-y";
  panel.insertBefore(canvas, panel.firstChild);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xbfe9ff, 0x2a0f2a, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rimA = new THREE.PointLight(0x3fe6e0, 6, 0, 2);
  const rimB = new THREE.PointLight(0xff37ae, 5, 0, 2);
  scene.add(rimA, rimB);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL);
  const room = gltf.scene;

  // centre the room and size the camera so it fills the panel while it turns
  const box = new THREE.Box3().setFromObject(room);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  room.position.sub(centre);
  const pivot = new THREE.Group();
  pivot.add(room);
  scene.add(pivot);
  const radius = Math.max(size.x, size.z) / 2;
  rimA.position.set(-radius * 2, size.y * 0.4, radius * 2);
  rimB.position.set(radius * 2.2, size.y * 0.1, -radius * 0.5);

  const target = new THREE.Vector3(0, -size.y * 0.04, 0);
  const controls = drag ? new OrbitControls(camera, canvas) : null;
  if (controls) {
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.target.copy(target);
    controls.addEventListener("start", () => panel.classList.add("is-grabbed"));
  }

  let placed = false;
  function frame() {
    const w = panel.clientWidth;
    const h = panel.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // distance that fits the room's height and its turning width
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitH = (size.y * 0.6) / Math.tan(vFov / 2);
    const fitW = (radius * 1.12) / (Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(fitH, fitW) + radius;
    // keep the visitor's drag angle once placed; otherwise the default three-quarter view
    const dir = placed ? camera.position.clone().sub(target) : new THREE.Vector3(0.55, 0.32, 1);
    placed = true;
    camera.position.copy(target).add(dir.normalize().multiplyScalar(dist));
    camera.near = dist / 50;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    controls?.update();
  }
  frame();
  new ResizeObserver(frame).observe(panel);

  let visible = true;
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) loop();
  }).observe(panel);

  let raf = 0;
  let last = performance.now();
  function loop() {
    if (raf) return;
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!still) pivot.rotation.y += dt * 0.22;
    controls?.update();
    renderer.render(scene, camera);
    if (visible && !document.hidden && !still) loop();
  }
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    if (!document.hidden && visible) loop();
  });

  renderer.render(scene, camera);
  panel.classList.add("is-3d");
  if (drag) panel.classList.add("is-drag");
  if (still && controls) controls.addEventListener("change", () => renderer.render(scene, camera));
  last = performance.now();
  loop();
}
