// Everything Bobo's world is made of, for one mode: lights, Bobo's spot, Bobo's Hideout (scene/house: the hall with
// the can room and Bobo's Arcade; in AR behind a walk-in door), the party set, the fizz orb, particles and a
// camera-facing tint for the moods (sleep dims the light, party flashes colours). All of it is built at load and stays
// in the scene graph (hidden when unused), so the moments never compile a shader when they appear (pitfall 13).
//
// One Stage per mode (showcase / AR) so each keeps its own state; they share geometry and textures. The ONE Bobo moves
// to the active stage's actor. Units: Bobo is 1 unit tall; the AR mode scales the stage root to the room.
import * as THREE from 'three';
import type { PropKit } from './props';
import { Actor } from './actor';
import { DiscoFloor, Particles, contactShadow } from './fx';
import { damp } from '../core/timeline';
import type { Media } from './media';
import { Playground } from '../physics/playground';
import { HouseSet } from './house';

/** Gravity for the toys, in metres per second squared (soft: hearts float a little). */
const TOY_G = 6.4;
/** The showcase treats Bobo as this many metres tall for the toys' gravity (AR: the stage scale). */
const SHOWCASE_M = 0.9;

export type Variant = 'showcase' | 'ar';
export type MoodName = 'normal' | 'sleep' | 'cold' | 'party';

interface Mood { hemi: number; sun: number; sky: number; ground: number; sunCol: number; bg: number; tint: number; tintA: number }
const MOODS: Record<MoodName, Mood> = {
  normal: { hemi: 1.15, sun: 1.5, sky: 0xfff3e4, ground: 0x3a2c48, sunCol: 0xfff3e6, bg: 1, tint: 0x0a1c2a, tintA: 0 },
  sleep: { hemi: 0.5, sun: 0.25, sky: 0x93a2ff, ground: 0x1a2440, sunCol: 0x7f8cff, bg: 0.38, tint: 0x0a1c2a, tintA: 0.42 },
  cold: { hemi: 1.1, sun: 1.3, sky: 0xcfeaff, ground: 0x2a4a68, sunCol: 0xe0f4ff, bg: 0.9, tint: 0xbfefff, tintA: 0.18 },
  party: { hemi: 0.85, sun: 1.6, sky: 0xffffff, ground: 0x3a1a5a, sunCol: 0xff4f9a, bg: 0.6, tint: 0x1a0a30, tintA: 0.2 },
};


export class Stage {
  readonly root = new THREE.Group();
  readonly content = new THREE.Group(); // everything except the tint (the AR mode moves/scales root)
  readonly actor: Actor;
  readonly fx = new Particles(700);
  /** Physical toys: thrown hearts, bouncing stars, party balloons (src/experience/physics). */
  readonly play: Playground;
  /** Bobo's head, for snow to land on (the Cold moment); follows him every frame. */
  readonly headPerch = new THREE.Sphere(new THREE.Vector3(0, 0.76, 0), 0.24);
  /** His arms are open for a catch (set by the toss game every frame). */
  catching = false;
  catchY = 0.6;
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xc8a8bc, 1.25);
  readonly sun = new THREE.DirectionalLight(0xfff3e6, 1.7);
  // Bobo's Hideout (scene/house/): the hall, the can room and the arcade (AR: behind a walk-in door)
  readonly house = new THREE.Group();     // origin = floor centre of the cottage's footprint (stage units)
  readonly houseSet: HouseSet;
  readonly houseModel: THREE.Group;       // the cottage outside (taps)
  readonly houseSize = new THREE.Vector3(); // footprint size in stage units (kept up to date every frame)
  readonly door = new THREE.Vector3();    // stage-local point in front of the door
  readonly portal: THREE.Mesh | null = null;
  readonly interior: THREE.Object3D;        // the room behind the door
  // moments
  readonly disco = new THREE.Group();
  readonly discoFloor = new DiscoFloor(6, 2.6);
  readonly discoBall: THREE.Group;
  readonly orb: THREE.Mesh;
  readonly tint: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  /** Camera position / forward in stage-local space (set by the mode every frame). */
  readonly cam = new THREE.Vector3(0, 1.2, 4);
  readonly camDir = new THREE.Vector3(0, 0, -1);
  bg = 1; // background intensity (showcase backdrop)
  private moodNow: Mood = { ...MOODS.normal };
  private mood: MoodName = 'normal';
  private partyT = 0;
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  private inv = new THREE.Matrix4();
  private camW = new THREE.Vector3();
  private sunOff = new THREE.Vector3(2.2, 5, 3.2);
  private hbBox = new THREE.Box3();

  constructor(readonly variant: Variant, kit: PropKit, readonly media: Media) {
    this.root.name = `stage-${variant}`;
    this.root.add(this.content);
    this.actor = new Actor(`bear-${variant}`);
    // 3D: Bobo a little smaller in the hideout (Dapo, 2026-11-22), so the room and the machines read bigger round him
    if (variant === 'showcase') this.actor.holder.scale.setScalar(0.85);

    // lights (each stage carries its own: the light count never changes, so no recompiles)
    this.hemi.position.set(0, 4, 0);
    this.sun.position.set(2.2, 5, 3.2);
    this.sun.target.position.set(0, 0.6, 0);
    this.content.add(this.hemi, this.sun, this.sun.target);

    // Bobo's spot + his contact shadow
    this.shadow = contactShadow(0.42, 0.42);
    this.actor.holder.add(this.shadow);
    this.content.add(this.actor.holder);

    // ---- Bobo's Hideout (scene/house/): 3D's whole world; in AR a walk-in door behind Bobo
    this.houseSet = new HouseSet(this, kit, media);
    this.houseModel = this.houseSet.exterior;
    this.interior = this.houseSet.room.group;
    this.house.add(this.houseSet.root);
    this.content.add(this.house);
    this.houseSet.update(0, null);

    // ---- party set: tile floor and a disco ball
    this.discoBall = kit.make('discoball', 0.5);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    cord.position.y = 0.5 + 0.8;
    this.discoBall.add(cord);
    this.disco.add(this.discoFloor.mesh, this.discoBall);
    this.discoBall.visible = false;
    this.content.add(this.disco);

    // ---- the fizz orb (the Magic moment): a cyan Eclipse fizz bubble, its flat glow cycling through EVADE colours
    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshStandardMaterial({ color: 0x4fd6e8, emissive: 0x4fd6e8, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 }),
    );
    this.orb.visible = false;
    this.content.add(this.orb);

    this.content.add(this.fx.points);

    // ---- physical toys (one program each, compiled with everything else at load)
    this.play = new Playground(this.fx);
    this.content.add(this.play.group);

    // ---- mood tint: a camera-facing flat quad (sleep dims everything, cold frosts it); drawn last, no depth
    this.tint = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ color: 0x14103a, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.tint.renderOrder = 999;
    this.tint.frustumCulled = false;
    this.tint.visible = false;
    this.root.add(this.tint);
  }

  // ------------------------------------------------------------------ moods
  setMood(m: MoodName): void {
    this.mood = m;
  }
  get moodName(): MoodName {
    return this.mood;
  }

  /** Per frame. */
  update(dt: number, camWorld: THREE.Camera | null): void {
    // camera in stage space
    if (camWorld) {
      camWorld.getWorldPosition(this.cam);
      camWorld.getWorldDirection(this.camDir);
      const inv = this.inv.copy(this.root.matrixWorld).invert();
      this.cam.applyMatrix4(inv);
      this.camDir.transformDirection(inv);
    }
    // mood lerp
    const t = MOODS[this.mood], k = damp(2.2, dt), M = this.moodNow;
    M.hemi += (t.hemi - M.hemi) * k;
    M.sun += (t.sun - M.sun) * k;
    M.bg += (t.bg - M.bg) * k;
    M.tintA += (t.tintA - M.tintA) * k;
    this.hemi.intensity = M.hemi;
    this.sun.intensity = M.sun;
    this.hemi.color.lerp(this.c1.setHex(t.sky), k);
    this.hemi.groundColor.lerp(this.c1.setHex(t.ground), k);
    let sunHex = t.sunCol;
    if (this.mood === 'party') {
      this.partyT += dt;
      const cyc = [0xff4f9a, 0x4fd6e8, 0xf6c344, 0x2a5bd7, 0x6a32e8];
      sunHex = cyc[Math.floor(this.partyT * 2.2) % cyc.length];
    }
    this.sun.color.lerp(this.c2.setHex(sunHex), this.mood === 'party' ? damp(9, dt) : k);
    const tm = this.tint.material as THREE.MeshBasicMaterial;
    tm.color.lerp(this.c1.setHex(t.tint), k);
    tm.opacity = M.tintA;
    this.tint.visible = M.tintA > 0.005;
    this.bg = M.bg;
    if (this.tint.visible) {
      // just in front of the camera, facing it, big enough to cover the view
      this.tint.position.copy(this.cam).addScaledVector(this.camDir, 0.5 / Math.max(1e-3, this.root.scale.x));
      this.tint.lookAt(this.root.localToWorld(this.camW.copy(this.cam)));
      this.tint.scale.setScalar(1 / Math.max(1e-3, this.root.scale.x));
    }
    this.sun.target.position.copy(this.actor.position).setY(0.5);
    this.sun.position.copy(this.actor.position).add(this.sunOff);
    this.discoFloor.update(dt);
    if (this.discoBall.visible) this.discoBall.rotation.y += dt * 1.2;
    this.houseSet.update(dt, camWorld);
    this.updateToys(dt);
    this.fx.update(dt);
  }

  /** The cottage's footprint in stage-local space (null while the house is hidden). Games keep pickups out of it. */
  houseBounds(out: THREE.Box3): THREE.Box3 | null {
    return this.houseSet.bounds(out);
  }

  /** The toys' physics: Bobo's body, the door frame (AR, at rest), gravity in stage units. */
  private updateToys(dt: number): void {
    const play = this.play, a = this.actor;
    const metres = this.variant === 'ar' ? Math.max(0.05, this.root.scale.x) : SHOWCASE_M;
    play.world.gravityY = TOY_G / metres;
    play.setBear(a.position, this.catching && !!a.bear && !a.asleep, this.catchY);
    // his paws reach out a little in front of him
    play.sensor.x += Math.sin(a.heading) * 0.15;
    play.sensor.z += Math.cos(a.heading) * 0.15;
    this.headPerch.center.set(a.position.x, 0.76, a.position.z);
    // the cottage's walls (outside only: inside, the toys fly round the room)
    const hb = play.houseBox, hs = this.houseSet;
    hb.on = this.house.visible && !hs.inside && !hs.posed && !!hs.bounds(this.hbBox);
    if (hb.on) {
      hb.min.copy(this.hbBox.min);
      hb.max.copy(this.hbBox.max);
    }
    play.update(dt);
  }

  /** Everything back to its resting layout (Start again). */
  resetLayout(): void {
    this.fx.clear();
    this.play.clear();
    this.discoFloor.mesh.visible = false;
    this.discoBall.visible = false;
    this.orb.visible = false;
    this.mood = 'normal';
    this.houseSet.reset();
  }

  /** Every texture/material under the stage, for warming. */
  warmTargets(): THREE.Object3D {
    return this.root;
  }
}
