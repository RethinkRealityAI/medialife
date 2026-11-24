// Spray Bobo Enhanced: painting on 3D models (projective texture painting, all on the GPU).
//
// Every placed model ("paintable") owns a paint layer: a 1024 x 1024 render target laid out by the model's paint atlas
// (attribute `paintUv`: one non-overlapping UV square over all its parts, made offline by xatlas, see
// scripts/build-spray-enhanced/). The model's own materials stay as they are and show the paint layer on top
// (premultiplied colour + coverage), with the paint's own finish (gloss / matte / metal / glow).
//
// A stroke is a "brush camera": a narrow perspective camera at the nozzle looking down the spray direction. Its view
// cone IS the spray cone. One stamp =
//   1. depth pass: every paintable, seen from the brush camera (RGBA-packed depth, 256 px), for occlusion;
//   2. paint pass per paintable in the cone: the model is drawn in UV space (gl_Position = paintUv) into its paint
//      layer; each texel projects its world position into the brush camera and gets paint if it is inside the cone,
//      faces the nozzle and is not hidden behind something (depth test against pass 1).
//   3. dilate: texels just outside the charts copy their inside neighbour, so seams never show a dark line.
// So paint lands exactly where the spray hits in the room, wraps over curves and across UV seams, never goes
// through Bobo to the other side, and follows animated (skinned) models because pass 2 uses the skinned positions.
import * as THREE from 'three';

const PAINT_LAYER = 2;                      // brush camera layer: paintable parts only (outlines, fizz etc. stay out)
const MODE = { spray: 0, marker: 1, fill: 2, decal: 3, erase: 4, eraseSpray: 5 };

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
attribute vec2 paintUv;
varying vec3 vW; varying vec3 vN;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = vec4(paintUv * 2.0 - 1.0, 0.0, 1.0);
}`;
const FRAG = /* glsl */`
#include <packing>
uniform mat4 uVP; uniform vec3 uPos; uniform sampler2D uDepth; uniform float uNear, uFar;
uniform vec3 uColor; uniform float uAmt; uniform int uMode; uniform float uSeed; uniform float uHard;
uniform sampler2D uDecal; uniform vec2 uDecalK; uniform float uWhole;
varying vec3 vW; varying vec3 vN;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + uSeed); return fract(p.x * p.y); }
void main() {
  vec3 toNoz = uPos - vW; float dist = length(toNoz);
  float facing = dot(normalize(vN), toNoz / dist);
  if (uMode == 2) {                                   // fill: the whole part
    gl_FragColor = vec4(uColor, 1.0); return;
  }
  vec4 c = uVP * vec4(vW, 1.0);
  if (c.w <= 0.0) discard;
  vec3 ndc = c.xyz / c.w;
  if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0) discard;
  // occlusion: is something nearer to the nozzle along this ray?
  float sd = unpackRGBAToDepth(texture2D(uDepth, ndc.xy * 0.5 + 0.5));
  float zHit = -perspectiveDepthToViewZ(sd, uNear, uFar), zMe = -perspectiveDepthToViewZ(ndc.z * 0.5 + 0.5, uNear, uFar);
  if (zMe > zHit + 0.006 + zMe * 0.012) discard;
  float face = smoothstep(0.03, 0.35, facing);
  if (face <= 0.0) discard;
  float r = length(ndc.xy);
  float a = 0.0;
  if (uMode == 0 || uMode == 5) {                     // spray: soft cone, grainy, overspray at the rim
    if (r > 1.0) discard;                             // a round cone, not the brush camera's square
    float core = 1.0 - smoothstep(0.25, 1.0, r);
    float grain = hash(gl_FragCoord.xy);
    a = uAmt * core * mix(0.35, 1.0, grain) * face;
    if (r > 0.75 && grain > 0.985 - 0.02 * uAmt) a = max(a, 0.5 * face);   // stray droplets round the edge
  } else if (uMode == 1 || uMode == 4) {              // marker / eraser: a hard round tip
    a = (1.0 - smoothstep(1.0 - uHard, 1.0, r)) * face * uAmt;
  } else if (uMode == 3) {                            // decal: the sticker, square to the nozzle
    vec2 d = ndc.xy * uDecalK * 0.5 + 0.5;
    if (d.x < 0.0 || d.y < 0.0 || d.x > 1.0 || d.y > 1.0) discard;
    vec4 t = texture2D(uDecal, d);
    a = t.a * step(0.08, facing);
    gl_FragColor = vec4(t.rgb * a, a); return;
  }
  if (a <= 0.002) discard;
  if (uMode >= 4) { gl_FragColor = vec4(0.0, 0.0, 0.0, a); return; }
  gl_FragColor = vec4(uColor * a, a);
}`;
// UV-space coverage mask (once per model): white wherever a chart is
const MASK_FRAG = /* glsl */`void main() { gl_FragColor = vec4(1.0); }`;
const QUAD_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DILATE_FRAG = /* glsl */`
uniform sampler2D src; uniform sampler2D mask; uniform vec2 px; varying vec2 vUv;
void main() {
  vec4 c = texture2D(src, vUv);
  if (texture2D(mask, vUv).r > 0.5) { gl_FragColor = c; return; }
  vec4 best = c; float bw = 0.0;
  for (int i = 1; i <= 4; i++) {
    for (int k = 0; k < 8; k++) {
      float an = float(k) * 0.7853982;
      vec2 o = vec2(cos(an), sin(an)) * px * float(i);
      if (texture2D(mask, vUv + o).r > 0.5 && bw < 0.5) { best = texture2D(src, vUv + o); bw = 1.0; }
    }
  }
  gl_FragColor = best;
}`;
const COPY_FRAG = /* glsl */`uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = texture2D(src, vUv); }`;

export function createPainter(renderer, { res = 1024, undoDepth = 8 } = {}) {
  const rtOpts = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const mkRT = (n = res) => new THREE.WebGLRenderTarget(n, n, rtOpts);
  const depthRT = new THREE.WebGLRenderTarget(256, 256, { type: THREE.UnsignedByteType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const brush = new THREE.PerspectiveCamera(5, 1, 0.03, 12);
  brush.layers.set(PAINT_LAYER);
  const depthCam = brush.clone(); depthCam.layers.set(PAINT_LAYER);   // only paintable parts occlude (outline hulls would hide the body)
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
  const U = {
    uVP: { value: new THREE.Matrix4() }, uPos: { value: new THREE.Vector3() }, uDepth: { value: depthRT.texture },
    uNear: { value: brush.near }, uFar: { value: brush.far }, uColor: { value: new THREE.Color() }, uAmt: { value: 1 },
    uMode: { value: 0 }, uSeed: { value: 0 }, uHard: { value: 0.15 }, uDecal: { value: blank }, uDecalK: { value: new THREE.Vector2(1, 1) }, uWhole: { value: 0 },
  };
  const blendOver = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const blendErase = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const base = { vertexShader: VERT, uniforms: U, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true };
  const paintMat = new THREE.ShaderMaterial({ ...base, fragmentShader: FRAG, ...blendOver });
  const eraseMat = new THREE.ShaderMaterial({ ...base, fragmentShader: FRAG, ...blendErase });
  const maskMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: MASK_FRAG, uniforms: {}, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  // full-screen passes
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; quadScene.add(quad);
  const dilateMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: DILATE_FRAG, uniforms: { src: { value: null }, mask: { value: null }, px: { value: new THREE.Vector2(1 / res, 1 / res) } }, depthTest: false, depthWrite: false });
  const copyMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COPY_FRAG, uniforms: { src: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending });

  const all = [];                              // every live paintable
  const world = new THREE.Scene();             // all paintables live in here (add it to the AR scene)
  world.name = 'paint-world';

  // render state we touch, saved and given back (the 8th Wall pipeline owns the renderer)
  const saved = { rt: null, clear: new THREE.Color(), alpha: 1, autoClear: true, xr: false };
  function begin() {
    saved.rt = renderer.getRenderTarget(); renderer.getClearColor(saved.clear); saved.alpha = renderer.getClearAlpha();
    saved.autoClear = renderer.autoClear; renderer.autoClear = false;
    saved.xr = renderer.xr.enabled; renderer.xr.enabled = false;
  }
  function end() { renderer.setRenderTarget(saved.rt); renderer.setClearColor(saved.clear, saved.alpha); renderer.autoClear = saved.autoClear; renderer.xr.enabled = saved.xr; }
  function blit(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

  // ---------------------------------------------------------------- display material: the model's own + the paint layer
  function patch(mat, P) {
    let m = mat;
    if (!m.isMeshStandardMaterial) {             // unlit / phong models: same colour and texture, physically lit
      m = new THREE.MeshStandardMaterial({ color: mat.color ? mat.color.clone() : 0xffffff, map: mat.map || null, roughness: 0.6, metalness: 0, transparent: mat.transparent, opacity: mat.opacity, side: mat.side, name: mat.name });
    } else m = mat.clone();
    m.userData.paint = P.u;
    m.onBeforeCompile = paintCompile;
    return m;
  }

  // ---------------------------------------------------------------- a paintable model
  // root: the model (already scaled/positioned inside a group the page owns). parts: meshes that get paint.
  function makePaintable(root, parts) {
    const raw = mkRT(), disp = mkRT(), mask = mkRT();
    const P = {
      root, parts, raw, disp, mask, undo: [], dirty: true, gen: 0,
      u: { map: { value: disp.texture }, rough: { value: 0.4 }, metal: { value: 0 }, glow: { value: 0 } },
      scene: new THREE.Scene(),
    };
    P.scene.add(root); world.add(P.scene);
    for (const m of parts) {
      m.layers.enable(PAINT_LAYER);
      m.material = Array.isArray(m.material) ? m.material.map((x) => patch(x, P)) : patch(m.material, P);
    }
    // clear the layers and draw the coverage mask
    begin();
    renderer.setClearColor(0x000000, 0);
    for (const t of [raw, disp, mask]) { renderer.setRenderTarget(t); renderer.clear(true, false, false); }
    P.scene.overrideMaterial = maskMat; brush.position.set(0, 0, 0); brush.updateMatrixWorld();
    renderer.setRenderTarget(mask); withAll(P, () => renderer.render(P.scene, brush));
    P.scene.overrideMaterial = null;
    end();
    all.push(P);
    return P;
  }
  // brush-camera culling would drop parts outside the cone: off during the UV passes
  function withAll(P, fn) {
    const fc = []; P.root.traverse((o) => { if (o.isMesh) { fc.push([o, o.frustumCulled]); o.frustumCulled = false; } });
    fn(); for (const [o, f] of fc) o.frustumCulled = f;
  }
  function dispose(P) {
    const i = all.indexOf(P); if (i >= 0) all.splice(i, 1);
    world.remove(P.scene); for (const t of [P.raw, P.disp, P.mask, ...P.undo]) t.dispose();
  }

  // ---------------------------------------------------------------- strokes
  function aimBrush(origin, dir, up, halfAngleRad) {
    brush.fov = THREE.MathUtils.radToDeg(halfAngleRad * 2); brush.aspect = 1; brush.updateProjectionMatrix();
    brush.position.copy(origin); brush.up.copy(up); brush.lookAt(_t.copy(origin).add(dir)); brush.updateMatrixWorld();
    depthCam.fov = brush.fov; depthCam.projectionMatrix.copy(brush.projectionMatrix); depthCam.position.copy(brush.position); depthCam.quaternion.copy(brush.quaternion); depthCam.updateMatrixWorld();
    U.uVP.value.multiplyMatrices(brush.projectionMatrix, brush.matrixWorldInverse); U.uPos.value.copy(origin);
  }
  const _t = new THREE.Vector3(), _s = new THREE.Sphere(), _c = new THREE.Vector3();
  // does the cone (origin, dir, half angle) come near P? (cheap bounding-sphere test)
  function inCone(P, origin, dir, half) {
    new THREE.Box3().setFromObject(P.root).getBoundingSphere(_s);
    _c.copy(_s.center).sub(origin); const along = _c.dot(dir); if (along < -_s.radius) return false;
    const perp = Math.sqrt(Math.max(_c.lengthSq() - along * along, 0));
    return perp < _s.radius + Math.max(along, 0) * Math.tan(half) + 0.02;
  }
  /** one stamp. s: { origin, dir, up, half (rad), mode, color (THREE.Color, linear), amt (0..1), hard, decal: {tex, aspect}, only: P } */
  function stamp(s) {
    const targets = (s.only ? [s.only] : all).filter((P) => P.root.visible && inCone(P, s.origin, s.dir, s.half));
    if (!targets.length) return [];
    begin();
    aimBrush(s.origin, s.dir, s.up, s.half);
    // 1. depth from the nozzle (all paintables occlude)
    renderer.setRenderTarget(depthRT); renderer.setClearColor(0xffffff, 1); renderer.clear(true, true, false);
    world.overrideMaterial = depthMat; renderer.render(world, depthCam); world.overrideMaterial = null;
    // 2. paint
    U.uMode.value = MODE[s.mode] ?? 0; U.uAmt.value = s.amt ?? 1; U.uHard.value = s.hard ?? 0.15; U.uSeed.value = Math.random() * 97;
    if (s.color) U.uColor.value.copy(s.color);
    if (s.decal) { U.uDecal.value = s.decal.tex; const a = s.decal.aspect || 1; U.uDecalK.value.set(a >= 1 ? 1 : 1 / a, a >= 1 ? a : 1); }
    const mat = s.mode === 'erase' || s.mode === 'eraseSpray' ? eraseMat : paintMat;
    for (const P of targets) {
      P.scene.overrideMaterial = mat; renderer.setRenderTarget(P.raw);
      withAll(P, () => renderer.render(P.scene, brush));
      P.scene.overrideMaterial = null; P.dirty = true; P.gen++;
    }
    end();
    return targets;
  }
  /** fill one part (mesh) of P with a colour */
  function fill(P, mesh, color) {
    begin();
    U.uMode.value = MODE.fill; U.uColor.value.copy(color);
    const keep = []; P.root.traverse((o) => { if (o.isMesh && o !== mesh && o.layers.isEnabled(PAINT_LAYER)) { keep.push(o); o.layers.disable(PAINT_LAYER); } });
    P.scene.overrideMaterial = paintMat; renderer.setRenderTarget(P.raw); withAll(P, () => renderer.render(P.scene, brush)); P.scene.overrideMaterial = null;
    for (const o of keep) o.layers.enable(PAINT_LAYER);
    end(); P.dirty = true; P.gen++;
  }
  // after strokes: refresh what the models show (dilated across chart edges)
  function update() {
    let any = false;
    for (const P of all) if (P.dirty) {
      if (!any) { begin(); any = true; }
      dilateMat.uniforms.src.value = P.raw.texture; dilateMat.uniforms.mask.value = P.mask.texture; blit(dilateMat, P.disp); P.dirty = false;
    }
    if (any) end();
  }

  // ---------------------------------------------------------------- undo, clear, save, load
  function snapshot(P) {
    let t = P.undo.length >= undoDepth ? P.undo.shift() : mkRT();
    begin(); copyMat.uniforms.src.value = P.raw.texture; blit(copyMat, t); end();
    P.undo.push(t);
  }
  function undo(P) {
    const t = P.undo.pop(); if (!t) return false;
    begin(); copyMat.uniforms.src.value = t.texture; blit(copyMat, P.raw); end(); t.dispose(); P.dirty = true; P.gen++; return true;
  }
  function clear(P) { begin(); renderer.setRenderTarget(P.raw); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); end(); P.dirty = true; P.gen++; }
  function isEmpty(P) { return P.gen === 0; }
  /** the paint layer as a PNG blob (for IndexedDB) */
  async function toBlob(P) {
    const px = new Uint8Array(res * res * 4);
    begin(); renderer.readRenderTargetPixels(P.raw, 0, 0, res, res, px); end();
    const c = document.createElement('canvas'); c.width = c.height = res; const g = c.getContext('2d'); const im = g.createImageData(res, res);
    const row = res * 4;
    for (let y = 0; y < res; y++) im.data.set(px.subarray((res - 1 - y) * row, (res - y) * row), y * row);   // GL rows are bottom-up
    // stored premultiplied: un-premultiply for the PNG so 8-bit colour survives
    const d = im.data; for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a && a < 255) { d[i] = Math.min(255, d[i] * 255 / a); d[i + 1] = Math.min(255, d[i + 1] * 255 / a); d[i + 2] = Math.min(255, d[i + 2] * 255 / a); } }
    g.putImageData(im, 0, 0);
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }
  const loadMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: `uniform sampler2D src; varying vec2 vUv; void main(){ vec4 c = texture2D(src, vUv); gl_FragColor = vec4(c.rgb * c.a, c.a); }`, uniforms: { src: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  async function fromBlob(P, blob) {
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.premultiplyAlpha = false; tex.needsUpdate = true;
    // ImageBitmap ignores flipY: rows arrive top-down, so flip in the quad instead
    const q = quad.geometry.attributes.uv; const old = q.array.slice();
    for (let i = 0; i < q.count; i++) q.setY(i, 1 - q.getY(i)); q.needsUpdate = true;
    begin(); loadMat.uniforms.src.value = tex; blit(loadMat, P.raw); end();
    q.array.set(old); q.needsUpdate = true; tex.dispose(); bmp.close && bmp.close();
    P.dirty = true; P.gen++;
  }
  // compile every program once while loading (a shader compile mid-session stalls 8th Wall: Top pitfall 13)
  function warm(P, camera) {
    const origin = new THREE.Vector3(0, 0, 5), dir = new THREE.Vector3(0, 0, -1);
    stamp({ origin, dir, up: new THREE.Vector3(0, 1, 0), half: 0.01, mode: 'spray', color: new THREE.Color(0), amt: 0, only: P });
    stamp({ origin, dir, up: new THREE.Vector3(0, 1, 0), half: 0.01, mode: 'erase', amt: 0, only: P });
    P.gen = 0; update();
    try { renderer.compile(P.scene, camera); } catch (e) { /* older three */ }
  }
  return { world, makePaintable, dispose, stamp, fill, update, snapshot, undo, clear, isEmpty, toBlob, fromBlob, warm, all, PAINT_LAYER };
}

// the display material's patch: one function (one shader program for every painted material of a kind)
function paintCompile(shader) {
  const u = this.userData.paint;
  shader.uniforms.paintMap = u.map; shader.uniforms.paintRough = u.rough; shader.uniforms.paintMetal = u.metal; shader.uniforms.paintGlow = u.glow;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 paintUv;\nvarying vec2 vPaintUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintUv = paintUv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D paintMap; uniform float paintRough, paintMetal, paintGlow;\nvarying vec2 vPaintUv;\nvec4 pnt;')
    .replace('#include <map_fragment>', '#include <map_fragment>\npnt = texture2D(paintMap, vPaintUv);\ndiffuseColor.rgb = diffuseColor.rgb * (1.0 - pnt.a) + pnt.rgb;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, paintRough, pnt.a);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, paintMetal, pnt.a);')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += pnt.rgb * paintGlow;');
}
