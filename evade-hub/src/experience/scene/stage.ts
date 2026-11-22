// Everything Happi's world is made of, for one mode: lights, the bear's spot, her house (with the portal and the
// inside), the car and mailbox, the rainbow, the party set, the magic orb, particles and a camera-facing tint for the
// moods (sleep dims the light, cold frosts it, party flashes colours). All of it is built at load and stays in the
// scene graph (hidden when unused), so the moments never compile a shader when they appear (pitfall 13).
//
// One Stage per mode (showcase / AR) so each keeps its own state; they share geometry and textures. The ONE bear moves
// to the active stage's actor. Units: the bear is 1 unit tall; the AR mode scales the stage root to the room.
import * as THREE from 'three';
import type { PropKit } from './props';
import { Actor } from './actor';
import { DiscoFloor, Particles, contactShadow } from './fx';
import { damp } from '../core/timeline';
import type { Media } from './media';
import { Playground } from '../physics/playground';
import { StareBeam } from './stare';
import { HouseSet } from './house';

/** Gravity for the toys, in metres per second squared (soft: hearts float a little). */
const TOY_G = 6.4;
/** The showcase treats Happi as this many metres tall (AR: the stage scale). */
const SHOWCASE_M = 0.9;

export type Variant = 'showcase' | 'ar';
export type MoodName = 'normal' | 'sleep' | 'cold' | 'party';

interface Mood { hemi: number; sun: number; sky: number; ground: number; sunCol: number; bg: number; tint: number; tintA: number }
const MOODS: Record<MoodName, Mood> = {
  normal: { hemi: 1.25, sun: 1.7, sky: 0xffffff, ground: 0xc8a8bc, sunCol: 0xfff3e6, bg: 1, tint: 0x1a1030, tintA: 0 },
  sleep: { hemi: 0.5, sun: 0.25, sky: 0x93a2ff, ground: 0x2e2448, sunCol: 0x7f8cff, bg: 0.38, tint: 0x14103a, tintA: 0.42 },
  cold: { hemi: 1.15, sun: 1.3, sky: 0xcfeaff, ground: 0x8fb8d8, sunCol: 0xe0f4ff, bg: 0.9, tint: 0xbfe6ff, tintA: 0.2 },
  party: { hemi: 0.85, sun: 1.6, sky: 0xffffff, ground: 0x6a3c8a, sunCol: 0xff389b, bg: 0.6, tint: 0x2a0a40, tintA: 0.22 },
};

/** Old house height (stage units). The house is now built in code (scene/house/) and sized in metres. */
export const HOUSE_H = 2.4;

export class Stage {
  readonly root = new THREE.Group();
  readonly content = new THREE.Group(); // everything except the tint (the AR mode moves/scales root)
  readonly actor: Actor;
  readonly fx = new Particles(700);
  /** Physical toys: thrown hearts, bouncing stars, party balloons (src/experience/physics). */
  readonly play: Playground;
  /** The Care Bear Stare beam (the Stare moment). */
  readonly beam = new StareBeam();
  /** Her head, for snow to land on (the Cold moment); follows her every frame. */
  readonly headPerch = new THREE.Sphere(new THREE.Vector3(0, 0.76, 0), 0.24);
  /** Her arms are open for a catch (set by the toss game every frame). */
  catching = false;
  catchY = 0.6;
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xc8a8bc, 1.25);
  readonly sun = new THREE.DirectionalLight(0xfff3e6, 1.7);
  // house set (scene/house/): a code-built cottage whose door is a walk-through portal into a life-size room
  readonly house = new THREE.Group();     // origin = floor centre of the cottage's footprint (stage units)
  readonly houseSet: HouseSet;
  readonly houseModel: THREE.Group;       // the cottage outside (taps)
  readonly houseSize = new THREE.Vector3(); // footprint size in stage units (kept up to date every frame)
  readonly door = new THREE.Vector3();    // stage-local point in front of the door
  readonly portal: THREE.Mesh | null = null;
  readonly interior: THREE.Group;         // the room behind the door
  readonly mailbox: THREE.Group;
  readonly car = new THREE.Group();
  readonly carModel: THREE.Group;
  // moments
  readonly rainbow = new THREE.Group();
  readonly disco = new THREE.Group();
  readonly discoFloor = new DiscoFloor(6, 2.6);
  readonly discoBall: THREE.Group;
  readonly partyTv = new THREE.Group();
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

    // lights (each stage carries its own: the light count never changes, so no recompiles)
    this.hemi.position.set(0, 4, 0);
    this.sun.position.set(2.2, 5, 3.2);
    this.sun.target.position.set(0, 0.6, 0);
    this.content.add(this.hemi, this.sun, this.sun.target);

    // Happi's spot + her contact shadow
    this.shadow = contactShadow(0.42, 0.42);
    this.actor.holder.add(this.shadow);
    this.content.add(this.actor.holder);

    // ---- the house set (scene/house/): built in code, the door is a portal into the room
    this.houseSet = new HouseSet(this, kit, media);
    this.houseModel = this.houseSet.exterior;
    this.interior = this.houseSet.room.group;
    this.house.add(this.houseSet.root);
    this.content.add(this.house);
    if (variant === 'showcase') {
      this.house.position.set(0, 0, -3.6);
      this.house.visible = false;
    }
    this.houseSet.update(0, null);

    this.mailbox = kit.make('mailbox', 0.78);
    this.mailbox.add(contactShadow(0.36, 0.3));
    this.mailbox.position.set(-2.6, 0, this.house.position.z + this.houseSize.z * 0.3);
    this.mailbox.rotation.y = 0.5;
    this.mailbox.visible = variant === 'ar';
    this.content.add(this.mailbox);

    this.carModel = kit.make('car', 0.68);
    this.car.add(this.carModel, contactShadow(0.85, 0.3));
    this.car.visible = false;
    this.content.add(this.car);

    // ---- rainbow (Rainbow moment)
    const rb = kit.make('rainbow', 1.5);
    this.rainbow.add(rb);
    this.rainbow.visible = false;
    this.content.add(this.rainbow);

    // ---- party set: tile floor, disco ball, a TV playing the theme
    this.discoBall = kit.make('discoball', 0.5);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    cord.position.y = 0.5 + 0.8;
    this.discoBall.add(cord);
    this.disco.add(this.discoFloor.mesh, this.discoBall);
    this.discoBall.visible = false;
    this.content.add(this.disco);
    this.partyTv.add(this.tvSet(kit, 1.0, media.themeTexture), contactShadow(0.5, 0.3));
    this.partyTv.visible = false;
    this.content.add(this.partyTv);

    // ---- magic orb (Mattercraft "Magic Orb": blue glass, emissive cycling)
    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshStandardMaterial({ color: 0x3d8bff, emissive: 0x4d99ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 }),
    );
    this.orb.visible = false;
    this.content.add(this.orb);

    this.content.add(this.fx.points);

    // ---- physical toys + the Stare beam (one program each, compiled with everything else at load)
    this.play = new Playground(this.fx);
    this.content.add(this.play.group, this.beam.mesh);

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

  /** A TV with the theme video on its screen (TV model front faces +z; the screen sits at the upper part). */
  private tvSet(kit: PropKit, height: number, tex: THREE.Texture): THREE.Group {
    const g = new THREE.Group();
    const tv = kit.make('tv', height);
    g.add(tv);
    const s = height; // TV model 1 tall: the screen opening is about 0.36 x 0.29 at (-0.06, 0.78) (measured on a render)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.355 * s, 0.285 * s),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    );
    screen.position.set(-0.058 * s, 0.782 * s, 0.215 * s);
    screen.name = 'screen';
    g.add(screen);
    return g;
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
      const cyc = [0xff389b, 0x439bdd, 0xffd84a, 0x5fcf86, 0x9a6bff];
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

  /** The toys' physics: her body, the house walls (AR, house at rest), gravity in stage units. */
  private updateToys(dt: number): void {
    const play = this.play, a = this.actor;
    const metres = this.variant === 'ar' ? Math.max(0.05, this.root.scale.x) : SHOWCASE_M;
    play.world.gravityY = TOY_G / metres;
    play.setBear(a.position, this.catching && !!a.bear && !a.asleep, this.catchY);
    // her arms reach out a little in front of her
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
    this.beam.mesh.visible = false;
    this.rainbow.visible = false;
    this.discoFloor.mesh.visible = false;
    this.discoBall.visible = false;
    this.partyTv.visible = false;
    this.orb.visible = false;
    this.car.visible = false;
    this.mood = 'normal';
    this.houseSet.reset();
    if (this.variant === 'showcase') {
      this.house.visible = false;
      this.mailbox.visible = false;
    }
  }

  /** Every texture/material under the stage, for warming. */
  warmTargets(): THREE.Object3D {
    return this.root;
  }
}
