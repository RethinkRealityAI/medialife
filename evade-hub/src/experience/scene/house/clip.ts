// The doorway "portal" clip: four planes through the camera and the edges of the door opening, so from outside the
// room is only drawn where you look through the door (the room is much bigger than the cottage). Inside, the planes
// are switched off (moved out of the way; nothing recompiles).
//
// Why not three's own clippingPlanes: `renderer.compile()` builds programs with whatever clipping count the LAST
// rendered material left behind, so clipped materials are compiled again on their first real draw (a stall at the
// moment the door opens, the exact thing that blacked out the camera in the Cola Run hideout). This clip is a tiny
// shader patch with a fixed program key: compiled once at load with everything else, then only uniforms change.
//
// Inside, the room draws with PLAIN twins of its materials (ar-4): the clip's `discard` stays in the shader even when
// its planes are switched off, and a shader that can discard turns off the GPU's early depth test / hidden-surface
// removal on phones, so every wall, the floor, the ceiling and the furniture were fully shaded under each other while
// the room filled the screen. The twins are made and compiled at load (`twinHolder()`), so swapping is free.
import * as THREE from 'three';

const OFF = new THREE.Vector4(0, 1, 0, 1e9);
/** A plane nothing is in front of (the cut never fires). */
const NONE = new THREE.Vector4(0, 1, 0, -1e9);

/** The world-position varying, for any built-in material (batching / instancing aware). */
function worldVarying(sh: THREE.WebGLProgramParametersWithUniforms): void {
  sh.vertexShader = 'varying vec3 vHouseW;\n' + sh.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
    {
      vec4 hw = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        hw = batchingMatrix * hw;
      #endif
      #ifdef USE_INSTANCING
        hw = instanceMatrix * hw;
      #endif
      vHouseW = ( modelMatrix * hw ).xyz;
    }`,
  );
}

export class DoorClip {
  /** World-space planes (kept side = positive distance). */
  readonly planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  readonly uniform = { value: [OFF.clone(), OFF.clone(), OFF.clone(), OFF.clone()] };
  /** The cottage cut: the same four planes plus the door plane (facing into the room). */
  readonly cut = { value: [OFF.clone(), OFF.clone(), OFF.clone(), OFF.clone(), NONE.clone()] };
  private on = false;
  /** Clipped material -> its plain twin (same look, no clip patch, built-in program key). */
  private twins = new Map<THREE.Material, THREE.Material>();

  /** Patch a material (any built-in lit or unlit one). Call before the first compile. */
  apply<T extends THREE.Material>(m: T): T {
    const u = this.uniform;
    this.twins.set(m, PENDING);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.houseClip = u;
      worldVarying(sh);
      sh.fragmentShader = 'uniform vec4 houseClip[ 4 ];\nvarying vec3 vHouseW;\n' + sh.fragmentShader.replace(
        'void main() {',
        `void main() {
        for ( int i = 0; i < 4; i ++ ) {
          if ( dot( houseClip[ i ].xyz, vHouseW ) + houseClip[ i ].w < 0.0 ) discard;
        }`,
      );
    };
    m.customProgramCacheKey = () => 'cb-house-clip';
    return m;
  }

  /**
   * The cottage's outside (walls, roof, base clouds) gets the opposite patch: it is cut away wherever you look through
   * the door into the room (inside the four planes AND beyond the door plane), so bits of the cottage that poke into
   * the room's volume (base clouds, roof puffs) never show in the room. Same rules: one fixed program, compiled at load.
   */
  applyCut<T extends THREE.Material>(m: T): T {
    const u = this.cut;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.houseCut = u;
      worldVarying(sh);
      sh.fragmentShader = 'uniform vec4 houseCut[ 5 ];\nvarying vec3 vHouseW;\n' + sh.fragmentShader.replace(
        'void main() {',
        `void main() {
        {
          bool cut = true;
          for ( int i = 0; i < 5; i ++ ) {
            if ( dot( houseCut[ i ].xyz, vHouseW ) + houseCut[ i ].w < 0.0 ) cut = false;
          }
          if ( cut ) discard;
        }`,
      );
    };
    m.customProgramCacheKey = () => 'cb-house-cut';
    return m;
  }

  /** The plain twin of a clipped material (made on first ask; shares its textures). Null if `m` is not clipped. */
  twin(m: THREE.Material): THREE.Material | null {
    const t = this.twins.get(m);
    if (!t) return null;
    if (t !== PENDING) return t;
    const c = m.clone(); // clone() leaves onBeforeCompile / customProgramCacheKey behind: a built-in program
    c.name = (m.name || m.type) + ' (plain)';
    this.twins.set(m, c);
    return c;
  }

  /**
   * Hidden meshes that carry every twin used under `root`, on the SAME geometry as the mesh that will wear it (the
   * geometry and mesh kind decide some shader defines), so the compile at load builds the twins' programs too
   * (three's compile() visits hidden objects' materials). Returns the swaps for `wear()`.
   */
  twinHolder(root: THREE.Object3D): { holder: THREE.Group; swaps: Array<[THREE.Mesh, THREE.Material, THREE.Material]> } {
    const holder = new THREE.Group();
    holder.name = 'house-plain-twins';
    holder.visible = false;
    const swaps: Array<[THREE.Mesh, THREE.Material, THREE.Material]> = [];
    const done = new Set<string>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const tw = this.twin(mesh.material);
      if (!tw) return;
      swaps.push([mesh, mesh.material, tw]);
      const key = tw.uuid + ':' + mesh.geometry.uuid + ':' + ((mesh as THREE.InstancedMesh).isInstancedMesh ? 'i' : 'm');
      if (done.has(key)) return;
      done.add(key);
      let h: THREE.Mesh;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const im = new THREE.InstancedMesh(mesh.geometry, tw, 1);
        if ((mesh as THREE.InstancedMesh).instanceColor) im.setColorAt(0, new THREE.Color(1, 1, 1));
        h = im;
      } else h = new THREE.Mesh(mesh.geometry, tw);
      h.frustumCulled = false;
      h.userData.cbxTwinHolder = true;
      holder.add(h);
    });
    return { holder, swaps };
  }

  /** No clipping (inside, or standing in the doorway). */
  off(): void {
    if (!this.on) return;
    this.on = false;
    for (const v of this.uniform.value) v.copy(OFF);
    for (const v of this.cut.value) v.copy(OFF);
    this.cut.value[4].copy(NONE);
  }

  /** Standing in the doorway: no room clip, and the cottage is cut behind the door plane (`door`, kept side = room). */
  doorway(door: THREE.Plane): void {
    this.off();
    this.on = true;
    this.cut.value[4].set(door.normal.x, door.normal.y, door.normal.z, door.constant);
  }

  /**
   * Clip to what the camera sees through a rectangle (the door opening's bounds, world space corners in order
   * round the edge) on the room's side. `inside` is a world point in the room, used to orient the planes.
   */
  through(cam: THREE.Vector3, corners: THREE.Vector3[], inside: THREE.Vector3, door: THREE.Plane): void {
    this.on = true;
    this.cut.value[4].set(door.normal.x, door.normal.y, door.normal.z, door.constant);
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], p = this.planes[i];
      A.subVectors(a, cam);
      B.subVectors(b, cam);
      N.crossVectors(A, B);
      if (N.lengthSq() < 1e-12) { this.uniform.value[i].copy(OFF); this.cut.value[i].copy(OFF); continue; }
      p.setFromNormalAndCoplanarPoint(N.normalize(), cam);
      if (p.distanceToPoint(inside) < 0) p.negate();
      this.uniform.value[i].set(p.normal.x, p.normal.y, p.normal.z, p.constant);
      this.cut.value[i].copy(this.uniform.value[i]);
    }
  }
}

const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
/** Marks a clipped material whose twin is not made yet. */
const PENDING = new THREE.MeshBasicMaterial();
