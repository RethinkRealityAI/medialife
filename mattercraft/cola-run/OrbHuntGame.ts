/**
 * OrbHuntGame.ts — Mattercraft custom ZComponent
 * Rethink Reality
 *
 * A complete collect-the-orbs round in a single node.
 *
 *   · spawns glowing orbs on a seeded, minimum-separation layout
 *   · a pulsing ground beacon under each one
 *   · collection via Mattercraft's native SphereTrigger pair (distance-check
 *     fallback available on a dropdown)
 *   · round timer, target count, win / fail states
 *   · an animated portal that opens when the target is hit
 *   · a screen-space menu (Play / Pause / Restart) + score & timer HUD
 *   · four sound hooks, and three timeline hooks for your own animation
 *
 * Companion to PortalShader.ts and OrbShader.ts — the orb, glow and portal
 * GLSL here is byte-identical to those components, so anything you tune in
 * the standalone labs transfers straight across.
 *
 * ── Install ────────────────────────────────────────────────────────────────
 *  1. Project Panel → + → CustomThreeJSComponent, name it `OrbHuntGame`.
 *  2. Replace the generated file's contents with this file.
 *  3. Hierarchy Panel → + → OrbHuntGame.
 *  4. Set "Player Node" to your joystick-driven character.
 *  5. Optionally point "Win Timeline" at a timeline or state to fire on the win.
 *
 * ── How collection works ───────────────────────────────────────────────────
 * Mattercraft's Trigger system pairs nodes by TAG and requires the two sides to
 * have DIFFERENT `isTrigger` values — two `isTrigger = true` nodes never
 * collide. This component builds both sides for you: each orb gets a
 * SphereTrigger with `isTrigger = true`, your player gets one with
 * `isTrigger = false`, and both carry the same private tag. You don't wire
 * anything up. If triggers misbehave in your scene, flip Collision Mode to
 * Distance — same cost, same feel, no trigger system involved.
 *
 * ── Notes ──────────────────────────────────────────────────────────────────
 *  • Every orb shares one material set, so a 30-orb field is still four
 *    materials. Variety comes from a per-orb random orientation (the noise is
 *    sampled in object space) and a per-orb pulse phase.
 *  • The component never touches your camera. The win reveal is yours to
 *    author — point `winTimeline` at it, or listen for `onPortalOpen`.
 *  • Leave `autoStart` off on mobile: the Play tap is what unlocks the
 *    browser's audio context, so autostarting swallows the first sound.
 *
 * @packageDocumentation
 */

import {
  Component,
  ContextManager,
  Event,
  Observable,
  classNameForAlignment,
  HorizontalAlignment,
  VerticalAlignment,
  useOnBeforeRender,
  useOverlay,
} from "@zcomponent/core";
// Audio is not re-exported from the @zcomponent/core barrel — deep path required.
import { Audio } from "@zcomponent/core/lib/components/Audio";
// The synth routes into Mattercraft's audio layer so per-layer volume and
// muting apply to built-in cues exactly as they do to file playback.
import { AudioContextContext, useAudioContext } from "@zcomponent/core/lib/contexts/audiocontextcontext";
import { Group } from "@zcomponent/three/lib/components/Group";
import { GLTF } from "@zcomponent/three/lib/components/models/GLTF";
import { Image as ZImage } from "@zcomponent/three/lib/components/Image";
import { Object3D } from "@zcomponent/three/lib/components/Object3D";
import { useCamera } from "@zcomponent/three/lib/scenecontext";
import { SphereTrigger } from "@zcomponent/three/lib/components/physics/triggers/SphereTrigger";
import { CollisionEvent } from "@zcomponent/three/lib/components/physics/triggers/Trigger";
import * as THREE from "three";

/* ════════════════════════════════════════════════════════════════════════
   SHADERS — orb / glow / portal are byte-identical to the standalone
   components. The beacon is new and lives only here.
   ════════════════════════════════════════════════════════════════════════ */

/** Shared 3D value noise, injected into the orb shader at build time. */
const NOISE3 = /* glsl */ `
float hash31(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 rotY(vec3 p, float a){
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
float fbm3(vec3 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * vnoise3(p);
    p = rotY(p, 0.7) * 2.03;
    a *= 0.5;
  }
  return v;
}`;

const ORB_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main(){
  vLocal   = position;
  vNormalV = normalize(normalMatrix * normal);
  vec4 mv  = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const ORB_FRAG = /* glsl */ `
precision highp float;
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
uniform float uTime;
uniform vec3  uColorCore;
uniform vec3  uColorInner;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform float uHueBlend;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uTurbulence;
uniform float uSurfaceSharpness;
uniform float uSurfaceEnergy;
uniform float uCoreGlow;
uniform float uDensity;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uBrightness;
uniform float uOpacity;
uniform float uPulse;
uniform float uFlare;
uniform float uFlareBoost;
__NOISE3__
void main(){
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  float t = uTime * uSpeed;
  vec3  q = vLocal * uNoiseScale;
  q.y -= t * 0.6;
  q = rotY(q, t * 0.35);
  float w = fbm3(q + vec3(1.7, 9.2, 4.3));
  float n = fbm3(q + (w - 0.5) * uTurbulence);
  float veins = 1.0 - abs(n * 2.0 - 1.0);
  veins = pow(clamp(veins, 0.0, 1.0), uSurfaceSharpness);
  float flare  = uFlare * uFlareBoost;
  float rim    = pow(fres, uRimPower) * uRimIntensity * (1.0 + flare);
  float energy = veins * uSurfaceEnergy * (1.0 + flare * 0.6) + rim;
  float k = clamp(energy, 0.0, 1.6);
  vec3 hue = mix(uColorInner, uColorMid, smoothstep(uHueBlend - 0.35, uHueBlend + 0.35, fres));
  vec3 col = mix(uColorCore, hue,        smoothstep(0.00, 0.50, k));
  col      = mix(col,        uColorEdge, smoothstep(0.50, 1.10, k));
  col *= (uCoreGlow + energy);
  col *= uBrightness * uPulse * (1.0 + flare);
  float alpha = clamp(uDensity + energy, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}`;

const GLOW_VERT = /* glsl */ `
varying vec3  vViewPos;
varying vec3  vCenterV;
varying float vOuter;
void main(){
  vec4 mv  = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vCenterV = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vOuter   = length(modelViewMatrix[0].xyz) * 0.5;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */ `
precision highp float;
varying vec3  vViewPos;
varying vec3  vCenterV;
varying float vOuter;
uniform vec3  uColor;
uniform float uFalloff;
uniform float uIntensity;
uniform float uCoreFrac;
uniform float uPulse;
uniform float uFlare;
uniform float uFlareBoost;
uniform float uOpacity;
void main(){
  vec3  D  = normalize(vViewPos);
  float d  = length(vCenterV - D * dot(vCenterV, D));
  float nr = clamp(d / max(vOuter, 0.0001), 0.0, 1.0);
  float g  = clamp((nr - uCoreFrac) / max(1.0 - uCoreFrac, 0.0001), 0.0, 1.0);
  float f  = pow(1.0 - g, uFalloff);
  float a  = f * uIntensity * uPulse * (1.0 + uFlare * uFlareBoost) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`;

/* ---- ground beacon: a pulsing ring on the floor under each orb --------- */
const BEACON_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BEACON_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3  uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uRingWidth;
uniform float uPoolStrength;
uniform float uWaveSpeed;
uniform float uOpacity;
uniform float uPhase;
void main(){
  vec2  p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float outer = 1.0 - smoothstep(0.95, 1.0, r);

  // static ring near the rim
  float hw   = max(uRingWidth, 0.01);
  float ring = 1.0 - smoothstep(0.0, hw, abs(r - 0.78));

  // soft pool filling the middle
  float pool = (1.0 - smoothstep(0.0, 0.85, r)) * uPoolStrength;

  // one wave travelling outward
  float w    = fract(uTime * uWaveSpeed + uPhase);
  float wave = (1.0 - smoothstep(0.0, 0.13, abs(r - w))) * (1.0 - w);

  float a = (ring + pool + wave * 0.85) * uIntensity * outer;
  gl_FragColor = vec4(uColor * a, a * uOpacity);
}`;

/* ---- portal ------------------------------------------------------------ */
const PORTAL_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PORTAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3  uColorCore;
uniform vec3  uColorInner;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform float uHueBlend;
uniform float uRadius;
uniform float uSwirl;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uTurbulence;
uniform float uArmSharpness;
uniform float uCoreSize;
uniform float uCoreDarkness;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uEdgeWobble;
uniform float uEdgeWobbleSpeed;
uniform float uStarDensity;
uniform float uStarIntensity;
uniform float uHaloSize;
uniform float uHaloIntensity;
uniform float uBrightness;
uniform float uOpacity;
const float TAU = 6.28318530718;
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = vec2(p.x * 1.62 + p.y * 1.18, -p.x * 1.18 + p.y * 1.62);
    a *= 0.5;
  }
  return v;
}
vec2 rot(vec2 p, float t){
  float c = cos(t), s = sin(t);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
void main(){
  vec2  p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime * uSpeed;
  vec2  ring = vec2(cos(a), sin(a)) * 2.4;
  float wob  = fbm(ring + vec2(t * uEdgeWobbleSpeed)) - 0.5;
  float R    = max(uRadius * (1.0 + wob * uEdgeWobble), 0.001);
  float nr   = r / R;
  float disc = 1.0 - smoothstep(0.93, 1.0, nr);
  float twist = uSwirl * log(max(nr, 0.05)) - t;
  vec2  sp    = rot(p / R, twist);
  vec2 warp = vec2(
    fbm(sp * uNoiseScale + vec2(0.0, t * 0.35)),
    fbm(sp * uNoiseScale + vec2(5.2, 1.3) - t * 0.22)
  );
  float n = fbm(sp * uNoiseScale + (warp - 0.5) * uTurbulence);
  float arms = 1.0 - abs(n * 2.0 - 1.0);
  arms = pow(clamp(arms, 0.0, 1.0), uArmSharpness);
  float hole = smoothstep(0.0, max(uCoreSize, 0.001), nr);
  float rim  = pow(clamp(nr, 0.0, 1.0), uRimPower);
  float body = arms * hole * (0.30 + 0.70 * rim);
  float lip  = smoothstep(0.55, 1.0, nr) * rim * uRimIntensity;
  float energy = (body + lip) * disc;
  vec2  g  = p * uStarDensity;
  vec2  gi = floor(g);
  vec2  gf = fract(g) - 0.5;
  float h  = hash21(gi);
  vec2  jitter = (vec2(hash21(gi + 1.7), hash21(gi + 4.3)) - 0.5) * 0.7;
  float star = step(0.90, h) * smoothstep(0.16, 0.0, length(gf - jitter));
  star *= 0.45 + 0.55 * sin(uTime * 2.6 + h * TAU * 9.0);
  star *= disc * smoothstep(0.0, 0.35, nr) * (1.0 - smoothstep(0.75, 1.0, nr));
  float halo = exp(-pow(max(nr - 0.92, 0.0) / max(uHaloSize, 0.001), 1.6)) *
               smoothstep(0.45, 1.0, nr) * uHaloIntensity;
  float k = clamp(energy, 0.0, 1.6);
  float hueMix = smoothstep(uHueBlend - 0.35, uHueBlend + 0.35, nr);
  vec3 hue = mix(uColorInner, uColorMid, hueMix);
  vec3 col = mix(uColorCore, hue,        smoothstep(0.02, 0.50, k));
  col      = mix(col,        uColorEdge, smoothstep(0.50, 1.10, k));
  col *= energy;
  col += uColorEdge * (star * uStarIntensity + halo);
  col += hue * halo * 0.45;
  col *= uBrightness;
  float alpha = clamp(energy + halo + star * uStarIntensity, 0.0, 1.0);
  alpha = max(alpha, disc * uCoreDarkness);
  gl_FragColor = vec4(col, alpha * uOpacity);
}`;

/* ════════════════════════════════════════════════════════════════════════
   ENUMS — each of these renders as a dropdown in the Node Properties panel.
   A real TS string enum is what produces a <select>; the editor shows the
   member NAME and stores the VALUE, which is why every @zdefault below is
   written as the value, not the key.
   ════════════════════════════════════════════════════════════════════════ */

/** How the game detects the player reaching an orb. */
export enum CollisionMode {
  /** Native Mattercraft SphereTrigger pair. Correct and cheap — use this. */
  Trigger = "trigger",
  /** Per-frame distance test. Fallback if triggers misbehave in your scene. */
  Distance = "distance",
}

/** Which screen corner the menu button anchors to. All are notch-safe. */
export enum MenuCorner {
  TopLeft = "topLeft",
  TopRight = "topRight",
  BottomLeft = "bottomLeft",
  BottomRight = "bottomRight",
}

/** What the reward panel's primary button does when it's pressed. */
export enum RewardClaimAction {
  /**
   * Open the How To Claim screen. The default, because the prize is claimed
   * somewhere else entirely — a code typed into another app — and a player
   * sent straight to that app without the code has been sent nowhere.
   */
  Instructions = "instructions",
  /** Follow Claim URL, for a prize that really is one link away. */
  OpenLink = "openLink",
}

/** What the reward panel shows when a round is won. */
export enum RewardModalContent {
  /** The celebration: artwork, headline, Claim button. */
  Reward = "reward",
  /** The redemption steps, so the prize can be claimed on the spot. */
  Instructions = "instructions",
}

/** Which side the HUD column sits on. */
export enum HudAlign {
  Left = "left",
  Center = "center",
  Right = "right",
}

/** Where the on-screen score/timer readout sits. */
export enum HudPosition {
  Top = "top",
  Bottom = "bottom",
  Hidden = "hidden",
}

/** The shape orbs are scattered through. */
export enum SpawnArea {
  /** Anywhere between the min and max radius, evenly spread. */
  Disc = "disc",
  /** Pinned to the max radius — a circle of orbs around the origin. */
  Ring = "ring",
  /** Disc, but height rises toward the centre. Good for terrain that mounds up. */
  Dome = "dome",
}

/** What happens when the round timer reaches zero. */
export enum TimeoutAction {
  /** Fire the fail timeline, then reset and return to idle automatically. */
  ResetAndIdle = "resetAndIdle",
  /** Fire the fail timeline and hold on the fail state until Restart. */
  HoldOnFail = "holdOnFail",
}

/** When the background music starts. */
export enum MusicStart {
  /** As soon as the browser unlocks audio — usually the first tap anywhere. */
  OnLoad = "onLoad",
  /** Only once a round actually begins. Keeps the intro screen quiet. */
  OnGameStart = "onGameStart",
}

/**
 * Glyph shown beside a legend row. Score and Timer draw the round's live
 * values, so the legend always matches the settings above it.
 * Set a Legend Icon Image on the same row to override any of these.
 */
export enum LegendIcon {
  None = "none",
  Orb = "orb",
  Can = "can",
  Score = "score",
  Timer = "timer",
  Menu = "menu",
  Joystick = "joystick",
  Portal = "portal",
  Star = "star",
  Clock = "clock",
  Bolt = "bolt",
}

/** Emblem shown on the reward badge / above the wordmark. */
export enum RewardIcon {
  Trophy = "trophy",
  Medal = "medal",
  Star = "star",
  Bolt = "bolt",
  Orb = "orb",
  Gift = "gift",
  Sparkle = "sparkle",
  None = "none",
}

/** Emblem on a lounge action button. */
export enum LoungeIcon {
  /** A paw with drifting z's. */
  Sleep = "sleep",
  /** A burst of sparkles. */
  Excited = "excited",
  Paw = "paw",
  Heart = "heart",
  Play = "play",
  Star = "star",
  Bolt = "bolt",
  Fish = "fish",
  Ball = "ball",
  Orb = "orb",
  None = "none",
}

/** What the collectibles are made of. */
export enum PickupKind {
  /** The built-in shader orb. */
  Orb = "orb",
  /** A .glb / .gltf from your project files. */
  Model = "model",
  /** An image from your project files, on a plane that faces the camera. */
  Image = "image",
}

/** Where the lounge action row sits horizontally. */
export enum LoungeAlign {
  Left = "left",
  Center = "center",
  Right = "right",
}

/** Read-only-ish view of where the round is up to. */
export enum GameState {
  /** Intro dismissed, waiting for the player to place the AR scene. */
  Placing = "placing",
  Idle = "idle",
  Playing = "playing",
  Paused = "paused",
  Won = "won",
  Failed = "failed",
}

/* ════════════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Colour handling matches PortalShader / OrbShader: authored, mixed and output
 * in DISPLAY space, every material `toneMapped = false`. Pickers are WYSIWYG,
 * the labs and the editor render identically, and nothing depends on
 * three.js shader-chunk names that changed across 0.150–0.164.
 */
function setColor(target: THREE.Color, v: [number, number, number]): THREE.Color {
  return target.setRGB(v[0], v[1], v[2]);
}

/**
 * mulberry32. Mattercraft ships no RNG, and `Math.random()` gives a different
 * course every run — which makes difficulty impossible to tune and demos
 * impossible to rehearse. A seed prop plus this gives reproducible layouts.
 */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a radius that spreads points EVENLY OVER THE AREA of the ring between
 * two radii.
 *
 * The obvious `min + sqrt(u) * (max - min)` is wrong twice over: sqrt only
 * corrects area bias for a full disc starting at zero, and applying it to a
 * lerp between two non-zero radii pushes points outward on top of that. With
 * a 4–16 spawn ring it put 59% of the orbs in the outer half of the area,
 * which reads as "they're all around the edge" — because they are.
 *
 * Uniform over an annulus means r² is uniform between min² and max².
 */
function annulusRadius(rnd: () => number, minR: number, maxR: number): number {
  const a = minR * minR;
  const b = maxR * maxR;
  return Math.sqrt(a + rnd() * (b - a));
}

/**
 * Darken a colour until white text on it clears a contrast ratio.
 *
 * The claim button is filled with the interface accent, and accents are
 * chosen to glow — bright cyan, hot pink — which is exactly the range where
 * white text stops being readable. Rather than hand-pick a second colour per
 * mode and hope, scale the colour down until the maths says it passes. Any
 * accent an author picks then works, including the ones nobody tested.
 */
export function shadeForWhiteText(
  rgb: [number, number, number], target = 4.8,
): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const ratio = (c: [number, number, number]) => {
    const l = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    return 1.05 / (l + 0.05);                     // white against this colour
  };
  let out: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
  // 60 steps of 5% reaches black from any starting colour, so this always
  // terminates — and black is trivially past the target.
  for (let i = 0; i < 60 && ratio(out) < target; i++) {
    out = [out[0] * 0.95, out[1] * 0.95, out[2] * 0.95];
  }
  return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])];
}

/** Black or white — whichever is actually readable on this colour. */
export function bestTextOn(rgb: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  // Contrast against white vs against near-black; pick the winner rather than
  // assuming the accent is light. Authors pick accents for glow, not legibility.
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.06) ? "#fff" : "#04121b";
}

/** The slice of a GLTF component the lounge animation watchdog needs. */
export interface AnimatedModel {
  animationClips: { value: Map<string, THREE.AnimationClip> };
  mixer: { value?: THREE.AnimationMixer };
  streams: { [name: string]: { stop?: () => void } };
}

/**
 * Keys of every model animation actively running right now.
 *
 * "Running" is three.js's meaning: enabled, not paused, actually advancing.
 * A clamped-finished or paused animation is NOT running — it is *parked*,
 * holding its pose at full weight, and telling those two states apart is the
 * entire trick here: the joystick's walk is running, a stale lounge pose is
 * parked.
 */
export function runningAnimKeys(models: AnimatedModel[]): Set<string> {
  const out = new Set<string>();
  models.forEach((m, i) => {
    const mixer = m.mixer.value;
    if (!mixer) return;
    for (const [name, clip] of m.animationClips.value) {
      const a = mixer.existingAction(clip);
      if (a && !a.paused && a.isRunning()) out.add(i + ":" + name);
    }
  });
  return out;
}

/**
 * The first running animation that nothing accounts for — not started by the
 * lounge timeline (owned), not already running when the button was pressed
 * (ambient, e.g. a tail-idle loop), and not one of the streams the latched
 * timeline drives (covers a timeline whose animation block starts late, so
 * it wasn't running yet when we snapshotted).
 *
 * Finding one means an outside system — the joystick controller — has taken
 * over the character, and the lounge pose must let go before the two blend.
 */
export function firstExternalAnim(
  running: Set<string>,
  owned: Set<string>,
  ambient: Set<string>,
  clipStreams: Set<unknown>,
  models: AnimatedModel[],
): string | undefined {
  for (const key of running) {
    if (owned.has(key) || ambient.has(key)) continue;
    const sep = key.indexOf(":");
    const stream = models[+key.slice(0, sep)]?.streams[key.slice(sep + 1)];
    if (stream && clipStreams.has(stream)) continue;
    return key;
  }
  return undefined;
}

/**
 * Stop every animation the lounge owns, and every animation parked holding a
 * pose — while leaving running animations we don't own (the walk) alone.
 * Parked is `enabled && paused`: both a clamped-finished LoopOnce and a
 * stream the timeline system paused mid-play land in that state, and both
 * keep applying their pose every frame until stopped.
 */
export function stopLoungeAnims(models: AnimatedModel[], owned: Set<string>) {
  models.forEach((m, i) => {
    const mixer = m.mixer.value;
    for (const [name, clip] of m.animationClips.value) {
      const a = mixer?.existingAction(clip);
      const parked = !!a && a.enabled && a.paused;
      if (parked || owned.has(i + ":" + name)) m.streams[name]?.stop?.();
    }
  });
}

/**
 * Scale and recentre an arbitrary object so it occupies a sphere of `diameter`
 * centred on its own origin.
 *
 * Both halves matter. A pickup model can arrive at any scale — centimetres,
 * metres, or whatever the exporter felt like — and the game's pickup radius,
 * bob and spawn-height clamp are all expressed in the orb's size, so an
 * unnormalised model either fills the room or vanishes. And models are
 * routinely authored with the origin at the feet or in a corner, which would
 * hang the pickup off its spawn point and out of reach of a collision sphere
 * centred on that point.
 *
 * Returns the scale applied, or 0 if the object has no measurable geometry.
 */
export function fitToDiameter(obj: THREE.Object3D, diameter: number): number {
  /*
   * Measure in the object's OWN space, not with Box3.setFromObject.
   * setFromObject walks matrixWorld, so it folds in every ancestor's
   * transform — the wrapper's own previous fit, the collect burst's scale,
   * the AR placement scale — and the second call would then fit the already
   * fitted size and compound. Composing each descendant's matrix against the
   * inverse of the object's own gives a box that's identical every time,
   * which makes this safe to call whenever Orb Size changes.
   */
  obj.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const box = new THREE.Box3();
  const bb = new THREE.Box3();
  obj.traverse(c => {
    const geom = (c as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    bb.copy(geom.boundingBox).applyMatrix4(rel.multiplyMatrices(toLocal, c.matrixWorld));
    box.union(bb);
  });
  if (box.isEmpty()) return 0;

  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0) || !isFinite(longest)) return 0;

  // Absolute, not relative: assignment keeps repeat calls idempotent where
  // `position.sub(centre)` would drift the model further each time.
  obj.position.copy(box.getCenter(new THREE.Vector3())).negate();
  const scale = diameter / longest;
  const wrapper = obj.parent;
  if (wrapper) wrapper.scale.setScalar(scale);
  else obj.scale.setScalar(scale);
  return scale;
}

/** Clamp + round, for the integer props Mattercraft can't constrain natively. */
function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * "#6ff2ff" → "111,242,255", for building rgba() tints from a colour prop.
 * Accepts #rgb and #rrggbb; anything else returns the fallback rather than
 * emitting a broken custom property that would make a whole rule drop out.
 */
function rgbChannels(hex: string, fallback: string): string {
  const h = (hex || "").trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

interface OrbSlot {
  group: THREE.Group;
  inner: THREE.Group;
  /** Wrapper for a cloned model / image, empty until a custom pickup loads. */
  custom: THREE.Group;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  beacon: THREE.Mesh;
  trigger?: SphereTrigger;
  onHit?: (evt: CollisionEvent) => void;
  home: THREE.Vector3;
  phase: number;
  alive: boolean;
  active: boolean;   // part of the current round at all
  burst: number;     // collect animation 0..1, 0 = not bursting
}

/* ════════════════════════════════════════════════════════════════════════
   BUILT-IN AUDIO

   Every cue is synthesised, so the game has sound the moment you drop the
   component in — nothing to source, load or license. Supply a file for any
   individual cue and that file wins; leave it blank and the synth covers it.

   Everything routes into Mattercraft's audio layer via
   `AudioContextContext.getLayer()`, so per-layer volume and muting still
   apply to the synthesised cues exactly as they do to file playback.

   Signal path:  oscillators → sfxBus / musicBus → master → audio layer
   The two buses let the menu's Music and Sound toggles duck one another
   independently.
   ════════════════════════════════════════════════════════════════════════ */

/** Am — F — C — G, in semitones from A2. Warm, unhurried, loops forever. */
const MUSIC_CHORDS: number[][] = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
const MUSIC_ARP: number[] = [0, -1, 1, 2, -1, 1, 0, -1];

interface NoteOpts {
  freq: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  attack?: number;
  at?: number;
  detune?: number;
  filter?: number;
}

class GameAudio {
  public sfxOn = true;
  public musicOn = true;
  public musicLevel = 0.5;

  private readonly _ctx: AudioContext;
  private readonly _master: GainNode;
  private readonly _sfx: GainNode;
  private readonly _music: GainNode;
  private _hum: { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null = null;
  private _nextBeat = 0;
  private _beat = 0;

  constructor(ctx: AudioContext, out: AudioNode) {
    this._ctx = ctx;
    this._master = ctx.createGain();
    this._master.gain.value = 0.8;
    this._master.connect(out);
    this._sfx = ctx.createGain();
    this._sfx.gain.value = 1;
    this._sfx.connect(this._master);
    this._music = ctx.createGain();
    this._music.gain.value = 0.0001;
    this._music.connect(this._master);
    this._nextBeat = ctx.currentTime + 0.1;
  }

  public setMasterVolume(v: number) { this._master.gain.value = v; }

  public setSfx(on: boolean) {
    this.sfxOn = on;
    const t = this._ctx.currentTime;
    this._sfx.gain.cancelScheduledValues(t);
    this._sfx.gain.linearRampToValueAtTime(on ? 1 : 0.0001, t + 0.15);
  }

  public setMusic(on: boolean) {
    this.musicOn = on;
    const t = this._ctx.currentTime;
    this._music.gain.cancelScheduledValues(t);
    this._music.gain.setValueAtTime(Math.max(0.0001, this._music.gain.value), t);
    this._music.gain.linearRampToValueAtTime(on ? Math.max(0.0001, this.musicLevel) : 0.0001, t + (on ? 1.4 : 0.6));
  }

  private _note(bus: AudioNode, o: NoteOpts) {
    const t0 = o.at ?? this._ctx.currentTime;
    const dur = o.dur ?? 0.3;
    const atk = Math.min(o.attack ?? 0.01, dur * 0.9);
    const gain = Math.max(0.0002, o.gain ?? 0.2);
    const osc = this._ctx.createOscillator();
    const g = this._ctx.createGain();
    osc.type = o.type ?? "sine";
    if (o.detune) osc.detune.value = o.detune;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let tail: AudioNode = osc;
    if (o.filter) {
      const f = this._ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.filter;
      osc.connect(f);
      tail = f;
    }
    tail.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.06);
  }

  /** Rises in pitch with the streak, so a run of pickups reads as a combo. */
  public collect(streak: number, step: number) {
    if (!this.sfxOn) return;
    const f = 523.25 * Math.pow(1 + step, Math.min(Math.max(streak, 1) - 1, 12));
    this._note(this._sfx, { freq: f, dur: 0.26, type: "triangle", gain: 0.24, slideTo: f * 1.5, attack: 0.006 });
    this._note(this._sfx, { freq: f * 2, dur: 0.17, type: "sine", gain: 0.1, attack: 0.004 });
  }

  public win() {
    if (!this.sfxOn) return;
    const t = this._ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._note(this._sfx, { freq: f, dur: 0.7, type: "sine", gain: 0.19, attack: 0.012, at: t + i * 0.09 });
      this._note(this._sfx, { freq: f / 2, dur: 0.85, type: "triangle", gain: 0.07, attack: 0.02, at: t + i * 0.09 });
    });
    this._note(this._sfx, { freq: 110, dur: 1.5, type: "sine", gain: 0.15, slideTo: 220, attack: 0.3, at: t });
  }

  /**
   * The unlock sting. Deliberately different in character from `win()` — that
   * one is a rising major arpeggio, this is a bell stack over a swell, so the
   * two read as two events rather than one long jingle when they overlap.
   */
  public reward() {
    if (!this.sfxOn) return;
    const t = this._ctx.currentTime;
    // Shimmer: a stack of bell partials struck together, decaying at
    // different rates. Non-integer ratios are what make it read as a bell
    // rather than an organ.
    [1, 2.02, 2.99, 4.21, 5.43].forEach((r, i) => {
      this._note(this._sfx, {
        freq: 880 * r, dur: 1.6 - i * 0.2, type: "sine",
        gain: 0.14 / (i + 1.4), attack: 0.006, at: t,
      });
    });
    // Swell underneath, arriving late so the bell lands first.
    this._note(this._sfx, {
      freq: 220, dur: 1.4, type: "triangle", gain: 0.12,
      slideTo: 440, attack: 0.25, at: t + 0.04,
    });
    // Two-note confirm on the tail.
    this._note(this._sfx, { freq: 1318.5, dur: 0.5, type: "sine", gain: 0.1, attack: 0.008, at: t + 0.42 });
    this._note(this._sfx, { freq: 1760, dur: 0.7, type: "sine", gain: 0.09, attack: 0.008, at: t + 0.58 });
  }

  public warn() {
    if (!this.sfxOn) return;
    this._note(this._sfx, { freq: 380, dur: 0.1, type: "square", gain: 0.09 });
  }

  public fail() {
    if (!this.sfxOn) return;
    this._note(this._sfx, { freq: 300, dur: 0.8, type: "sawtooth", gain: 0.13, slideTo: 80, filter: 900 });
    this._note(this._sfx, { freq: 150, dur: 0.9, type: "sine", gain: 0.1, slideTo: 45 });
  }

  /** Low detuned drone while the portal stands open. Fades, never clicks. */
  public portalHum(on: boolean) {
    if (on && !this._hum) {
      const g = this._ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(this._sfx);
      const f = this._ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 460;
      f.Q.value = 3.5;
      f.connect(g);
      const oscs = [-9, 0, 7].map(d => {
        const o = this._ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = 82.4;
        o.detune.value = d;
        o.connect(f);
        o.start();
        return o;
      });
      const lfo = this._ctx.createOscillator();
      const lg = this._ctx.createGain();
      lfo.frequency.value = 0.22;
      lg.gain.value = 170;
      lfo.connect(lg);
      lg.connect(f.frequency);
      lfo.start();
      g.gain.exponentialRampToValueAtTime(0.05, this._ctx.currentTime + 1.4);
      this._hum = { g, oscs, lfo };
    } else if (!on && this._hum) {
      const h = this._hum;
      this._hum = null;
      const t = this._ctx.currentTime;
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setValueAtTime(Math.max(0.0001, h.g.gain.value), t);
      h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const stopAt = t + 0.7;
      h.oscs.forEach(o => o.stop(stopAt));
      h.lfo.stop(stopAt);
    }
  }

  /**
   * Generative loop, scheduled ~0.4s ahead of the audio clock. Call once per
   * frame: WebAudio timing is sample-accurate, so a dropped frame never
   * disturbs the groove.
   */
  public musicTick() {
    if (!this.musicOn) return;
    const now = this._ctx.currentTime;
    let guard = 0;
    while (this._nextBeat < now + 0.4 && guard++ < 32) {
      const t = Math.max(this._nextBeat, now + 0.02);
      const b = this._beat;
      const chord = MUSIC_CHORDS[Math.floor(b / 16) % MUSIC_CHORDS.length];

      if (b % 16 === 0) {
        chord.forEach((semi, i) =>
          this._note(this._music, {
            freq: 110 * Math.pow(2, semi / 12), dur: 8.6, type: "sine",
            gain: 0.075, attack: 2.4, at: t, detune: (i - 1) * 7, filter: 850,
          }),
        );
      }
      const step = MUSIC_ARP[b % MUSIC_ARP.length];
      if (step >= 0) {
        const octave = b % 8 === 4 ? 24 : 12;
        const semi = chord[step % chord.length] + octave;
        this._note(this._music, {
          freq: 110 * Math.pow(2, semi / 12), dur: 1.15, type: "triangle",
          gain: 0.05, attack: 0.02, at: t, filter: 2400,
        });
      }
      this._beat++;
      this._nextBeat = t + 0.42;
    }
  }

  public dispose() {
    this.portalHum(false);
    try { this._master.disconnect(); } catch { /* already gone */ }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════════════════════════════════════ */

interface ConstructorProps {
  /**
   * Maximum orbs this game can ever have on screen. The pool — meshes,
   * materials and triggers — is allocated once at this size, so "Orbs to
   * spawn" can be changed live without rebuilding anything. Keep it close to
   * the largest count you'll actually use.
   *
   * @zui
   * @zdefault 32
   */
  maxOrbs: number;

  /**
   * Sphere tessellation for each orb. 32 is plenty at pickup size; drop to 16
   * if you're running a lot of orbs on low-end mobile.
   *
   * @zui
   * @zdefault 32
   */
  orbDetail: number;

  /**
   * Sound played when an orb is collected. Pick a project file, or paste any
   * URL — the loader is a plain fetch, so both work (subject to CORS).
   * Sound files are constructor props because Mattercraft's Audio component
   * takes its source at construction.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  collectSound: string;

  /**
   * A 3D model to use as the collectible instead of the built-in orb, from
   * your project files. Used when Pickup Kind is Model.
   *
   * It's scaled and recentred automatically to match Orb Size, so it doesn't
   * matter what units it was exported in or where its origin sits. Keep it
   * light — this mesh is duplicated once per orb on the board.
   *
   * @zui
   * @zvalues files *.+(glb|gltf)
   */
  pickupModel: string;

  /**
   * An image to use as the collectible instead of the built-in orb, from your
   * project files. Used when Pickup Kind is Image. Transparency is supported,
   * and the plane keeps the image's aspect ratio.
   *
   * @zui
   * @zvalues files *.+(jpg|jpeg|png|webp)
   */
  pickupImage: string;

  /**
   * Sound played when the target is reached and the portal opens.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  winSound: string;

  /**
   * Artwork shown in the centre of the reward modal, from your project files.
   * Leave it blank for the built-in gold badge.
   *
   * @zui
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  rewardModalImage: string;

  /**
   * Sound for the "digital exclusive unlocked" reveal. Plays a moment after
   * the win cue so the two don't stack on top of each other. Leave blank for
   * the built-in unlock chime.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  rewardSound: string;

  /**
   * Ticking / warning cue played once a second inside the warning window.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  warningSound: string;

  /**
   * Sound played when the round timer runs out.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  failSound: string;

  /**
   * Looping background music. Leave blank for the built-in generative loop —
   * a slow Am-F-C-G pad with a gentle arpeggio that never repeats exactly and
   * costs nothing to ship.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  musicTrack: string;

  /**
   * Looping ambience while the portal stands open. Blank uses the built-in
   * detuned drone.
   *
   * @zui
   * @zvalues files *.+(mp3|wav|ogg|m4a)
   */
  portalHumSound: string;

}

/**
 * Orb Hunt — a complete collect-the-orbs round in one node.
 *
 * Spawns glowing orbs on a seeded layout with ground beacons, collects them
 * when your character walks in, counts down a round timer, and opens an
 * animated portal when the target is reached. Ships its own screen-space menu
 * and HUD, its own sounds, and hooks for your timelines.
 *
 * @zcomponent
 * @zicon sports_esports
 * @ztag three/Object3D/Group/OrbHuntGame
 * @zparents three/Object3D/Group/**
 */
export class OrbHuntGame extends Group {

  /* ══ Setup ══════════════════════════════════════════════════════════ */

  /**
   * Your character — the node that collects orbs by walking into them.
   * Usually the root of your joystick-driven rig.
   *
   * @zui
   * @zgroup Game Setup
   * @zgrouppriority 200
   * @zpriority 100
   * @zvalues nodeids three/Object3D/**
   */
  public playerNode = new Observable<string | undefined>(undefined, () => this._bindPlayer());

  /**
   * How collection is detected.
   *
   * Trigger uses Mattercraft's native SphereTrigger pair — one sphere-sphere
   * overlap per orb per frame, with proper enter/leave hysteresis. Distance is
   * an identical-cost fallback that skips the trigger system entirely; switch
   * to it if triggers don't behave in your scene.
   *
   * @zui
   * @zgroup Game Setup
   * @zgrouppriority 200
   * @zpriority 90
   * @zdefault trigger
   */
  public collisionMode = new Observable(CollisionMode.Trigger, () => this._rebuildTriggers());

  /**
   * Pickup radius around your character, in scene units. Compensated for the
   * player node's world scale, so this is a real-world distance either way.
   *
   * @zui
   * @zgroup Game Setup
   * @zgrouppriority 200
   * @zpriority 80
   * @zdefault 0.7
   */
  public playerRadius = new Observable(0.7, () => this._sizePlayerTrigger());

  /**
   * How far above the player node's origin the pickup sphere sits, in scene
   * units. Character rigs are almost always anchored at the feet, so a sphere
   * centred on the origin can't reach an orb floating at head height — leave
   * this near chest height for the character. Set it to 0 if your player node
   * is already at the character's centre. Clamped to 0–5.
   *
   * @zui
   * @zgroup Game Setup
   * @zgrouppriority 200
   * @zpriority 75
   * @zdefault 0.9
   */
  public playerHeightOffset = new Observable(0.9, v => {
    const n = Math.max(0, Math.min(5, v));
    if (n !== v) this.playerHeightOffset.value = n;
    this._sizePlayerTrigger();
    this._layout();     // the reachable height band moved with it
  });

  /**
   * What the collectibles are. Orb is the built-in shader; Model and Image use
   * the files picked in Pickup Model / Pickup Image, which live under
   * Constructor Props because loading a file rebuilds the scene.
   *
   * Whatever you choose keeps the same size, bob, pickup radius and ground
   * ring — only the thing you see changes.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 105
   * @zdefault orb
   */
  public pickupKind = new Observable(PickupKind.Orb, () => this._applyPickupKind());

  /**
   * Size multiplier for a custom model or image, on top of Orb Size. Use it
   * when the automatic fit reads too big or too small for a particular shape —
   * a long thin object normalises to the same box as a chunky one and can look
   * smaller than it measures. Clamped to 0.1–5.
   *
   * It changes what you see, not what you can reach: the pickup radius stays
   * tied to Orb Size. Scale a pickup up a long way and use Orb Pickup Radius
   * if collection starts to feel tight.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 104
   * @zdefault 1
   */
  public pickupScale = new Observable(1, v => {
    const n = Math.max(0.1, Math.min(5, v));
    if (n !== v) this.pickupScale.value = n;
    this._fitPickup();
  });

  /**
   * How fast a custom model or image turns, in turns per second. Rotation is
   * what stops a static mesh reading as scenery. Set 0 to hold it still.
   * Images face the camera, so this only tilts them — leave it at 0 for those.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 103
   * @zdefault 0.15
   */
  public pickupSpin = new Observable(0.15);

  /**
   * Pickup radius around each orb, as a multiple of the orb's own radius.
   * 1 means "touching the orb"; higher is more forgiving, which mobile
   * joysticks generally need.
   *
   * @zui
   * @zgroup Game Setup
   * @zgrouppriority 200
   * @zpriority 70
   * @zdefault 1.8
   */
  public orbPickupRadius = new Observable(1.8, () => {
    this._sizeOrbTriggers();
    this._layout();     // reach depends on this too
  });

  /**
   * Tag used to pair the player and orb triggers. Mattercraft only tests
   * triggers that share a tag, so this must be unique to this game — change it
   * only if it clashes with triggers elsewhere in your project. Prefix with
   * `local:` to scope it to this ZComponent instance rather than globally.
   *
   * @zui
   * @zgroup Game Setup
   * @zgrouppriority 200
   * @zpriority 60
   * @zdefault orbhunt-pickup
   */
  public triggerTag = new Observable("orbhunt-pickup", () => this._retagTriggers());

  /* ══ Spawning ═══════════════════════════════════════════════════════ */

  /**
   * Layout seed. The same seed always produces the same course — change it for
   * a different arrangement, keep it to rehearse a demo or tune difficulty.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 100
   * @zdefault 1337
   */
  public seed = new Observable(1337, () => {
    this._roundSeed = this.seed.value | 0;
    this._rng = mulberry32(this._roundSeed ^ 0x9e3779b9);
    this._layout();
  });

  /**
   * Draw a fresh layout every round instead of replaying the seeded one. Leave
   * this on for anything the public will play twice — a course that's
   * identical on every restart is solved after one go. Turn it off when you
   * need the same board every time: a demo you're rehearsing, a bug you're
   * chasing, a comparison screenshot. The Seed then decides the layout.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 95
   * @zdefault true
   */
  public randomizeEachRound = new Observable(true);

  /**
   * How many orbs appear. Clamped to the Max Orbs pool size.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 90
   * @zdefault 8
   */
  public orbCount = new Observable(8, () => this._layout());

  /**
   * How many the player must collect to open the portal. Set this below Orbs
   * To Spawn to let them miss a few.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 80
   * @zdefault 6
   */
  public targetCount = new Observable(6, () => this._syncHud());

  /**
   * Shape the orbs are scattered through, measured from this node's origin.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 70
   * @zdefault disc
   */
  public spawnArea = new Observable(SpawnArea.Disc, () => this._layout());

  /**
   * Closest an orb can spawn to the ORIGIN — the centre of the board, not the
   * player. Use Spawn Clearance for the player; this one shapes the field.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 60
   * @zdefault 4
   */
  public spawnMinRadius = new Observable(4, () => this._layout());

  /**
   * How much room to leave around the PLAYER when the board is drawn, in
   * scene units, measured from the edge of their pickup radius.
   *
   * Minimum Spawn Radius keeps orbs away from the origin, which is only the
   * same thing as keeping them away from the player on the very first frame
   * of the very first round. Replay a round after walking somewhere and the
   * board is redrawn around the origin while the player stands wherever they
   * finished — so an orb lands on them and is collected before they see it,
   * which reads as a can that never spawned.
   *
   * A respawning orb has always avoided the player. This is the same rule
   * applied to the initial layout, off the same property, so the two can't
   * drift.
   *
   * 0 turns it off. Raise it if your character moves fast enough to make 1.5
   * units feel like no warning at all.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 58
   * @zdefault 1.5
   */
  public spawnClearance = new Observable(1.5, v => {
    const n = Math.max(0, Math.min(20, v));
    if (n !== v) this.spawnClearance.value = n;
    this._layout();
  });

  /**
   * Furthest an orb can spawn from the origin.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 50
   * @zdefault 16
   */
  public spawnMaxRadius = new Observable(16, () => this._layout());

  /**
   * How high orbs float above this node's ground plane.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 40
   * @zdefault 1.1
   */
  public spawnHeight = new Observable(1.1, () => this._layout());

  /**
   * Random variation applied to the float height, so the field isn't flat.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 30
   * @zdefault 0.5
   */
  public spawnHeightJitter = new Observable(0.5, () => this._layout());

  /**
   * Minimum ground distance between two orbs. Placement rejection-samples
   * against this, so orbs never clump into an accidental freebie.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 20
   * @zdefault 3
   */
  public minSeparation = new Observable(3, () => this._layout());

  /**
   * Furthest an orb may land from its nearest neighbour, in scene units. This
   * is what keeps the field together: without it, orbs scatter across the
   * whole spawn ring and the player spends the round walking rather than
   * collecting — especially in AR, where the ring is bigger than the room.
   *
   * Set 0 to switch it off and let them spread across the full ring. Values
   * below Minimum Separation are impossible to satisfy, so they're raised to
   * it automatically.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 18
   * @zdefault 6
   */
  public maxSpacing = new Observable(6, () => this._layout());

  /**
   * Respawn each orb somewhere new after it's collected, so the field never
   * empties. The target count still ends the round.
   *
   * @zui
   * @zgroup Game Spawning
   * @zgrouppriority 190
   * @zpriority 10
   * @zdefault false
   */
  public respawnCollected = new Observable(false);

  /* ══ Round ══════════════════════════════════════════════════════════ */

  /**
   * Start the round as soon as the experience loads, instead of waiting for
   * the Play button. Leave this off on mobile: the Play tap is also what
   * unlocks the browser's audio context, so autostarting means the first
   * collect sound is silently swallowed.
   *
   * @zui
   * @zgroup Game Round
   * @zgrouppriority 180
   * @zpriority 100
   * @zdefault false
   */
  public autoStart = new Observable(false);

  /**
   * Run a countdown. Off means the portal opens purely on the target count.
   *
   * @zui
   * @zgroup Game Round
   * @zgrouppriority 180
   * @zpriority 90
   * @zdefault true
   */
  public timerEnabled = new Observable(true, () => {
    this._applyUiVisibility();
    this._syncIntro();
    this._syncHud();
  });

  /**
   * Length of the round.
   *
   * @zui
   * @zgroup Game Round
   * @zgrouppriority 180
   * @zpriority 80
   * @ztype time-seconds
   * @zdefault 45
   */
  public roundTime = new Observable(45);

  /**
   * How much time is left when the warning cue starts.
   *
   * @zui
   * @zgroup Game Round
   * @zgrouppriority 180
   * @zpriority 70
   * @ztype time-seconds
   * @zdefault 10
   */
  public warningTime = new Observable(10);

  /**
   * What happens when the clock hits zero.
   *
   * @zui
   * @zgroup Game Round
   * @zgrouppriority 180
   * @zpriority 60
   * @zdefault resetAndIdle
   */
  public timeoutAction = new Observable(TimeoutAction.ResetAndIdle);

  /**
   * Pause on the fail state for this long before resetting, so a fail
   * timeline has room to play.
   *
   * @zui
   * @zgroup Game Round
   * @zgrouppriority 180
   * @zpriority 50
   * @ztype time-seconds
   * @zdefault 2
   */
  public resetDelay = new Observable(2);


  /* ══ Placement ══════════════════════════════════════════════════════ */

  /**
   * Show the built-in Place and Reset buttons, replacing the HTML nodes you'd
   * otherwise wire up by hand. The round waits until the scene is placed, so
   * nobody burns clock hunting for a flat surface.
   *
   * Turn this off if your project handles placement some other way — the game
   * then starts straight from the intro as before.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 100
   * @zdefault true
   */
  public placementEnabled = new Observable(true, () => this._applyPlacementUi());

  /**
   * Start the round the moment placement is confirmed. Off leaves the game
   * idle so the player starts it from the menu themselves.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 90
   * @zdefault true
   */
  public startRoundOnPlace = new Observable(true);

  /**
   * Timeline or state played when the player taps Place. This is where your
   * existing placement animation goes.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 80
   * @zvalues layerclipids
   */
  public placeTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when the player taps Reset placement.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 70
   * @zvalues layerclipids
   */
  public resetTimeline = new Observable<string | undefined>(undefined);

  /**
   * Label on the Place button.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 60
   * @zdefault Place
   */
  public placeButtonLabel = new Observable("Place", () => this._syncPlacement());

  /**
   * Show the orienting line of text above the Place button.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 50
   * @zdefault true
   */
  public showPlaceHint = new Observable(true, () => this._syncPlacement());

  /**
   * What that line says. Line breaks are preserved.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 40
   * @ztype text-multiline
   * @zdefault Point the white circle at any flat surface and tap to place.
   */
  public placeHintText = new Observable(
    "Point the white circle at any flat surface and tap to place.",
    () => this._syncPlacement(),
  );

  /**
   * A second, quieter line under the placement instruction.
   *
   * It exists to get ahead of the one failure every AR session has: tracking
   * drifts, the board ends up in a wall, and the player has no idea that is
   * recoverable. The Reset control only appears AFTER placing, so this is the
   * only moment it can be mentioned before it is needed.
   *
   * Its own property rather than two sentences in Place Hint, so it can carry
   * a quieter treatment, be turned off on its own, and be reworded if you move
   * the Reset button out of the bottom-right corner. Blank hides it.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 38
   * @ztype text-multiline
   * @zdefault Lose tracking later? Tap Reset placement, bottom right.
   */
  public placeHintTip = new Observable(
    "Lose tracking later? Tap Reset placement, bottom right.",
    () => this._syncPlacement(),
  );

  /**
   * Extra space between the hint and the Place button, in pixels.
   *
   * Lifts the text without moving the button, which is the pairing you
   * usually want: the button belongs near the thumb, the instruction wants to
   * be clear of it and further up the view where the camera feed is.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 36
   * @zdefault 18
   */
  public placeHintLift = new Observable(18, v => {
    const n = Math.max(0, Math.min(240, v));
    if (n !== v) this.placeHintLift.value = n;
    this._syncPlacement();
  });

  /**
   * Caption under the circular Reset button.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 30
   * @zdefault Reset placement
   */
  public resetButtonLabel = new Observable("Reset placement", () => this._syncPlacement());

  /**
   * Which corner the Reset button sits in during play. Bottom right keeps it
   * clear of a bottom-left joystick and the top-right menu.
   *
   * @zui
   * @zgroup Game Placement
   * @zgrouppriority 195
   * @zpriority 20
   * @zdefault bottomRight
   */
  public resetCorner = new Observable(MenuCorner.BottomRight, () => this._applyCorner());

  /* ══ Portal ═════════════════════════════════════════════════════════ */

  /**
   * Where the portal appears, relative to this node.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 100
   * @zdefault [0, 1.7, -14]
   */
  public portalPosition = new Observable<[number, number, number]>([0, 1.7, -14], v => {
    this._portal.position.set(v[0], v[1], v[2]);
  });

  /**
   * Which way the portal faces.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 90
   * @ztype angle-degrees
   * @zdefault 0
   */
  public portalRotationY = new Observable(0, v => {
    this._portal.rotation.y = (v * Math.PI) / 180;
  });

  /**
   * Diameter of the portal once fully open.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 80
   * @zdefault 3.4
   */
  public portalSize = new Observable(3.4);

  /**
   * How long the portal takes to swell open.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 70
   * @ztype time-seconds
   * @zdefault 1.8
   */
  public portalOpenTime = new Observable(1.8);

  /**
   * Show the portal from the start instead of hiding it until the target is
   * reached. Useful for signposting where the player is heading.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 60
   * @zdefault false
   */
  public portalVisibleFromStart = new Observable(false, () => this._applyPortalVisibility());

  /**
   * Portal rim / highlight colour.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 50
   * @ztype color-norm-rgb
   * @zdefault [0.81, 0.91, 1]
   */
  public portalColorEdge = new Observable<[number, number, number]>([0.81, 0.91, 1], v => {
    setColor(this._portalU.uColorEdge.value, v);
  });

  /**
   * Portal outer arm colour.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 40
   * @ztype color-norm-rgb
   * @zdefault [0.11, 0.44, 0.94]
   */
  public portalColorMid = new Observable<[number, number, number]>([0.11, 0.44, 0.94], v => {
    setColor(this._portalU.uColorMid.value, v);
  });

  /**
   * Portal inner arm colour.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 30
   * @ztype color-norm-rgb
   * @zdefault [0.08, 0.82, 0.76]
   */
  public portalColorInner = new Observable<[number, number, number]>([0.08, 0.82, 0.76], v => {
    setColor(this._portalU.uColorInner.value, v);
  });

  /**
   * Portal output gain.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 20
   * @zdefault 1.05
   */
  public portalBrightness = new Observable(1.05, v => { this._portalU.uBrightness.value = v; });

  /* ══ Orb look ═══════════════════════════════════════════════════════ */

  /**
   * Diameter of each orb.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 100
   * @zdefault 0.85
   */
  public orbSize = new Observable(0.85, () => {
    this._sizeOrbTriggers();
    this._fitPickup();
    this._layout();
  });

  /**
   * Orb highlight colour.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 90
   * @ztype color-norm-rgb
   * @zdefault [0.87, 0.95, 1]
   */
  public orbColorEdge = new Observable<[number, number, number]>([0.87, 0.95, 1], v => {
    setColor(this._orbU.uColorEdge.value, v);
  });

  /**
   * Orb silhouette colour. Also tints the halo.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 80
   * @ztype color-norm-rgb
   * @zdefault [0.11, 0.44, 0.94]
   */
  public orbColorMid = new Observable<[number, number, number]>([0.11, 0.44, 0.94], v => {
    setColor(this._orbU.uColorMid.value, v);
    setColor(this._glowU.uColor.value, v);
  });

  /**
   * Orb colour where it faces the camera.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 70
   * @ztype color-norm-rgb
   * @zdefault [0.09, 0.8, 0.84]
   */
  public orbColorInner = new Observable<[number, number, number]>([0.09, 0.8, 0.84], v => {
    setColor(this._orbU.uColorInner.value, v);
  });

  /**
   * Orb output gain.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 60
   * @zdefault 1
   */
  public orbBrightness = new Observable(1, v => { this._orbU.uBrightness.value = v; });

  /**
   * How fast the plasma churns across each orb.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 50
   * @zdefault 0.3
   */
  public orbSpeed = new Observable(0.3, v => { this._orbU.uSpeed.value = v; });

  /**
   * How far each orb bobs up and down as it idles.
   *
   * @zui
   * @zgroup Game Orb Look
   * @zgrouppriority 160
   * @zpriority 40
   * @zdefault 0.12
   */
  public orbBob = new Observable(0.12, () => this._layout());   // moves the spawn ceiling

  /* ══ Beacon ═════════════════════════════════════════════════════════ */

  /**
   * Show a glowing ring on the ground under each orb. Tells the player where
   * to walk and stops floating orbs reading as pasted on.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 100
   * @zdefault true
   */
  public beaconEnabled = new Observable(true);

  /**
   * Diameter of the ground ring.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 90
   * @zdefault 2.4
   */
  public beaconSize = new Observable(2.4, v => {
    for (const o of this._orbs) o.beacon.scale.setScalar(v);
  });

  /**
   * Ground ring colour.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 80
   * @ztype color-norm-rgb
   * @zdefault [0.12, 0.73, 0.94]
   */
  public beaconColor = new Observable<[number, number, number]>([0.12, 0.73, 0.94], v => {
    setColor(this._beaconU.uColor.value, v);
  });

  /**
   * Ground ring brightness.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 70
   * @zdefault 0.85
   */
  public beaconIntensity = new Observable(0.85, v => { this._beaconU.uIntensity.value = v; });

  /**
   * Thickness of the ring's outline.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 60
   * @ztype proportion
   * @zdefault 0.09
   */
  public beaconRingWidth = new Observable(0.09, v => { this._beaconU.uRingWidth.value = v; });

  /**
   * How strongly the middle of the ring is filled in.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 50
   * @ztype proportion
   * @zdefault 0.16
   */
  public beaconPool = new Observable(0.16, v => { this._beaconU.uPoolStrength.value = v; });

  /**
   * Speed of the pulse travelling outward through the ring.
   *
   * @zui
   * @zgroup Game Beacon
   * @zgrouppriority 150
   * @zpriority 40
   * @zdefault 0.5
   */
  public beaconWaveSpeed = new Observable(0.5, v => { this._beaconU.uWaveSpeed.value = v; });

  /* ══ Interface ══════════════════════════════════════════════════════ */

  /**
   * Show the built-in menu button and HUD. Turn this off to build your own UI
   * in Mattercraft's 2D layer and drive the game from the events below.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 100
   * @zdefault true
   */
  public uiEnabled = new Observable(true, () => this._applyUiVisibility());

  /**
   * Which corner the glowing menu button sits in. All four use the notch-safe
   * insets, so nothing lands under a camera cutout.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 90
   * @zdefault topRight
   */
  public menuCorner = new Observable(MenuCorner.TopRight, () => this._applyCorner());

  /**
   * Where the score and timer readout sits.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 80
   * @zdefault top
   */
  public hudPosition = new Observable(HudPosition.Top, () => this._applyHudPosition());

  /**
   * Which side of the screen the HUD column sits on. Centre by default,
   * directly under nothing; Left and Right tuck it into a corner instead,
   * clear of the notch.
   *
   * Watch what else lives in the corner you pick: the menu button is top
   * right, mute bottom left, reset bottom right.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 78
   * @zdefault center
   */
  public hudAlign = new Observable(HudAlign.Center, () => this._applyHudPosition());

  /**
   * Space between the clock and the count beneath it, in pixels. 0 butts them
   * together into one slab; 40 or so reads as two separate readouts. Clamped
   * to 0–120.
   *
   * Only the gap is yours to set — the count's actual offset is the clock's
   * measured height plus this, so it stays put if the clock's type size ever
   * changes.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 74
   * @zdefault 10
   */
  public hudGap = new Observable(10, v => {
    const n = Math.max(0, Math.min(120, v));
    if (n !== v) this.hudGap.value = n;
    this._applyHudStack();
    this._applyLogoClearance();
  });

  /**
   * How far down the screen the whole HUD column sits — clock and count
   * together — as a percentage of screen height. Clamped to 0–40, and applied
   * to the bottom edge instead when HUD Position is Bottom.
   *
   * The device's safe-area inset is a FLOOR, not an addition: the column sits
   * wherever you put it, and the inset only stops it climbing under a notch
   * or, in a WebXR session, under the browser's own exit control. So the
   * number here describes where the HUD is rather than where it starts from.
   *
   * Being a percentage rather than pixels is what keeps the placement looking
   * the same on a phone and a tablet.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 75
   * @zdefault 2
   */
  public timerOffset = new Observable(2, v => {
    const n = Math.max(0, Math.min(40, v));
    if (n !== v) this.timerOffset.value = n;   // snap the field to what's used
    this._applyTimerOffset();
    // The column's spacing is measured, so it has to be re-measured after the
    // column moves — otherwise the count keeps the offset it had at the old
    // position and the pair drifts apart.
    this._applyHudStack();
    this._applyLogoClearance();
  });

  /**
   * Accent colour for the UI — button glow, progress bar, active text.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 70
   * @ztype color-norm-rgb
   * @zdefault [0.31, 0.84, 0.91]
   */
  public uiAccent = new Observable<[number, number, number]>([0.31, 0.84, 0.91],
    () => this._applyMode());

  /**
   * The interface colour while Lounge mode is open.
   *
   * The whole UI switches to it — menu, toggles, the Join button, the Place
   * button, the menu button itself — so at any moment the colour tells you
   * which mode you're in without reading a word. That's the job: mode is
   * otherwise invisible state, and invisible state is what makes people press
   * the wrong thing.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 76
   * @ztype color-norm-rgb
   * @zdefault [1, 0.36, 0.71]
   */
  public loungeAccent = new Observable<[number, number, number]>([1, 0.36, 0.71],
    // The reward panel's lounge row wears it too, so that row stays
    // recognisable as the same destination the menu offers.
    () => { this._applyMode(); this._syncRewardModalTheme(); });

  /**
   * Title shown at the top of the menu.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 60
   * @zdefault Cola Run
   */
  public menuTitle = new Observable("Cola Run", () => this._syncMenu());

  /**
   * Word above the score in the HUD. It named the pickup back when the pickup
   * was always an orb; with Pickup Kind able to be anything, it has to be
   * yours. Keep it short — it sits in a narrow top-left block.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 58
   * @zdefault Cans
   */
  public scoreLabel = new Observable("Cans", () => this._syncHudLabels());

  /**
   * Word above the countdown in the HUD.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 57
   * @zdefault Time
   */
  public timeLabel = new Observable("Time", () => this._syncHudLabels());

  /**
   * Show a quick mute button, so players can silence the game without opening
   * the menu. It mutes music and effects together and stays in sync with the
   * two toggles inside the menu.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 50
   * @zdefault true
   */
  public soundToggleEnabled = new Observable(true, () => this._applyUiVisibility());

  /**
   * Which corner the quick mute button sits in. Check this against your own
   * on-screen controls — a bottom-left joystick will want it moved.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 40
   * @zdefault bottomLeft
   */
  public soundToggleCorner = new Observable(MenuCorner.BottomLeft, () => this._applyCorner());

  /**
   * How high the dialogs sit above everything else on screen.
   *
   * Mattercraft's overlay gives its children no stacking order of their own,
   * so whatever was added to the scene LAST paints on top — which is how an
   * on-screen joystick ends up drawn over a modal's own buttons, swallowing
   * the taps meant for them. This component stacks itself explicitly instead:
   * the logo at the bottom, then the HUD, then the corner controls, then the
   * celebration, then every dialog at this number, and the image viewer one
   * above that.
   *
   * The default clears anything you are realistically stacking against. Raise
   * it only if something else in your scene sets a z-index higher still.
   *
   * @zui
   * @zgroup Game Interface
   * @zgrouppriority 140
   * @zpriority 30
   * @zdefault 2000000
   */
  public modalLayer = new Observable(2000000, () => this._applyLayerOrder());

  /* ══ Logo ═══════════════════════════════════════════════════════════ */

  /**
   * Your logo, watermarked over the AR view. Pick a project file or paste a
   * URL. Leave it empty and nothing is drawn at all.
   *
   * A transparent PNG or an SVG works best — the view behind it is a live
   * camera feed, so a logo on a solid white rectangle will look pasted on.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 100
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public logoImage = new Observable("", () => this._applyLogo());

  /**
   * Where tapping the logo goes. Blank makes it a plain watermark again.
   *
   * It always opens in a NEW tab, and that is not a property. Navigating the
   * current tab away ends the WebXR session, drops the placed board and puts
   * the player back at the camera-permission prompt if they return — an
   * unrecoverable exit dressed up as a link.
   *
   * Only the image itself becomes tappable, never its anchor: the anchor is a
   * full-width overlay child, and Mattercraft's core CSS forces
   * pointer-events:auto on those with an ID selector no class can outrank, so
   * making the wrapper interactive would swallow every tap on the AR view
   * behind it.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 55
   * @zdefault https://medialife.ai/
   */
  public logoUrl = new Observable("https://medialife.ai/", () => this._applyLogo());

  /**
   * What a screen reader announces for that link. A link whose only content
   * is an image with no alt text is announced as its URL, which is no help to
   * anybody. Ignored when Logo URL is blank.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 54
   * @zdefault Visit MEDIALIFE
   */
  public logoLinkLabel = new Observable("Visit MEDIALIFE", () => this._applyLogo());

  /**
   * Which corner the logo sits in. Top left by default.
   *
   * The score block and the timer both move down to make room rather than
   * sitting under the logo, so top left stays usable at any logo size.
   *
   * The other three corners hold controls that do NOT move out of the way —
   * the menu button top right, mute bottom left, reset bottom right — so
   * check the logo against those before putting a large one there.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 90
   * @zdefault topLeft
   */
  public logoCorner = new Observable(MenuCorner.TopLeft, () => this._applyLogo());

  /**
   * Logo width, as a percentage of the screen's SHORTER side.
   *
   * Measuring against the shorter side is what makes it survive rotation: a
   * percentage of width would double in size when a phone turns landscape.
   * Pair it with Logo Max Width so it stops growing on a desktop monitor.
   * Clamped to 4–60.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 80
   * @zdefault 22
   */
  public logoSize = new Observable(22, v => {
    const n = Math.max(4, Math.min(60, v));
    if (n !== v) this.logoSize.value = n;
    this._applyLogo();
  });

  /**
   * Ceiling on the logo's width in pixels, so it doesn't become a billboard
   * on a large screen. Clamped to 24–600.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 70
   * @zdefault 160
   */
  public logoMaxWidth = new Observable(160, v => {
    const n = Math.max(24, Math.min(600, v));
    if (n !== v) this.logoMaxWidth.value = n;
    this._applyLogo();
  });

  /**
   * Gap between the logo and the screen edge, sideways, in pixels. Measured
   * from inside the notch, so it never lands under a camera cutout.
   * Clamped to 0–200.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 60
   * @zdefault 14
   */
  public logoOffsetX = new Observable(14, v => {
    const n = Math.max(0, Math.min(200, v));
    if (n !== v) this.logoOffsetX.value = n;
    this._applyLogo();
  });

  /**
   * Gap between the logo and the top or bottom edge, in pixels. Clamped to
   * 0–200.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 50
   * @zdefault 14
   */
  public logoOffsetY = new Observable(14, v => {
    const n = Math.max(0, Math.min(200, v));
    if (n !== v) this.logoOffsetY.value = n;
    this._applyLogo();
  });

  /**
   * Logo opacity. Dropping it to around 0.8 keeps a logo present without it
   * competing with the game for attention.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 40
   * @ztype proportion
   * @zdefault 1
   */
  public logoOpacity = new Observable(1, () => this._applyLogo());

  /**
   * Keep the logo on screen during a round. Off shows it only when the game
   * is not being played — the intro, the menu, the lounge, the placement
   * step — which keeps the playfield clear.
   *
   * @zui
   * @zgroup Game Logo
   * @zgrouppriority 145
   * @zpriority 30
   * @zdefault true
   */
  public logoInGame = new Observable(true, () => this._applyUiVisibility());

  /* ══ Audio ══════════════════════════════════════════════════════════ */

  /**
   * Master volume for all four game sounds.
   *
   * @zui
   * @zgroup Game Audio
   * @zgrouppriority 130
   * @zpriority 100
   * @ztype proportion
   * @zdefault 0.7
   */
  public volume = new Observable(0.7, v => {
    this._sfxCollect.volume.value = v;
    this._sfxWin.volume.value = v;
    this._sfxReward.volume.value = v;
    this._sfxWarn.volume.value = v;
    this._sfxFail.volume.value = v;
    this._sfxHum.volume.value = v;
    this._audio?.setMasterVolume(v);
  });

  /**
   * How much the collect sound pitches up with each orb in a streak. 0 plays
   * the same pitch every time; 0.06 gives a rising combo without going shrill.
   * Capped at 12 steps.
   *
   * @zui
   * @zgroup Game Audio
   * @zgrouppriority 130
   * @zpriority 90
   * @zdefault 0.06
   */
  public collectPitchStep = new Observable(0.06);

  /**
   * Sound effects on. Also exposed as a toggle in the player's menu, and the
   * two stay in sync in both directions.
   *
   * @zui
   * @zgroup Game Audio
   * @zgrouppriority 130
   * @zpriority 80
   * @zdefault true
   */
  public soundEnabled = new Observable(true, v => {
    this._audio?.setSfx(v);
    this._syncToggles();
  });

  /**
   * Background music on. Also a toggle in the player's menu.
   *
   * @zui
   * @zgroup Game Audio
   * @zgrouppriority 130
   * @zpriority 70
   * @zdefault true
   */
  public musicEnabled = new Observable(true, v => {
    this._audio?.setMusic(v);
    this._applyMusicSource();
    this._syncToggles();
  });

  /**
   * Level of the background music, relative to the master volume.
   *
   * @zui
   * @zgroup Game Audio
   * @zgrouppriority 130
   * @zpriority 60
   * @ztype proportion
   * @zdefault 0.5
   */
  /**
   * When the background music starts. On Load begins as soon as the browser
   * unlocks audio; On Game Start keeps the intro screen quiet and only brings
   * the music in once a round begins.
   *
   * @zui
   * @zgroup Game Audio
   * @zgrouppriority 130
   * @zpriority 55
   * @zdefault onGameStart
   */
  public musicStart = new Observable(MusicStart.OnGameStart, () => this._applyMusicSource());

  public musicVolume = new Observable(0.5, v => {
    if (this._audio){
      this._audio.musicLevel = v;
      if (this.musicEnabled.value) this._audio.setMusic(true);
    }
    this._sfxMusic.volume.value = v;
  });

  /* ══ Intro ══════════════════════════════════════════════════════════ */

  /**
   * Show the how-to-play modal when the experience loads. Recommended: its
   * Start button is the user gesture that unlocks browser audio, so the first
   * collect sound is actually audible.
   *
   * @zui
   * @zgroup Game Intro
   * @zgrouppriority 125
   * @zpriority 100
   * @zdefault true
   */
  public showIntroOnLoad = new Observable(true);

  /**
   * Heading on the intro modal.
   *
   * @zui
   * @zgroup Game Intro
   * @zgrouppriority 125
   * @zpriority 90
   * @zdefault Cola Run
   */
  public introTitle = new Observable("Cola Run", () => this._syncIntro());

  /**
   * Intro copy, shown under the heading. Line breaks are preserved.
   *
   * @zui
   * @zgroup Game Intro
   * @zgrouppriority 125
   * @zpriority 80
   * @ztype text-multiline
   * @zdefault Gather these scattered Cola cans before the clock runs out. Collect enough and the portal will open.
   */
  public introBody = new Observable(
    "Gather these scattered Cola cans before the clock runs out. Collect enough and the portal will open.",
    () => this._syncIntro(),
  );

  /**
   * Label on the intro's primary button.
   *
   * @zui
   * @zgroup Game Intro
   * @zgrouppriority 125
   * @zpriority 70
   * @zdefault Start playing
   */
  public introButtonLabel = new Observable("Start playing", () => this._syncIntro());

  /**
   * Label on the intro's secondary button when Lounge mode is off. With it on,
   * Lounge Button Label is used instead.
   *
   * @zui
   * @zgroup Game Intro
   * @zgrouppriority 125
   * @zpriority 55
   * @zdefault Maybe later
   */
  public introDismissLabel = new Observable("Maybe later", () => this._syncIntro());

  /**
   * Artwork across the top of the intro modal. 16:9 crops best. Pick a project
   * file or paste a URL; leave blank to hide the image and show text only.
   *
   * @zui
   * @zgroup Game Intro
   * @zgrouppriority 125
   * @zpriority 60
   * @zvalues files *.+(jpg|jpeg|png|webp)
   */
  public introImage = new Observable("", () => this._applyIntroImage());

  /* ── Legend row 1 ── */

  /**
   * Row 1 of the intro legend.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 1
   * @zgrouppriority 124
   * @zpriority 100
   * @zdefault can
   */
  public legend1Icon = new Observable(LegendIcon.Can, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 1
   * @zgrouppriority 124
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend1IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 1
   * @zgrouppriority 124
   * @zpriority 80
   * @zdefault Collect the cans
   */
  public legend1Title = new Observable("Collect the cans", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 1
   * @zgrouppriority 124
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault Walk into a can to pick it up. Look for the ring of light on the ground beneath each one.
   */
  public legend1Text = new Observable("Walk into a can to pick it up. Look for the ring of light on the ground beneath each one.", () => this._syncIntro());

  /* ── Legend row 2 ── */

  /**
   * Row 2 of the intro legend.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 2
   * @zgrouppriority 123
   * @zpriority 100
   * @zdefault score
   */
  public legend2Icon = new Observable(LegendIcon.Score, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 2
   * @zgrouppriority 123
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend2IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 2
   * @zgrouppriority 123
   * @zpriority 80
   * @zdefault Score \u2014 top left
   */
  public legend2Title = new Observable("Score \u2014 top left", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 2
   * @zgrouppriority 123
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault How many you've gathered, and how many you still need.
   */
  public legend2Text = new Observable("How many you've gathered, and how many you still need.", () => this._syncIntro());

  /* ── Legend row 3 ── */

  /**
   * Row 3 of the intro legend.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 3
   * @zgrouppriority 122
   * @zpriority 100
   * @zdefault timer
   */
  public legend3Icon = new Observable(LegendIcon.Timer, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 3
   * @zgrouppriority 122
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend3IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 3
   * @zgrouppriority 122
   * @zpriority 80
   * @zdefault Timer \u2014 top centre
   */
  public legend3Title = new Observable("Timer \u2014 top centre", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 3
   * @zgrouppriority 122
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault Seconds remaining. It turns orange when you're running out.
   */
  public legend3Text = new Observable("Seconds remaining. It turns orange when you're running out.", () => this._syncIntro());

  /* ── Legend row 4 ── */

  /**
   * Row 4 of the intro legend.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 4
   * @zgrouppriority 121
   * @zpriority 100
   * @zdefault menu
   */
  public legend4Icon = new Observable(LegendIcon.Menu, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 4
   * @zgrouppriority 121
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend4IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 4
   * @zgrouppriority 121
   * @zpriority 80
   * @zdefault Menu button
   */
  public legend4Title = new Observable("Menu button", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 4
   * @zgrouppriority 121
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault Tap the glowing button in the corner for play, pause, restart and sound.
   */
  public legend4Text = new Observable("Tap the glowing button in the corner for play, pause, restart and sound.", () => this._syncIntro());

  /* ── Legend row 5 ── */

  /**
   * A spare row. Give it a title or some text and it appears in the intro; leave both blank and it stays hidden.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 5
   * @zgrouppriority 120
   * @zpriority 100
   * @zdefault none
   */
  public legend5Icon = new Observable(LegendIcon.None, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 5
   * @zgrouppriority 120
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend5IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 5
   * @zgrouppriority 120
   * @zpriority 80
   * @zdefault 
   */
  public legend5Title = new Observable("", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 5
   * @zgrouppriority 120
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault 
   */
  public legend5Text = new Observable("", () => this._syncIntro());

  /* ── Legend row 6 ── */

  /**
   * A spare row. Give it a title or some text and it appears in the intro; leave both blank and it stays hidden.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 6
   * @zgrouppriority 119
   * @zpriority 100
   * @zdefault none
   */
  public legend6Icon = new Observable(LegendIcon.None, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 6
   * @zgrouppriority 119
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend6IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 6
   * @zgrouppriority 119
   * @zpriority 80
   * @zdefault 
   */
  public legend6Title = new Observable("", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 6
   * @zgrouppriority 119
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault 
   */
  public legend6Text = new Observable("", () => this._syncIntro());

  /* ── Legend row 7 ── */

  /**
   * A spare row. Give it a title or some text and it appears in the intro; leave both blank and it stays hidden.
   *
   * Icon for this row. Score and Timer draw the round's live values.
   *
   * @zui
   * @zgroup Intro Legend 7
   * @zgrouppriority 118
   * @zpriority 100
   * @zdefault none
   */
  public legend7Icon = new Observable(LegendIcon.None, () => this._syncIntro());

  /**
   * Optional image for this row, overriding the icon above. Square artwork
   * works best. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Intro Legend 7
   * @zgrouppriority 118
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|svg)
   */
  public legend7IconImage = new Observable("", () => this._syncIntro());

  /**
   * Bold heading for this row.
   *
   * @zui
   * @zgroup Intro Legend 7
   * @zgrouppriority 118
   * @zpriority 80
   * @zdefault 
   */
  public legend7Title = new Observable("", () => this._syncIntro());

  /**
   * Explanatory line under the heading. Blank both this and the heading to
   * hide the row entirely.
   *
   * @zui
   * @zgroup Intro Legend 7
   * @zgrouppriority 118
   * @zpriority 70
   * @ztype text-multiline
   * @zdefault 
   */
  public legend7Text = new Observable("", () => this._syncIntro());


  /* ══ Digital Exclusive ══════════════════════════════════════════════
     The reward moment: a celebration when the target is reached, and a
     standing Claim call-to-action in the menu. The CTA does NOT depend on
     finishing the round — the exclusive is already theirs; the game is the
     experience around it.                                                  */

  /**
   * Show a celebration when the target is reached and the portal opens.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 100
   * @zdefault true
   */
  public rewardEnabled = new Observable(true);

  /**
   * How long the portal's hum keeps playing after it opens, in seconds. The
   * drone is atmosphere for the reveal, not a permanent state — left running
   * it becomes the sound of the app being stuck.
   *
   * 0 keeps it going until the round resets. If Portal Hide After is set, the
   * hum stops with the portal regardless of this. Clamped to 0–120.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 25
   * @zdefault 6
   */
  public portalHumSeconds = new Observable(6, v => {
    const n = Math.max(0, Math.min(120, v));
    if (n !== v) this.portalHumSeconds.value = n;
  });

  /**
   * Seconds the portal stays open before closing itself, counted from the
   * moment it finishes opening. 0 leaves it open until the round resets.
   *
   * It closes with the same animation it opened with, in reverse, and takes
   * the hum with it — so if you set this, you don't need to think about the
   * sound at all.
   *
   * @zui
   * @zgroup Game Portal
   * @zgrouppriority 170
   * @zpriority 24
   * @zdefault 0
   */
  public portalHideAfter = new Observable(0, v => {
    const n = Math.max(0, Math.min(300, v));
    if (n !== v) this.portalHideAfter.value = n;
  });

  /**
   * Show the full-screen gradient wordmark — cinematic, best when the reveal
   * itself is the hero.
   *
   * The three pieces of the reward moment are independent switches rather than
   * one dropdown, so any combination works: wordmark only, modal only, badge
   * plus modal, or all three in sequence. Turn everything off here and use
   * Reward Timeline if you'd rather author the whole moment yourself.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 97
   * @zdefault true
   */
  public rewardWordmark = new Observable(true);

  /**
   * Show the console-style achievement pill at the bottom of the screen. It
   * stays out of the way, so it reads well over a portal reveal.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 96
   * @zdefault true
   */
  public rewardBadge = new Observable(true);

  /**
   * Small line above the headline. Keep it short — it's set in wide caps.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 92
   * @zdefault Unlocked
   */
  public rewardKicker = new Observable("Unlocked", () => this._syncReward());

  /**
   * The headline itself. Short, punchy and uppercase reads best in the
   * wordmark style — long sentences shrink to fit and lose their impact.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 88
   * @zdefault DIGITAL EXCLUSIVE
   */
  public rewardTitle = new Observable("DIGITAL EXCLUSIVE", () => this._syncReward());

  /**
   * Supporting line under the headline, and the second line on the badge.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 84
   * @ztype text-multiline
   * @zdefault You've unlocked your digital exclusive.
   */
  public rewardMessage = new Observable(
    "You've unlocked your digital exclusive.", () => this._syncReward());

  /**
   * Emblem shown on the badge and above the wordmark.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 80
   * @zdefault trophy
   */
  public rewardIcon = new Observable(RewardIcon.Trophy, () => this._syncReward());

  /**
   * Start of the headline gradient — the colour at the top of the letters.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 76
   * @ztype color
   * @zdefault #6ff2ff
   */
  public rewardColorA = new Observable("#6ff2ff", () => this._syncRewardTheme());

  /**
   * End of the headline gradient — the colour at the bottom of the letters.
   * A hue shift between the two is what makes the wordmark read as a gradient
   * rather than a flat tint.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 72
   * @ztype color
   * @zdefault #a07bff
   */
  public rewardColorB = new Observable("#a07bff", () => this._syncRewardTheme());

  /**
   * Icon colour, and the tint of the badge's glow.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 68
   * @ztype color
   * @zdefault #eafcff
   */
  public rewardIconColor = new Observable("#eafcff", () => this._syncRewardTheme());

  /**
   * Electric treatment — a light sweep across the letters, arcing filaments
   * and a burst of sparks. Turn it off for a calmer, more premium reveal.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 64
   * @zdefault true
   */
  public rewardElectric = new Observable(true, () => this._syncRewardTheme());

  /**
   * Beat of silence between the portal opening and the celebration, in
   * seconds. A short pause lets the portal register before the text lands.
   * Clamped to 0–5.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 60
   * @zdefault 0.45
   */
  public rewardDelay = new Observable(0.45, v => {
    const n = Math.max(0, Math.min(5, v));
    if (n !== v) this.rewardDelay.value = n;
  });

  /**
   * How long the celebration stays on screen, in seconds. In Both mode this
   * is the wordmark's time; the badge holds for a little longer. Clamped to
   * 1–20.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 56
   * @zdefault 3.4
   */
  public rewardDuration = new Observable(3.4, v => {
    const n = Math.max(1, Math.min(20, v));
    if (n !== v) this.rewardDuration.value = n;
  });

  /* ── the reward modal ──────────────────────────────────────────────── */

  /**
   * Show a centred modal at the end of the round — glass panel, glowing
   * border, artwork and a claim button. This is the conversion moment: the
   * wordmark and badge celebrate, the modal is what someone acts on.
   *
   * It appears after the wordmark has finished, so the two never fight.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 100
   * @zdefault true
   */
  public rewardModal = new Observable(true, () => this._syncRewardModal());

  /* ══ Instructions ═══════════════════════════════════════════════════ */

  /**
   * What the reward panel shows when the round is won.
   *
   * Reward is the celebration: artwork, a headline and the Claim button.
   * Instructions is the same panel carrying the redemption steps instead —
   * for a prize that lives somewhere else, the moment someone wins is the
   * moment they want to know how to get it, and sending them hunting through
   * a menu for that loses people.
   *
   * The steps themselves are the same ones the How To Claim screen shows, so
   * there is one set of copy to keep right rather than two.
   *
   * @zui
   * @zgroup Game Instructions
   * @zgrouppriority 162
   * @zpriority 100
   * @zdefault reward
   */
  public rewardModalContent = new Observable(RewardModalContent.Reward,
    () => this._syncRewardModal());

  /**
   * Heading on the How To Claim screen.
   *
   * @zui
   * @zgroup Game Instructions
   * @zgrouppriority 162
   * @zpriority 95
   * @zdefault How to claim your item
   */
  public instructionsTitle = new Observable("How to claim your item",
    () => this._syncInstructions());

  /**
   * Label on the menu row that opens the How To Claim screen. Blank hides
   * the row, leaving the reward panel as the only route to the steps.
   *
   * @zui
   * @zgroup Game Instructions
   * @zgrouppriority 162
   * @zpriority 90
   * @zdefault How to claim
   */
  public instructionsMenuLabel = new Observable("How to claim",
    () => { this._syncInstructions(); this._syncMenu(); });

  /**
   * Label on the button that closes the How To Claim screen.
   *
   * @zui
   * @zgroup Game Instructions
   * @zgrouppriority 162
   * @zpriority 85
   * @zdefault Got it
   */
  public instructionsCloseLabel = new Observable("Got it",
    () => this._syncInstructions());

  /**
   * What a screen reader announces for a step's screenshot.
   *
   * Every screenshot in the steps is tappable — at step width they're too
   * small to read the thing they point at, so tapping one opens it full
   * screen with a zoom. This is the name of that control. It lives here
   * rather than hardcoded so a non-English build can translate it.
   *
   * @zui
   * @zgroup Game Instructions
   * @zgrouppriority 162
   * @zpriority 80
   * @zdefault View image full screen
   */
  public imageViewerOpenLabel = new Observable("View image full screen",
    () => this._syncInstructions());

  /**
   * Step 1. A step with no text is skipped entirely, so blank the ones you
   * don't need rather than hiding them some other way.
   *
   * @zui
   * @zgroup Instruction Step 1
   * @zgrouppriority 161
   * @zpriority 100
   * @ztype text-multiline
   * @zdefault Join Evade on Roblox.
   */
  public step1Text = new Observable("Join Evade on Roblox.",
    () => this._syncInstructions());

  /**
   * Screenshot shown under step 1. Pick a project file or paste a URL.
   *
   * @zui
   * @zgroup Instruction Step 1
   * @zgrouppriority 161
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|gif)
   */
  public step1Image = new Observable("", () => this._syncInstructions());

  /**
   * A link button under step 1 — where "Join Evade" actually goes. Leave it
   * blank for no button. A tappable button beats a pasted URL: nobody types
   * a roblox.com link off a phone screen.
   *
   * @zui
   * @zgroup Instruction Step 1
   * @zgrouppriority 161
   * @zpriority 80
   * @zdefault https://www.roblox.com/games/9872472334/Evade
   */
  public step1Link = new Observable("https://www.roblox.com/games/9872472334/Evade",
    () => this._syncInstructions());

  /**
   * Label on step 1's link button.
   *
   * @zui
   * @zgroup Instruction Step 1
   * @zgrouppriority 161
   * @zpriority 70
   * @zdefault Open Evade on Roblox
   */
  public step1LinkLabel = new Observable("Open Evade on Roblox",
    () => this._syncInstructions());

  /**
   * Step 2.
   *
   * @zui
   * @zgroup Instruction Step 2
   * @zgrouppriority 160
   * @zpriority 100
   * @ztype text-multiline
   * @zdefault Open the Codes panel — it's the bird icon on the right of the main menu.
   */
  public step2Text = new Observable(
    "Open the Codes panel — it's the bird icon on the right of the main menu.",
    () => this._syncInstructions());

  /**
   * Screenshot shown under step 2.
   *
   * @zui
   * @zgroup Instruction Step 2
   * @zgrouppriority 160
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|gif)
   */
  public step2Image = new Observable("", () => this._syncInstructions());

  /**
   * Step 3.
   *
   * @zui
   * @zgroup Instruction Step 3
   * @zgrouppriority 159
   * @zpriority 100
   * @ztype text-multiline
   * @zdefault Enter BOBO_COLA_RDC26 to claim your free UGC item.
   */
  public step3Text = new Observable(
    "Enter BOBO_COLA_RDC26 to claim your free UGC item.",
    () => this._syncInstructions());

  /**
   * Screenshot shown under step 3.
   *
   * @zui
   * @zgroup Instruction Step 3
   * @zgrouppriority 159
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|gif)
   */
  public step3Image = new Observable("", () => this._syncInstructions());

  /**
   * The code itself, shown as a copyable chip in whichever step mentions it.
   * Blank to leave it out. Tapping it copies the code to the clipboard.
   *
   * @zui
   * @zgroup Instruction Step 3
   * @zgrouppriority 159
   * @zpriority 80
   * @zdefault BOBO_COLA_RDC26
   */
  public claimCode = new Observable("BOBO_COLA_RDC26", () => this._syncInstructions());

  /**
   * Step 4, blank by default — room for one more step without a rebuild.
   *
   * @zui
   * @zgroup Instruction Step 4
   * @zgrouppriority 158
   * @zpriority 100
   * @ztype text-multiline
   */
  public step4Text = new Observable("", () => this._syncInstructions());

  /**
   * Screenshot shown under step 4.
   *
   * @zui
   * @zgroup Instruction Step 4
   * @zgrouppriority 158
   * @zpriority 90
   * @zvalues files *.+(jpg|jpeg|png|webp|gif)
   */
  public step4Image = new Observable("", () => this._syncInstructions());

  /* ══ Timeout ════════════════════════════════════════════════════════ */

  /**
   * Show a panel when the clock runs out, offering a rematch.
   *
   * Without it the round just stops — the fail sound plays, the board either
   * freezes or quietly resets, and the player is left looking at an AR view
   * with no idea what happened or what to do. The panel names the outcome and
   * gives two ways forward.
   *
   * It takes over from Timeout Action: with the panel on, the round waits for
   * the player instead of resetting itself, because a board that rebuilds
   * underneath an open dialog reads as a glitch.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 100
   * @zdefault true
   */
  public timeoutModal = new Observable(true, () => this._syncTimeoutModal());

  /**
   * Heading on the timeout panel. Short — it's the loudest line on screen.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 90
   * @zdefault Out of time
   */
  public timeoutTitle = new Observable("Out of time", () => this._syncTimeoutModal());

  /**
   * The line under the heading. Say what happened in the player's terms.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 80
   * @ztype text-multiline
   * @zdefault You didn't collect enough cans in time.
   */
  public timeoutBody = new Observable(
    "You didn't collect enough cans in time.", () => this._syncTimeoutModal());

  /**
   * Label on the primary button, which starts a fresh round.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 70
   * @zdefault Retry
   */
  public timeoutRetryLabel = new Observable("Retry", () => this._syncTimeoutModal());

  /**
   * Label on the second button, which opens Lounge mode. The button hides
   * itself when Lounge Mode is off, leaving Retry as the only way on.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 60
   * @zdefault Go to lounge mode
   */
  public timeoutLoungeLabel = new Observable("Go to lounge mode",
    () => this._syncTimeoutModal());

  /**
   * Seconds between the clock hitting zero and the panel appearing. A short
   * pause lets the fail sound and the fail timeline land first — arriving on
   * the same frame as the buzzer reads as an error message. Clamped to 0–10.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 50
   * @zdefault 0.8
   */
  public timeoutDelay = new Observable(0.8, v => {
    const n = Math.max(0, Math.min(10, v));
    if (n !== v) this.timeoutDelay.value = n;
  });

  /**
   * Edge light and glow colour for the timeout panel. Warm by default, so it
   * reads as a setback at a glance rather than as another reward.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 40
   * @ztype color-hex
   * @zdefault #ff8a6b
   */
  public timeoutAccent = new Observable("#ff8a6b", () => this._syncTimeoutTheme());

  /**
   * Second colour in the timeout panel's edge gradient.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 30
   * @ztype color-hex
   * @zdefault #ff5470
   */
  public timeoutAccent2 = new Observable("#ff5470", () => this._syncTimeoutTheme());

  /**
   * Seconds between whatever ran before the modal finishing and the modal
   * opening. With the wordmark on, that's measured from the end of the
   * wordmark; with nothing before it, from the moment the round is won.
   *
   * Measuring from the end rather than from the win is deliberate: changing
   * Reward Duration would otherwise silently pull the modal back on top of
   * the celebration it was set to follow. Clamped to 0–30.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 98
   * @zdefault 0.35
   */
  public rewardModalDelay = new Observable(0.35, v => {
    const n = Math.max(0, Math.min(30, v));
    if (n !== v) this.rewardModalDelay.value = n;
  });

  /**
   * Small line above the modal's heading. Blank to hide it.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 96
   * @zdefault Congratulations
   */
  public rewardModalKicker = new Observable("Congratulations", () => this._syncRewardModal());

  /**
   * The modal's heading.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 92
   * @zdefault Evade Exclusive Unlocked
   */
  public rewardModalTitle = new Observable("Evade Exclusive Unlocked", () => this._syncRewardModal());

  /**
   * Body copy under the heading. Keep it to a line or two — this is a moment,
   * not a page.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 88
   * @ztype text-multiline
   * @zdefault You've earned it. Claim your digital exclusive to keep it.
   */
  public rewardModalBody = new Observable(
    "You've earned it. Claim your digital exclusive to keep it.",
    () => this._syncRewardModal());

  /**
   * What the modal's primary button does.
   *
   * **How to Claim** (the default) opens the step-by-step screen. The item is
   * redeemed with a code typed into another app, so a player dropped at that
   * app's front door without the code has been sent nowhere — the steps are
   * the actual claim, and this is the moment they'll follow them.
   *
   * **Open Link** follows Claim URL instead, for a prize that genuinely is one
   * link away. Either way, Claim Timeline still plays and On Claimed still
   * fires, so a scene reacting to the claim doesn't care which you picked.
   *
   * Set this and Claim Button Label together — a button reading "How to
   * Claim" that leaves for a website is the kind of surprise people stop
   * trusting a button over.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 86
   * @zdefault instructions
   */
  public rewardModalButtonAction = new Observable(RewardClaimAction.Instructions,
    () => this._syncRewardModal());

  /**
   * Label on the modal's primary button. Blank hides the button entirely,
   * leaving the close row as the only way out of the panel.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 84
   * @zdefault How to Claim
   */
  public rewardModalButtonLabel = new Observable("How to Claim",
    () => this._syncRewardModal());

  /**
   * Offer another round straight from the reward panel.
   *
   * On by default. Winning is the moment somebody most wants to go again, and
   * without this the only way back to a round is the menu — two taps and a
   * scan of a list, which is enough friction to end the session there.
   *
   * The rows read Replay, Lounge, then Claim last — the two free, reversible
   * choices first and the commercial one at the end of the list, where it is
   * also the only filled row and the last thing the eye passes over.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 83
   * @zdefault true
   */
  public rewardModalReplay = new Observable(true, () => this._syncRewardModal());

  /**
   * Label on that button. Blank hides it, same as turning the toggle off.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 82
   * @zdefault Replay
   */
  public rewardModalReplayLabel = new Observable("Replay",
    () => this._syncRewardModal());

  /**
   * Offer the lounge from the reward panel too.
   *
   * On by default, and it disappears on its own when Lounge Mode is off, so
   * there is never a row leading somewhere that doesn't exist.
   *
   * With this the panel covers all three things a player might want after a
   * win — go again, take the prize, or just hang out with Bobo — and none of
   * them costs a trip through the menu. It wears the lounge's own colour, so
   * the row is recognisable as the same destination the menu offers.
   *
   * It reuses **Lounge Button Label** rather than adding a second copy of the
   * same words: two labels for one destination is two things to keep in step,
   * and they drift the first time one of them is edited.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 81
   * @zdefault true
   */
  public rewardModalLounge = new Observable(true, () => this._syncRewardModal());

  /**
   * Fill colour for the panel's Claim button.
   *
   * A pale blue by default, deliberately unlike the other two rows: Replay
   * wears the panel's own accent and Lounge wears the lounge pink, so three
   * destinations read as three destinations at a glance rather than as a
   * stack of identical buttons.
   *
   * The label colour is not a property. It's chosen by measuring contrast
   * against whatever you pick — black on a pale fill, white on a deep one —
   * because a fill this light with white text on it is illegible, and that is
   * not a trade worth exposing as a setting.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 79
   * @ztype color-norm-rgb
   * @zdefault [0.55, 0.82, 0.98]
   */
  public rewardModalClaimColor = new Observable<[number, number, number]>(
    [0.55, 0.82, 0.98], () => this._syncRewardModalTheme());

  /**
   * Label on the modal's dismiss button. Blank to hide it — but leave a way
   * out: a modal over a camera feed with no exit is a trap, and the scrim tap
   * isn't discoverable on its own.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 80
   * @zdefault Not now
   */
  public rewardModalCloseLabel = new Observable("Not now", () => this._syncRewardModal());

  /**
   * Main modal colour — the glow, the border and the button. Teal and
   * aquamarine read as "unlocked" without the alarm of a warm colour.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 76
   * @ztype color
   * @zdefault #4fe3d0
   */
  public rewardModalAccent = new Observable("#4fe3d0", () => this._syncRewardModalTheme());

  /**
   * Second colour in the modal's border and glow. A hue apart from the main
   * colour is what makes the border read as light rather than as a stroke.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 72
   * @ztype color
   * @zdefault #2f8fff
   */
  public rewardModalAccent2 = new Observable("#2f8fff", () => this._syncRewardModalTheme());

  /**
   * Rotate the border light around the panel. Off leaves a static gradient
   * border, which is calmer and cheaper on old phones.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 68
   * @zdefault true
   */
  public rewardModalAnimate = new Observable(true, () => this._syncRewardModalTheme());

  /**
   * Frosted glass behind the panel. Off falls back to a solid dark surface —
   * worth trying if the modal looks muddy over a busy camera feed, and on very
   * old devices where a full-screen blur costs frames.
   *
   * @zui
   * @zgroup Reward Modal
   * @zgrouppriority 164
   * @zpriority 64
   * @zdefault true
   */
  public rewardModalGlass = new Observable(true, () => this._syncRewardModalTheme());

  /**
   * Show the Claim button in the game menu. It's there from the first open,
   * whether or not the round has been played — the exclusive is already
   * theirs, and burying the claim behind a win costs conversions.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 52
   * @zdefault true
   */
  public claimEnabled = new Observable(true, () => this._syncClaim());

  /**
   * Label on the claim button.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 48
   * @zdefault Join Evade
   */
  public claimLabel = new Observable("Join Evade", () => this._syncClaim());

  /**
   * Where the claim button sends people — your redemption page, wallet drop,
   * shop link or form.
   *
   * Left blank it falls back to Step 1's link, so the button and the
   * instructions send people to the same place without you keeping two URLs
   * in step. Set it only when the claim button should go somewhere the
   * instructions don't.
   *
   * With both blank the button still fires Claim Timeline and the On Claim
   * event, so you can handle it in the editor instead.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 44
   * @zdefault
   */
  public claimUrl = new Observable("", () => this._syncClaim());

  /**
   * Open the claim link in a new tab. Leave this on: an AR session that
   * navigates away is a session the player has to re-place and re-start.
   *
   * @zui
   * @zgroup Digital Exclusive
   * @zgrouppriority 165
   * @zpriority 40
   * @zdefault true
   */
  public claimNewTab = new Observable(true);


  /* ══ Lounge Mode ════════════════════════════════════════════════════
     A no-pressure mode reached from the intro's secondary button. No clock,
     no orbs, no score — just the character and a row of things to ask them
     to do, each firing a timeline you authored. It exists because not every
     visitor wants a timed game, and "Maybe later" used to send those people
     into one anyway.                                                       */

  /**
   * Turn the intro's secondary button into Lounge mode. Off, it goes back to
   * being a plain dismiss.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 100
   * @zdefault true
   */
  public loungeEnabled = new Observable(true, () => {
    this._syncIntro(); this._syncLounge(); this._syncTimeoutModal();
    // The reward panel offers the lounge too, so it has to hear about this.
    this._syncMenu(); this._syncRewardModal();
  });

  /**
   * Label on the intro button that opens Lounge mode.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 90
   * @zdefault Lounge with Bobo Cat
   */
  public loungeButtonLabel = new Observable("Lounge with Bobo Cat",
    // Three places wear this label now — the intro, the menu row and the
    // reward panel — because one destination gets one set of words.
    () => { this._syncIntro(); this._syncMenu(); this._syncRewardModal(); });

  /**
   * Timeline or state played when Lounge mode opens — the character settling
   * in, the lighting changing, whatever the mode's entrance is.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 80
   * @zvalues layerclipids
   */
  public loungeTimeline = new Observable<string | undefined>(undefined);

  /**
   * Your character's model — the node whose animations the lounge buttons
   * play (Bobo Cat). Point this at the GLTF node, or any group above it.
   *
   * Setting it is what makes switching between lounge animations clean.
   * Mattercraft plays a model animation by giving it weight in a mixer, and a
   * finished or interrupted animation KEEPS its weight, frozen at its last
   * pose — so without this reference, pressing Purr after Sleep blends the
   * sleeping pose into the purr and the cat comes out wrong. With it, every
   * button press stops all of the model's animations dead before starting
   * the new one from frame zero.
   *
   * You do not need per-animation Animation behaviours with weights for
   * this — setting weights to 0 doesn't help, because a paused animation
   * still applies its pose regardless.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 75
   * @zvalues nodeids three/Object3D/**
   */
  public loungeCharacter = new Observable<string | undefined>(undefined);

  /**
   * Label on the small link that leaves Lounge mode and starts a round.
   * Leave it blank, or turn Show Exit Link off, to hide it — but then the
   * only way out is the menu, which is a lot to ask of a first-time visitor.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 70
   * @zdefault Start Cola Run
   */
  public loungeExitLabel = new Observable("Start Cola Run", () => this._syncLounge());

  /**
   * How far up from the bottom of the screen the lounge buttons sit, as a
   * percentage of screen height. The default lifts them clear of an on-screen
   * joystick, which usually lives in the bottom corners. Clamped to 0–70.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 58
   * @zdefault 30
   */
  public loungeOffset = new Observable(30, v => {
    const n = Math.max(0, Math.min(70, v));
    if (n !== v) this.loungeOffset.value = n;   // snap the field to what's used
    this._applyLoungeOffset();
  });

  /**
   * Which side of the screen the lounge buttons sit on. Move them away from
   * your joystick if lifting them isn't enough.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 57
   * @zdefault center
   */
  public loungeAlign = new Observable(LoungeAlign.Center, () => this._applyCorner());

  /**
   * Show the link out of Lounge mode above the action buttons.
   *
   * @zui
   * @zgroup Lounge Mode
   * @zgrouppriority 158
   * @zpriority 60
   * @zdefault true
   */
  public showLoungeExit = new Observable(true, () => this._syncLounge());

  /**
   * Caption under action 1's button. Keep it to a word or two; it sits
   * under a circular button and a long label makes the row wrap.
   *
   * @zui
   * @zgroup Lounge Action 1
   * @zgrouppriority 157
   * @zpriority 100
   * @zdefault Sleep
   */
  public lounge1Label = new Observable("Sleep", () => this._syncLounge());

  /**
   * Icon on action 1's button.
   *
   * @zui
   * @zgroup Lounge Action 1
   * @zgrouppriority 157
   * @zpriority 90
   * @zdefault sleep
   */
  public lounge1Icon = new Observable(LoungeIcon.Sleep, () => this._syncLounge());

  /**
   * Timeline or state played when action 1 is tapped. This is where Bobo
   * actually does the thing.
   *
   * @zui
   * @zgroup Lounge Action 1
   * @zgrouppriority 157
   * @zpriority 80
   * @zvalues layerclipids
   */
  public lounge1Timeline = new Observable<string | undefined>(undefined);

  /**
   * Caption under action 2's button. Keep it to a word or two; it sits
   * under a circular button and a long label makes the row wrap.
   *
   * @zui
   * @zgroup Lounge Action 2
   * @zgrouppriority 156
   * @zpriority 100
   * @zdefault Excited
   */
  public lounge2Label = new Observable("Excited", () => this._syncLounge());

  /**
   * Icon on action 2's button.
   *
   * @zui
   * @zgroup Lounge Action 2
   * @zgrouppriority 156
   * @zpriority 90
   * @zdefault bolt
   */
  public lounge2Icon = new Observable(LoungeIcon.Bolt, () => this._syncLounge());

  /**
   * Timeline or state played when action 2 is tapped. This is where Bobo
   * actually does the thing.
   *
   * @zui
   * @zgroup Lounge Action 2
   * @zgrouppriority 156
   * @zpriority 80
   * @zvalues layerclipids
   */
  public lounge2Timeline = new Observable<string | undefined>(undefined);

  /**
   * Caption under action 3's button. Keep it to a word or two; it sits under a
   * circular button and a long label makes the row wrap.
   *
   * @zui
   * @zgroup Lounge Action 3
   * @zgrouppriority 155
   * @zpriority 100
   * @zdefault Purr
   */
  public lounge3Label = new Observable("Purr", () => this._syncLounge());

  /**
   * Icon on action 3's button.
   *
   * @zui
   * @zgroup Lounge Action 3
   * @zgrouppriority 155
   * @zpriority 90
   * @zdefault paw
   */
  public lounge3Icon = new Observable(LoungeIcon.Paw, () => this._syncLounge());

  /**
   * Timeline or state played when action 3 is tapped. This is where Bobo
   * actually does the thing.
   *
   * @zui
   * @zgroup Lounge Action 3
   * @zgrouppriority 155
   * @zpriority 80
   * @zvalues layerclipids
   */
  public lounge3Timeline = new Observable<string | undefined>(undefined);

  /**
   * Caption under action 4's button. Blank by default — give it a label to make it appear. Keep it to a word or two; it sits
   * under a circular button and a long label makes the row wrap.
   *
   * @zui
   * @zgroup Lounge Action 4
   * @zgrouppriority 154
   * @zpriority 100
   * @zdefault 
   */
  public lounge4Label = new Observable("", () => this._syncLounge());

  /**
   * Icon on action 4's button.
   *
   * @zui
   * @zgroup Lounge Action 4
   * @zgrouppriority 154
   * @zpriority 90
   * @zdefault none
   */
  public lounge4Icon = new Observable(LoungeIcon.None, () => this._syncLounge());

  /**
   * Timeline or state played when action 4 is tapped. This is where Bobo
   * actually does the thing.
   *
   * @zui
   * @zgroup Lounge Action 4
   * @zgrouppriority 154
   * @zpriority 80
   * @zvalues layerclipids
   */
  public lounge4Timeline = new Observable<string | undefined>(undefined);

  /* ══ Bobo's Hideout ═════════════════════════════════════════════════
     A third mode next to the round and the lounge: the Collector Hub room
     (CollectorHubMode.ts). The game owns the mode — the intro button, the
     menu row, placement and the HUD — and the hideout component owns the
     room. Without a CollectorHubMode in the scene nothing here shows.       */

  /**
   * Offer Bobo's Hideout on the intro card and in the menu. CollectorHubMode
   * switches this on for you when it finds the game, so you only need it if
   * you open the room from your own behaviours.
   *
   * @zui
   * @zgroup Bobo's Hideout
   * @zgrouppriority 153
   * @zpriority 100
   * @zdefault false
   */
  public hideoutEnabled = new Observable(false, () => {
    this._syncIntro(); this._syncMenu();
  });

  /**
   * Label on the intro button and the menu row that open the hideout.
   *
   * @zui
   * @zgroup Bobo's Hideout
   * @zgrouppriority 153
   * @zpriority 90
   * @zdefault Visit Bobo's Hideout
   */
  public hideoutButtonLabel = new Observable("Visit Bobo's Hideout",
    () => { this._syncIntro(); this._syncMenu(); });

  /**
   * The interface colour while the hideout is open, and the colour of the
   * buttons that lead there. EVADE yellow by default, so the three modes are
   * three colours: the round, the lounge and the hideout.
   *
   * @zui
   * @zgroup Bobo's Hideout
   * @zgrouppriority 153
   * @zpriority 80
   * @ztype color-norm-rgb
   * @zdefault [1, 0.77, 0.18]
   */
  public hideoutAccent = new Observable<[number, number, number]>([1, 0.77, 0.18],
    () => this._applyMode());

  /* ══ Timelines ══════════════════════════════════════════════════════ */

  /**
   * Timeline or state played the moment the portal opens. This is your win
   * cinematic — camera move, reveal, UI, whatever you've authored.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 100
   * @zvalues layerclipids
   */
  public winTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when the round timer runs out.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 90
   * @zvalues layerclipids
   */
  public failTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when a round starts.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 80
   * @zvalues layerclipids
   */
  public startTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when the celebration appears. Use it to move the
   * camera onto the portal, dim the scene, or fire your own particles.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 70
   * @zvalues layerclipids
   */
  public rewardTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when the claim button is tapped — fires whether
   * or not Claim URL is set, so you can handle the claim entirely in-scene.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 60
   * @zvalues layerclipids
   */
  public claimTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when the reward modal opens.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 55
   * @zvalues layerclipids
   */
  public rewardModalTimeline = new Observable<string | undefined>(undefined);

  /**
   * Timeline or state played when Replay is pressed on the reward panel.
   *
   * Its own hook rather than reusing Start Timeline, because the two are
   * different moments: Start Timeline runs for every round however it began,
   * while this one only runs for somebody choosing to go again straight after
   * a win. Both fire on a replay, so put the shared part in Start Timeline and
   * keep this one for whatever is specific to the second run.
   *
   * @zui
   * @zgroup Game Timelines
   * @zgrouppriority 110
   * @zpriority 52
   * @zvalues layerclipids
   */
  public replayTimeline = new Observable<string | undefined>(undefined);

  /* ══ Events ═════════════════════════════════════════════════════════
     Wire these to behaviours from the editor without touching code.        */

  /** Fired when a round begins. @zui */
  public onGameStart = new Event<[]>();
  /** Fired for every orb collected, with the running score and the target. @zui */
  public onOrbCollected = new Event<[{ score: number; target: number }]>();
  /** Fired the instant the target count is reached, before the portal animates. @zui */
  public onTargetReached = new Event<[]>();
  /** Fired when the portal has finished opening. @zui */
  public onPortalOpen = new Event<[]>();
  /** Fired when the portal has finished closing itself. @zui */
  public onPortalClosed = new Event<[]>();
  /** Fired when the round timer reaches zero. @zui */
  public onTimeUp = new Event<[]>();
  /** Fired when the board is reset back to idle. @zui */
  public onGameReset = new Event<[]>();
  /** Fired when the player confirms placement. @zui */
  public onPlace = new Event<[]>();
  /** Fired when the player resets placement. @zui */
  public onResetPlacement = new Event<[]>();
  /** Fired when the digital-exclusive celebration appears. @zui */
  public onRewardShown = new Event<[]>();
  /** Fired when the reward modal opens. @zui */
  public onRewardModalShown = new Event<[]>();
  /** Fired when the reward modal is dismissed without claiming. @zui */
  public onRewardModalDismissed = new Event<[]>();
  /** Fired when the claim button is tapped, before the link opens. @zui */
  public onClaimed = new Event<[]>();
  /** Fired when Replay is pressed on the reward panel. @zui */
  public onReplay = new Event<[]>();
  /** Fired when Lounge mode opens. @zui */
  public onLoungeEnter = new Event<[]>();
  /** Fired when Lounge mode closes. @zui */
  public onLoungeExit = new Event<[]>();
  /** Fired when a lounge action is tapped, with its 1-based slot and label. @zui */
  public onLoungeAction = new Event<[{ action: number; label: string }]>();
  /** Fired when the player picks Bobo's Hideout (before placement, if it still needs placing). @zui */
  public onHideoutEnter = new Event<[]>();
  /** Fired when the player leaves Bobo's Hideout for the round or the lounge. @zui */
  public onHideoutExit = new Event<[]>();
  /** Fired when the intro / how-to-play card closes. @zui */
  public onIntroClose = new Event<[]>();

  /* ══ Public API — call these from a behaviour or a Call Function track ══ */

  /** Start (or restart) a round. @zui */
  public startGame() { this._start(); }
  /** Pause a running round. @zui */
  public pauseGame() { if (this._state === GameState.Playing) this._setState(GameState.Paused); }
  /** Resume a paused round. @zui */
  public resumeGame() { if (this._state === GameState.Paused) this._setState(GameState.Playing); }
  /** Reset the board to idle without starting. @zui */
  public resetGame() { this._reset(); }
  /** Open the how-to-play modal. @zui */
  public showIntro() { this._openIntro(); }
  /** Open the game menu. @zui */
  public showMenu() { this._openMenu(); }
  /** Confirm placement, as if the player tapped Place. @zui */
  public place() { this._place(); }
  /** Return to placement mode, as if the player tapped Reset. @zui */
  public resetPlacement() { this._resetPlacement(); }
  /** Play the digital-exclusive celebration now, without winning. @zui */
  public showReward() { this._showReward(); }
  /** Hide the celebration immediately. @zui */
  public hideReward() { this._hideReward(true); }
  /** Close the portal now, with its opening animation reversed. @zui */
  public closePortal() {
    if (this._state === GameState.Won && this._portal.visible) this._portalClosing = true;
  }
  /** Open the reward modal now. @zui */
  public showRewardModal() { this._openRewardModal(); }
  /** Close the reward modal. @zui */
  public hideRewardModal() { this._closeRewardModal(false); }
  /** Trigger the claim action, as if the button were tapped. @zui */
  public claim() { this._claim(); }
  /** Open Lounge mode. @zui */
  public enterLounge() { this._enterLounge(); }
  /** Leave Lounge mode without starting a round. @zui */
  public exitLounge() { this._exitLounge(); }
  /** True while Lounge mode is open. */
  public get isLounging() { return this._lounge; }
  /** Open Bobo's Hideout mode (placement first, if the scene isn't placed yet). @zui */
  public enterHideout() { this._enterHideout(); }
  /** Leave Bobo's Hideout mode without starting a round or the lounge. @zui */
  public exitHideout() { this._exitHideout(); }
  /** True while Bobo's Hideout mode is open. */
  public get isInHideout() { return this._hideout; }
  /** True while the intro / how-to-play card is open. */
  public get isIntroOpen() { return !!this._introWrap?.classList.contains("on"); }

  /**
   * Log what the custom-pickup path actually did, in your scene.
   *
   * The pickup path cannot be tested outside the editor — the loaders, the
   * file pickers and the scene graph above this component only exist there —
   * so when a model misbehaves this is the way to find out why instead of
   * guessing. Run it after the round has started and paste the output.
   *
   * It names the failure rather than dumping numbers: the source never
   * arrived, the clones were never built, every pickup is stacked on the
   * component origin (which looks exactly like one model that "won't move"),
   * or the model is fine and sitting where it should be.
   *
   * @zui
   */
  public auditPickup() {
    const kind = this.pickupKind.value;
    const src = this._pickupSource();
    const P = "[OrbHuntGame]";

    console.log(`${P} Pickup Kind: ${kind} | Pickup Model prop: ` +
      `${this.constructorProps.pickupModel || "(empty)"} | Pickup Image prop: ` +
      `${this.constructorProps.pickupImage || "(empty)"}`);

    if (kind === PickupKind.Orb) {
      console.log(`${P} Pickup Kind is Orb — the shader orb is showing by design.`);
      return;
    }
    if (!src) {
      console.warn(`${P} DIAGNOSIS: the source never arrived. Either the file ` +
        `is still loading, the prop is empty, or the load threw — look further ` +
        `up the console for a "failed to load" line. Orbs are showing as the ` +
        `fallback, which is why you still see orbs.`);
      return;
    }

    // What did we actually get handed? An empty container clones to nothing.
    const d = this._describePickupSource(src);
    console.log(`${P} source: ${d.text}`);
    if (d.meshes === 0) {
      console.warn(`${P} DIAGNOSIS: the loaded object contains no meshes, so ` +
        `every clone is empty and nothing can render. The load succeeded — ` +
        `this is what the file has in it. Open the same file in any glTF ` +
        `viewer and you will see the same thing.`);
      return;
    }

    this.element.updateMatrixWorld(true);
    const gp = new THREE.Vector3();
    const cp = new THREE.Vector3();
    const rows = this._orbs.map((o, i) => {
      const fit = o.custom.children[0];
      const clone = fit?.children[0];
      o.group.getWorldPosition(gp);
      if (clone) clone.getWorldPosition(cp); else cp.set(NaN, NaN, NaN);
      return {
        i,
        active: o.active,
        orbVisible: o.group.visible,
        customVisible: o.custom.visible,
        cloneBuilt: !!clone,
        fitScale: fit ? +fit.scale.x.toFixed(4) : null,
        orbAt: `${gp.x.toFixed(2)},${gp.y.toFixed(2)},${gp.z.toFixed(2)}`,
        modelAt: clone ? `${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)}` : "—",
        driftFromOrb: clone ? +cp.distanceTo(gp).toFixed(3) : null,
      };
    });
    const live = rows.filter(r => r.active);
    console.table(live);

    /* Each of these is a different bug with a different fix, so say which. */
    const built = live.filter(r => r.cloneBuilt);
    if (!built.length) {
      console.warn(`${P} DIAGNOSIS: the source loaded but no clones were built. ` +
        `_applyPickupKind ran before the orb pool existed, or hasn't run since ` +
        `the file arrived.`);
      return;
    }
    if (built.length < live.length) {
      console.warn(`${P} DIAGNOSIS: only ${built.length} of ${live.length} live ` +
        `pickups have a model. The rest are empty slots.`);
    }
    const zeroScale = built.filter(r => !r.fitScale);
    if (zeroScale.length) {
      console.warn(`${P} DIAGNOSIS: ${zeroScale.length} pickup(s) have a zero ` +
        `fit scale — fitToDiameter found no measurable geometry, so the model ` +
        `is there but has no size.`);
    }
    // The signature of "one model at the centre that never moves": every clone
    // in the same place. N models stacked on the origin look like one.
    const spots = new Set(built.map(r => r.modelAt));
    if (spots.size === 1 && built.length > 1) {
      console.warn(`${P} DIAGNOSIS: all ${built.length} pickups are at the same ` +
        `world position (${built[0].modelAt}). That is why you see one model ` +
        `that never moves — they are stacked. The orbs' own positions are ` +
        `${new Set(built.map(r => r.orbAt)).size === 1 ? "ALSO identical, so the " +
        "layout never ran" : "spread out, so the models are not following " +
        "their orbs"}.`);
      return;
    }
    const drifted = built.filter(r => (r.driftFromOrb ?? 0) > this.orbSize.value * 2);
    if (drifted.length) {
      console.warn(`${P} DIAGNOSIS: ${drifted.length} model(s) sit more than ` +
        `two orb-widths from the orb they belong to, so the pickup and its ` +
        `ground ring are in different places:`, drifted);
      return;
    }
    console.log(`${P} pickups look correct: ${built.length} model(s), each on ` +
      `its own orb, spread across ${spots.size} position(s).`);
    return rows;
  }

  /**
   * Log a per-orb diagnostic to the browser console: position, whether the orb
   * is within the player's vertical reach, and the state of its trigger and
   * beacon. Use this when one orb misbehaves — it turns "that one won't
   * collect" into a specific broken invariant.
   *
   * @zui
   */
  public auditOrbs() {
    const reach = this._reachHeight();
    const rows = this._orbs.map((o, i) => ({
      i,
      active: o.active,
      alive: o.alive,
      visible: o.group.visible,
      beaconVisible: o.beacon.visible,
      x: +o.home.x.toFixed(2),
      y: +o.home.y.toFixed(2),
      z: +o.home.z.toFixed(2),
      trigger: o.trigger ? (o.trigger.enabled.value ? "enabled" : "DISABLED") : "none",
      withinReach: o.home.y + Math.abs(this.orbBob.value) <= reach,
    }));
    const live = rows.filter(r => r.active);
    console.log(
      `[OrbHuntGame] round seed ${this._roundSeed}` +
      `${this.randomizeEachRound.value ? " (randomised each round)" : " (fixed by the Seed prop)"}`);
    console.log(
      `[OrbHuntGame] player reach ${reach.toFixed(2)} = offset ` +
      `${this.playerHeightOffset.value} + radius ${this.playerRadius.value} + orb ` +
      `${this._orbRadius().toFixed(2)} | mode ${this.collisionMode.value} | ` +
      `player node ${this._playerObj ? "bound" : "NOT BOUND"} | ` +
      `player trigger ${this._playerTrigger ? "present" : "none"}`);
    console.table(live);
    const bad = live.filter(r => !r.withinReach || (r.alive && r.trigger === "DISABLED"));
    if (bad.length) {
      console.warn(`[OrbHuntGame] ${bad.length} orb(s) cannot be collected:`, bad);
    } else {
      console.log("[OrbHuntGame] every live orb is reachable with an enabled trigger.");
    }
    return rows;
  }
  /** True once the scene has been placed. */
  public get isPlaced() { return this._placed; }
  /**
   * The seed that produced the current layout. With Randomize Each Round on
   * this changes every round — read it back to reproduce a board a player
   * reported, by pasting it into Seed and turning randomising off.
   */
  public get roundSeed() { return this._roundSeed; }

  /** Current score. */
  public get score() { return this._score; }
  /** Seconds remaining, or Infinity when the timer is off. */
  public get timeRemaining() { return this.timerEnabled.value ? this._timeLeft : Infinity; }
  /** Where the round is up to. */
  public get gameState() { return this._state; }

  /* ══ Internals ══════════════════════════════════════════════════════ */

  private readonly _zc = this.getZComponentInstance();

  /**
   * Seed for the current round's layout. Equal to the Seed prop unless
   * Randomize Each Round is on, in which case a fresh one is drawn when the
   * round starts — the board stays stable while you're editing props, and only
   * changes when the player actually replays.
   */
  private _roundSeed = 0;
  /** Long-lived stream for respawns, so successive respawns never repeat. */
  private _rng: () => number = mulberry32(0);

  private _state: GameState = GameState.Idle;
  private _score = 0;
  private _streak = 0;
  private _timeLeft = 0;
  private _time = 0;
  private _warned = false;
  private _nextWarnAt = 0;
  private _portalOpen = 0;
  private _portalDone = false;
  /** Scheduled on _time, so a reset cancels them the way everything else does. */
  private _humStopAt = -1;
  private _portalCloseAt = -1;
  private _portalClosing = false;
  private _resetAt = -1;
  private _warnedNoPlayer = false;
  private _warnedReach = false;
  private _warnedPickup = false;
  private _warnedSkinned = false;
  /** Whether the glow would be on if the pickup were an orb. */
  private _glowWanted = true;
  /** The lounge timeline last started, so the next press can reset it. */
  private _loungeClipId?: string;
  /** Animation keys the current lounge timeline started. */
  private _loungeAnims = new Set<string>();
  /** Animations already running at press time — exempt while they keep running. */
  private _loungeAmbient = new Set<string>();
  /** Stream objects the latched timeline drives (covers late-starting blocks). */
  private _loungeClipStreams = new Set<unknown>();
  private _pickupGltf?: GLTF;
  private _pickupImage?: ZImage;
  private _pickupModel?: THREE.Object3D;
  private _pickupImageObj?: THREE.Object3D;
  private _camera?: THREE.Camera;
  private _nextHudAt = 0;

  private readonly _orbU = {
    uTime: { value: 0 },
    uColorCore: { value: new THREE.Color(0.03, 0.1, 0.19) },
    uColorInner: { value: new THREE.Color(0.09, 0.8, 0.84) },
    uColorMid: { value: new THREE.Color(0.11, 0.44, 0.94) },
    uColorEdge: { value: new THREE.Color(0.87, 0.95, 1.0) },
    uHueBlend: { value: 0.42 },
    uSpeed: { value: 0.3 },
    uNoiseScale: { value: 3.4 },
    uTurbulence: { value: 1.3 },
    uSurfaceSharpness: { value: 2.8 },
    uSurfaceEnergy: { value: 0.75 },
    uCoreGlow: { value: 0.32 },
    uDensity: { value: 0.88 },
    uRimPower: { value: 3.6 },
    uRimIntensity: { value: 0.55 },
    uBrightness: { value: 1 },
    uOpacity: { value: 1 },
    uPulse: { value: 1 },
    uFlare: { value: 0 },
    uFlareBoost: { value: 0.85 },
  };

  private readonly _glowU = {
    uColor: { value: new THREE.Color(0.11, 0.44, 0.94) },
    uFalloff: { value: 2.6 },
    uIntensity: { value: 0.9 },
    uCoreFrac: { value: 1 / 1.7 },
    uPulse: { value: 1 },
    uFlare: { value: 0 },
    uFlareBoost: { value: 0.85 },
    uOpacity: { value: 1 },
  };

  private readonly _beaconU = {
    uColor: { value: new THREE.Color(0.12, 0.73, 0.94) },
    uTime: { value: 0 },
    uIntensity: { value: 0.85 },
    uRingWidth: { value: 0.09 },
    uPoolStrength: { value: 0.16 },
    uWaveSpeed: { value: 0.5 },
    uOpacity: { value: 1 },
    uPhase: { value: 0 },
  };

  private readonly _portalU = {
    uTime: { value: 0 },
    uColorCore: { value: new THREE.Color(0.02, 0.04, 0.09) },
    uColorInner: { value: new THREE.Color(0.08, 0.82, 0.76) },
    uColorMid: { value: new THREE.Color(0.11, 0.44, 0.94) },
    uColorEdge: { value: new THREE.Color(0.81, 0.91, 1.0) },
    uHueBlend: { value: 0.6 },
    uRadius: { value: 0.72 },
    uSwirl: { value: 2.2 },
    uSpeed: { value: 0.16 },
    uNoiseScale: { value: 2.6 },
    uTurbulence: { value: 1.5 },
    uArmSharpness: { value: 3.2 },
    uCoreSize: { value: 0.3 },
    uCoreDarkness: { value: 0.55 },
    uRimPower: { value: 2.8 },
    uRimIntensity: { value: 0.88 },
    uEdgeWobble: { value: 0.13 },
    uEdgeWobbleSpeed: { value: 0.3 },
    uStarDensity: { value: 22 },
    uStarIntensity: { value: 1 },
    uHaloSize: { value: 0.16 },
    uHaloIntensity: { value: 0.55 },
    uBrightness: { value: 1.05 },
    uOpacity: { value: 0 },
  };

  // One material of each kind serves every orb — a 30-orb field is still four
  // materials. Per-orb variety comes from a random orientation (the noise is
  // sampled in object space) plus a per-orb pulse phase on the CPU.
  private readonly _orbMat: THREE.ShaderMaterial;
  private readonly _glowMat: THREE.ShaderMaterial;
  private readonly _beaconMat: THREE.ShaderMaterial;
  private readonly _portalMat: THREE.ShaderMaterial;
  private readonly _orbGeom: THREE.SphereGeometry;
  private readonly _glowGeom: THREE.SphereGeometry;
  private readonly _beaconGeom: THREE.PlaneGeometry;
  private readonly _portalGeom: THREE.PlaneGeometry;
  private readonly _portal: THREE.Mesh;

  private readonly _orbs: OrbSlot[] = [];
  private _playerObj?: THREE.Object3D;
  private _playerTrigger?: SphereTrigger;

  private readonly _sfxCollect: Audio;
  private readonly _sfxWin: Audio;
  private readonly _sfxReward: Audio;
  private readonly _sfxWarn: Audio;
  private readonly _sfxFail: Audio;
  private readonly _sfxHum: Audio;
  private readonly _sfxMusic: Audio;
  private _audio?: GameAudio;
  private _humPlaying = false;

  private readonly _root = document.createElement("div");
  private _scoreWrap!: HTMLDivElement;
  private _timeWrap!: HTMLDivElement;
  /**
   * Fires when the timeout panel appears — hook a sound or a timeline to it.
   *
   * @zui
   * @zgroup Game Timeout
   * @zgrouppriority 163
   * @zpriority 20
   */
  public readonly onTimeoutModalShown = new Event<[]>();

  private _logoWrap!: HTMLDivElement;
  private _logoImg!: HTMLImageElement;
  private _toWrap!: HTMLDivElement;
  private _insWrap!: HTMLDivElement;
  /** Watches the two HUD cards so the stack can never go stale. */
  private _hudRO?: ResizeObserver;
  private _hudRaf = 0;
  /** True while the steps are showing as a detour FROM the reward panel. */
  private _insFromReward = false;
  /** Full-screen viewer for a step's screenshot. */
  private _lightWrap!: HTMLDivElement;
  private _lightImg!: HTMLImageElement;
  /** The control that opened the viewer, so focus can go back to it. */
  private _lightOpener?: HTMLElement;
  /** Game clock at which the timeout panel should open; -1 when idle. */
  private _timeoutAt = -1;
  private _scoreLblEl?: HTMLSpanElement;
  private _timeLblEl?: HTMLSpanElement;
  private _menuWrap!: HTMLDivElement;
  private _introWrap!: HTMLDivElement;
  private _placeWrap!: HTMLDivElement;
  private _resetWrap!: HTMLDivElement;
  private _soundWrap!: HTMLDivElement;
  private _rewardWrap!: HTMLDivElement;
  private _rwModalWrap!: HTMLDivElement;
  private _rwModalAt = -1;
  private _rwWord!: HTMLDivElement;
  private _rwBadge!: HTMLDivElement;
  /** Scheduled on `_time`, not setTimeout, so it can't outlive a reset. */
  private _rewardAt = -1;
  private _rwWordHideAt = -1;
  private _rwBadgeHideAt = -1;
  private _iconBtn!: HTMLButtonElement;
  private _menu!: HTMLDivElement;
  private _introEl!: HTMLDivElement;
  private _introImg!: HTMLImageElement;
  private _introH1!: HTMLElement;
  private _introLead!: HTMLElement;
  private _scoreEl!: HTMLSpanElement;
  private _timeEl!: HTMLSpanElement;
  private _barEl!: HTMLDivElement;
  private _titleEl!: HTMLDivElement;
  private _msgEl!: HTMLDivElement;
  private _statusEl!: HTMLDivElement;
  private _menuOpen = false;
  private _placed = false;
  private _lounge = false;
  private _hideout = false;
  /** Neither mode has a round: no orbs, no clock, no score. */
  private get _noRound() { return this._lounge || this._hideout; }
  private _loungeWrap!: HTMLDivElement;

  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();

  constructor(contextManager: ContextManager, public constructorProps: ConstructorProps) {
    super(contextManager, constructorProps);

    /* ── materials ────────────────────────────────────────────────────
       toneMapped = false on all four, matching PortalShader/OrbShader, so
       RenderSettings tone mapping can't re-grade the game art.            */
    this._orbMat = new THREE.ShaderMaterial({
      uniforms: this._orbU,
      vertexShader: ORB_VERT,
      fragmentShader: ORB_FRAG.replace("__NOISE3__", NOISE3),
      transparent: true,
      depthWrite: true,
    });
    this._orbMat.toneMapped = false;

    this._glowMat = new THREE.ShaderMaterial({
      uniforms: this._glowU,
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    this._glowMat.toneMapped = false;

    this._beaconMat = new THREE.ShaderMaterial({
      uniforms: this._beaconU,
      vertexShader: BEACON_VERT,
      fragmentShader: BEACON_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this._beaconMat.toneMapped = false;

    this._portalMat = new THREE.ShaderMaterial({
      uniforms: this._portalU,
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._portalMat.toneMapped = false;

    const detail = clampInt(constructorProps.orbDetail ?? 32, 8, 96);
    this._orbGeom = new THREE.SphereGeometry(0.5, detail, Math.round(detail * 0.75));
    this._glowGeom = new THREE.SphereGeometry(0.5, 24, 16);
    this._beaconGeom = new THREE.PlaneGeometry(1, 1);
    this._portalGeom = new THREE.PlaneGeometry(1, 1);

    this._portal = new THREE.Mesh(this._portalGeom, this._portalMat);
    this._portal.position.set(0, 1.7, -14);
    this._portal.scale.setScalar(3.4);
    this._portal.visible = false;
    this.element.add(this._portal);

    /* ── orb pool ─────────────────────────────────────────────────────
       Allocated once at maxOrbs so "Orbs to spawn" can change live without
       churning geometry or re-registering triggers mid-round.             */
    const pool = clampInt(constructorProps.maxOrbs ?? 32, 1, 200);
    for (let i = 0; i < pool; i++) this._orbs.push(this._makeOrb());

    /* ── audio ────────────────────────────────────────────────────────
       Mattercraft resumes the shared AudioContext on the first user gesture,
       so no unlock code is needed — but anything played before the first tap
       is silently dropped. That's why Play defaults to a button press.      */
    this._sfxCollect = new Audio(contextManager, { source: constructorProps.collectSound });
    this._sfxWin = new Audio(contextManager, { source: constructorProps.winSound });
    this._sfxReward = new Audio(contextManager, { source: constructorProps.rewardSound });
    this._sfxWarn = new Audio(contextManager, { source: constructorProps.warningSound });
    this._sfxFail = new Audio(contextManager, { source: constructorProps.failSound });
    this._sfxHum = new Audio(contextManager, { source: constructorProps.portalHumSound });
    this._sfxMusic = new Audio(contextManager, { source: constructorProps.musicTrack });
    this._sfxMusic.loop.value = true;

    // Built-in synth for every cue with no file behind it, wired into the
    // same audio layer so Mattercraft's mixer still governs it.
    try {
      const actx = useAudioContext(contextManager);
      const layer = contextManager.get(AudioContextContext).getLayer(undefined);
      this._audio = new GameAudio(actx, layer);
      this._audio.musicLevel = this.musicVolume.value;
      this._audio.setSfx(this.soundEnabled.value);
    } catch (e) {
      console.warn("[OrbHuntGame] No audio context available; running silent.", e);
    }

    this._roundSeed = this.seed.value | 0;
    this._rng = mulberry32(this._roundSeed ^ 0x9e3779b9);

    this._loadPickup(contextManager);
    // Billboarded image pickups need the live camera; it can change (entering
    // WebXR swaps it), so track the observable rather than reading it once.
    const cam = useCamera(contextManager);
    this._camera = cam.value;
    this.register(cam, c => { this._camera = c; });

    this._buildUi(contextManager);
    this._layout();
    this._applyPortalVisibility();
    this._applyCorner();
    this._applyLayerOrder();
    this._observeHud();
    this._applyMode();
    this._applyHudPosition();
    this._applyLogo();
    this._applyTimerOffset();
    this._applyLoungeOffset();
    this._applyUiVisibility();
    this._syncMenu();
    this._syncIntro();
    this._syncReward();
    this._syncRewardTheme();
    this._syncRewardModal();
    this._syncRewardModalTheme();
    this._syncTimeoutModal();
    this._syncTimeoutTheme();
    this._syncInstructions();
    this._syncClaim();
    this._syncLounge();
    this._applyPlacementUi();
    this._applyPickupKind();
    this._syncHud();

    // Resolve the player node once the whole ZComponent tree exists.
    this._zc.constructed.then(() => {
      this._bindPlayer();
      this._applyMusicSource();
      if (this.showIntroOnLoad.value && this.uiEnabled.value) this._openIntro();
      else this._afterIntroDismissed();
      if (this.autoStart.value) this._start();
    });

    // dt arrives in milliseconds.
    this.register(useOnBeforeRender(contextManager), dt => this._tick(dt * 0.001));
  }

  /* ── construction helpers ─────────────────────────────────────────── */

  private _makeOrb(): OrbSlot {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);

    const mesh = new THREE.Mesh(this._orbGeom, this._orbMat);
    inner.add(mesh);

    const glow = new THREE.Mesh(this._glowGeom, this._glowMat);
    glow.scale.setScalar(1.7);
    glow.renderOrder = 1;
    glow.raycast = () => undefined;
    inner.add(glow);

    const beacon = new THREE.Mesh(this._beaconGeom, this._beaconMat);
    beacon.rotation.x = -Math.PI / 2;
    beacon.renderOrder = 2;
    beacon.raycast = () => undefined;
    group.add(beacon);

    // Sibling of `inner`, not a child: `inner` carries the orb's own pulse
    // scaling, and a custom model has already been normalised to size.
    const custom = new THREE.Group();
    custom.visible = false;
    group.add(custom);

    group.visible = false;
    this.element.add(group);

    return {
      group, inner, mesh, glow, beacon, custom,
      home: new THREE.Vector3(), phase: 0,
      alive: false, active: false, burst: 0,
    };
  }

  /* ── custom pickups ───────────────────────────────────────────────── */

  /**
   * Load the model or image once and clone it per orb.
   *
   * One loader component for the whole board, not one per orb: thirty GLTF
   * components would mean thirty loads of the same file, and `Object3D.clone`
   * shares geometry and materials by reference, so the clones cost almost
   * nothing.
   */
  private _loadPickup(mgr: ContextManager) {
    const modelSrc = this.constructorProps.pickupModel;
    const imageSrc = this.constructorProps.pickupImage;

    if (modelSrc) {
      const gltf = new GLTF(mgr, { source: modelSrc, frustumCulled: false });
      this._pickupGltf = gltf;
      gltf.loaded
        .then(() => { this._pickupModel = gltf.element; this._applyPickupKind(); })
        .catch((e: unknown) =>
          console.warn(`[OrbHuntGame] Pickup Model failed to load (${modelSrc}):`, e));
    }
    if (imageSrc) {
      const img = new ZImage(mgr, { source: imageSrc, transparent: true });
      this._pickupImage = img;
      // Image exposes its load as a method rather than a promise property.
      Promise.resolve(img._load())
        .then(() => { this._pickupImageObj = img.element; this._applyPickupKind(); })
        .catch((e: unknown) =>
          console.warn(`[OrbHuntGame] Pickup Image failed to load (${imageSrc}):`, e));
    }
  }

  /**
   * Describe what the loader actually handed us.
   *
   * When a pickup file "loads" but nothing renders, the useful question is
   * what is inside the object, not whether a promise resolved. GLTF._load()
   * adds the cloned scene to its element before it resolves, and `disposed`
   * is only ever set by an explicit dispose() — so an element with no
   * geometry means the glTF scene itself has none. That is almost always a
   * file that exports cameras, empties, bones or animation but no mesh:
   * a Blender scene exported with the wrong collection selected, a model
   * whose geometry sits behind a compression extension the decoder skipped,
   * or simply the wrong file picked in the property.
   *
   * Naming the nodes is what turns "it doesn't work" into "that file has
   * three Empties and a camera in it".
   */
  private _describePickupSource(src: THREE.Object3D) {
    let meshes = 0, nodes = 0;
    const kinds = new Map<string, number>();
    const names: string[] = [];
    src.traverse(c => {
      nodes++;
      kinds.set(c.type, (kinds.get(c.type) ?? 0) + 1);
      if ((c as THREE.Mesh).geometry) meshes++;
      if (names.length < 12 && c !== src) names.push(`${c.name || "(unnamed)"}:${c.type}`);
    });
    const gltf = this._pickupGltf;
    return {
      meshes,
      nodes,
      text:
        `${meshes} mesh(es), ${nodes} node(s) total. ` +
        `Types: ${[...kinds].map(([k, n]) => `${k}×${n}`).join(", ") || "none"}. ` +
        `Nodes: ${names.join(", ") || "(the object is empty)"}. ` +
        (gltf
          ? `Loader: ${gltf.element.children.length} direct child(ren), ` +
            `${gltf.nodesByName.value.size} named node(s), ` +
            `${gltf.animationClips.value.size} animation clip(s), ` +
            `disposed=${gltf.disposed}. `
          : "") +
        `File: ${this.constructorProps.pickupModel || this.constructorProps.pickupImage || "(none)"}`,
    };
  }

  /** Which source object the current Pickup Kind wants, if it has arrived. */
  private _pickupSource() {
    switch (this.pickupKind.value) {
      case PickupKind.Model: return this._pickupModel;
      case PickupKind.Image: return this._pickupImageObj;
      default: return undefined;
    }
  }

  private _applyPickupKind() {
    if (!this._orbs.length) return;
    const kind = this.pickupKind.value;
    const src = this._pickupSource();

    if (kind !== PickupKind.Orb && !src) {
      // Either the file is still loading or none was set. Stay on orbs rather
      // than showing an empty board, and say which it is.
      const prop = kind === PickupKind.Model ? "Pickup Model" : "Pickup Image";
      const set = kind === PickupKind.Model
        ? this.constructorProps.pickupModel : this.constructorProps.pickupImage;
      if (!set && !this._warnedPickup) {
        this._warnedPickup = true;
        console.warn(`[OrbHuntGame] Pickup Kind is ${kind} but no ${prop} is set — ` +
                     `showing orbs. Pick a file in Constructor Props.`);
      }
    }

    const useCustom = !!src;
    for (const o of this._orbs) {
      // Rebuild the clone: the source may have changed, and a stale clone of
      // the previous model would linger otherwise.
      for (const child of o.custom.children.slice()) o.custom.remove(child);
      if (useCustom) {
        // Three nodes, three jobs: `custom` carries the collect burst, `fit`
        // carries the normalising scale, the clone carries the recentring.
        // Sharing any two of those means one silently overwrites the other.
        const fit = new THREE.Group();
        const clone = src!.clone(true);
        clone.traverse(c => { c.raycast = () => undefined; });
        fit.add(clone);
        o.custom.add(fit);
      }
      o.custom.visible = useCustom;
      o.inner.visible = !useCustom;
      // Answering the design question directly: the ground ring stays for
      // custom pickups (it's what makes them findable across a room), the
      // sphere glow does not — it's shaped for a sphere and reads as a
      // mistake wrapped around an arbitrary mesh.
      o.glow.visible = !useCustom && this._glowWanted;
    }
    if (useCustom) this._warnSkinned(src!);
    this._fitPickup();
  }

  /** Normalise every clone to the orb's size. Cheap: it's a scale per orb. */
  private _fitPickup() {
    const src = this._pickupSource();
    if (!src) return;
    const target = Math.max(0.01, this.orbSize.value * this.pickupScale.value);
    for (const o of this._orbs) {
      const clone = o.custom.children[0]?.children[0];
      if (clone) fitToDiameter(clone, target);
    }
  }

  private _warnSkinned(src: THREE.Object3D) {
    if (this._warnedSkinned) return;
    let skinned = false;
    src.traverse(c => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
    if (!skinned) return;
    this._warnedSkinned = true;
    console.warn("[OrbHuntGame] The pickup model is rigged. Clones share the " +
                 "original skeleton, so every pickup renders in bind pose and " +
                 "none of them animate. Export a static mesh for pickups.");
  }

  /* ── triggers ─────────────────────────────────────────────────────── */

  /**
   * Mattercraft pairs triggers by tag and requires the two sides to have
   * DIFFERENT `isTrigger` values — two `isTrigger = true` nodes never collide.
   * Orbs are the triggers, the player is the collider.
   */
  private _rebuildTriggers() {
    const wantTriggers = this.collisionMode.value === CollisionMode.Trigger;

    for (const o of this._orbs) {
      if (wantTriggers && !o.trigger) {
        const t = new SphereTrigger(this.contextManager, {});
        t.isTrigger.value = true;                // orbs are the triggers…
        t.tags.value = [this.triggerTag.value];
        o.group.add(t.element);
        o.onHit = (evt: CollisionEvent) => {
          if (this._state !== GameState.Playing) return;
          if (this._playerTrigger && evt.otherTrigger !== this._playerTrigger) return;
          if (!o.alive) return;
          this._collect(o);
        };
        this.register(t.onCollisionEnter, o.onHit);
        o.trigger = t;
      } else if (!wantTriggers && o.trigger) {
        // Unregister before disposing, or flipping the mode back and forth
        // accumulates dead listeners on this entity.
        if (o.onHit) this.unregister(o.trigger.onCollisionEnter, o.onHit);
        o.onHit = undefined;
        o.trigger.dispose();
        o.trigger = undefined;
      }
    }

    if (wantTriggers && !this._playerTrigger && this._playerObj) {
      const t = new SphereTrigger(this.contextManager, {});
      t.isTrigger.value = false;               // …and the player is the collider
      t.tags.value = [this.triggerTag.value];
      this._playerObj.add(t.element);
      this._playerTrigger = t;
    } else if (!wantTriggers && this._playerTrigger) {
      this._playerTrigger.dispose();
      this._playerTrigger = undefined;
    }

    // Triggers are created long after the first _layout() (the player node only
    // resolves once the ZComponent tree is built), so the enabled/disabled state
    // the layout decided has to be re-applied here. Otherwise unused pool slots
    // keep live triggers parked at the component origin.
    for (const o of this._orbs) if (o.trigger) o.trigger.enabled.value = o.active;

    this._sizeOrbTriggers();
    this._sizePlayerTrigger();
  }

  private _retagTriggers() {
    const tag = this.triggerTag.value;
    for (const o of this._orbs) if (o.trigger) o.trigger.tags.value = [tag];
    if (this._playerTrigger) this._playerTrigger.tags.value = [tag];
  }

  /** A SphereTrigger's world radius is 1 × its element's world scale. */
  private _sizeOrbTriggers() {
    const r = 0.5 * this.orbSize.value * this.orbPickupRadius.value;
    for (const o of this._orbs) {
      o.inner.scale.setScalar(this.orbSize.value);
      if (o.trigger) o.trigger.element.scale.setScalar(r);
    }
  }

  private _sizePlayerTrigger() {
    if (!this._playerTrigger || !this._playerObj) return;
    // Compensate for any scale on the player rig so both props stay real
    // world-space distances rather than multiples of the rig's scale.
    this._playerObj.getWorldScale(this._v1);
    const s = Math.max(1e-4, (this._v1.x + this._v1.y + this._v1.z) / 3);
    this._playerTrigger.element.scale.setScalar(this.playerRadius.value / s);
    // Lift the sphere onto the character's body. A rig anchored at the feet
    // with a 0.7 sphere reaches y = 0.7; orbs float around 1.1. Without this
    // the character walks under the high orbs and nothing fires — which looks
    // exactly like "one orb is broken".
    this._playerTrigger.element.position.y = this.playerHeightOffset.value / s;
  }

  /** Highest orb centre the player can ever touch, in scene units. */
  private _reachHeight() {
    return this.playerHeightOffset.value + this.playerRadius.value + this._orbRadius();
  }

  /**
   * Highest resting height an orb may be given. Below `_reachHeight()` by the
   * bob amplitude, because an orb parked exactly at the limit is only
   * collectable during part of its bob cycle — the player walks into it and it
   * takes, or doesn't, depending on the phase. Intermittent is worse than
   * impossible: it reads as a flaky game rather than a tuning mistake.
   */
  private _spawnCeiling() {
    return this._reachHeight() - Math.abs(this.orbBob.value) - 0.08;
  }

  private _orbRadius() {
    return 0.5 * this.orbSize.value * this.orbPickupRadius.value;
  }

  private _bindPlayer() {
    const id = this.playerNode.value;
    if (this._playerTrigger) {
      this._playerTrigger.dispose();
      this._playerTrigger = undefined;
    }
    this._playerObj = undefined;
    if (!id) return;
    const comp = this._zc.resolveNodeID<Object3D>(id);
    this._playerObj = comp?.element;
    this._rebuildTriggers();
  }

  /* ── layout ───────────────────────────────────────────────────────── */

  /**
   * How far a spawn has to stay from the player, squared, and where they are.
   *
   * One rule, read by both the initial layout and a respawn. They used to
   * disagree: a respawning orb avoided the player, a freshly laid-out board
   * did not — so replaying a round after walking away dropped a can on the
   * player's head and it was collected on the first frame.
   *
   * Returns null when there is no player to avoid (no character assigned, or
   * the clearance turned off), so callers can skip the term entirely rather
   * than score against a position that means nothing.
   */
  private _playerKeepOut(out: THREE.Vector3): number | null {
    const clear = Math.max(0, this.spawnClearance.value);
    if (clear <= 0 || !this._playerObj) return null;
    this._playerObj.getWorldPosition(out);
    // World → component space; spawn positions are component-local.
    this.element.worldToLocal(out);
    // Measured from the edge of the pickup sphere, not its centre: an orb
    // that lands exactly at the pickup distance is still collected instantly.
    const d = this.playerRadius.value + this._orbRadius() + clear;
    return d * d;
  }

  private _layout() {
    const count = clampInt(this.orbCount.value, 0, this._orbs.length);
    const rnd = mulberry32(this._roundSeed);
    const minR = Math.max(0, this.spawnMinRadius.value);
    const maxR = Math.max(minR, this.spawnMaxRadius.value);
    const sep2 = this.minSeparation.value * this.minSeparation.value;
    // A cohesion cap below the separation floor is unsatisfiable, so raise it
    // rather than spin through 40 doomed samples per orb.
    const cohere = this.maxSpacing.value > 0
      ? Math.max(this.maxSpacing.value, this.minSeparation.value * 1.15) : 0;
    const cohere2 = cohere * cohere;
    const placed: THREE.Vector3[] = [];
    const reach = this._spawnCeiling();
    let clampedAny = false;
    // Where the player is standing RIGHT NOW, which on a replay is wherever
    // they walked to — not the origin the board is drawn around.
    const keepOut2 = this._playerKeepOut(this._v1);

    this._orbs.forEach((o, i) => {
      if (i >= count) {
        o.active = false;
        o.alive = false;
        o.burst = 0;
        o.group.visible = false;
        if (o.trigger) o.trigger.enabled.value = false;
        return;
      }

      /*
       * Two competing constraints: no closer than Minimum Separation to any
       * orb, and no further than Max Spacing from the nearest one. Score every
       * sample against both and keep the best rather than taking the first
       * that fits — with a cohesion cap, first-fit degenerates to "whatever
       * the 40th sample was", which is the one place the field looks worst.
       */
      let px = 0, pz = 0, py = 0, bestScore = -Infinity;
      for (let attempt = 0; attempt < 40; attempt++) {
        const ang = rnd() * Math.PI * 2;
        const area = this.spawnArea.value;
        // Ring hugs the outer radius; everything else fills the area evenly.
        const rad = area === SpawnArea.Ring ? maxR : annulusRadius(rnd, minR, maxR);
        const cx = Math.cos(ang) * rad;
        const cz = Math.sin(ang) * rad;
        let cy = this.spawnHeight.value + (rnd() - 0.5) * 2 * this.spawnHeightJitter.value;
        if (area === SpawnArea.Dome) {
          const t = maxR > 0 ? 1 - Math.min(1, rad / maxR) : 0;
          cy += t * t * this.spawnHeight.value * 1.5;
        }

        let nearest2 = Infinity;
        for (const q of placed) {
          const d2 = (q.x - cx) ** 2 + (q.z - cz) ** 2;
          if (d2 < nearest2) nearest2 = d2;
        }
        // 1 means "satisfied"; below 1 says how badly it misses.
        const sepOk = placed.length === 0 || sep2 <= 0 ? 1 : nearest2 / sep2;
        const cohOk = placed.length === 0 || cohere2 <= 0 ? 1
          : Math.min(1, cohere2 / Math.max(nearest2, 1e-6));
        /*
         * Clearing the player is worth more than spacing.
         *
         * An orb too close to its neighbour looks slightly clumped. An orb on
         * top of the player is gone before they see it and the round starts a
         * can short for no visible reason — so when the two constraints fight,
         * this is the one that wins. Weighted x3 against separation's x2.
         */
        const plrOk = keepOut2 === null ? 1 : Math.min(1,
          ((cx - this._v1.x) ** 2 + (cz - this._v1.z) ** 2) / keepOut2);
        const score = Math.min(sepOk, 1) * 2 + cohOk + plrOk * 3;
        if (score > bestScore) { bestScore = score; px = cx; pz = cz; py = cy; }
        if (sepOk >= 1 && cohOk >= 1 && plrOk >= 1) break;
      }

      // Never spawn an orb the player physically cannot touch. Height is the
      // one axis a player can't solve by walking, so an orb above the combined
      // reach of the two spheres is unwinnable and reads as a bug — which is
      // exactly what it is. Clamp instead, and say so once.
      const capped = Math.min(py, reach);
      if (capped < py - 1e-4) clampedAny = true;
      py = Math.max(0.05, capped);

      const p = new THREE.Vector3(px, py, pz);
      placed.push(p);
      o.home.copy(p);
      o.group.position.copy(p);
      o.phase = rnd();
      // Random orientation gives each orb a different slice of the shared
      // noise field — the cheap way to vary a one-material crowd.
      o.inner.rotation.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
      o.inner.scale.setScalar(this.orbSize.value);
      o.custom.scale.setScalar(1);
      o.beacon.scale.setScalar(this.beaconSize.value);
      o.active = true;
      o.alive = true;
      o.burst = 0;
      o.group.visible = true;
      if (o.trigger) o.trigger.enabled.value = true;
    });

    /*
     * The board is invisible while lounging, and _layout is the one place
     * that turns orbs back on.
     *
     * Fourteen different things call it — the entry into lounge itself, a
     * respawn, and every spawn property in the panel — so guarding the
     * callers means guarding fourteen places and getting one wrong. Re-assert
     * the invariant here instead: after a layout, if we're lounging, the
     * board is empty. That's why a pickup could still be standing in the
     * lounge after a round.
     */
    if (this._noRound) this._applyLoungeBoard();

    if (clampedAny && !this._warnedReach) {
      this._warnedReach = true;
      console.warn(
        `[OrbHuntGame] Some orbs spawned above the player's reach (${reach.toFixed(2)}) ` +
        `and were lowered. Reach = Player Height Offset (${this.playerHeightOffset.value}) ` +
        `+ Player Pickup Radius (${this.playerRadius.value}) + orb radius ` +
        `(${this._orbRadius().toFixed(2)}). Lower Spawn Height / Spawn Height Jitter, ` +
        `or raise one of those, to place them where you intended.`);
    }

    this._sizeOrbTriggers();
    this._syncHud();
  }

  /**
   * Move a collected orb somewhere new.
   *
   * Draws from the round's live stream rather than re-seeding from the score,
   * so a one-orb board doesn't walk a fixed circuit — with `seed + score * 977`
   * the Nth pickup of every round landed in exactly the same place.
   *
   * Two rejections, best-of-N rather than first-fit: don't land on the player
   * (an orb that respawns on top of them is collected instantly and reads as a
   * skipped pickup), and don't land on another live orb.
   */
  private _respawn(o: OrbSlot) {
    const rnd = this._rng;
    const minR = Math.max(0, this.spawnMinRadius.value);
    const maxR = Math.max(minR, this.spawnMaxRadius.value);
    const sep2 = this.minSeparation.value * this.minSeparation.value;
    // The same keep-out the initial layout uses, off the same property — this
    // used to hardcode its own 1.5 and the two could drift apart.
    const keepOut2 = this._playerKeepOut(this._v1);

    let bestX = 0, bestZ = 0, bestPy = this.spawnHeight.value, bestScore = -Infinity;
    for (let attempt = 0; attempt < 14; attempt++) {
      const ang = rnd() * Math.PI * 2;
      const rad = this.spawnArea.value === SpawnArea.Ring
        ? maxR : annulusRadius(rnd, minR, maxR);
      const px = Math.cos(ang) * rad, pz = Math.sin(ang) * rad;
      const py = this.spawnHeight.value + (rnd() - 0.5) * 2 * this.spawnHeightJitter.value;

      // Infinity, not 0, when there is nobody to avoid: this term is a MIN
      // over constraints, so an unsatisfiable-looking 0 would pin every score
      // at zero and the best-of-N would collapse to the first sample.
      const plr = keepOut2 === null ? Infinity
        : ((px - this._v1.x) ** 2 + (pz - this._v1.z) ** 2) / keepOut2;
      let dOrb = Infinity;
      for (const q of this._orbs) {
        if (q === o || !q.active || !q.alive) continue;
        dOrb = Math.min(dOrb, (q.home.x - px) ** 2 + (q.home.z - pz) ** 2);
      }
      // Score a candidate by how comfortably it clears every constraint, and
      // keep the best. First-fit would fall back to the LAST sample when every
      // one clashes, which on a crowded board is the worst of them.
      const cohere = this.maxSpacing.value > 0
        ? Math.max(this.maxSpacing.value, this.minSeparation.value * 1.15) : 0;
      const cohesion = cohere > 0 && isFinite(dOrb)
        ? Math.min(1, (cohere * cohere) / Math.max(dOrb, 1e-6)) : 1;
      const score = Math.min(
        plr,
        sep2 > 0 ? dOrb / sep2 : Infinity,
        cohesion,
      );
      if (score > bestScore) { bestScore = score; bestX = px; bestZ = pz; bestPy = py; }
      if (score >= 1) break;
    }

    o.home.set(
      bestX,
      Math.max(0.05, Math.min(bestPy, this._spawnCeiling())),
      bestZ,
    );
    o.group.position.copy(o.home);
    o.active = true;              // a respawn must restore every flag _layout sets
    o.alive = true;
    o.burst = 0;
    o.group.visible = !this._noRound;
    // The collect burst inflates the beacon; only the burst's own completion
    // resets it, and respawning cancels the burst before it gets there.
    o.beacon.scale.setScalar(this.beaconSize.value);
    o.inner.scale.setScalar(this.orbSize.value);
    o.custom.scale.setScalar(1);
    if (o.trigger) o.trigger.enabled.value = !this._noRound;
  }

  /* ── round flow ───────────────────────────────────────────────────── */

  private _start() {
    this._exitLounge();
    this._exitHideout();
    this._newRoundSeed();
    this._portalHum(false);
    this._score = 0;
    this._streak = 0;
    this._warned = false;
    this._nextWarnAt = 0;
    this._timeLeft = this.roundTime.value;
    this._portalOpen = 0;
    this._portalDone = false;
    this._portalClosing = false;
    this._humStopAt = -1;
    this._portalCloseAt = -1;
    this._resetAt = -1;
    // Whatever comes next — a retry, a reset, the lounge — the timeout panel
    // and its pending open both belong to the round that just ended.
    this._closeTimeout();
    this._hideReward(true);
    this._portalU.uOpacity.value = 0;
    this._layout();
    this._applyPortalVisibility();
    this._setState(GameState.Playing);
    this._closeMenu();
    this._playClip(this.startTimeline.value);
    this.onGameStart.emit();
  }

  /**
   * Roll the seed the next layout will use.
   *
   * Mattercraft ships no RNG, so the entropy has to come from Math.random().
   * That's the only unseeded call in the component and it's deliberately
   * confined here: everything downstream is still a reproducible mulberry32
   * stream, so a round can be replayed exactly by reading _roundSeed back out.
   */
  private _newRoundSeed() {
    this._roundSeed = this.randomizeEachRound.value
      ? (Math.random() * 4294967296) >>> 0
      : (this.seed.value | 0);
    this._rng = mulberry32(this._roundSeed ^ 0x9e3779b9);
  }

  private _reset() {
    this._portalHum(false);
    this._score = 0;
    this._streak = 0;
    this._timeLeft = this.roundTime.value;
    this._portalOpen = 0;
    this._portalDone = false;
    this._portalClosing = false;
    this._humStopAt = -1;
    this._portalCloseAt = -1;
    this._resetAt = -1;
    // Whatever comes next — a retry, a reset, the lounge — the timeout panel
    // and its pending open both belong to the round that just ended.
    this._closeTimeout();
    this._hideReward(true);
    this._portalU.uOpacity.value = 0;
    this._layout();
    this._applyPortalVisibility();
    // Back to Placing if the scene still needs placing, otherwise Idle.
    this._setState(this.placementEnabled.value && !this._placed
      ? GameState.Placing : GameState.Idle);
    this.onGameReset.emit();
  }

  private _collect(o: OrbSlot) {
    o.alive = false;
    o.burst = 0.0001;
    if (o.trigger) o.trigger.enabled.value = false;

    this._score++;
    this._streak++;

    const step = this.collectPitchStep.value;
    const speed = 1 + step * Math.min(this._streak - 1, 12);
    this._play(this._sfxCollect, this.constructorProps.collectSound,
               () => this._audio?.collect(this._streak, step), speed);

    this.onOrbCollected.emit({ score: this._score, target: this.targetCount.value });
    this._syncHud();

    if (this._score >= clampInt(this.targetCount.value, 1, 999)) this._win();
    else if (this.respawnCollected.value) this._respawn(o);
  }

  private _win() {
    this._setState(GameState.Won);
    this._play(this._sfxWin, this.constructorProps.winSound, () => this._audio?.win());
    this._portalHum(true);
    if (this.portalHumSeconds.value > 0) {
      this._humStopAt = this._time + this.portalHumSeconds.value;
    }
    this._portal.visible = true;
    this.onTargetReached.emit();
    this._playClip(this.winTimeline.value);
    // Scheduled rather than immediate: the win cue and the unlock sting on top
    // of each other read as noise, and the portal deserves a beat on its own.
    if (this.rewardEnabled.value) {
      this._rewardAt = this._time + Math.max(0, Math.min(5, this.rewardDelay.value));
    }
  }

  /* ── digital exclusive ─────────────────────────────────────────────── */

  private _showReward() {
    this._rewardAt = -1;
    const word = this.rewardWordmark.value;
    const badge = this.rewardBadge.value;
    const dur = Math.max(1, Math.min(20, this.rewardDuration.value));

    this._syncReward();
    this._syncRewardTheme();
    this._fitReward();

    if (word) {
      // Restarting a CSS animation needs the class off, a reflow, then on —
      // otherwise a second win in the same session shows a static wordmark.
      this._rwWord.classList.remove("on");
      void this._rwWord.offsetWidth;
      this._rwWord.classList.add("on");
      this._rwWordHideAt = this._time + dur;
      // Duck the HUD. The clock is stopped and the score is final, so the
      // numbers have nothing left to say — and on a short landscape viewport
      // the centred timer sits exactly where the headline wants to be.
      this._duckHud(true);
    }

    if (badge && !word) {
      this._rwBadge.classList.remove("on");
      void this._rwBadge.offsetWidth;
      this._rwBadge.classList.add("on");
      this._rwBadgeHideAt = this._time + dur;
    } else if (badge && word) {
      // Hand-off, not cross-fade: the badge waits until the wordmark has begun
      // leaving. On a short landscape viewport the two occupy the same band of
      // screen, and overlapping them there reads as a layout bug.
      this._rwBadgeHideAt = this._time + dur + 4.25;
      this._rwBadge.classList.remove("on");
      window.setTimeout(() => {
        if (this._rwBadgeHideAt > 0) this._rwBadge.classList.add("on");
      }, Math.round(dur * 1000 + 250));
    }

    /*
     * The modal is the last beat. Its delay is measured from the END of
     * whatever ran before it, not from the win — so changing Reward Duration
     * doesn't silently reopen the overlap the delay was set to avoid. With
     * nothing before it, it's measured from the win itself.
     */
    if (this.rewardModal.value) {
      const gap = Math.max(0, Math.min(30, this.rewardModalDelay.value));
      const runsFirst = word ? dur : 0;
      this._rwModalAt = this._time + runsFirst + gap;
    }

    this._play(this._sfxReward, this.constructorProps.rewardSound,
               () => this._audio?.reward());
    this._playClip(this.rewardTimeline.value);
    this.onRewardShown.emit();
  }

  /* ── reward modal ─────────────────────────────────────────────────── */

  /**
   * The redemption steps, built once and used in two places: the How To Claim
   * screen and the reward panel in Instructions mode. One builder because one
   * set of copy — two renderers would drift the moment a step changed.
   *
   * A step with no text is skipped, so blanking Step 4 removes it rather than
   * leaving an empty numbered row.
   */
  private _stepsHtml() {
    const E = OrbHuntGame._esc;
    const steps: [string, string][] = [
      [this.step1Text.value, this.step1Image.value],
      [this.step2Text.value, this.step2Image.value],
      [this.step3Text.value, this.step3Image.value],
      [this.step4Text.value, this.step4Image.value],
    ];
    const link = this.step1Link.value.trim();
    const code = this.claimCode.value.trim();
    let n = 0;
    return steps.filter(([t, img]) => t.trim() || img.trim()).map(([text, img], i) => {
      n++;
      const isFirst = i === 0;
      // The code goes with whichever step actually names it, so moving the
      // wording between steps doesn't strand the chip on the wrong one.
      const showsCode = !!code && text.includes(code);
      const body = showsCode
        ? E(text).replace(E(code),
            `<button class="ohg-stepCode" type="button" data-code="1">${E(code)}</button>`)
        : E(text);
      return `<li class="ohg-step">
          <span class="ohg-stepNum" aria-hidden="true">${n}</span>
          <div class="ohg-stepBody">
            <p class="ohg-stepText">${body}</p>
            ${isFirst && link
              ? `<a class="ohg-stepLink" href="${E(link)}" target="_blank" rel="noopener">` +
                `${E(this.step1LinkLabel.value.trim() || "Open link")}</a>` : ""}
            ${img.trim()
              // A button, not a bare <img>: the screenshots carry the detail
              // people came for (a menu corner, a code field) and at step
              // width they're too small to read, so tapping one has to open
              // it. Making the wrapper a real control gets keyboard focus,
              // Enter/Space and a screen-reader name for free — a click
              // handler on an <img> gets none of those.
              ? `<button class="ohg-shot" type="button" data-shot="${E(img)}"
                         aria-label="${E(this.imageViewerOpenLabel.value.trim()
                                        || "View image full screen")}">
                   <img class="ohg-stepImg" src="${E(img)}" alt="" loading="lazy" />
                   <span class="ohg-shotHint" aria-hidden="true">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="2.2" stroke-linecap="round">
                       <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>
                     </svg>
                   </span>
                 </button>` : ""}
          </div>
        </li>`;
    }).join("");
  }

  /**
   * Wire a freshly rendered step list.
   *
   * Both renderers call this ONE function rather than each remembering to
   * call the code binder and the image binder. Two call sites that each have
   * to list every binding is how the reward panel ends up with live steps and
   * dead screenshots the first time a third binding is added.
   */
  private _bindSteps(root: HTMLElement) {
    this._bindStepCodes(root);
    this._bindStepShots(root);
  }

  /** Copy the claim code, and say so — a silent copy reads as a dead button. */
  private _bindStepCodes(root: HTMLElement) {
    root.querySelectorAll<HTMLButtonElement>(".ohg-stepCode").forEach(btn => {
      btn.addEventListener("click", () => {
        const code = this.claimCode.value.trim();
        const done = () => {
          const was = btn.textContent;
          btn.textContent = "Copied";
          btn.classList.add("ohg-copied");
          window.setTimeout(() => {
            btn.textContent = was;
            btn.classList.remove("ohg-copied");
          }, 1400);
        };
        // Clipboard access needs a secure context and can be refused outright,
        // so the feedback only fires on success — claiming "Copied" when
        // nothing was copied is worse than no feedback at all.
        navigator.clipboard?.writeText(code).then(done, () => {
          console.warn("[OrbHuntGame] Clipboard refused; the code is still on screen.");
        });
      });
    });
  }

  /* ── image viewer ─────────────────────────────────────────────────── */

  /** Every step screenshot opens the viewer. */
  private _bindStepShots(root: HTMLElement) {
    root.querySelectorAll<HTMLButtonElement>(".ohg-shot").forEach(btn => {
      btn.addEventListener("click", () => this._openImage(btn.dataset.shot ?? "", btn));
    });
  }

  /**
   * Show one image full screen.
   *
   * It opens at "fit" — the whole picture inside the viewport — because the
   * first thing anyone wants is to see all of it at a readable size. A second
   * tap goes to 2× and the frame becomes scrollable, which is how you read a
   * small label in the corner of a screenshot. Native scrolling does the
   * panning: no drag maths, and momentum, bounce and trackpads all behave the
   * way the platform already does.
   */
  private _openImage(src: string, opener?: HTMLElement) {
    if (!src || !this._lightWrap) return;
    this._lightOpener = opener;
    this._lightImg.src = src;
    this._setImageZoom(false);
    this._lightWrap.classList.add("on");
    // Focus moves into the viewer so Escape and Tab belong to it, not to the
    // dialog still open underneath.
    (this._lightWrap.querySelector(".ohg-lightX") as HTMLButtonElement | null)?.focus();
  }

  private _closeImage() {
    if (!this._lightWrap) return;
    this._lightWrap.classList.remove("on");
    this._setImageZoom(false);
    // Back to the thumbnail that opened it, or keyboard focus is stranded on
    // a hidden button and the next Tab starts from the top of the document.
    this._lightOpener?.focus();
    this._lightOpener = undefined;
    // Dropping the source frees the decoded bitmap; a 1100px screenshot held
    // behind an invisible layer is memory an AR session would rather have.
    this._lightImg.removeAttribute("src");
  }

  private _setImageZoom(on: boolean) {
    const frame = this._lightWrap.querySelector(".ohg-lightFrame") as HTMLElement | null;
    this._lightWrap.classList.toggle("ohg-zoomed", on);
    const zoom = this._lightWrap.querySelector(".ohg-lightZoom") as HTMLButtonElement | null;
    if (zoom) {
      zoom.setAttribute("aria-pressed", String(on));
      zoom.setAttribute("aria-label", on ? "Fit image to screen" : "Zoom in");
    }
    if (frame && !on) { frame.scrollLeft = 0; frame.scrollTop = 0; }
    else if (frame && on) {
      // Zooming to the top-left corner of a screenshot is disorienting.
      // Centre it, and let the reader scroll out to whichever edge they want.
      frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
      frame.scrollTop = (frame.scrollHeight - frame.clientHeight) / 2;
    }
  }

  private _syncInstructions() {
    if (!this._insWrap) return;
    const q = <T extends HTMLElement>(sel: string) => this._insWrap.querySelector(sel) as T;
    q(".ohg-insTitle").textContent = this.instructionsTitle.value;
    q(".ohg-insClose").textContent = this.instructionsCloseLabel.value.trim() || "Close";
    const list = q<HTMLElement>(".ohg-steps");
    list.innerHTML = this._stepsHtml();
    this._bindSteps(list);
    // The reward panel shares the steps, so it has to be rebuilt with them.
    if (this._rwModalWrap) this._syncRewardModal();
  }

  /**
   * Open the How To Claim screen.
   *
   * `returnToReward` is declared by the CALLER rather than inferred from
   * whether the reward panel happens to be open, because by the time this runs
   * the panel has already been closed to make room for the steps. Every entry
   * point therefore says where it came from, and a new one has to say too.
   */
  private _openInstructions(returnToReward = false) {
    if (!this._insWrap || !this.uiEnabled.value) return;
    this._insFromReward = returnToReward;
    this._syncInstructions();
    this._insWrap.classList.remove("on");
    void this._insWrap.offsetWidth;
    this._insWrap.classList.add("on");
  }

  private _closeInstructions() {
    if (this._insWrap) this._insWrap.classList.remove("on");
    /*
     * Closing the steps you reached FROM the reward panel puts the panel back.
     *
     * Otherwise that route was a one-way door: Claim closed the panel to show
     * the steps, and closing the steps left the player on a finished board
     * with a spent clock, the portal open and no Replay anywhere — the only
     * way on was to find the menu and press Restart. The panel is where Replay,
     * Lounge and Claim all live, so returning to it is returning to every
     * choice they had a moment ago.
     */
    if (this._insFromReward) {
      this._insFromReward = false;
      this._reopenRewardModal();
      return;
    }
    // The menu paused the round on its way here, and nothing else will hand
    // it back now that Resume is gone.
    this._resumeIfPaused();
  }

  /**
   * Put the reward panel back without replaying the whole arrival.
   *
   * Not `_openRewardModal`: that restarts the entrance animation and emits
   * On Reward Modal Shown a second time, so a behaviour counting wins would
   * count this one twice and the panel would pop as though it were news. This
   * is a return to something the player already saw.
   */
  private _reopenRewardModal() {
    if (!this._rwModalWrap || !this.uiEnabled.value) return;
    this._syncRewardModal();
    this._syncRewardModalTheme();
    this._rwModalWrap.classList.add("on");
  }

  /** Open the How To Claim screen. @zui */
  public showInstructions() { this._openInstructions(); }

  /** Close the How To Claim screen. @zui */
  public hideInstructions() { this._closeInstructions(); }

  /** True while the How To Claim screen is on. @zui */
  public instructionsOpen() {
    return !!this._insWrap && this._insWrap.classList.contains("on");
  }

  private _syncTimeoutModal() {
    if (!this._toWrap) return;
    const q = <T extends HTMLElement>(sel: string) => this._toWrap.querySelector(sel) as T;
    q(".ohg-toTitle").textContent = this.timeoutTitle.value;
    const body = q<HTMLElement>(".ohg-toBody");
    body.textContent = this.timeoutBody.value;
    body.style.display = this.timeoutBody.value.trim() ? "" : "none";
    q(".ohg-toRetry").textContent = this.timeoutRetryLabel.value.trim() || "Retry";
    const lounge = q<HTMLButtonElement>(".ohg-toLounge");
    // No lounge to go to means no button — an option that leads nowhere is
    // worse than one fewer option.
    lounge.style.display = this.loungeEnabled.value ? "" : "none";
    lounge.textContent = this.timeoutLoungeLabel.value.trim() || "Lounge";
  }

  private _syncTimeoutTheme() {
    if (!this._toWrap) return;
    // On the shell, for the reason spelled out in _syncRewardModalTheme.
    const shell = this._toWrap.querySelector(".ohg-rwmShell") as HTMLElement | null;
    if (!shell) return;
    const st = shell.style;
    st.setProperty("--ohg-rwmA", this.timeoutAccent.value);
    st.setProperty("--ohg-rwmB", this.timeoutAccent2.value);
    // Raw channels: this panel carries text, so its tints have to paint on
    // WebViews with no color-mix support. Same reasoning as the reward panel.
    st.setProperty("--ohg-rwmArgb", rgbChannels(this.timeoutAccent.value, "255,138,107"));
    st.setProperty("--ohg-rwmBrgb", rgbChannels(this.timeoutAccent2.value, "255,84,112"));
  }

  private _openTimeout() {
    if (!this._toWrap || !this.uiEnabled.value) return;
    this._timeoutAt = -1;
    this._syncTimeoutModal();
    this._syncTimeoutTheme();
    // Replay the entrance — a second timeout in one session would otherwise
    // find the panel already settled.
    this._toWrap.classList.remove("on");
    void this._toWrap.offsetWidth;
    this._toWrap.classList.add("on");
    this.onTimeoutModalShown.emit();
  }

  private _closeTimeout() {
    if (!this._toWrap) return;
    this._timeoutAt = -1;
    this._toWrap.classList.remove("on");
  }

  /** True while the timeout panel is on screen. @zui */
  public timeoutModalOpen() {
    return !!this._toWrap && this._toWrap.classList.contains("on");
  }

  /** Show the timeout panel now, without losing a round. @zui */
  public showTimeoutModal() { this._openTimeout(); }

  /** Hide the timeout panel immediately. @zui */
  public hideTimeoutModal() { this._closeTimeout(); }

  private _openRewardModal() {
    if (!this._rwModalWrap || !this.uiEnabled.value) return;
    this._rwModalAt = -1;
    this._syncRewardModal();
    this._syncRewardModalTheme();
    // Restart the entrance: a second win in the same session would otherwise
    // show the panel already settled.
    this._rwModalWrap.classList.remove("on");
    void this._rwModalWrap.offsetWidth;
    this._rwModalWrap.classList.add("on");
    this._playClip(this.rewardModalTimeline.value);
    this.onRewardModalShown.emit();
  }

  private _closeRewardModal(dismissed: boolean) {
    if (!this._rwModalWrap) return;
    this._rwModalAt = -1;
    const wasOpen = this._rwModalWrap.classList.contains("on");
    this._rwModalWrap.classList.remove("on");
    // A deliberate dismissal ends the whole reward flow, detour included.
    if (dismissed) this._insFromReward = false;
    if (wasOpen && dismissed) this.onRewardModalDismissed.emit();
  }

  private _syncRewardModal() {
    if (!this._rwModalWrap) return;
    const q = <T extends HTMLElement>(sel: string) =>
      this._rwModalWrap.querySelector(sel) as T;
    const set = (sel: string, text: string) => {
      const el = q<HTMLElement>(sel);
      el.textContent = text;
      el.style.display = text.trim() ? "" : "none";
    };
    set(".ohg-rwmKicker", this.rewardModalKicker.value);
    set(".ohg-rwmTitle", this.rewardModalTitle.value);
    set(".ohg-rwmBody", this.rewardModalBody.value);

    set(".ohg-rwmClose", this.rewardModalCloseLabel.value);

    const art = q<HTMLDivElement>(".ohg-rwmArt");
    const src = this.constructorProps.rewardModalImage;
    art.innerHTML = src
      ? `<img alt="" src="${src.replace(/"/g, "&quot;")}" />`
      : OrbHuntGame._goldBadgeSvg();

    /*
     * Instructions mode swaps the celebration for the redemption steps.
     *
     * The artwork and body go, because the panel is already the tallest thing
     * on screen once screenshots are in it — keeping a badge above four steps
     * pushes the first one below the fold on a landscape phone, and a step
     * list you have to scroll to discover is a step list nobody follows. The
     * headline and both buttons stay: the win still needs announcing, and
     * Claim is still the point.
     */
    const steps = q<HTMLElement>(".ohg-rwmSteps");
    const asSteps = this.rewardModalContent.value === RewardModalContent.Instructions;
    steps.innerHTML = asSteps ? this._stepsHtml() : "";
    steps.style.display = asSteps ? "" : "none";
    if (asSteps) this._bindSteps(steps);
    art.style.display = asSteps ? "none" : "";
    q<HTMLElement>(".ohg-rwmBody").style.display =
      asSteps || !this.rewardModalBody.value.trim() ? "none" : "";
    this._rwModalWrap.classList.toggle("ohg-rwmWide", asSteps);

    /*
     * The primary button, decided AFTER the content mode is known.
     *
     * A "How to Claim" button on a panel that is already showing the steps
     * closes one sheet and opens an identical one — a control whose entire
     * effect is a transition. So in that combination the button is dropped
     * and the panel keeps its close row, which is the honest way out. Point
     * the action at Open Link and the button comes back, because leaving for
     * the site is something the steps in front of you can't do.
     */
    const lounge = q<HTMLButtonElement>(".ohg-rwmLounge");
    const loungeLabel = this.loungeButtonLabel.value.trim();
    lounge.textContent = loungeLabel;
    // Gated on Lounge Mode itself as well as its own toggle: a row leading to
    // a mode that doesn't exist is worse than no row.
    lounge.style.display =
      this.rewardModalLounge.value && this.loungeEnabled.value && loungeLabel
        ? "" : "none";

    const replay = q<HTMLButtonElement>(".ohg-rwmReplay");
    const replayLabel = this.rewardModalReplayLabel.value.trim();
    replay.textContent = replayLabel;
    replay.style.display =
      this.rewardModalReplay.value && replayLabel ? "" : "none";

    const claim = q<HTMLButtonElement>(".ohg-rwmClaim");
    const redundant = asSteps &&
      this.rewardModalButtonAction.value === RewardClaimAction.Instructions;
    (claim.querySelector(".ohg-claimLbl") as HTMLElement).textContent =
      this.rewardModalButtonLabel.value;
    claim.style.display =
      !redundant && this.rewardModalButtonLabel.value.trim() ? "" : "none";
  }

  private _syncRewardModalTheme() {
    if (!this._rwModalWrap) return;
    /*
     * The variables go on the SHELL, not the wrap.
     *
     * .ohg-rwmShell declares its own --ohg-rwmA/B defaults, and a custom
     * property declared on an element beats one inherited from its parent —
     * so setting them on the wrap never reached the panel and the accent
     * properties did nothing at all. It looked like it worked only because
     * the default value happened to equal the one in the stylesheet. Inline
     * on the shell outranks the class rule on the shell, which is what makes
     * these properties real.
     */
    const shell = this._rwModalWrap.querySelector(".ohg-rwmShell") as HTMLElement | null;
    if (!shell) return;
    const st = shell.style;
    st.setProperty("--ohg-rwmA", this.rewardModalAccent.value);
    st.setProperty("--ohg-rwmB", this.rewardModalAccent2.value);
    // Raw channels for the same reason as the badge: this panel carries text,
    // so its tints have to paint on WebViews without color-mix.
    st.setProperty("--ohg-rwmArgb", rgbChannels(this.rewardModalAccent.value, "79,227,208"));
    st.setProperty("--ohg-rwmBrgb", rgbChannels(this.rewardModalAccent2.value, "47,143,255"));
    /*
     * Three rows, three colours, so three destinations read as three things.
     *
     * Claim takes the author's pale blue, Lounge takes the lounge accent (the
     * same colour that row wears in the menu, so it's recognisable as the same
     * place), and Replay keeps the panel's own accent. Only Claim is filled —
     * it's still the commercial action — and the other two are outlines, so
     * the hierarchy survives having three of them.
     */
    const claim = this.rewardModalClaimColor.value;
    const cr: [number, number, number] = [
      Math.round(Math.max(0, Math.min(1, claim[0])) * 255),
      Math.round(Math.max(0, Math.min(1, claim[1])) * 255),
      Math.round(Math.max(0, Math.min(1, claim[2])) * 255),
    ];
    const lift = (k: number) =>
      cr.map(v => Math.round(v + (255 - v) * k)).join(",");
    const sink = (k: number) => cr.map(v => Math.round(v * k)).join(",");
    st.setProperty("--ohg-rwmClaimRgb", cr.join(","));
    st.setProperty("--ohg-rwmClaimLight", `rgb(${lift(0.22)})`);
    st.setProperty("--ohg-rwmClaimDeep", `rgb(${sink(0.86)})`);
    // Measured, not assumed. A pale fill needs dark text and a deep one needs
    // white, and the author is free to pick either — so the label is whichever
    // of the two actually clears 4.5:1 on what they chose.
    st.setProperty("--ohg-rwmClaimOn", bestTextOn(cr));

    const lounge = this.loungeAccent.value;
    st.setProperty("--ohg-rwmLoungeRgb", [
      Math.round(Math.max(0, Math.min(1, lounge[0])) * 255),
      Math.round(Math.max(0, Math.min(1, lounge[1])) * 255),
      Math.round(Math.max(0, Math.min(1, lounge[2])) * 255),
    ].join(","));

    this._rwModalWrap.classList.toggle("ohg-rwmSpinning", this.rewardModalAnimate.value);
    this._rwModalWrap.classList.toggle("ohg-rwmFrosted", this.rewardModalGlass.value);
  }

  /**
   * The default artwork: a gold medallion, drawn rather than shipped.
   *
   * A bundled PNG would be another asset to load and would blur when the modal
   * scales up on a tablet. The metal read comes from three things a flat gold
   * fill doesn't give you: a diagonal gradient with a light band across the
   * middle, a darker rim with a bright inner edge, and a specular highlight
   * that sits off-centre.
   */
  private static _goldBadgeSvg() {
    return `
    <svg viewBox="0 0 120 120" class="ohg-rwmBadge" aria-hidden="true">
      <defs>
        <linearGradient id="ohgGold" x1="18%" y1="0%" x2="82%" y2="100%">
          <stop offset="0%"   stop-color="#fff3c4"/>
          <stop offset="22%"  stop-color="#f7d982"/>
          <stop offset="24%"  stop-color="#f2ca63"/>
          <stop offset="46%"  stop-color="#c9922b"/>
          <stop offset="55%"  stop-color="#ffe9a8"/>
          <stop offset="70%"  stop-color="#d9a13c"/>
          <stop offset="100%" stop-color="#8a5f16"/>
        </linearGradient>
        <linearGradient id="ohgRim" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%"   stop-color="#ffe9a8"/>
          <stop offset="50%"  stop-color="#a4761f"/>
          <stop offset="100%" stop-color="#6d4a12"/>
        </linearGradient>
        <radialGradient id="ohgSpec" cx="34%" cy="28%" r="42%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity=".85"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="52" fill="url(#ohgRim)"/>
      <circle cx="60" cy="60" r="45" fill="url(#ohgGold)"/>
      <circle cx="60" cy="60" r="45" fill="none" stroke="#fff2c9"
              stroke-opacity=".55" stroke-width="1.5"/>
      <path d="M60 30l7.6 15.9 17.2 2.5-12.5 12.4 3 17.4L60 70l-15.3 8.2 3-17.4
               L35.2 48.4l17.2-2.5L60 30z" fill="#fff6d8" fill-opacity=".92"/>
      <circle cx="60" cy="60" r="52" fill="url(#ohgSpec)"/>
    </svg>`;
  }

  private readonly _onResize = () => {
    this._fitReward();
    this._applyLoungeOffset();
    this._applyHudStack();
    // vmin flips on rotation, so the logo's height — and the room the HUD
    // has to leave for it — changes with the orientation.
    this._applyLogoClearance();
  };

  /**
   * Escape closes the image viewer.
   *
   * Only the viewer: it's the one layer that opens on top of another dialog,
   * so Escape there has an unambiguous meaning. Wiring Escape to the menu as
   * well would make one key close two things at once, and on a phone nobody
   * has a key to press anyway — this is for whoever previews the build on a
   * laptop.
   */
  private readonly _onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (!this._lightWrap?.classList.contains("on")) return;
    e.stopPropagation();
    this._closeImage();
  };

  private _duckHud(on: boolean) {
    [this._scoreWrap, this._timeWrap].forEach(e => e?.classList.toggle("ohg-ducked", on));
  }

  private _hideReward(immediate = false) {
    this._rewardAt = -1;
    // The detour belonged to the win that is being cleared. Leaving it set
    // would pop the reward panel the next time somebody closes the steps from
    // the menu, mid-round.
    this._insFromReward = false;
    this._closeRewardModal(false);
    this._rwWordHideAt = -1;
    this._rwBadgeHideAt = -1;
    this._rwWord.classList.remove("on");
    this._rwBadge.classList.remove("on");
    this._duckHud(false);
    if (immediate) {
      // Skip the exit transition entirely — used by reset, where the next
      // round shouldn't inherit a fading celebration.
      [this._rwWord, this._rwBadge].forEach(e => {
        e.classList.add("ohg-noAnim");
        void e.offsetWidth;
        e.classList.remove("ohg-noAnim");
      });
    }
  }

  /** Text and emblem. Cheap, so it just rewrites rather than diffing. */
  private _syncReward() {
    if (!this._rwWord) return;
    const q = <T extends Element>(s: string) => this._rewardWrap.querySelector(s) as T;
    const title = this.rewardTitle.value;
    const msg = this.rewardMessage.value;
    const kick = this.rewardKicker.value;
    const emblem = this._emblemSvg(this.rewardIcon.value);

    q<HTMLElement>(".ohg-rwEmblem").innerHTML = emblem;
    q<HTMLElement>(".ohg-rwEmblem").style.display = emblem ? "" : "none";
    q<HTMLElement>(".ohg-rwKicker").textContent = kick;
    q<HTMLElement>(".ohg-rwKicker").style.display = kick ? "" : "none";
    q<HTMLElement>(".ohg-rwTitle").textContent = title;
    q<HTMLElement>(".ohg-rwPlate").style.display = title ? "" : "none";
    q<HTMLElement>(".ohg-rwMsg").textContent = msg;
    q<HTMLElement>(".ohg-rwMsg").style.display = msg ? "" : "none";

    q<HTMLElement>(".ohg-rwBadgeIc").innerHTML = emblem;
    q<HTMLElement>(".ohg-rwBadgeTitle").textContent = title || kick;
    q<HTMLElement>(".ohg-rwBadgeSub").textContent = msg;
    q<HTMLElement>(".ohg-rwBadgeSub").style.display = msg ? "" : "none";

    this._fitReward();
  }

  /**
   * Shrink the headline until it fits on one line.
   *
   * Measured, not estimated: a character count can't know the font, and the
   * first version of this guessed 0.62em per character and clipped
   * "DIGITAL EXCLUSIVE" on a phone. `scrollWidth` is the real typeset width
   * even while the layer is hidden (visibility, not display), so this is safe
   * to call before the reveal.
   */
  private _fitReward() {
    if (!this._rwWord) return;
    const t = this._rewardWrap.querySelector(".ohg-rwTitle") as HTMLElement | null;
    if (!t || !t.textContent) return;
    if (this._rwWord.clientWidth <= 0) return;     // not laid out yet
    // Iterative, because the plate's padding is in em: shrinking the type also
    // shrinks the box around it, so one division lands a few pixels out. Two
    // passes is normally enough; four is the safety net.
    let scale = 1;
    this._rwWord.style.setProperty("--ohg-rwScale", "1");
    for (let i = 0; i < 4; i++) {
      const avail = t.clientWidth, need = t.scrollWidth;
      if (!need || !avail || need <= avail) break;
      scale = Math.max(0.18, scale * (avail / need) * 0.985);
      this._rwWord.style.setProperty("--ohg-rwScale", scale.toFixed(4));
    }
  }

  /** Colours and the electric switch — separate so a colour tweak is cheap. */
  private _syncRewardTheme() {
    if (!this._rwWord) return;
    const s = this._rewardWrap.style;
    s.setProperty("--ohg-rwA", this.rewardColorA.value);
    s.setProperty("--ohg-rwB", this.rewardColorB.value);
    s.setProperty("--ohg-rwIc", this.rewardIconColor.value);
    // Also publish the raw channels so the CSS can build translucent tints with
    // plain rgba() instead of color-mix(). Anything the player reads text on
    // has to paint on every WebView, not only the ones with color-mix.
    s.setProperty("--ohg-rwArgb", rgbChannels(this.rewardColorA.value, "111,242,255"));
    s.setProperty("--ohg-rwBrgb", rgbChannels(this.rewardColorB.value, "160,123,255"));
    this._rewardWrap.classList.toggle("ohg-electric", this.rewardElectric.value);
  }

  private _emblemSvg(i: RewardIcon) {
    const S = (d: string) =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"` +
      ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    switch (i) {
      case RewardIcon.Trophy:
        return S(`<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/>` +
                 `<path d="M7 5H4v2a3 3 0 0 0 3 3"/><path d="M12 14v3"/><path d="M9 20h6"/>` +
                 `<path d="M10 17h4l1 3H9l1-3z"/>`);
      case RewardIcon.Medal:
        return S(`<circle cx="12" cy="14.5" r="5.5"/><path d="m8.5 9.5-3-6.5h5l2 4"/>` +
                 `<path d="m15.5 9.5 3-6.5h-5l-2 4"/><path d="m12 12 .9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1` +
                 `.4-2L8.7 14.2l2-.3L12 12z"/>`);
      case RewardIcon.Star:
        return S(`<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9L12 3z"/>`);
      case RewardIcon.Bolt:
        return S(`<path d="M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2z"/>`);
      case RewardIcon.Orb:
        return `<span class="ohg-rwOrb" aria-hidden="true"></span>`;
      case RewardIcon.Gift:
        return S(`<rect x="3" y="9" width="18" height="12" rx="1.6"/><path d="M3 13.5h18"/>` +
                 `<path d="M12 9v12"/><path d="M12 9S10.5 3 8 3a2.4 2.4 0 0 0 0 6"/>` +
                 `<path d="M12 9s1.5-6 4-6a2.4 2.4 0 0 1 0 6"/>`);
      case RewardIcon.Sparkle:
        return S(`<path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5z"/>` +
                 `<path d="M19 3.5 19.8 6l2.5.8-2.5.8L19 10l-.8-2.4L15.7 6.8 18.2 6 19 3.5z"/>`);
      default: return "";
    }
  }

  private _syncClaim() {
    if (!this._menuWrap) return;
    const b = this._menuWrap.querySelector(".ohg-claim") as HTMLButtonElement | null;
    if (!b) return;
    b.style.display = this.claimEnabled.value ? "" : "none";
    (b.querySelector(".ohg-claimLbl") as HTMLElement).textContent =
      this.claimLabel.value || "Claim Digital Exclusive";
  }

  private _claim() {
    this.onClaimed.emit();
    this._playClip(this.claimTimeline.value);
    // Falls back to the instructions' own link: one destination, described
    // in one place, so the two can't drift apart.
    const url = this.claimUrl.value.trim() || this.step1Link.value.trim();
    if (!url) return;
    // `noopener` is not optional on a target=_blank link: without it the new
    // tab gets a handle on this window and can navigate the AR session away.
    if (this.claimNewTab.value) window.open(url, "_blank", "noopener,noreferrer");
    else window.location.href = url;
  }

  /**
   * Another round, straight from the reward panel.
   *
   * `_start()` already closes this panel and clears the celebration on its way
   * through `_hideReward(true)`, so there is nothing to tear down here — and
   * doing it twice would restart the entrance animation of a panel that is on
   * its way out.
   *
   * The event and the timeline fire BEFORE the round starts, so a behaviour
   * hanging off either one is looking at the panel that was just dismissed
   * rather than at a board that has already been rebuilt underneath it.
   */
  private _replay() {
    this.onReplay.emit();
    this._playClip(this.replayTimeline.value);
    this.startGame();
  }

  /**
   * The reward panel's primary button.
   *
   * Its default is the steps rather than the link, because the item is
   * redeemed by typing a code into another app: sending someone to that app
   * with no code is sending them nowhere, and they will not come back to an
   * AR session they've already navigated away from to find out what it was.
   *
   * Both branches emit On Claimed and play Claim Timeline. The claim is the
   * player's intent, not the mechanism, so a scene reacting to it — a sound,
   * an analytics ping, an animation — doesn't have to care which route the
   * author picked.
   */
  private _rewardModalClaim() {
    if (this.rewardModalButtonAction.value === RewardClaimAction.OpenLink) {
      this._claim();
      this._closeRewardModal(false);
      return;
    }
    this.onClaimed.emit();
    this._playClip(this.claimTimeline.value);
    // Closed, not stacked: two glass panels over an AR camera feed is a lot of
    // screen for a phone, and the steps are the thing being read now.
    this._closeRewardModal(false);
    this._openInstructions(true);
  }

  private _fail() {
    this._setState(GameState.Failed);
    this._play(this._sfxFail, this.constructorProps.failSound, () => this._audio?.fail());
    this.onTimeUp.emit();
    this._playClip(this.failTimeline.value);
    if (this.timeoutModal.value && this.uiEnabled.value) {
      /*
       * The panel owns the outcome, so the automatic reset is skipped.
       * Otherwise the board would rebuild itself under an open dialog while
       * the player is still reading it, and Retry would then be restarting a
       * round that had already restarted — which looks like a double reset.
       */
      this._timeoutAt = this._time + Math.max(0, this.timeoutDelay.value);
    } else if (this.timeoutAction.value === TimeoutAction.ResetAndIdle) {
      this._resetAt = this._time + Math.max(0, this.resetDelay.value);
    }
  }

  /**
   * Play a file if one was supplied for this cue, otherwise fall back to the
   * built-in synth. `seek(0)` first — without the rewind a retrigger is a
   * silent no-op, which is the trap Zappar's own PlaySound behaviour guards.
   */
  private _play(a: Audio, source: string | undefined, synth: () => void, speed = 1) {
    if (!this.soundEnabled.value) return;
    if (source) {
      a.seek(0);
      a.play({ speed });
    } else {
      synth();
    }
  }

  private _portalHum(on: boolean) {
    if (on === this._humPlaying) return;
    this._humPlaying = on;
    if (this.constructorProps.portalHumSound) {
      if (on) { this._sfxHum.loop.value = true; this._sfxHum.seek(0); this._sfxHum.play(); }
      else this._sfxHum.stop();
    } else {
      this._audio?.portalHum(on);
    }
  }

  /** Music comes from a file when one is supplied, otherwise from the synth. */
  private _applyMusicSource() {
    const gate = this.musicStart.value === MusicStart.OnLoad
      || (this._state !== GameState.Idle && this._state !== GameState.Placing);
    const on = this.musicEnabled.value && gate;
    if (this.constructorProps.musicTrack) {
      this._audio?.setMusic(false);
      if (on) { this._sfxMusic.loop.value = true; this._sfxMusic.play({ loop: true }); }
      else this._sfxMusic.stop();
    } else {
      this._sfxMusic.stop();
      this._audio?.setMusic(on);
    }
  }

  /** Timelines and States are the same runtime object — both resolve here. */
  /**
   * Every GLTF under the Lounge Character node (or the node itself).
   * Resolved fresh each press — the reference is cheap and the scene can
   * change under us in the editor.
   */
  private _loungeGltfs(): GLTF[] {
    const id = this.loungeCharacter.value;
    if (!id) return [];
    const root = this._zc.resolveNodeID<Object3D>(id);
    if (!root) return [];
    const out: GLTF[] = [];
    const walk = (c: { children: unknown[] }) => {
      if (c instanceof GLTF) out.push(c);
      for (const child of (c as Component).children) walk(child as Component);
    };
    walk(root as unknown as Component);
    return out;
  }

  /**
   * Put the lounge character back to a clean animation state.
   *
   * Two separate things hold a stale pose, and both have to be released —
   * this is all verified from @zcomponent/core's animation source:
   *
   * 1. THE MIXER. A timeline drives a model animation through a StreamTrack,
   *    which ends up at a THREE.AnimationAction with clampWhenFinished on.
   *    When the timeline ends or is interrupted the track calls pause(), not
   *    stop() — and a paused action still applies its pose at full weight
   *    every frame. LayerClip.stop() doesn't save you either: it reports the
   *    stop at an absolute time the track can't map to a block, so the track
   *    pauses again. The ONLY reliable release is stopping the model's
   *    streams directly, which is what the Lounge Character reference is for.
   *
   * 2. THE LAYER. A timeline that keyframes node properties keeps applying
   *    them while it is its layer's active clip, playing or not. Stopping
   *    the clip and handing the layer a null entry releases that influence
   *    (with the layer's own fade, so it lets go smoothly).
   *
   * What it deliberately does NOT do: stop a running animation the lounge
   * didn't start. The joystick's walk keeps walking through a button press —
   * only the lounge's own animations and parked poses are cleared.
   */
  private _resetLoungeAnimations(exceptId?: string) {
    const prevId = this._loungeClipId;
    if (prevId && prevId !== exceptId) {
      const prev = this._zc.animation.layerClipByID.get(prevId);
      if (prev) {
        prev.stop();
        if (prev.layer.active === prev) prev.layer.setActive(null);
      }
    }
    stopLoungeAnims(this._loungeGltfs(), this._loungeAnims);
    this._loungeAnims.clear();
    this._loungeClipStreams.clear();
  }

  /**
   * Every stream object the timeline drives, including through nested clips.
   * `_streamTracks` is internal API, read from @zcomponent/core 1.29 — hence
   * the defensive chaining, and hence this being a *second* line of defence
   * behind the running-set snapshot rather than the only one.
   */
  private _clipStreamObjects(id: string | undefined): Set<unknown> {
    const out = new Set<unknown>();
    if (!id) return out;
    const lc = this._zc.animation.layerClipByID.get(id);
    const walk = (clip: unknown) => {
      const tracks = (clip as { _streamTracks?: unknown[] })?._streamTracks ?? [];
      for (const t of tracks) {
        const st = t as { stream?: unknown; clip?: unknown };
        if (st.stream) out.add(st.stream);
        if (st.clip) walk(st.clip);
      }
    };
    walk(lc?.clip);
    return out;
  }

  /**
   * Lounge timelines are exclusive: starting one resets whatever the last
   * one did, then plays from frame zero. Game timelines go through
   * _playClip unchanged — they're fire-and-forget by design.
   *
   * The three bookkeeping sets are what lets the watchdog below tell the
   * joystick's walk apart from everything else: `owned` is what this press
   * started (play() reaches the mixer synchronously, so a before/after
   * snapshot catches it), `ambient` is what was already running (a tail-idle
   * loop must never trigger a release), and `clipStreams` covers an owned
   * animation whose block starts partway into the timeline.
   */
  private _playLoungeClip(id: string | undefined) {
    const models = this._loungeGltfs();
    const before = runningAnimKeys(models);
    this._resetLoungeAnimations(id);
    this._loungeClipId = id;
    this._playClip(id);
    const after = runningAnimKeys(models);
    this._loungeAnims = new Set([...after].filter(k => !before.has(k)));
    this._loungeAmbient = new Set([...before].filter(k => after.has(k)));
    this._loungeClipStreams = this._clipStreamObjects(id);
  }

  /**
   * Let go of whatever pose the lounge animations left on the character.
   *
   * Runs by itself the moment another system starts an animation on the
   * character — in practice, the joystick playing its walk — so the walk
   * never blends with a parked Sleep or Purr. It's also callable from
   * events or the console if a controller drives the character some way
   * the watchdog can't see.
   *
   * @zui
   */
  public releaseLoungePose() {
    this._resetLoungeAnimations();
    this._loungeClipId = undefined;
    this._loungeAmbient.clear();
  }

  /**
   * The detector. While a lounge animation is latched, any animation that
   * starts running on the character that the lounge can't account for means
   * another system has taken over — release our pose and get out of its way.
   * Ambient animations stay exempt only while they keep running: a walk that
   * was mid-stride at button-press time, then stopped, then started again is
   * a fresh takeover, not ambience.
   */
  private _loungeWatchdog() {
    if (!this._lounge || this._loungeClipId === undefined) return;
    if (!this.loungeCharacter.value) return;
    const models = this._loungeGltfs();
    const running = runningAnimKeys(models);
    for (const k of [...this._loungeAmbient]) {
      if (!running.has(k)) this._loungeAmbient.delete(k);
    }
    const external = firstExternalAnim(
      running, this._loungeAnims, this._loungeAmbient, this._loungeClipStreams, models);
    if (external !== undefined) this.releaseLoungePose();
  }

  private _playClip(id: string | undefined) {
    if (!id) return;
    const clip = this._zc.animation.layerClipByID.get(id);
    if (!clip) return;
    clip.seek(0, { dontActivateLayer: true });
    clip.play();
  }

  private _setState(s: GameState) {
    const was = this._state;
    this._state = s;
    // "On game start" music is gated on leaving Idle, so re-evaluate on any
    // transition into or out of it.
    const inRound = (g: GameState) => g !== GameState.Idle && g !== GameState.Placing;
    if (inRound(was) !== inRound(s)) this._applyMusicSource();
    this._syncMenu();
    this._syncHud();
    // Placement, the round starting, the win — each one can change what the
    // HUD shows and therefore how tall it is. _restackHud existed for exactly
    // this and was never called from anywhere, which is why the column kept
    // whatever it measured at setup.
    this._restackHud();
  }

  /* ── frame ────────────────────────────────────────────────────────── */

  private _tick(dt: number) {
    this._time += dt;
    this._orbU.uTime.value = this._time;
    this._beaconU.uTime.value = this._time;
    this._portalU.uTime.value = this._time;
    this._audio?.musicTick();

    // Cheap when disarmed (three early-outs), and the lounge has no orbs to
    // update, so the per-frame budget is there when it does run.
    this._loungeWatchdog();

    /* timer */
    if (this._state === GameState.Playing && this.timerEnabled.value) {
      this._timeLeft -= dt;
      if (this._timeLeft <= this.warningTime.value && !this._warned) {
        this._warned = true;
        this._nextWarnAt = this._time;
      }
      if (this._warned && this._timeLeft > 0 && this._time >= this._nextWarnAt) {
        this._nextWarnAt = this._time + 1;
        this._play(this._sfxWarn, this.constructorProps.warningSound, () => this._audio?.warn());
      }
      if (this._timeLeft <= 0) {
        this._timeLeft = 0;
        this._fail();
      }
      // The readout shows one decimal, so 10 Hz is the highest rate that can
      // actually change a pixel. Per-frame textContent writes just cost layout.
      if (this._time >= this._nextHudAt) {
        this._nextHudAt = this._time + 0.1;
        this._syncHud();
      }
    }

    /* deferred reset after a fail */
    if (this._timeoutAt > 0 && this._time >= this._timeoutAt) {
      this._timeoutAt = -1;
      this._openTimeout();
    }

    if (this._resetAt > 0 && this._time >= this._resetAt) {
      this._resetAt = -1;
      this._reset();
    }

    /* digital-exclusive celebration, scheduled on the same clock */
    if (this._rewardAt > 0 && this._time >= this._rewardAt) this._showReward();
    if (this._rwWordHideAt > 0 && this._time >= this._rwWordHideAt) {
      this._rwWordHideAt = -1;
      this._rwWord.classList.remove("on");
      this._duckHud(false);
    }
    if (this._rwBadgeHideAt > 0 && this._time >= this._rwBadgeHideAt) {
      this._rwBadgeHideAt = -1;
      this._rwBadge.classList.remove("on");
    }
    if (this._rwModalAt > 0 && this._time >= this._rwModalAt) this._openRewardModal();

    if (this._portalCloseAt > 0 && this._time >= this._portalCloseAt) {
      this._portalCloseAt = -1;
      this._portalClosing = true;
    }

    /* orbs */
    const playing = this._state === GameState.Playing;
    const distanceMode = this.collisionMode.value === CollisionMode.Distance;
    let haveP = false;
    if (playing && !this._playerObj && !this._warnedNoPlayer) {
      this._warnedNoPlayer = true;
      console.warn("[OrbHuntGame] No Player Node set — orbs can never be collected.");
    }
    if (playing && distanceMode && this._playerObj) {
      this._playerObj.getWorldPosition(this._v1);
      // Same body offset the trigger sphere gets, so switching Collision Mode
      // never changes what is and isn't reachable.
      this._v1.y += this.playerHeightOffset.value;
      haveP = true;
    }

    const bob = this.orbBob.value;
    const beaconOn = this._beaconsAllowed();
    const billboard = this.pickupKind.value === PickupKind.Image;
    const spin = this.pickupSpin.value;

    for (const o of this._orbs) {
      if (!o.active || this._noRound) continue;

      const wave = Math.sin((this._time + o.phase * 4) * Math.PI * 2 * 0.35);
      o.group.position.y = o.home.y + wave * bob;
      o.inner.rotation.y += dt * 0.35;

      if (o.custom.visible) {
        if (billboard && this._camera) {
          // Face the camera, but only in yaw: a full lookAt tips the plane
          // back when the player looks down at it, and a pickup lying at an
          // angle to the floor reads as broken rather than as facing you.
          this._camera.getWorldPosition(this._v2);
          o.custom.getWorldPosition(this._v1);
          o.custom.rotation.set(0, Math.atan2(this._v2.x - this._v1.x,
                                              this._v2.z - this._v1.z), 0);
        } else if (spin !== 0) {
          o.custom.rotation.y += dt * spin * Math.PI * 2;
        }
      }
      // The beacon belongs to the floor, not the orb — cancel the bob so it
      // stays pinned instead of floating along with the pickup.
      o.beacon.position.y = -o.group.position.y + 0.03;

      if (o.alive) {
        o.inner.scale.setScalar(this.orbSize.value * (1 + wave * 0.045));

        if (playing && distanceMode && haveP) {
          o.group.getWorldPosition(this._v2);
          const rr = this.playerRadius.value + this._orbRadius();
          if (this._v2.distanceToSquared(this._v1) < rr * rr) this._collect(o);
        }
      } else if (o.burst > 0) {
        // Collect burst — swell and vanish. Orbs share one material, so the
        // fade has to be geometric rather than an opacity ramp.
        o.burst += dt * 3.2;
        const k = Math.min(1, o.burst);
        if (o.custom.visible) o.custom.scale.setScalar(1 + k * 1.6);
        else o.inner.scale.setScalar(this.orbSize.value * (1 + k * 1.6));
        o.beacon.scale.setScalar(this.beaconSize.value * (1 + k * 0.8));
        if (k >= 1) {
          o.burst = 0;
          o.group.visible = false;
          o.custom.scale.setScalar(1);
          o.beacon.scale.setScalar(this.beaconSize.value);
        }
      }

      o.beacon.visible = beaconOn && o.group.visible;
    }

    /* the hum is atmosphere for the reveal, not a permanent state */
    if (this._humStopAt > 0 && this._time >= this._humStopAt) {
      this._humStopAt = -1;
      this._portalHum(false);
    }

    /* portal open animation */
    if (this._state === GameState.Won && this._portalClosing) {
      // Closing runs the opening curve backwards, at the same rate, so the
      // portal leaves the way it arrived rather than blinking out.
      this._portalOpen = Math.max(0, this._portalOpen - dt / Math.max(0.05, this.portalOpenTime.value));
      const e = 1 - Math.pow(1 - this._portalOpen, 3);
      this._portal.scale.setScalar(this.portalSize.value * (0.15 + 0.85 * e));
      this._portalU.uOpacity.value = e;
      this._portalU.uSpeed.value = 0.16 + (1 - e) * 1.6;
      if (this._portalOpen <= 0) {
        this._portalClosing = false;
        this._portal.visible = false;
        // Whatever the hum timer said, a portal that isn't there shouldn't
        // still be humming.
        this._humStopAt = -1;
        this._portalHum(false);
        this.onPortalClosed.emit();
      }
    } else if (this._state === GameState.Won && this._portalOpen < 1) {
      this._portalOpen = Math.min(1, this._portalOpen + dt / Math.max(0.05, this.portalOpenTime.value));
      const e = 1 - Math.pow(1 - this._portalOpen, 3);          // ease-out cubic
      this._portal.scale.setScalar(this.portalSize.value * (0.15 + 0.85 * e));
      this._portalU.uOpacity.value = e;
      this._portalU.uSpeed.value = 0.16 + (1 - e) * 1.6;        // spins down as it settles
      if (this._portalOpen >= 1 && !this._portalDone) {
        this._portalDone = true;
        this.onPortalOpen.emit();
        // Counted from fully open, not from the win: the open animation is
        // part of the reveal, not part of the time it's on offer.
        if (this.portalHideAfter.value > 0) {
          this._portalCloseAt = this._time + this.portalHideAfter.value;
        }
      }
    } else if (this.portalVisibleFromStart.value && this._state !== GameState.Won) {
      this._portal.scale.setScalar(this.portalSize.value);
      this._portalU.uOpacity.value = 1;
      this._portalU.uSpeed.value = 0.16;
    }
  }

  private _applyPortalVisibility() {
    // Nothing from the round survives into the lounge — including a portal
    // left standing open from the win the player just had.
    const show = !this._noRound &&
      (this.portalVisibleFromStart.value || this._state === GameState.Won);
    this._portal.visible = show;
    if (this.portalVisibleFromStart.value && this._state !== GameState.Won) {
      this._portalU.uOpacity.value = 1;
      this._portal.scale.setScalar(this.portalSize.value);
    }
  }

  /* ══ Screen-space UI ═══════════════════════════════════════════════
     Plain DOM in Mattercraft's overlay div — the same route Zappar's own
     SnapshotUI and VideoRecorderUI take. `useOverlay` is an Observable, so we
     re-append if the overlay is swapped (entering WebXR does exactly that).
     `classNameForAlignment` gives notch-safe anchoring for free.

     Layout: score anchored top-left, timer top-centre, menu button in the
     corner you choose, and both modals centred and independently scrollable
     so they survive short landscape viewports.                            */

  private _buildUi(mgr: ContextManager) {
    if (!document.getElementById(OrbHuntGame._STYLE_ID)) {
      const style = document.createElement("style");
      style.id = OrbHuntGame._STYLE_ID;
      style.textContent = OrbHuntGame._CSS;
      document.head.appendChild(style);
    }

    /* ---- corner menu button ---- */
    this._root.innerHTML =
      `<button class="ohg-icon" type="button" aria-label="Open game menu">` +
      `<span class="ohg-orb" aria-hidden="true"></span>` +
      `<span class="ohg-bars" aria-hidden="true"><i></i><i></i><i></i></span></button>`;
    this._iconBtn = this._root.querySelector(".ohg-icon") as HTMLButtonElement;
    this._iconBtn.addEventListener("click", () => {
      this._menuOpen ? this._closeMenu() : this._openMenu();
    });

    /* ---- score (top-left) ---- */
    this._scoreWrap = document.createElement("div");
    this._scoreWrap.innerHTML = `
      <div class="ohg-hud">
        <span class="ohg-lbl ohg-scoreLbl"></span>
        <span class="ohg-valRow"><span class="ohg-hudOrb"></span><span class="ohg-val ohg-score">0 / 0</span></span>
        <div class="ohg-bar"><div class="ohg-fill"></div></div>
      </div>`;
    this._scoreEl = this._scoreWrap.querySelector(".ohg-score") as HTMLSpanElement;
    this._barEl = this._scoreWrap.querySelector(".ohg-fill") as HTMLDivElement;
    this._scoreLblEl = this._scoreWrap.querySelector(".ohg-scoreLbl") as HTMLSpanElement;

    /* ---- timer (top-centre) ---- */
    this._timeWrap = document.createElement("div");
    this._timeWrap.innerHTML = `
      <div class="ohg-hud ohg-centre">
        <span class="ohg-lbl ohg-timeLbl"></span>
        <span class="ohg-val ohg-big ohg-time">0.0</span>
      </div>`;
    this._timeEl = this._timeWrap.querySelector(".ohg-time") as HTMLSpanElement;
    this._timeLblEl = this._timeWrap.querySelector(".ohg-timeLbl") as HTMLSpanElement;
    this._syncHudLabels();

    /* ---- centred menu ---- */
    this._menuWrap = document.createElement("div");
    this._menuWrap.className = "ohg-layer";
    this._menuWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-modal ohg-menu" role="dialog" aria-modal="true">
        <div class="ohg-menuGlow" aria-hidden="true"></div>
        <div class="ohg-menuHead">
          <span class="ohg-menuOrb" aria-hidden="true"></span>
          <div class="ohg-title"></div>
        </div>
        <button class="ohg-menuX" data-a="close" type="button" aria-label="Close menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
        <div class="ohg-status"><span class="ohg-dot" aria-hidden="true"></span><span class="ohg-statusTxt"></span></div>
        <div class="ohg-msg"></div>
        <button class="ohg-btn"             data-a="restart"  type="button">Restart</button>
        <button class="ohg-btn ohg-ghost"   data-a="howto"    type="button">How to play</button>
        <button class="ohg-btn ohg-ghost ohg-howclaim" data-a="howclaim" type="button"></button>
        <button class="ohg-btn ohg-lounge"  data-a="lounge"   type="button"></button>
        <button class="ohg-btn ohg-primary ohg-start" data-a="start" type="button"></button>
        <button class="ohg-btn ohg-hideout" data-a="hideout" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/></svg><span class="ohg-hideLbl"></span></button>
        <div class="ohg-div"></div>
        <div class="ohg-toggle" data-t="music"><span>Music</span><div class="ohg-sw"></div></div>
        <div class="ohg-toggle" data-t="sound"><span>Sound effects</span><div class="ohg-sw"></div></div>
        <div class="ohg-div"></div>
        <button class="ohg-btn ohg-claim"   data-a="claim"   type="button">
          <span class="ohg-claimGlow" aria-hidden="true"></span>
          <span class="ohg-claimLbl">Claim Digital Exclusive</span>
        </button>
      </div>`;
    this._menu = this._menuWrap.querySelector(".ohg-menu") as HTMLDivElement;
    this._titleEl = this._menuWrap.querySelector(".ohg-title") as HTMLDivElement;
    this._statusEl = this._menuWrap.querySelector(".ohg-status") as HTMLDivElement;
    this._msgEl = this._menuWrap.querySelector(".ohg-msg") as HTMLDivElement;
    (this._menuWrap.querySelector(".ohg-scrim") as HTMLDivElement)
      .addEventListener("click", () => this._dismissMenu());

    /* ---- intro / how-to-play ---- */
    this._introWrap = document.createElement("div");
    this._introWrap.className = "ohg-layer";
    this._introWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-modal ohg-intro" role="dialog" aria-modal="true">
        <div class="ohg-hero"><img alt="" /></div>
        <div class="ohg-introBody">
          <h1 class="ohg-h1"></h1>
          <p class="ohg-lead"></p>
          <div class="ohg-legend"></div>
          <button class="ohg-btn ohg-primary" data-a="introPlay"  type="button">Start playing</button>
          <button class="ohg-btn ohg-ghost"   data-a="introClose" type="button">Maybe later</button>
          <button class="ohg-btn ohg-hideout" data-a="introHideout" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/></svg><span class="ohg-hideLbl"></span></button>
        </div>
      </div>`;
    this._introEl = this._introWrap.querySelector(".ohg-intro") as HTMLDivElement;
    this._introImg = this._introWrap.querySelector(".ohg-hero img") as HTMLImageElement;
    this._introH1 = this._introWrap.querySelector(".ohg-h1") as HTMLElement;
    this._introLead = this._introWrap.querySelector(".ohg-lead") as HTMLElement;
    (this._introWrap.querySelector(".ohg-scrim") as HTMLDivElement)
      .addEventListener("click", () => this._closeIntro());

    /* ---- digital-exclusive celebration ----
       Purely decorative, so the whole layer stays pointer-transparent: core
       CSS forces `pointer-events: auto` on every direct child of the overlay,
       and a full-bleed celebration that ate taps would strand the player
       mid-AR. Nothing in here is interactive — the claim CTA lives in the
       menu, where it can be reached at any time.                            */
    this._rewardWrap = document.createElement("div");
    this._rewardWrap.className = "ohg-rwLayer";
    this._rewardWrap.innerHTML = `
      <div class="ohg-rwWord" aria-hidden="true">
        <div class="ohg-rwRays"></div>
        <div class="ohg-rwEmblem"></div>
        <div class="ohg-rwKicker"></div>
        <div class="ohg-rwPlate">
          <div class="ohg-rwTitle"></div>
          <div class="ohg-rwSweep"></div>
        </div>
        <div class="ohg-rwMsg"></div>
        <div class="ohg-rwArcs"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="ohg-rwBadge" role="status" aria-live="polite">
        <span class="ohg-rwBadgeIc"></span>
        <span class="ohg-rwBadgeTxt">
          <strong class="ohg-rwBadgeTitle"></strong>
          <span class="ohg-rwBadgeSub"></span>
        </span>
      </div>`;
    this._rwWord = this._rewardWrap.querySelector(".ohg-rwWord") as HTMLDivElement;
    this._rwBadge = this._rewardWrap.querySelector(".ohg-rwBadge") as HTMLDivElement;

    /* ---- reward modal ----
       Its own layer, not part of the celebration: that one is forced
       pointer-transparent so it can't eat taps on the AR view, and this is the
       one piece of the reward flow that has to be tappable. */
    this._rwModalWrap = document.createElement("div");
    this._rwModalWrap.className = "ohg-layer";
    /* ---- how-to-claim screen ----
       Its own panel rather than the reward shell: this one carries full-width
       screenshots and has to scroll, and bending the reward glass around that
       would compromise a layout that currently works at every size. */
    this._insWrap = document.createElement("div");
    this._insWrap.className = "ohg-layer ohg-insLayer";
    this._insWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-modal ohg-ins" role="dialog" aria-modal="true">
        <div class="ohg-menuGlow" aria-hidden="true"></div>
        <h2 class="ohg-insTitle"></h2>
        <ol class="ohg-steps"></ol>
        <button class="ohg-btn ohg-primary ohg-insClose" type="button"></button>
      </div>`;
    (this._insWrap.querySelector(".ohg-scrim") as HTMLDivElement)
      .addEventListener("click", () => this._closeInstructions());
    (this._insWrap.querySelector(".ohg-insClose") as HTMLButtonElement)
      .addEventListener("click", () => this._closeInstructions());

    /* ---- image viewer ----
       Its own layer rather than a box inside the instructions sheet: the
       reward panel shows the same steps, and a viewer nested in one of them
       would be clipped by that panel's own rounded, scrolling frame. One
       layer above every dialog serves both. */
    this._lightWrap = document.createElement("div");
    this._lightWrap.className = "ohg-layer ohg-lightLayer";
    this._lightWrap.innerHTML = `
      <div class="ohg-scrim ohg-lightScrim"></div>
      <div class="ohg-lightBox" role="dialog" aria-modal="true" aria-label="Image viewer">
        <div class="ohg-lightFrame">
          <img class="ohg-lightImg" alt="" />
        </div>
        <div class="ohg-lightBar">
          <button class="ohg-lightZoom" type="button" aria-pressed="false" aria-label="Zoom in">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
              <path class="ohg-lightPlus" d="M11 8v6M8 11h6"/>
              <path class="ohg-lightMinus" d="M8 11h6"/>
            </svg>
          </button>
          <button class="ohg-lightX" type="button" aria-label="Close image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
          </button>
        </div>
      </div>`;
    this._lightImg = this._lightWrap.querySelector(".ohg-lightImg") as HTMLImageElement;
    /*
     * Tapping beside the picture closes it.
     *
     * The scrim alone isn't enough: .ohg-lightBox and .ohg-lightFrame are both
     * inset:0, so they cover the backdrop completely and every tap outside the
     * image landed on a div that did nothing. On a phone the dark margin
     * around a photo IS the close button — people tap it before they look for
     * an X — so the background of the viewer has to answer for it.
     *
     * Only when the target IS the background: a tap on the image toggles
     * zoom, and a tap on the bar is a button. And never while zoomed, where
     * the frame is a scroll container and the end of a pan gesture arrives
     * here as a click — dismissing the image someone was in the middle of
     * reading is the worst possible response to that.
     */
    this._lightWrap.addEventListener("click", e => {
      const t = e.target as HTMLElement;
      const background = t.classList.contains("ohg-lightScrim") ||
                         t.classList.contains("ohg-lightBox") ||
                         t.classList.contains("ohg-lightFrame");
      if (!background) return;
      if (this._lightWrap.classList.contains("ohg-zoomed")) return;
      this._closeImage();
    });
    (this._lightWrap.querySelector(".ohg-lightX") as HTMLButtonElement)
      .addEventListener("click", () => this._closeImage());
    (this._lightWrap.querySelector(".ohg-lightZoom") as HTMLButtonElement)
      .addEventListener("click", () =>
        this._setImageZoom(!this._lightWrap.classList.contains("ohg-zoomed")));
    // Tapping the picture itself is the gesture people try first, and it's a
    // far bigger target than the corner button.
    this._lightImg.addEventListener("click", () =>
      this._setImageZoom(!this._lightWrap.classList.contains("ohg-zoomed")));

    /* ---- timeout panel ----
       Deliberately the SAME shell as the reward modal: same glass, bevel,
       sheen, entrance and responsive rules, re-tinted through the CSS
       variables that panel already exposes. A second hand-built panel would
       be a second thing to keep legible at 360px and a second thing to get
       wrong. */
    this._toWrap = document.createElement("div");
    this._toWrap.className = "ohg-layer ohg-toLayer ohg-rwmSpinning ohg-rwmFrosted";
    this._toWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-rwmShell" role="alertdialog" aria-modal="true">
        <div class="ohg-rwmSpin" aria-hidden="true"></div>
        <div class="ohg-rwmGlass">
          <div class="ohg-rwmSheen" aria-hidden="true"></div>
          <div class="ohg-rwmBevel" aria-hidden="true"></div>
          <div class="ohg-toArt" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/>
              <path d="M9 2h6"/><path d="m19.5 5.5-1.6 1.6"/>
            </svg>
          </div>
          <h2 class="ohg-rwmTitle ohg-toTitle"></h2>
          <p class="ohg-rwmBody ohg-toBody"></p>
          <button class="ohg-btn ohg-primary ohg-toRetry" type="button"></button>
          <button class="ohg-btn ohg-ghost ohg-toLounge" type="button"></button>
        </div>
      </div>`;
    (this._toWrap.querySelector(".ohg-toRetry") as HTMLButtonElement)
      .addEventListener("click", () => { this._closeTimeout(); this.startGame(); });
    (this._toWrap.querySelector(".ohg-toLounge") as HTMLButtonElement)
      .addEventListener("click", () => { this._closeTimeout(); this._enterLounge(); });
    /*
     * The scrim does NOT dismiss this one, unlike the reward modal.
     * Losing is a fork in the road, not a notification: tapping the backdrop
     * would drop the player onto a dead board with a spent clock and no way
     * back except the menu. Both buttons are exits, so there is always a way
     * out — it just has to be a chosen one.
     */

    this._rwModalWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-rwmShell" role="dialog" aria-modal="true">
        <div class="ohg-rwmSpin" aria-hidden="true"></div>
        <div class="ohg-rwmGlass">
          <div class="ohg-rwmSheen" aria-hidden="true"></div>
          <div class="ohg-rwmBevel" aria-hidden="true"></div>
          <div class="ohg-rwmArt"></div>
          <div class="ohg-rwmKicker"></div>
          <h2 class="ohg-rwmTitle"></h2>
          <p class="ohg-rwmBody"></p>
          <ol class="ohg-steps ohg-rwmSteps"></ol>
          <button class="ohg-btn ohg-rwmReplay" type="button"></button>
          <button class="ohg-btn ohg-rwmLounge" type="button"></button>
          <button class="ohg-btn ohg-claim ohg-rwmClaim" type="button">
            <span class="ohg-claimGlow" aria-hidden="true"></span>
            <span class="ohg-claimLbl"></span>
          </button>
          <button class="ohg-btn ohg-ghost ohg-rwmClose" type="button"></button>
        </div>
      </div>`;
    (this._rwModalWrap.querySelector(".ohg-scrim") as HTMLDivElement)
      .addEventListener("click", () => this._closeRewardModal(true));
    (this._rwModalWrap.querySelector(".ohg-rwmClose") as HTMLButtonElement)
      .addEventListener("click", () => this._closeRewardModal(true));
    (this._rwModalWrap.querySelector(".ohg-rwmReplay") as HTMLButtonElement)
      .addEventListener("click", () => this._replay());
    (this._rwModalWrap.querySelector(".ohg-rwmLounge") as HTMLButtonElement)
      .addEventListener("click", () => {
        this._closeRewardModal(false);
        this._enterLounge();
      });
    (this._rwModalWrap.querySelector(".ohg-rwmClaim") as HTMLButtonElement)
      .addEventListener("click", () => this._rewardModalClaim());

    /* ---- button + toggle wiring (shared across both modals) ---- */
    // ".ohg-btn, [data-a]" rather than just ".ohg-btn": the corner close is a
    // deliberately un-button-shaped control, so binding by shape alone left
    // it inert — it carried a data-a nobody was listening for.
    [this._menuWrap, this._introWrap].forEach(w =>
      w.querySelectorAll<HTMLButtonElement>("[data-a]").forEach(b =>
        b.addEventListener("click", () => this._uiAction(b.dataset.a ?? "")),
      ),
    );
    this._menuWrap.querySelectorAll<HTMLDivElement>(".ohg-toggle").forEach(row => {
      row.addEventListener("click", () => {
        const on = !row.querySelector(".ohg-sw")!.classList.contains("on");
        if (row.dataset.t === "music") this.musicEnabled.value = on;
        else this.soundEnabled.value = on;
        this._syncToggles();
      });
    });

    /* ---- placement: hint + Place button, bottom-centre ---- */
    this._placeWrap = document.createElement("div");
    this._placeWrap.innerHTML = `
      <div class="ohg-placeBar">
        <div class="ohg-hint">
          <span class="ohg-hintMain"></span>
          <span class="ohg-hintTip"></span>
        </div>
        <button class="ohg-place" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>
          </svg><span class="ohg-placeLbl">Place</span>
        </button>
      </div>`;
    this._placeWrap.querySelector(".ohg-place")!
      .addEventListener("click", () => this._place());

    /* ---- placement: circular Reset ---- */
    this._resetWrap = document.createElement("div");
    this._resetWrap.innerHTML = `
      <div class="ohg-resetBox">
        <button class="ohg-round" type="button" aria-label="Reset placement">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.5 3.5V9h-5.5"/>
          </svg>
        </button>
        <span class="ohg-roundLbl"></span>
      </div>`;
    this._resetWrap.querySelector(".ohg-round")!
      .addEventListener("click", () => this._resetPlacement());

    /* ---- lounge mode: exit link + a row of action buttons ----
       Bottom-centre, where Place lives while unplaced — the two are never on
       screen together, and it's where the thumb already is. */
    this._loungeWrap = document.createElement("div");
    this._loungeWrap.innerHTML = `
      <div class="ohg-loungeBar">
        <button class="ohg-loungeExit" type="button"></button>
        <div class="ohg-loungeRow"></div>
      </div>`;
    this._loungeWrap.querySelector(".ohg-loungeExit")!
      .addEventListener("click", () => { this._exitLounge(); this.startGame(); });

    /* ---- logo watermark ---- */
    this._logoWrap = document.createElement("div");
    // Always an anchor, href toggled by the property. With no href it is not
    // focusable and not a link, so an unset URL costs nothing.
    this._logoWrap.innerHTML =
      `<a class="ohg-logoLink" rel="noopener noreferrer" target="_blank">` +
      `<img class="ohg-logoImg" alt="" /></a>`;
    this._logoImg = this._logoWrap.querySelector(".ohg-logoImg") as HTMLImageElement;
    // The score block moves down to clear the logo, and it can only do that
    // once the image has a height — which is one load later than everything
    // else on screen.
    this._logoImg.addEventListener("load", () => this._applyLogoClearance());
    this._logoImg.addEventListener("error", () => {
      if (!this.logoImage.value) return;
      console.warn(`[OrbHuntGame] Logo image failed to load: ${this.logoImage.value}`);
      this._logoWrap.style.display = "none";
      this._applyLogoClearance();
    });

    /* ---- quick mute ---- */
    this._soundWrap = document.createElement("div");
    this._soundWrap.innerHTML = `
      <button class="ohg-mute" type="button" aria-label="Toggle sound">
        <svg class="ohg-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/>
        </svg>
        <svg class="ohg-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m17 9 5 6"/><path d="m22 9-5 6"/>
        </svg>
      </button>`;
    this._soundWrap.querySelector(".ohg-mute")!.addEventListener("click", () => {
      // One tap silences everything; restoring brings both back.
      const on = !(this.soundEnabled.value || this.musicEnabled.value);
      this.soundEnabled.value = on;
      this.musicEnabled.value = on;
      this._syncToggles();
    });

    const attach = (overlay: HTMLDivElement) => {
      // First, so it paints under the HUD and every modal — a watermark, not
      // a layer anything has to work around.
      overlay.appendChild(this._logoWrap);
      overlay.appendChild(this._scoreWrap);
      overlay.appendChild(this._timeWrap);
      overlay.appendChild(this._root);
      overlay.appendChild(this._placeWrap);
      overlay.appendChild(this._resetWrap);
      overlay.appendChild(this._soundWrap);
      overlay.appendChild(this._loungeWrap);
      overlay.appendChild(this._rewardWrap);
      overlay.appendChild(this._rwModalWrap);
      overlay.appendChild(this._toWrap);
      overlay.appendChild(this._insWrap);
      overlay.appendChild(this._menuWrap);
      overlay.appendChild(this._introWrap);
      // Last, and stacked one band above the dialogs — it opens FROM one.
      overlay.appendChild(this._lightWrap);
    };
    // Orientation changes re-flow the wordmark, so the fit has to be redone.
    // Bound with bindWhenDisabled so it survives the node being disabled.
    window.addEventListener("resize", this._onResize);
    window.addEventListener("keydown", this._onKeyDown);

    const overlayObs = useOverlay(mgr);
    attach(overlayObs.value);
    this.register(overlayObs, o => {
      [this._logoWrap, this._scoreWrap, this._timeWrap, this._root, this._placeWrap,
       this._resetWrap, this._soundWrap, this._loungeWrap, this._rewardWrap,
       this._rwModalWrap, this._toWrap, this._insWrap, this._menuWrap,
       this._introWrap, this._lightWrap].forEach(e => e.remove());
      attach(o);
    });
  }

  private _uiAction(a: string) {
    switch (a) {
      case "restart": this.startGame(); this._closeMenu(); break;
      // Claiming closes the menu: on mobile the new tab takes focus anyway, and
      // returning to a still-open menu over the AR view reads as stuck.
      case "claim": this._claim(); this._closeMenu(); break;
      // One button, both directions. In a round it offers the lounge; in the
      // lounge it offers the round — a control that only works one way leaves
      // the player hunting for the way back.
      // Two rows now, one destination each, rather than one row that changed
      // meaning depending on where you were. A control whose label flips is a
      // control people have to read before every press.
      case "lounge": this._enterLounge(); this._closeMenu(); break;
      case "start":  this.startGame(); this._closeMenu(); break;
      case "hideout": this._closeMenu(); this._enterHideout(); break;
      case "introHideout": this._closeIntro(); this._enterHideout(); break;
      case "howclaim": this._closeMenu(); this._openInstructions(); break;
      case "howto": this._closeMenu(); this._openIntro(); break;
      case "close": this._dismissMenu(); break;
      case "introPlay":
        this._closeIntro();
        // With placement on, the intro hands off to Place rather than starting.
        if (this.placementEnabled.value && !this._placed) this._afterIntroDismissed();
        else this.startGame();
        break;
      case "introClose":
        this._closeIntro();
        // The secondary button used to dump people who said "maybe later"
        // straight into the timed game they'd just declined. Now it opens the
        // lounge instead — unless the author turned that off.
        if (this.loungeEnabled.value) this._enterLounge();
        this._afterIntroDismissed();
        break;
    }
    this._syncMenu();
  }

  private _openMenu() {
    this._menuOpen = true;
    this._menuWrap.classList.add("on");
    this._iconBtn.classList.add("on");
    // Opening the menu pauses play — nobody wants the clock running while
    // they read the options.
    if (this._state === GameState.Playing) this.pauseGame();
    this._syncMenu();
  }

  private _closeMenu() {
    this._menuOpen = false;
    this._menuWrap.classList.remove("on");
    this._iconBtn.classList.remove("on");
  }

  /**
   * Close the menu and carry on playing.
   *
   * Opening the menu pauses the round, and the Resume button used to be the
   * way back. With that row gone, dismissing IS resuming — otherwise a player
   * who opened the menu to read something would be stuck on a frozen clock
   * with no control that unfreezes it.
   *
   * Separate from _closeMenu because closing to open another panel must NOT
   * resume: How To Play and How To Claim both close the menu on their way to
   * a modal, and a clock ticking behind an open dialog is the bug this
   * distinction exists to prevent.
   */
  private _dismissMenu() {
    this._closeMenu();
    this._resumeIfPaused();
  }

  /** Hand the round back after a panel that paused it goes away. */
  private _resumeIfPaused() {
    if (this._state === GameState.Paused) this.resumeGame();
  }

  /** HUD captions. Separate from the values, which change every frame. */
  private _syncHudLabels() {
    if (this._scoreLblEl) this._scoreLblEl.textContent = this.scoreLabel.value;
    if (this._timeLblEl) this._timeLblEl.textContent = this.timeLabel.value;
  }

  /**
   * Placement gates the round: the intro hands off to Place, and only a
   * confirmed placement starts the clock. Without that the timer would run
   * while the player is still hunting for a flat surface.
   */
  private _afterIntroDismissed() {
    if (this.placementEnabled.value && !this._placed) {
      this._setState(GameState.Placing);
      return;
    }
    // Reached from How To Play, which paused the round to get here.
    this._resumeIfPaused();
  }

  private _place() {
    if (this._placed) return;
    this._placed = true;
    this._playClip(this.placeTimeline.value);
    this.onPlace.emit();
    this._applyPlacementUi();
    // Placing while lounging drops the scene into the room and stops there —
    // Start Round On Place is about starting the hunt, and the whole point of
    // the lounge is that nobody asked for the hunt.
    if (this.startRoundOnPlace.value && !this._noRound) this._start();
    else this._setState(GameState.Idle);
  }

  private _resetPlacement() {
    this._playClip(this.resetTimeline.value);
    this.onResetPlacement.emit();
    this._placed = false;
    // The world has moved under the player's feet, so the board goes with it.
    this._reset();
    this._setState(GameState.Placing);
    this._applyPlacementUi();
  }

  private _openIntro() {
    if (this._state === GameState.Playing) this.pauseGame();
    this._introWrap.classList.add("on");
    this._syncIntro();
    this._applyPlacementUi();
  }

  private _closeIntro() {
    const was = this._introWrap.classList.contains("on");
    this._introWrap.classList.remove("on");
    this._applyPlacementUi();
    if (was) this.onIntroClose.emit();
  }

  private static _cornerClass(c: MenuCorner) {
    const left = c === MenuCorner.TopLeft || c === MenuCorner.BottomLeft;
    const top = c === MenuCorner.TopLeft || c === MenuCorner.TopRight;
    return classNameForAlignment(
      left ? HorizontalAlignment.leftSafe : HorizontalAlignment.rightSafe,
      top ? VerticalAlignment.topSafe : VerticalAlignment.bottomSafe,
    );
  }

  /**
   * Push the current mode's palette onto every overlay layer.
   *
   * Every layer, not just the root: the accent variable is declared on
   * `.ohg-root, .ohg-anchor` AND `.ohg-layer`, and a custom property declared
   * on an element beats one inherited from a parent — so setting it in one
   * place reached one place. That's why the UI Accent property only ever
   * recoloured the menu button, which nobody noticed because its default
   * matched the stylesheet.
   */
  private _applyMode() {
    const v = this._hideout ? this.hideoutAccent.value
      : this._lounge ? this.loungeAccent.value : this.uiAccent.value;
    const rgb: [number, number, number] = [
      Math.round(Math.max(0, Math.min(1, v[0])) * 255),
      Math.round(Math.max(0, Math.min(1, v[1])) * 255),
      Math.round(Math.max(0, Math.min(1, v[2])) * 255),
    ];
    const channels = rgb.join(",");
    // The claim CTA carries white text, so it can't wear the accent raw — a
    // light accent would drop the label to unreadable. Derive a shade dark
    // enough for white and let the glow carry the hue instead.
    const deep = shadeForWhiteText(rgb);
    const deeper = shadeForWhiteText(rgb, 6.5);
    const scale = (c: [number, number, number], k: number): [number, number, number] =>
      [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
    const lighten = (c: [number, number, number], k: number): [number, number, number] =>
      [Math.round(c[0] + (255 - c[0]) * k),
       Math.round(c[1] + (255 - c[1]) * k),
       Math.round(c[2] + (255 - c[2]) * k)];
    const other = this._lounge ? this.uiAccent.value : this.loungeAccent.value;
    const to255 = (c: [number, number, number]) =>
      c.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)).join(",");
    const alt = to255(other).split(",").map(Number);

    for (const el of this._modeLayers()) {
      if (!el) continue;
      const st = el.style;
      st.setProperty("--ohg-accent", `rgb(${channels})`);
      st.setProperty("--ohg-accentRgb", channels);
      st.setProperty("--ohg-claimA", `rgb(${deep.join(",")})`);
      st.setProperty("--ohg-claimB", `rgb(${deeper.join(",")})`);
      // The row that switches modes wears the colour of the mode it leads TO,
      // so the button is a preview of where you're about to end up.
      st.setProperty("--ohg-altRgb", alt.join(","));
      // Three modes means a row can't just wear "the other one": each mode
      // row carries its own mode's colour, wherever it appears.
      st.setProperty("--ohg-uiRgb", to255(this.uiAccent.value));
      st.setProperty("--ohg-loungeRgb", to255(this.loungeAccent.value));
      st.setProperty("--ohg-hideRgb", to255(this.hideoutAccent.value));
      // The Place pill is a light fill with dark text, so it needs a lighter
      // and a darker relative of the accent for its gradient — and a label
      // colour chosen by contrast rather than assumed, since an author is
      // free to pick an accent dark enough to swallow black text.
      st.setProperty("--ohg-tintLight", `rgb(${lighten(rgb, 0.45).join(",")})`);
      st.setProperty("--ohg-tintDeep", `rgb(${scale(rgb, 0.74).join(",")})`);
      st.setProperty("--ohg-onTint", bestTextOn(rgb));
      el.classList.toggle("ohg-loungeMode", this._lounge);
      el.classList.toggle("ohg-hideoutMode", this._hideout);
    }
  }

  /** Every overlay child that declares its own accent, so all of them move. */
  private _modeLayers(): (HTMLElement | undefined)[] {
    return [this._root, this._scoreWrap, this._timeWrap, this._placeWrap,
            this._resetWrap, this._soundWrap, this._loungeWrap, this._logoWrap,
            this._rewardWrap, this._rwModalWrap, this._toWrap, this._insWrap,
            this._menuWrap, this._introWrap, this._lightWrap];
  }

  /**
   * Stack the overlay explicitly, because Mattercraft doesn't.
   *
   * `#zcomponent-overlay > *` gets `position:absolute` and nothing else, so
   * every child paints with `z-index:auto` and the winner is decided by DOM
   * order — i.e. by whatever the scene tree happens to add last. A joystick
   * added after this component therefore draws over an open dialog and eats
   * the taps aimed at its buttons. There is no ordering to negotiate with
   * once a real z-index is in play: any positive value beats `auto`.
   *
   * The bands are deliberately far apart so a future layer can be slotted in
   * without renumbering, and the dialog band is the author-facing one.
   */
  private _applyLayerOrder() {
    const modal = Math.max(1, Math.round(this.modalLayer.value));
    const put = (el: HTMLElement | undefined, z: number) => {
      if (el) el.style.zIndex = String(z);
    };
    // A watermark, not a layer anything has to work around.
    put(this._logoWrap, 10);
    put(this._scoreWrap, 20);
    put(this._timeWrap, 20);
    // Corner controls sit over the HUD: they're the things you actually press.
    put(this._root, 30);
    put(this._placeWrap, 30);
    put(this._resetWrap, 30);
    put(this._soundWrap, 30);
    put(this._loungeWrap, 40);
    // The celebration passes over the HUD but under anything you can press.
    put(this._rewardWrap, 50);
    for (const el of [this._rwModalWrap, this._toWrap, this._insWrap,
                      this._menuWrap, this._introWrap]) put(el, modal);
    // The viewer opens FROM a dialog, so it has to clear the one it came from.
    put(this._lightWrap, modal + 1);
  }

  private _applyCorner() {
    this._root.className = "ohg-root " + OrbHuntGame._cornerClass(this.menuCorner.value);
    if (this._resetWrap)
      this._resetWrap.className = "ohg-anchor " + OrbHuntGame._cornerClass(this.resetCorner.value);
    if (this._soundWrap)
      this._soundWrap.className = "ohg-anchor " + OrbHuntGame._cornerClass(this.soundToggleCorner.value);
    if (this._placeWrap)
      this._placeWrap.className = "ohg-anchor ohg-placeAnchor " +
        classNameForAlignment(HorizontalAlignment.center, VerticalAlignment.bottomSafe);
    if (this._loungeWrap) {
      const h = this.loungeAlign.value === LoungeAlign.Left ? HorizontalAlignment.leftSafe
              : this.loungeAlign.value === LoungeAlign.Right ? HorizontalAlignment.rightSafe
              : HorizontalAlignment.center;
      this._loungeWrap.className = "ohg-anchor ohg-loungeAnchor " +
        classNameForAlignment(h, VerticalAlignment.bottomSafe);
      this._applyLoungeOffset();
    }
  }

  /**
   * Place and size the logo.
   *
   * Responsive the way a watermark has to be: the width is
   * `min(<size>vmin, <max>px)`. vmin is the SHORTER viewport side, so the
   * logo keeps its size when a phone rotates — a percentage of width would
   * balloon in landscape. The px cap stops it becoming a billboard on a
   * desktop monitor. Height follows from the aspect ratio, so any artwork
   * shape works without a second property.
   *
   * The whole wrap is `pointer-events: none`. Core CSS forces
   * `pointer-events: auto` on every direct child of the overlay with an ID
   * selector no class can outrank, so a full-width logo anchor would
   * silently eat taps on the AR view behind it.
   */
  private _applyLogo() {
    if (!this._logoWrap) return;
    const src = this.logoImage.value.trim();
    this._logoWrap.className = "ohg-anchor ohg-logo " +
      OrbHuntGame._cornerClass(this.logoCorner.value);
    this._logoWrap.style.display = src ? "" : "none";
    this._logoWrap.style.margin =
      `${this.logoOffsetY.value}px ${this.logoOffsetX.value}px`;
    this._logoImg.style.width =
      `min(${this.logoSize.value}vmin, ${this.logoMaxWidth.value}px)`;
    this._logoImg.style.opacity = String(Math.max(0, Math.min(1, this.logoOpacity.value)));

    const link = this._logoWrap.querySelector<HTMLAnchorElement>(".ohg-logoLink");
    const url = this.logoUrl.value.trim();
    if (link) {
      if (url) {
        link.href = url;
        link.setAttribute("aria-label", this.logoLinkLabel.value.trim() || "Open link");
      } else {
        link.removeAttribute("href");
        link.removeAttribute("aria-label");
      }
      // The class is what re-enables pointer events, and only on the image.
      this._logoWrap.classList.toggle("ohg-logoTap", !!url);
    }
    if (this._logoImg.getAttribute("src") !== src) {
      if (src) this._logoImg.setAttribute("src", src);
      else this._logoImg.removeAttribute("src");
    }
    this._applyLogoClearance();
    this._applyUiVisibility();
  }

  /**
   * Move the score block clear of the logo when they share a corner.
   *
   * Measured rather than assumed. The logo's height depends on the artwork's
   * aspect ratio and on a viewport-relative width, so no constant is right
   * for two different logos — and a HUD sitting on top of someone's brand is
   * the kind of thing that gets noticed in a demo.
   */
  private _applyLogoClearance() {
    if (!this._scoreWrap || !this._logoWrap) return;
    const c = this.logoCorner.value;
    const logoTop = c === MenuCorner.TopLeft || c === MenuCorner.TopRight;
    const hudTop = this.hudPosition.value !== HudPosition.Bottom;
    const shown = this.logoImage.value.trim() !== "" &&
      this._logoWrap.style.display !== "none" && this._logoWrap.offsetParent !== null;

    /*
     * Two questions, and the HUD only moves if both answer yes.
     *
     * Vertically: is the logo in the same half as the HUD column? A logo at
     * the bottom has nothing to do with a HUD at the top.
     *
     * Horizontally: does the logo actually reach into the column? The HUD is
     * a centred stack and the logo is in a corner, so on most screens it
     * doesn't — which is the point. Dropping the column for a logo it never
     * touches would strand the clock a third of the way down the view, which
     * is exactly what an earlier version of this did on landscape.
     *
     * Horizontal positions don't change with the vertical offset, so the
     * measurement can't feed back on itself.
     */
    /*
     * Measure at the NATURAL position — offset cleared first.
     *
     * With the offset still applied the column has already moved out of the
     * logo's way, so the intersection test would come back false, the offset
     * would be removed, the collision would return, and the HUD would
     * oscillate every time this ran. Reading a rect forces the reflow, so
     * clearing the variable on the line above is enough to measure clean.
     */
    for (const el of [this._timeWrap, this._scoreWrap]) {
      el.style.setProperty("--ohg-logoDrop", "0px");
    }
    const lBox = this._logoWrap.getBoundingClientRect();
    const sBox = this._scoreWrap.getBoundingClientRect();
    const tBox = this._timeWrap.getBoundingClientRect();
    /*
     * A real box intersection, measured with the current offset already in
     * place. Guessing from the column's width was far too coarse — a centred
     * score block is wide enough to span most of a phone, so a logo in the
     * corner always "reached" it and the whole HUD was pushed down for a
     * collision that never happens.
     */
    const hits = (b: DOMRect) => b.width > 0 &&
      lBox.right > b.left - 8 && lBox.left < b.right + 8 &&
      lBox.bottom > b.top - 8 && lBox.top < b.bottom + 8;
    const reaches = shown && (hits(sBox) || hits(tBox));

    /*
     * Move by the distance still MISSING, not by the logo's whole height.
     *
     * Adding the full height meant the clearance stacked on top of whatever
     * HUD Offset said: set the column to 20% — already well below a top-left
     * logo — and it was still shoved another ~95px down, so the property
     * stopped describing where the HUD was. On a 360px phone that put the
     * clock 15% down the screen whatever the author asked for.
     *
     * As a floor it behaves the way a floor should: if the offset already
     * clears the logo, nothing moves and the prop is exact; if it doesn't, the
     * column drops just far enough to sit clear, and no further.
     *
     * The boxes here were measured with the offset cleared, so `top` is the
     * column's natural position and this arithmetic can't feed back on itself.
     */
    let drop = 0;
    if (shown && logoTop === hudTop && reaches && lBox.height > 0) {
      const pad = this.logoOffsetY.value;
      const need = hudTop
        ? lBox.bottom + pad - Math.min(tBox.top, sBox.top)
        : Math.max(tBox.bottom, sBox.bottom) + pad - lBox.top;
      drop = Math.max(0, Math.round(need));
    }

    // Both halves of the column take the same offset, so the stack moves as
    // one and the score stays pinned under the clock.
    for (const el of [this._timeWrap, this._scoreWrap]) {
      el.style.setProperty("--ohg-logoDrop", `${drop}px`);
    }
  }

  private _applyHudPosition() {
    if (!this._scoreWrap) return;
    const bottom = this.hudPosition.value === HudPosition.Bottom;
    const v = bottom ? VerticalAlignment.bottomSafe : VerticalAlignment.topSafe;
    /*
     * One centred column: the clock, and the count directly beneath it.
     *
     * Both anchors carry ohg-timeAnchor so they share the same drop from the
     * edge, and the score adds the clock's measured height on top of that.
     * Measured, because the clock's type size is a design decision that can
     * change — a hard-coded offset would quietly stop matching it, and the
     * two would drift apart or overlap depending on which way it moved.
     */
    const a = this.hudAlign.value;
    const hz = a === HudAlign.Left ? HorizontalAlignment.leftSafe
             : a === HudAlign.Right ? HorizontalAlignment.rightSafe
             : HorizontalAlignment.center;
    // The block's own contents line up with the side it's on, or a
    // left-anchored column reads as centred text pushed into a corner.
    const side = a === HudAlign.Left ? "ohg-hudLeft "
               : a === HudAlign.Right ? "ohg-hudRight " : "";
    this._scoreWrap.className = "ohg-anchor ohg-timeAnchor ohg-hudStack " + side +
      (bottom ? "ohg-fromBottom " : "") + classNameForAlignment(hz, v);
    this._timeWrap.className = "ohg-anchor ohg-timeAnchor " + side +
      (bottom ? "ohg-fromBottom " : "") + classNameForAlignment(hz, v);
    this._applyTimerOffset();
    this._applyHudStack();
    this._applyLogoClearance();
    this._applyUiVisibility();
  }

  /**
   * Sit the score block directly under the clock.
   *
   * The two are separate overlay anchors — they have to be, because each needs
   * its own alignment class from Mattercraft's helper — so stacking them means
   * offsetting the score by the clock's height plus the gap.
   *
   * One measurement, of the CLOCK CARD, and the answer is exact.
   *
   * This used to estimate from the clock WRAP's height (which includes the
   * anchor's 14px padding, so it overshot by 28px), write that, measure the
   * real card-to-card distance and correct by the difference. Two passes, and
   * the second one wrote whatever it read. When it read a collapsed box — a
   * frame where the score card had no layout, which is what entering an XR
   * session, a canvas resize or a mid-transition overlay all produce — the
   * "correction" landed at 225px against a true value of 75px. That is the
   * exaggerated gap: it stuck until the next call happened to run on a settled
   * layout, and then snapped back, which reads as random.
   *
   * Both anchors carry the same top, the same padding and the same offset
   * variables, so the score card's top is the clock card's top plus this
   * offset. The gap between them is therefore `stack - clockCardHeight`, and
   * `stack = clockCardHeight + gap` is the whole calculation. Nothing is
   * written before it's known, so a bad frame can no longer poison the value —
   * it just leaves the last good one in place until the observer below
   * re-measures.
   *
   * When the timer is off or hidden there is nothing to clear, and the score
   * takes the clock's place at the top of the column rather than leaving a gap
   * where a clock isn't.
   */
  private _applyHudStack() {
    if (!this._scoreWrap || !this._timeWrap) return;
    const timerShown = this._timeWrap.style.display !== "none" &&
      this._timeWrap.offsetParent !== null;
    if (!timerShown) {
      this._scoreWrap.style.setProperty("--ohg-hudStack", "0px");
      return;
    }
    const gap = Math.max(0, Math.min(120, this.hudGap.value));
    const clock = this._timeWrap.querySelector(".ohg-hud");
    if (!clock) return;
    const h = clock.getBoundingClientRect().height;
    // A card with no height isn't a card measuring zero, it's a card that
    // hasn't been laid out yet. Writing anything from that read is how the
    // gap used to end up three times too big; keeping the last good value and
    // waiting for the observer costs nothing.
    if (h <= 0) return;
    this._scoreWrap.style.setProperty("--ohg-hudStack", `${Math.round(h + gap)}px`);
  }

  /**
   * Re-measure whenever either card's box actually changes.
   *
   * The stack was previously computed on prop changes, on window resize and
   * on entering or leaving the lounge — and then trusted forever. Everything
   * else that changes the clock's box went unnoticed: crossing the 520px
   * breakpoint (the clock drops from 38px to 30px), the safe-area inset
   * changing, an XR session starting, a label being edited, the font settling.
   * Each of those left the gap describing a layout that no longer existed,
   * which is the other half of "it stops respecting the props once the game
   * starts".
   *
   * A ResizeObserver on the two cards closes that off completely: the browser
   * tells us when the boxes change and we re-measure, so the value cannot go
   * stale no matter what caused the change. It fires once on observe, which
   * also gives a free correct measurement after first layout.
   */
  private _observeHud() {
    if (this._hudRO || typeof ResizeObserver === "undefined") return;
    const clock = this._timeWrap?.querySelector(".ohg-hud");
    const count = this._scoreWrap?.querySelector(".ohg-hud");
    if (!clock || !count) return;
    this._hudRO = new ResizeObserver(() => {
      // Next frame: a resize callback runs mid-layout, and reading a rect
      // there is what produced the collapsed measurements in the first place.
      if (this._hudRaf) cancelAnimationFrame(this._hudRaf);
      this._hudRaf = requestAnimationFrame(() => {
        this._hudRaf = 0;
        this._applyHudStack();
        this._applyLogoClearance();
      });
    });
    this._hudRO.observe(clock);
    this._hudRO.observe(count);
  }

  private _applyLoungeOffset() {
    if (!this._loungeWrap) return;
    let n = Math.max(0, Math.min(70, this.loungeOffset.value));
    // Also clamp to what actually fits: a wrapped four-action row lifted 70%
    // runs off the top of a landscape phone. Clamped at runtime rather than
    // written back to the prop, so rotating back to portrait restores the
    // author's setting instead of silently keeping the squeezed one.
    const box = this._loungeWrap.getBoundingClientRect();
    const overlayH = (this._loungeWrap.parentElement?.clientHeight) || 0;
    if (overlayH > 0 && box.height > 0) {
      const maxPct = ((overlayH - box.height - 8) / overlayH) * 100;
      n = Math.max(0, Math.min(n, maxPct));
    }
    this._loungeWrap.style.setProperty("--ohg-loungeLift", `${n.toFixed(2)}%`);
  }

  /** Re-measure the stack whenever the clock's box could have changed. */
  private _restackHud() { this._applyHudStack(); this._applyLogoClearance(); }

  private _applyTimerOffset() {
    if (!this._timeWrap) return;
    const n = Math.max(0, Math.min(40, this.timerOffset.value));
    /*
     * BOTH halves of the column. The score anchor reads the same variable,
     * so setting it only on the clock left the count at the 12% default —
     * raise the offset and the clock would slide down past the count and
     * overlap it. The two are one block; they move as one.
     */
    this._timeWrap.style.setProperty("--ohg-timerDrop", `${n}%`);
    this._scoreWrap.style.setProperty("--ohg-timerDrop", `${n}%`);
  }

  private _applyUiVisibility() {
    if (!this._scoreWrap) return;
    const on = this.uiEnabled.value;
    const hud = on && this.hudPosition.value !== HudPosition.Hidden;
    this._root.style.display = on ? "" : "none";
    // Lounge mode has no round, so a score of 0/8 and a frozen clock would be
    // furniture at best and a wrong signal at worst.
    this._scoreWrap.style.display = hud && !this._noRound ? "" : "none";
    this._timeWrap.style.display = hud && !this._noRound && this.timerEnabled.value ? "" : "none";
    // The score sits under the clock, so it has to know when there isn't one.
    this._applyHudStack();
    this._soundWrap.style.display = on && this.soundToggleEnabled.value ? "" : "none";
    // Logo In Game off means "brand the moments, not the playfield": it shows
    // through the intro, the menu, the lounge and placement, and steps out
    // while a round is actually being played.
    const playing = this._state === GameState.Playing && !this._lounge;
    // The hideout has its own title bar where the logo would sit.
    const logoOn = on && !!this.logoImage.value.trim() && !this._hideout &&
      (this.logoInGame.value || !playing);
    if (this._logoWrap) this._logoWrap.style.display = logoOn ? "" : "none";
    if (!on) {
      this._closeMenu(); this._closeIntro();
      this._closeRewardModal(false); this._closeTimeout();
      this._closeInstructions();
    }
    this._applyPlacementUi();
  }

  /**
   * Place and Reset are mutually exclusive: Place while the scene is unplaced,
   * Reset once it is. Two near-identical buttons on screen at once reads as a
   * mistake rather than as flexibility.
   */
  private _applyPlacementUi() {
    if (!this._placeWrap) return;
    const on = this.uiEnabled.value && this.placementEnabled.value;
    const placing = on && !this._placed && !this._introWrap.classList.contains("on");
    this._placeWrap.style.display = placing ? "" : "none";
    this._resetWrap.style.display = on && this._placed ? "" : "none";
    // The lounge row waits for placement for the same reason Place does:
    // asking Bobo to nap before the scene exists in the room is meaningless.
    const loungeReady = this.uiEnabled.value && this._lounge &&
      !this._introWrap.classList.contains("on") &&
      (!this.placementEnabled.value || this._placed);
    this._loungeWrap.style.display = loungeReady ? "" : "none";
    this._syncPlacement();
    this._syncLounge();
    this._liftReward(loungeReady);
  }

  private _syncPlacement() {
    if (!this._placeWrap) return;
    const lbl = this._placeWrap.querySelector<HTMLSpanElement>(".ohg-placeLbl");
    if (lbl) lbl.textContent = this.placeButtonLabel.value;
    const hint = this._placeWrap.querySelector<HTMLDivElement>(".ohg-hint");
    if (hint) {
      const main = hint.querySelector<HTMLSpanElement>(".ohg-hintMain");
      const tip = hint.querySelector<HTMLSpanElement>(".ohg-hintTip");
      const mainTxt = this.placeHintText.value;
      const tipTxt = this.placeHintTip.value;
      if (main) {
        main.textContent = mainTxt;
        main.style.display = mainTxt.trim() ? "" : "none";
      }
      if (tip) {
        tip.textContent = tipTxt;
        tip.style.display = tipTxt.trim() ? "" : "none";
      }
      // The card goes when BOTH lines are empty — one empty line shouldn't
      // take the other's card away with it.
      hint.style.display =
        this.showPlaceHint.value && (mainTxt.trim() || tipTxt.trim()) ? "" : "none";
      hint.style.setProperty(
        "--ohg-hintLift", `${Math.max(0, Math.round(this.placeHintLift.value))}px`);
    }
    const rl = this._resetWrap.querySelector<HTMLSpanElement>(".ohg-roundLbl");
    if (rl) {
      rl.textContent = this.resetButtonLabel.value;
      rl.style.display = this.resetButtonLabel.value.trim() ? "" : "none";
    }
  }

/* ── lounge mode ───────────────────────────────────────────────────── */

  private _enterLounge() {
    if (this._lounge) return;
    // One mode at a time: the lounge and the hideout both own the scene.
    this._exitHideout();
    this._lounge = true;
    // No clock and no orbs on the board — this is a hangout, not a round.
    // _reset() clears the score, the timers, the reward layers and the
    // pending auto-reset; the calls after it take care of the things that
    // are visible in the 3D scene rather than the overlay.
    this._reset();
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._closeMenu();
    this._closeTimeout();
    if (this.placementEnabled.value && !this._placed) this._setState(GameState.Placing);
    else this._setState(GameState.Idle);
    this._applyUiVisibility();
    this._playLoungeClip(this.loungeTimeline.value);
    this.onLoungeEnter.emit();
  }

  private _exitLounge() {
    if (!this._lounge) return;
    this._lounge = false;
    // The round must not inherit a lounge pose: a cat that walked out of
    // Sleep frozen mid-curl reads as broken the moment the joystick moves.
    this._resetLoungeAnimations();
    this._loungeClipId = undefined;
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._applyUiVisibility();
    this.onLoungeExit.emit();
  }

/* ── Bobo's Hideout mode ───────────────────────────────────────────── */

  /**
   * The hideout is a mode like the lounge: no clock, no orbs, the HUD off.
   * What stays on screen is what the player needs in any mode — the menu
   * button, the sound toggle and Place / Reset placement — so moving the
   * room works exactly the way moving the round does.
   *
   * The room itself belongs to CollectorHubMode, which listens for
   * onHideoutEnter / onPlace / onResetPlacement / onHideoutExit.
   */
  private _enterHideout() {
    if (this._hideout) return;
    if (this._lounge) this._exitLounge();
    this._hideout = true;
    // Opened from a deep link or a behaviour while the intro is up.
    this._closeIntro();
    this._reset();
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._closeMenu();
    this._closeTimeout();
    if (this.placementEnabled.value && !this._placed) this._setState(GameState.Placing);
    else this._setState(GameState.Idle);
    this._applyUiVisibility();
    this._syncMenu();
    this.onHideoutEnter.emit();
  }

  private _exitHideout() {
    if (!this._hideout) return;
    this._hideout = false;
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._applyUiVisibility();
    this._syncMenu();
    this.onHideoutExit.emit();
  }

  /**
   * Clear the orb board while lounging. Orbs can only be collected during a
   * round, so leaving them floating there is a false affordance — the player
   * walks into one, nothing happens, and the game looks broken.
   */
  /**
   * Whether the ground rings should be drawn at all right now.
   *
   * Off during placement: the rings are pinned to the floor of a scene the
   * player hasn't put down yet, so they hang in mid-air over the room and
   * point at nothing. They're a wayfinding cue for a live round — before the
   * board exists they're just glowing litter.
   */
  private _beaconsAllowed() {
    // `_placed` is only ever set by the Place button, so a scene with
    // placement turned off would never satisfy it and the rings would be
    // hidden for the whole experience. Same idiom as _applyPlacementUi.
    const settled = !this.placementEnabled.value || this._placed;
    return this.beaconEnabled.value && !this._noRound &&
      this._state !== GameState.Placing && settled;
  }

  private _applyLoungeBoard() {
    for (const o of this._orbs) {
      const show = o.active && !this._noRound;
      o.group.visible = show;
      o.beacon.visible = show && this._beaconsAllowed();
      if (o.trigger) o.trigger.enabled.value = show;
    }
  }

  /**
   * Keep the achievement badge off the lounge bar. Measured, not assumed: the
   * bar's height depends on the action count and on whether the row wrapped,
   * so any constant would be wrong for some configuration.
   */
  private _liftReward(loungeVisible: boolean) {
    if (!this._rewardWrap) return;
    const h = loungeVisible ? this._loungeWrap.getBoundingClientRect().height : 0;
    this._rewardWrap.style.setProperty("--ohg-rwLift", h ? `${Math.round(h)}px` : "0px");
  }

  private _loungeSlots() {
    return [
      { n: 1, label: this.lounge1Label.value, icon: this.lounge1Icon.value, clip: this.lounge1Timeline.value },
      { n: 2, label: this.lounge2Label.value, icon: this.lounge2Icon.value, clip: this.lounge2Timeline.value },
      { n: 3, label: this.lounge3Label.value, icon: this.lounge3Icon.value, clip: this.lounge3Timeline.value },
      { n: 4, label: this.lounge4Label.value, icon: this.lounge4Icon.value, clip: this.lounge4Timeline.value },
    ];
  }

  private _syncLounge() {
    if (!this._loungeWrap) return;
    const exit = this._loungeWrap.querySelector(".ohg-loungeExit") as HTMLButtonElement;
    const label = this.loungeExitLabel.value.trim();
    exit.textContent = label;
    exit.style.display = this.showLoungeExit.value && label ? "" : "none";

    // A slot with neither a label nor an icon is an empty slot, not a blank
    // button: rebuild the row rather than leaving holes in it.
    const live = this._loungeSlots().filter(a => a.label.trim() || a.icon !== LoungeIcon.None);
    const row = this._loungeWrap.querySelector(".ohg-loungeRow") as HTMLDivElement;
    row.innerHTML = live.map(a => `
      <div class="ohg-loungeItem">
        <button class="ohg-round ohg-loungeBtn" type="button" data-la="${a.n}"
                aria-label="${(a.label || `Action ${a.n}`).replace(/"/g, "&quot;")}">
          ${this._loungeSvg(a.icon)}
        </button>
        <span class="ohg-roundLbl">${a.label.replace(/</g, "&lt;")}</span>
      </div>`).join("");
    row.querySelectorAll<HTMLButtonElement>(".ohg-loungeBtn").forEach(b =>
      b.addEventListener("click", () => this._loungeAction(Number(b.dataset.la))));
    this._applyLoungeOffset();   // the row's height just changed
  }

  private _loungeAction(n: number) {
    const slot = this._loungeSlots().find(a => a.n === n);
    if (!slot) return;
    this._playLoungeClip(slot.clip);
    this.onLoungeAction.emit({ action: n, label: slot.label });
  }

  private _loungeSvg(i: LoungeIcon) {
    const S = (d: string, w = "1.9") =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}"` +
      ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    // The paw is drawn with filled pads: at 24px a stroked paw turns to mush.
    const PAW = `<g fill="currentColor" stroke="none">` +
      `<ellipse cx="7.6" cy="10.4" rx="1.75" ry="2.25"/>` +
      `<ellipse cx="12" cy="9.1" rx="1.8" ry="2.35"/>` +
      `<ellipse cx="16.4" cy="10.4" rx="1.75" ry="2.25"/>` +
      `<path d="M12 12.9c3 0 5.2 2 5.2 4.3 0 1.9-1.7 3-3.6 3h-3.2` +
      `c-1.9 0-3.6-1.1-3.6-3 0-2.3 2.2-4.3 5.2-4.3z"/></g>`;
    switch (i) {
      case LoungeIcon.Sleep:
        // Paw plus drifting z's. The paw is shifted down-left and shrunk to
        // make room for z's big enough to read at 24px — with small ones this
        // was indistinguishable from the plain Paw icon sitting next to it.
        return S(`<g transform="translate(-2.1 1.6) scale(0.84)">${PAW}</g>` +
                 `<path d="M14.4 2.6h5l-5 5.4h5" stroke-width="2"/>` +
                 `<path d="M19.6 9.6h3.1l-3.1 3.3h3.1" stroke-width="1.8"/>`);
      case LoungeIcon.Paw:
        return S(PAW);
      case LoungeIcon.Excited:
        // A four-point sparkle with a smaller one trailing it, plus radiating
        // ticks — the visual shorthand for "energy" rather than "star rating".
        return S(`<path d="M10.5 2.6 12.2 7.5l4.9 1.7-4.9 1.7-1.7 4.9-1.7-4.9L3.9 9.2l4.9-1.7 1.7-4.9z"/>` +
                 `<path d="M18 13.4l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5z"/>` +
                 `<path d="M3.2 16.6h2.2M4.9 20.1l1.6-1.5M8.7 21.4v-2.1" stroke-width="1.6"/>`);
      case LoungeIcon.Heart:
        return S(`<path d="M12 20.3s-7.4-4.6-7.4-9.6A4.2 4.2 0 0 1 12 8.2a4.2 4.2 0 0 1 7.4 2.5` +
                 `c0 5-7.4 9.6-7.4 9.6z"/>`);
      case LoungeIcon.Play:
        return S(`<path d="M8 5.5 18.5 12 8 18.5V5.5z"/>`);
      case LoungeIcon.Star:
        return S(`<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9L12 3z"/>`);
      case LoungeIcon.Bolt:
        return S(`<path d="M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2z"/>`);
      case LoungeIcon.Fish:
        return S(`<path d="M15.5 12c0 3-3.1 5.4-6.6 5.4S3 15 3 12s2.4-5.4 5.9-5.4S15.5 9 15.5 12z"/>` +
                 `<path d="m15.5 12 5.5-3.6v7.2L15.5 12z"/><path d="M7 11.4h.01" stroke-width="2.4"/>`);
      case LoungeIcon.Ball:
        return S(`<circle cx="12" cy="12" r="8.4"/><path d="M4.4 9.4c5 .6 9.8 3.4 12.6 7.6"/>` +
                 `<path d="M7.2 5.2c3.6 2.6 6.2 6.5 7.2 10.9"/><path d="M19.6 14.6c-4.3-.9-8.9.1-12.4 2.8"/>`);
      case LoungeIcon.Orb:
        return `<span class="ohg-rwOrb" aria-hidden="true"></span>`;
      default: return "";
    }
  }

  private _syncToggles() {
    const mute = this._soundWrap?.querySelector(".ohg-mute");
    mute?.classList.toggle("ohg-muted", !this.soundEnabled.value && !this.musicEnabled.value);
    if (!this._menuWrap) return;
    const m = this._menuWrap.querySelector('.ohg-toggle[data-t="music"] .ohg-sw');
    const s = this._menuWrap.querySelector('.ohg-toggle[data-t="sound"] .ohg-sw');
    m?.classList.toggle("on", this.musicEnabled.value);
    s?.classList.toggle("on", this.soundEnabled.value);
  }

  private _applyIntroImage() {
    if (!this._introWrap) return;
    const src = this.introImage.value;
    const hero = this._introWrap.querySelector<HTMLDivElement>(".ohg-hero");
    if (src) { this._introImg.src = src; if (hero) hero.style.display = ""; }
    else if (hero) hero.style.display = "none";
    this._introEl?.classList.toggle("ohg-noHero", !src);
  }

  /** Escape prop text before it goes near innerHTML. */
  private static _esc(v: string) {
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
  }

  /**
   * The legend is authored entirely from props, so it's rebuilt rather than
   * patched. Seven rows; a row with no title and no text is skipped, which is
   * what keeps the three spare rows invisible until someone fills them in.
   */
  private _legendHtml(): string {
    const target = clampInt(this.targetCount.value, 1, 999);
    const secs = String(Math.round(this.roundTime.value));
    const E = OrbHuntGame._esc;

    const rows: Array<[LegendIcon, string, string, string]> = [
      [this.legend1Icon.value, this.legend1IconImage.value, this.legend1Title.value, this.legend1Text.value],
      [this.legend2Icon.value, this.legend2IconImage.value, this.legend2Title.value, this.legend2Text.value],
      [this.legend3Icon.value, this.legend3IconImage.value, this.legend3Title.value, this.legend3Text.value],
      [this.legend4Icon.value, this.legend4IconImage.value, this.legend4Title.value, this.legend4Text.value],
      [this.legend5Icon.value, this.legend5IconImage.value, this.legend5Title.value, this.legend5Text.value],
      [this.legend6Icon.value, this.legend6IconImage.value, this.legend6Title.value, this.legend6Text.value],
      [this.legend7Icon.value, this.legend7IconImage.value, this.legend7Title.value, this.legend7Text.value],
    ];

    const glyph = (icon: LegendIcon, img: string) => {
      if (img) return `<img class="ohg-legImg" src="${E(img)}" alt="" />`;
      switch (icon) {
        case LegendIcon.Orb:      return `<span class="ohg-legOrb"></span>`;
        case LegendIcon.Can:      return `<span class="ohg-legCan"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse class="ohg-cb" cx="12" cy="18.5" rx="4.5" ry="1.7"/><rect class="ohg-cb" x="7.5" y="7.9" width="9" height="10.6"/><path class="ohg-cb" d="M8.6 5.4h6.8l1.1 2.5H7.5z"/><rect class="ohg-cd" x="7.5" y="10.7" width="9" height="3.4"/><ellipse class="ohg-cl" cx="12" cy="5.4" rx="3.4" ry="1.28"/><ellipse class="ohg-cr" cx="12" cy="5.4" rx="2.2" ry="0.8"/><rect class="ohg-cs" x="9.1" y="9" width="1.3" height="7.6" rx="0.65"/></svg></span>`;
        case LegendIcon.Menu:     return `<span class="ohg-legMenu"><i></i><i></i><i></i></span>`;
        case LegendIcon.Joystick: return `<span class="ohg-legPad"></span>`;
        case LegendIcon.Portal:   return `<span class="ohg-legPortal"></span>`;
        case LegendIcon.Score:    return `<span class="ohg-legNum">0/${target}</span>`;
        case LegendIcon.Timer:    return `<span class="ohg-legNum">${secs}</span>`;
        case LegendIcon.Star:     return `<span class="ohg-legGlyph">&#9733;</span>`;
        case LegendIcon.Clock:    return `<span class="ohg-legGlyph">&#9201;</span>`;
        case LegendIcon.Bolt:     return `<span class="ohg-legGlyph">&#9889;</span>`;
        default:                  return "";
      }
    };

    return rows
      .filter(([icon, , title, text]) => {
        if (!title.trim() && !text.trim()) return false;
        // A timer row is meaningless in an untimed round.
        if (icon === LegendIcon.Timer && !this.timerEnabled.value) return false;
        return true;
      })
      .map(([icon, img, title, text]) => {
        const g = glyph(icon, img);
        return `<div class="ohg-row">` +
          (g ? `<span class="ohg-ic">${g}</span>` : `<span class="ohg-ic ohg-noIc"></span>`) +
          `<div>` +
            (title.trim() ? `<strong>${E(title)}</strong>` : "") +
            (text.trim() ? `<span>${E(text)}</span>` : "") +
          `</div></div>`;
      })
      .join("");
  }

  private _syncIntro() {
    if (!this._introWrap) return;
    this._introH1.textContent = this.introTitle.value;
    this._introLead.textContent = this.introBody.value;
    const legend = this._introWrap.querySelector<HTMLDivElement>(".ohg-legend");
    if (legend) legend.innerHTML = this._legendHtml();
    const play = this._introWrap.querySelector<HTMLButtonElement>('[data-a="introPlay"]');
    if (play) play.textContent = this.introButtonLabel.value;
    const second = this._introWrap.querySelector<HTMLButtonElement>('[data-a="introClose"]');
    if (second) {
      const lounge = this.loungeEnabled.value;
      const label = lounge ? this.loungeButtonLabel.value : this.introDismissLabel.value;
      second.textContent = label;
      // Lounge is a real destination, not a dismissal, so it stops looking
      // like the throwaway option — outlined rather than a faint ghost link.
      second.classList.toggle("ohg-ghost", !lounge);
      second.classList.toggle("ohg-lounge", lounge);
      second.style.display = label.trim() ? "" : "none";
    }
    const hide = this._introWrap.querySelector<HTMLButtonElement>('[data-a="introHideout"]');
    if (hide) {
      const label = this.hideoutButtonLabel.value.trim();
      (hide.querySelector(".ohg-hideLbl") as HTMLSpanElement).textContent = label;
      hide.style.display = this.hideoutEnabled.value && label ? "" : "none";
      this._introEl?.classList.toggle("ohg-three", this.hideoutEnabled.value && !!label);
    }
    this._applyIntroImage();
  }

  private _syncMenu() {
    if (!this._menu) return;
    this._titleEl.textContent = this.menuTitle.value;
    const s = this._state;
    // There is no Pause button: opening the menu pauses the round already, so
    // one would only ever be a no-op. The status pill communicates it instead.
    /*
     * No Play/Resume row any more.
     *
     * It carried four labels — Play, Resume, Restart round, "Place the scene
     * first" — which meant its meaning had to be read before every press, and
     * the placement one was a disabled row explaining itself. Restart and
     * Start Cola Run each do one thing under one label, and dismissing the
     * menu is what resumes.
     */
    /*
     * Only the mode you are NOT in gets a row.
     *
     * Offering both is offering one control that does nothing: in a round,
     * "Start Cola Run" is where you already are; in the lounge, the lounge
     * row is. Greying the dead one out would still cost a row and still make
     * people read it. So the menu shows the way OUT of where you are, and the
     * accent tells you where that is.
     */
    const startBtn = this._menu.querySelector<HTMLButtonElement>(".ohg-start");
    if (startBtn) {
      startBtn.textContent = this.loungeExitLabel.value.trim() || "Start";
      startBtn.style.display = this._noRound ? "" : "none";
      // Placement gates the round, so starting one before the scene is down
      // would drop the board into thin air.
      startBtn.disabled = s === GameState.Placing;
    }

    /*
     * No "Ready to place" pill. The Place button is already on screen with
     * its own hint, so the pill was a third thing saying the same thing —
     * and it pushed the actual controls further down the sheet.
     */
    const status =
      this._lounge ? "Lounging"
      : this._hideout ? "In Bobo's Hideout"
      : s === GameState.Paused ? "Paused"
      : s === GameState.Won ? "Portal open"
      : s === GameState.Failed ? "Out of time"
      : "";
    this._statusEl.classList.toggle("ohg-on", !!status);
    this._statusEl.classList.toggle("ohg-warn", s === GameState.Failed);
    this._statusEl.classList.toggle("ohg-good", s === GameState.Won);
    (this._statusEl.querySelector(".ohg-statusTxt") as HTMLSpanElement).textContent = status;

    const restartBtn = this._menu.querySelector<HTMLButtonElement>('[data-a="restart"]');
    // Nothing to restart in the lounge, and it would silently drop the player
    // into a round they didn't ask for.
    if (restartBtn) restartBtn.style.display = this._noRound ? "none" : "";

    const howClaim = this._menu.querySelector<HTMLButtonElement>(".ohg-howclaim");
    if (howClaim) {
      const label = this.instructionsMenuLabel.value.trim();
      // A blank label means the author doesn't want the row at all.
      howClaim.style.display = label ? "" : "none";
      howClaim.textContent = label;
    }

    const loungeBtn = this._menu.querySelector<HTMLButtonElement>(".ohg-lounge");
    if (loungeBtn) {
      // Hidden rather than disabled when the mode is off: a permanently dead
      // row in a short menu is just noise.
      loungeBtn.style.display =
        this.loungeEnabled.value && !this._lounge ? "" : "none";
      loungeBtn.textContent = this.loungeButtonLabel.value.trim() || "Lounge";
    }

    const hideBtn = this._menu.querySelector<HTMLButtonElement>(".ohg-hideout");
    if (hideBtn) {
      const label = this.hideoutButtonLabel.value.trim() || "Bobo's Hideout";
      (hideBtn.querySelector(".ohg-hideLbl") as HTMLSpanElement).textContent = label;
      hideBtn.style.display = this.hideoutEnabled.value && !this._hideout ? "" : "none";
    }

    const target = clampInt(this.targetCount.value, 1, 999);
    const noun = (this.scoreLabel.value.trim() || "orbs").toLowerCase();
    this._msgEl.textContent =
      this._lounge ? "Hanging out. No clock, nothing to collect."
      : this._hideout && s === GameState.Placing ? "Tap Place, and Bobo's room opens where you put him."
      : this._hideout ? "Bobo's room. Reset placement to move it, or pick another mode."
      : s === GameState.Placing ? "Tap Place to drop the game into your space."
      : s === GameState.Idle ? `Collect the ${noun} before the clock runs out.`
      : s === GameState.Paused ? `The clock is stopped. ${Math.max(0, target - this._score)} ${noun} left to find.`
      : s === GameState.Playing ? `Find ${Math.max(0, target - this._score)} more.`
      : s === GameState.Won ? "You made it. The portal is open."
      : "The clock beat you. Try again?";
    this._syncToggles();
  }

  private _syncHud() {
    if (!this._scoreEl) return;
    const target = clampInt(this.targetCount.value, 1, 999);
    this._scoreEl.textContent = `${this._score} / ${target}`;
    this._barEl.style.width = `${Math.min(100, (this._score / target) * 100)}%`;
    const timed = this.timerEnabled.value;
    this._timeEl.textContent = timed ? this._timeLeft.toFixed(1) : "∞";
    this._timeEl.classList.toggle("ohg-warn", timed && this._timeLeft <= this.warningTime.value);
    const hide = (this._state === GameState.Idle || this._state === GameState.Placing) ? "0" : "1";
    this._scoreWrap.style.opacity = hide;
    this._timeWrap.style.opacity = hide;
  }

  private static readonly _STYLE_ID = "ohg-styles";
  private static readonly _CSS = `
/* Scoped box-sizing reset. This CSS is injected into the host page, which may
   not have a global reset — without this, padding is added on top of the
   modal's max-height and a short landscape viewport overflows. */
.ohg-root,.ohg-anchor,.ohg-layer,.ohg-rwLayer,
.ohg-root *,.ohg-anchor *,.ohg-layer *,.ohg-rwLayer *{box-sizing:border-box}
.ohg-root,.ohg-anchor{--ohg-accent:#4fd6e8;--ohg-accentRgb:79,214,232;padding:14px;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
/* Overrides #zcomponent-overlay > * { pointer-events:auto } from core CSS —
   an ID selector we can't outrank with a class, and letting the HUD or a
   hidden modal layer eat canvas taps would break joystick input. */
.ohg-anchor{pointer-events:none!important;transition:opacity .3s}
/* Reads as a menu button at a glance — three bars — but the orb glows behind
   them so it still belongs to the game rather than to a settings dialog.
   The bars morph into a close X while the menu is open. */
.ohg-icon{position:relative;width:54px;height:54px;border-radius:16px;cursor:pointer;padding:0;
  display:grid;place-items:center;overflow:hidden;
  border:1px solid rgba(var(--ohg-accentRgb),.34);background:rgba(20,22,26,.86);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:transform .18s,border-color .18s,box-shadow .18s}
.ohg-icon:hover,.ohg-icon.on{transform:scale(1.06);border-color:var(--ohg-accent);
  box-shadow:0 0 18px 2px rgba(var(--ohg-accentRgb),.28)}
.ohg-orb{position:absolute;width:34px;height:34px;border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  filter:blur(5px);opacity:.85;animation:ohgPulse 2.6s ease-in-out infinite}
.ohg-bars{position:relative;display:flex;flex-direction:column;gap:4px;align-items:center}
.ohg-bars i{display:block;width:20px;height:2.5px;border-radius:2px;background:#f2fbff;
  box-shadow:0 0 6px rgba(234,252,255,.9);transition:width .18s,transform .18s,opacity .18s}
.ohg-bars i:nth-child(2){width:14px}
.ohg-icon:hover .ohg-bars i:nth-child(2){width:20px}
.ohg-icon.on .ohg-bars i:nth-child(1){transform:translateY(6.5px) rotate(45deg)}
.ohg-icon.on .ohg-bars i:nth-child(2){opacity:0}
.ohg-icon.on .ohg-bars i:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}
@keyframes ohgPulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.16);opacity:1}}

/* @section logo */
/* A watermark, not a control. pointer-events:none is load-bearing: core CSS
   forces pointer-events:auto on every direct child of #zcomponent-overlay
   with an ID selector no class can outrank, so this anchor would otherwise
   swallow taps on the AR view behind it. */
.ohg-logo{pointer-events:none}
.ohg-logo *{pointer-events:none}
/* The ONE exception, and it is deliberately narrow: with a Logo URL set, the
   link and the image take taps. Measured, the two share a box exactly, so the
   pair adds no target the player can hit by accident.
   The WRAP stays inert. It is not full-bleed — overlay children shrink-wrap,
   so it is the image plus the anchor's own 14px padding — but that padding is
   a band of dead space over the camera feed on all four sides of the logo, and
   a tap landing in it should reach the scene, not a link.
   Specificity (0,2,1) beats the .ohg-logo star blanket without !important. */
.ohg-logo.ohg-logoTap .ohg-logoLink,
.ohg-logo.ohg-logoTap .ohg-logoImg{pointer-events:auto}
.ohg-logo.ohg-logoTap .ohg-logoImg{cursor:pointer;
  transition:transform .16s ease,filter .16s ease}
.ohg-logo.ohg-logoTap .ohg-logoImg:hover{transform:scale(1.04);
  filter:drop-shadow(0 2px 14px rgba(0,0,0,.55))}
.ohg-logo.ohg-logoTap .ohg-logoLink{display:block}
.ohg-logo.ohg-logoTap .ohg-logoLink:focus-visible{outline:2px solid var(--ohg-accent);
  outline-offset:3px;border-radius:6px;pointer-events:auto}
@media (prefers-reduced-motion:reduce){
  .ohg-logo.ohg-logoTap .ohg-logoImg{transition:none}
}
/* min(vmin, px) is set inline. vmin tracks the SHORTER viewport side, so the
   logo holds its size through a rotation instead of doubling in landscape. */
.ohg-logoImg{display:block;height:auto;width:22vmin;
  filter:drop-shadow(0 2px 10px rgba(0,0,0,.45))}
/* Kept as state hooks only — the offset itself is applied by the single
   .ohg-timeAnchor margin rule below, so these must NOT set margin. */
/* @end logo */

.ohg-hud{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 14px;border-radius:12px;
  background:rgba(20,22,26,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid #2a2f38}
.ohg-hud.ohg-centre{align-items:center}
/* Drop the centred timer clear of the corner score block. A percentage in
   \`top\` resolves against the overlay's height, which is what we want; a
   percentage in \`padding\` would resolve against its WIDTH. Overriding the
   alignment class needs !important, and uses Mattercraft's --safe-area vars
   rather than env(), which WebXR Chrome doesn't set correctly. */
/* max(), not safe + offset.
   Adding them meant the safe-area inset was silently bolted onto whatever the
   author set, so the column sat somewhere neither value described. That is
   invisible on a desktop preview, where the inset is 0 — and then Mattercraft
   ships an :xr-overlay rule setting --safe-area-inset-top to 45px, so the
   moment a WebXR
   session starts (i.e. right after the scene is placed) the whole HUD drops
   45px and Timer Offset stops matching where the HUD actually is.
   As a floor instead, the prop positions the column and the inset only stops
   it climbing under a notch or the XR exit control. */
.ohg-timeAnchor{
  top:max(var(--safe-area-inset-top, 0px), var(--ohg-timerDrop, 2%))!important}
.ohg-timeAnchor.ohg-fromBottom{top:auto!important;
  bottom:max(var(--safe-area-inset-bottom, 0px), var(--ohg-timerDrop, 2%))!important}
/* There used to be an 88px floor on narrow screens here, from when the score
   block sat in the top-left corner and a centred clock had to clear it. The
   score is directly UNDER the clock now, so nothing needs clearing — and the
   floor had become a bug: it pinned the column at 88px on a phone whatever
   Timer Offset said, so the one property meant to move it up did nothing.
   The offset is the whole story now; safe-area insets keep it off the notch. */
/* The HUD column's offset from its edge, in ONE rule.
   Two contributions: the room a logo needs, and (for the score) the clock it
   sits under. They were separate rules for a while and both set margin-top,
   so whichever came last in the stylesheet silently won and the score landed
   on top of the clock. Summing them in a single declaration is the fix. */
.ohg-anchor.ohg-timeAnchor{
  margin-top:calc(var(--ohg-logoDrop,0px) + var(--ohg-hudStack,0px))}
.ohg-anchor.ohg-timeAnchor.ohg-fromBottom{margin-top:0;
  margin-bottom:calc(var(--ohg-logoDrop,0px) + var(--ohg-hudStack,0px))}
/* Centred under a centred clock, the left-aligned label and bar read as
   misaligned, so the whole block centres with it — and flips back when the
   column is anchored to a side. */
.ohg-hudStack .ohg-hud{align-items:center}
.ohg-hudStack .ohg-lbl{text-align:center}
.ohg-hudLeft .ohg-hud{align-items:flex-start}
.ohg-hudLeft .ohg-lbl{text-align:left}
.ohg-hudRight .ohg-hud{align-items:flex-end}
.ohg-hudRight .ohg-lbl{text-align:right}
.ohg-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a93a3;line-height:1}
.ohg-valRow{display:flex;align-items:center;gap:8px}
.ohg-hudOrb{width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 10px 2px rgba(var(--ohg-accentRgb),.5);animation:ohgPulse 2.6s ease-in-out infinite}
.ohg-val{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ohg-accent);line-height:1.15}
.ohg-val.ohg-big{font-size:38px}
.ohg-val.ohg-warn{color:#ff8a6b}
.ohg-bar{width:126px;height:4px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:3px}
.ohg-fill{height:100%;width:0%;border-radius:4px;background:var(--ohg-accent);
  transition:width .25s cubic-bezier(.4,0,.2,1)}

.ohg-layer{--ohg-accent:#4fd6e8;--ohg-accentRgb:79,214,232;position:absolute;left:0;top:0;width:100%;height:100%;
  pointer-events:none!important;opacity:0;transition:opacity .22s;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
.ohg-layer.on{opacity:1;pointer-events:auto!important}
.ohg-scrim{position:absolute;inset:0;background:rgba(5,7,11,.66);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.ohg-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  max-height:calc(100% - 28px);overflow-y:auto;-webkit-overflow-scrolling:touch;
  border-radius:20px;border:1px solid #2a2f38;box-shadow:0 26px 80px rgba(0,0,0,.72);color:#e8ecf2}
.ohg-menu{position:relative;width:min(340px,calc(100% - 40px));padding:24px 22px 20px;
  display:flex;flex-direction:column;gap:9px;overflow:hidden;
  background:
    radial-gradient(120% 70% at 50% -18%, rgba(var(--ohg-accentRgb),.16) 0%, transparent 62%),
    rgba(18,20,24,.975);
  border-color:rgba(var(--ohg-accentRgb),.22);
  box-shadow:0 26px 80px rgba(0,0,0,.72), 0 0 0 1px rgba(var(--ohg-accentRgb),.06) inset;
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
/* hairline of accent light along the top edge */
.ohg-menuGlow{position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--ohg-accent),transparent);opacity:.85}
.ohg-menuHead{display:flex;align-items:center;gap:11px}
.ohg-menuOrb{width:26px;height:26px;border-radius:50%;flex:0 0 auto;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 14px 3px rgba(var(--ohg-accentRgb),.45);animation:ohgPulse 2.6s ease-in-out infinite}
.ohg-title{font-size:22px;font-weight:800;letter-spacing:-.01em}
/* Status pill — this is what tells the player the clock has stopped, now that
   there's no Pause button to imply it. */
.ohg-status{display:none;align-items:center;gap:8px;align-self:flex-start;
  margin-top:2px;padding:7px 13px 7px 11px;border-radius:999px;
  font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ohg-accent);background:rgba(var(--ohg-accentRgb),.13);
  border:1px solid rgba(var(--ohg-accentRgb),.38)}
.ohg-status.ohg-on{display:flex}
.ohg-status.ohg-good{color:#7ff0b8;background:rgba(127,240,184,.12);border-color:rgba(127,240,184,.38)}
.ohg-status.ohg-warn{color:#ff8a6b;background:rgba(255,138,107,.12);border-color:rgba(255,138,107,.38)}
.ohg-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:0 0 auto;
  box-shadow:0 0 9px currentColor;animation:ohgBlink 1.6s ease-in-out infinite}
@keyframes ohgBlink{0%,100%{opacity:1}50%{opacity:.28}}
.ohg-msg{font-size:13px;color:#98a2b1;line-height:1.55;margin-bottom:8px}
/* One label treatment for every button: centred, white. Colour-coding the
   labels made Resume teal, Restart white and Claim near-black, which read as
   three different kinds of control rather than one menu. Emphasis now comes
   from the fill, the border and the glow — not from the text. */
.ohg-btn{padding:14px 18px;border-radius:12px;border:1px solid #2a2f38;background:#1b1e24;color:#fff;
  font:600 15px/1 inherit;cursor:pointer;transition:.15s;text-align:center;width:100%;
  /* The menu is a flex column that scrolls; without this, a short landscape
     viewport squashes every button instead of scrolling the list. */
  flex:0 0 auto}
/* Hover brightens the frame, not the text — the label stays white. */
.ohg-btn:hover:not(:disabled){border-color:var(--ohg-accent);background:#22262e}
.ohg-btn:disabled{opacity:.32;cursor:default}
.ohg-btn.ohg-primary{background:rgba(var(--ohg-accentRgb),.18);border-color:rgba(var(--ohg-accentRgb),.48);
  color:#fff}
.ohg-btn.ohg-primary:hover:not(:disabled){background:rgba(var(--ohg-accentRgb),.26)}
/* Tertiary actions stay white too; their lower weight comes from having no
   fill and no border, and from the smaller type. */
/* 44px is the minimum comfortable touch target. A ghost button is visually
   quiet but still has to be hittable — and in the reward modal it's the only
   way out. */
.ohg-btn.ohg-ghost{background:none;border-color:transparent;color:#fff;padding:12px 18px;
  font-size:13px;min-height:44px}
.ohg-btn.ohg-ghost:hover:not(:disabled){background:rgba(255,255,255,.06);border-color:transparent}
/* The intro's two buttons are a genuine choice between two modes, not an
   action and a dismissal — so they match in size and weight and differ only
   in hue. Sized here rather than on .ohg-btn so the menu's denser stack of
   rows is left alone. */
.ohg-intro .ohg-btn.ohg-primary,
.ohg-intro .ohg-btn.ohg-lounge,
.ohg-intro .ohg-btn.ohg-hideout{font-size:17px;font-weight:700;
  letter-spacing:.01em;padding:16px 20px;min-height:54px}
/* Three choices: a little air between them so they read as three. */
.ohg-intro .ohg-btn + .ohg-btn{margin-top:10px}
/* No hero image: the body's lift into the image would clip the title. */
.ohg-intro.ohg-noHero .ohg-introBody{margin-top:0;padding-top:26px}

/* The mode-switch rows — Lounge from a round, Start from the lounge — share
   one treatment and wear --ohg-altRgb: the colour of the mode they lead to.
   Only one of them is ever on screen, so they can't clash, and the button
   previewing its destination is what makes the colour mean something. */
.ohg-btn.ohg-lounge,.ohg-menu .ohg-btn.ohg-start,.ohg-btn.ohg-hideout{
  --ohg-rowRgb:var(--ohg-loungeRgb,var(--ohg-altRgb,255,92,180));
  background:rgba(var(--ohg-rowRgb),.18);
  border-color:rgba(var(--ohg-rowRgb),.62);
  color:#fff;
  box-shadow:0 0 18px rgba(var(--ohg-rowRgb),.34),
             inset 0 1px 0 rgba(255,255,255,.14)}
.ohg-menu .ohg-btn.ohg-start{--ohg-rowRgb:var(--ohg-uiRgb,var(--ohg-altRgb,79,214,232))}
.ohg-btn.ohg-hideout{--ohg-rowRgb:var(--ohg-hideRgb,255,196,46);
  display:flex;align-items:center;justify-content:center;gap:9px}
.ohg-btn.ohg-hideout svg{width:18px;height:18px;flex:0 0 auto}
.ohg-btn.ohg-lounge:hover:not(:disabled),
.ohg-menu .ohg-btn.ohg-start:hover:not(:disabled),
.ohg-btn.ohg-hideout:hover:not(:disabled){
  background:rgba(var(--ohg-rowRgb),.28);
  border-color:rgba(var(--ohg-rowRgb),.85);
  box-shadow:0 0 26px rgba(var(--ohg-rowRgb),.48),
             inset 0 1px 0 rgba(255,255,255,.18)}


/* The menu's close affordance. A 44px target in the corner, plus the scrim,
   replaces a Close row at the bottom of a list people had to scroll past. */
.ohg-menuX{position:absolute;top:10px;right:10px;z-index:2;
  width:38px;height:38px;padding:8px;border-radius:11px;
  display:grid;place-items:center;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid #2a2f38;color:#c3ccd9}
.ohg-menuX:hover{background:rgba(255,255,255,.11);color:#fff;
  border-color:var(--ohg-accent)}
.ohg-menuX svg{width:18px;height:18px}
/* The title has to stop before the X, or a long game name runs under it. */
.ohg-menu .ohg-menuHead{padding-right:44px}

/* @section claim */
/* ── Claim CTA ──────────────────────────────────────────────────────────
   The one commercial action in the whole UI, so it is deliberately the
   loudest thing in the menu: filled rather than outlined, its own glow, and
   a slow sheen so it reads as live. It sits directly under Play because the
   exclusive is already unlocked — gating it behind a win would cost claims
   from everyone who never finishes a round.                                */
/* White needs a 4.5:1 background at 15px bold. The old cyan→blue fill gave
   white 1.33:1 at the light end, so the fill is deeper now — 4.5:1 at the
   lightest stop, 5.4:1 at the darkest. It still reads as the bright one in
   the menu because the glow, the inset highlight and the sheen do that work;
   a near-white fill was never what made it loud. */
.ohg-btn.ohg-claim{position:relative;overflow:hidden;
  margin-top:2px;border:0;color:#fff;font-weight:800;font-size:15px;letter-spacing:.01em;
  /* Filled with the MODE's colour, darkened by script until white text on it
     clears 4.5:1 — see shadeForWhiteText. The hue still reads as the mode;
     the glow below carries it at full strength, where nothing has to be
     legible on top of it. */
  background:linear-gradient(135deg,
    var(--ohg-claimA,#2f6bff) 0%, var(--ohg-claimA,#2467f0) 46%,
    var(--ohg-claimB,#1a63dd) 100%);
  box-shadow:0 0 0 1px rgba(255,255,255,.34) inset,
             0 8px 26px -6px rgba(var(--ohg-accentRgb),.75),
             0 0 34px -8px rgba(var(--ohg-accentRgb),.65);
  animation:ohgClaimPulse 2.8s ease-in-out infinite}
.ohg-btn.ohg-claim:hover:not(:disabled){color:#fff;filter:brightness(1.12)}
.ohg-claimLbl{position:relative;z-index:1}
/* Sheen, confined to a gloss band across the top.
   A full-height sweep put 62% white directly behind the label twice every
   cycle, dropping white-on-fill from 4.6:1 to 1.8:1 — unreadable for a
   fraction of a second, repeatedly. Invisible when the label was dark; a real
   defect now that it's white. Keeping the highlight above the text band gets
   the same "this is live" read with none of that. */
.ohg-claimGlow{position:absolute;top:0;height:30%;width:38%;left:-50%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);
  transform:skewX(-18deg);animation:ohgClaimSheen 3.6s ease-in-out infinite}
/* The pulse animates the glow, so it has to carry the mode colour too — a
   hardcoded blue here left the button's halo blue in every mode while the
   fill changed underneath it. */
@keyframes ohgClaimPulse{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.34) inset,
                     0 8px 26px -6px rgba(var(--ohg-accentRgb),.75),
                     0 0 34px -8px rgba(var(--ohg-accentRgb),.65)}
  50%    {box-shadow:0 0 0 1px rgba(255,255,255,.5) inset,
                     0 8px 30px -4px rgba(var(--ohg-accentRgb),.95),
                     0 0 52px -6px rgba(var(--ohg-accentRgb),.85)}}
@keyframes ohgClaimSheen{0%{left:-50%}55%,100%{left:120%}}

/* @end claim */
.ohg-div{height:1px;background:#2a2f38;margin:4px 0}
.ohg-toggle{display:flex;align-items:center;justify-content:space-between;padding:7px 2px;
  font-size:14px;cursor:pointer}
.ohg-sw{position:relative;width:44px;height:26px;border-radius:999px;background:#2a2f38;
  transition:background .18s;flex:0 0 auto}
.ohg-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;
  background:#8892a4;transition:.18s}
.ohg-sw.on{background:rgba(var(--ohg-accentRgb),.4)}
.ohg-sw.on::after{left:21px;background:var(--ohg-accent)}

.ohg-intro{width:min(560px,calc(100% - 28px));background:#14161a}
.ohg-hero{position:relative;aspect-ratio:16/9;background:#10141a;overflow:hidden}
.ohg-hero img{width:100%;height:100%;object-fit:cover;display:block}
.ohg-hero::after{content:"";position:absolute;inset:0;
  background:linear-gradient(to bottom,transparent 55%,#14161a 100%)}
.ohg-introBody{padding:4px 24px 24px;position:relative;z-index:1;margin-top:-26px}
.ohg-h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px}
.ohg-lead{font-size:14px;line-height:1.6;color:#b8c1cf;margin:0 0 18px;white-space:pre-line}
.ohg-legend{display:flex;flex-direction:column;gap:13px;margin-bottom:22px}
.ohg-row{display:flex;gap:13px;align-items:flex-start}
.ohg-row strong{display:block;font-size:13.5px;font-weight:700;margin-bottom:2px}
.ohg-row div>span{display:block;font-size:12.5px;line-height:1.5;color:#8a93a3}
.ohg-ic{flex:0 0 42px;width:42px;height:42px;border-radius:11px;display:grid;place-items:center;
  background:#1b1e24;border:1px solid #2a2f38}
.ohg-legOrb{width:22px;height:22px;border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 10px 2px rgba(var(--ohg-accentRgb),.44)}
.ohg-legOrb.ohg-sm{width:15px;height:15px}
/* Drinks can. Tinted from --ohg-accent so it follows the UI colour, built from
   flat shapes rather than gradients because it has to read at 26px: a necked
   body, a brighter lid with a darker inner rim, a label band and one highlight.
   Every class is namespaced — these live in the page's global stylesheet. */
.ohg-legCan,.ohg-legCan svg{display:block;width:28px;height:28px}
.ohg-legCan .ohg-cb{fill:var(--ohg-accent);opacity:.62}
.ohg-legCan .ohg-cd{fill:var(--ohg-accent);opacity:.95}
.ohg-legCan .ohg-cl{fill:var(--ohg-accent)}
.ohg-legCan .ohg-cr{fill:#0a0d12;opacity:.3}
.ohg-legCan .ohg-cs{fill:#eafcff;opacity:.42}
.ohg-legImg{width:26px;height:26px;object-fit:contain;display:block;border-radius:6px}
.ohg-legGlyph{font-size:19px;line-height:1;color:var(--ohg-accent)}
.ohg-legMenu{display:flex;flex-direction:column;gap:3px;align-items:center}
.ohg-legMenu i{display:block;width:16px;height:2px;border-radius:2px;background:var(--ohg-accent)}
.ohg-legMenu i:nth-child(2){width:11px}
.ohg-legPad{width:22px;height:22px;border-radius:50%;border:1.5px solid #8a93a3;position:relative}
.ohg-legPad::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:10px;
  margin:-5px 0 0 -5px;border-radius:50%;background:rgba(var(--ohg-accentRgb),.6)}
.ohg-legPortal{width:22px;height:22px;border-radius:50%;
  background:conic-gradient(from 0deg,#eafcff,#1b6ff0,#37e0d8,#eafcff);
  -webkit-mask:radial-gradient(circle,transparent 42%,#000 46%);
  mask:radial-gradient(circle,transparent 42%,#000 46%)}
.ohg-noIc{background:none;border-color:transparent}

/* ── placement: hint + Place button, bottom-centre ── */
.ohg-placeAnchor{pointer-events:none!important}
/* The bar carries the width, not the hint.
   Overlay children are position:absolute with no width, so this anchor
   shrink-wraps its content — which is the Place button, about 167px. The
   hint's max-width could never bind against that, so the instruction was
   folding onto four lines on a 360px phone no matter what the cap said.
   Giving the bar a real width is what actually widens the hint; align-items
   keeps the button its own natural size, centred, exactly where it was. */
.ohg-placeBar{display:flex;flex-direction:column;align-items:center;gap:12px;
  width:min(420px,92vw);
  pointer-events:none;animation:ohgRise .3s ease-out}
@keyframes ohgRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
/* Wider than it was, and lifted clear of the Place button. 320px forced the
   one instruction anybody reads onto three ragged lines on a phone; 420 caps
   it at two, and 92vw keeps the margins on a 360px screen. The lift is a
   margin under the card rather than a change to the bar's gap, so the button
   stays exactly where the thumb expects it. */
.ohg-hint{width:100%;text-align:center;font-size:13px;line-height:1.5;color:#e8ecf2;
  white-space:pre-line;padding:10px 16px;border-radius:12px;
  margin-bottom:var(--ohg-hintLift,18px);
  display:flex;flex-direction:column;gap:5px;
  background:rgba(20,22,26,.82);border:1px solid #2a2f38;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
/* The tip is advice about a control that isn't on screen yet, so it reads
   quieter than the instruction it sits under — and a hairline keeps the two
   from running together as one paragraph. */
.ohg-hintTip{font-size:12px;line-height:1.45;color:#9aa4b2;
  padding-top:5px;border-top:1px solid rgba(255,255,255,.09)}
/* With nothing above it there is nothing to divide. */
.ohg-hintMain[style*="none"] + .ohg-hintTip{border-top:0;padding-top:0}
@media (max-height:430px){
  /* Landscape has the height to spare least of all, and the hint is the one
     thing here that can give some back. */
  .ohg-hint{margin-bottom:min(var(--ohg-hintLift,18px),8px);font-size:12.5px}
  .ohg-hintTip{font-size:11.5px}
}
.ohg-place{pointer-events:auto!important;display:flex;align-items:center;gap:9px;cursor:pointer;
  padding:15px 30px;border-radius:999px;font:700 16px/1 inherit;
  color:var(--ohg-onTint,#04121b);
  border:1px solid rgba(255,255,255,.55);
  /* All three stops derive from the mode's accent, and the label colour is
     picked by contrast — a hardcoded pale stop left this pill half cyan in
     a pink interface. */
  background:linear-gradient(180deg,var(--ohg-tintLight,#7ceaf6) 0%,
    var(--ohg-accent) 55%,var(--ohg-tintDeep,#25b6d6) 100%);
  box-shadow:0 0 22px 3px rgba(var(--ohg-accentRgb),.4),0 6px 22px rgba(0,0,0,.45);
  animation:ohgPlacePulse 2.4s ease-in-out infinite;transition:transform .15s}
.ohg-place:hover{transform:scale(1.04)}
.ohg-place:active{transform:scale(.97)}
.ohg-place svg{width:19px;height:19px}
@keyframes ohgPlacePulse{0%,100%{box-shadow:0 0 22px 3px rgba(var(--ohg-accentRgb),.4),0 6px 22px rgba(0,0,0,.45)}
  50%{box-shadow:0 0 34px 7px rgba(var(--ohg-accentRgb),.6),0 6px 22px rgba(0,0,0,.45)}}

/* ── placement: circular Reset ── */
.ohg-resetBox{display:flex;flex-direction:column;align-items:center;gap:7px;pointer-events:none}
.ohg-round{pointer-events:auto!important;width:54px;height:54px;border-radius:50%;cursor:pointer;padding:0;
  display:grid;place-items:center;color:var(--ohg-accent);
  border:1px solid rgba(var(--ohg-accentRgb),.34);background:rgba(20,22,26,.86);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:transform .18s,border-color .18s,box-shadow .18s}
.ohg-round:hover{transform:scale(1.07);border-color:var(--ohg-accent);
  box-shadow:0 0 18px 2px rgba(var(--ohg-accentRgb),.28)}
.ohg-round:active{transform:scale(.95)}
.ohg-round svg{width:24px;height:24px}
.ohg-roundLbl{font-size:11px;font-weight:600;letter-spacing:.02em;color:#c3ccd9;text-align:center;
  max-width:96px;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.8)}

/* @section rwmodal */
/* ── reward modal ───────────────────────────────────────────────────────
   Liquid glass: a translucent surface with its own light rather than a flat
   panel. Four layers do the work — a rotating conic gradient for the border
   light, the glass itself, a bevel drawn as inset shadows (light from the top
   left, shadow from the bottom right, which is what makes an edge read as
   chamfered), and a slow specular sweep. */
.ohg-rwmShell{--ohg-rwmA:#4fe3d0;--ohg-rwmB:#2f8fff;
  --ohg-rwmArgb:79,227,208;--ohg-rwmBrgb:47,143,255;
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);
  width:min(390px,calc(100% - 34px));max-height:calc(100% - 28px);
  padding:1.6px;                       /* the border light shows through here */
  border-radius:30px;overflow:hidden;opacity:0;
  transition:opacity .26s ease, transform .42s cubic-bezier(.16,.9,.3,1);
  box-shadow:0 30px 90px rgba(0,0,0,.62),
             0 0 60px -12px rgba(var(--ohg-rwmArgb),.55)}
.ohg-layer.on .ohg-rwmShell{opacity:1;transform:translate(-50%,-50%) scale(1)}

/* Border light. A conic gradient on a square twice the panel's diagonal,
   rotated behind it — animating a conic gradient's angle directly needs
   @property, which isn't safe to rely on in a WebView. */
.ohg-rwmSpin{position:absolute;top:50%;left:50%;width:220%;aspect-ratio:1;
  margin:-110% 0 0 -110%;
  background:conic-gradient(from 0deg,
    rgba(var(--ohg-rwmArgb),0) 0deg, var(--ohg-rwmA) 55deg,
    var(--ohg-rwmB) 120deg, rgba(var(--ohg-rwmBrgb),0) 190deg,
    rgba(var(--ohg-rwmArgb),0) 250deg, var(--ohg-rwmA) 320deg,
    rgba(var(--ohg-rwmArgb),0) 360deg)}
.ohg-rwmSpinning .ohg-rwmSpin{animation:ohgRwmSpin 7s linear infinite}
@keyframes ohgRwmSpin{to{transform:rotate(1turn)}}

.ohg-rwmGlass{position:relative;border-radius:28.4px;overflow:hidden;
  padding:26px 24px 20px;display:flex;flex-direction:column;align-items:center;
  max-height:calc(100vh - 34px);overflow-y:auto;-webkit-overflow-scrolling:touch;
  /* Opaque base under the tint: this panel carries text, and a camera feed
     behind a purely translucent surface makes it unreadable. */
  background:
    linear-gradient(160deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.03) 38%,
                    rgba(var(--ohg-rwmArgb),.07) 100%),
    linear-gradient(rgba(16,22,28,.90), rgba(10,14,19,.94))}
.ohg-rwmFrosted .ohg-rwmGlass{backdrop-filter:blur(22px) saturate(1.35);
  -webkit-backdrop-filter:blur(22px) saturate(1.35)}
/* The bevel. Inset highlight top-left, inset shade bottom-right, plus a
   hairline of the accent — an edge lit from one side reads as chamfered where
   a plain border reads as a sticker. */
.ohg-rwmBevel{position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:inset 1.5px 1.5px 0 rgba(255,255,255,.34),
             inset -1.5px -1.5px 0 rgba(0,0,0,.42),
             inset 0 0 0 1px rgba(var(--ohg-rwmArgb),.18),
             inset 0 22px 44px -26px rgba(255,255,255,.5)}
/* Specular sweep across the glass. */
/* Taller than the panel on purpose: at 70% height its lower edge cut a hard
   horizontal line across the glass, which read as a rendering artefact rather
   than as light. */
.ohg-rwmSheen{position:absolute;top:-40%;height:180%;width:46%;left:-60%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent);
  transform:skewX(-16deg);pointer-events:none}
.ohg-rwmSpinning .ohg-rwmSheen{animation:ohgRwmSheen 6.5s ease-in-out infinite}
@keyframes ohgRwmSheen{0%{left:-60%}45%,100%{left:150%}}

.ohg-rwmArt{position:relative;width:min(150px,42vw);aspect-ratio:1;
  display:grid;place-items:center;margin:2px 0 14px;
  filter:drop-shadow(0 10px 24px rgba(0,0,0,.55))
         drop-shadow(0 0 26px rgba(var(--ohg-rwmArgb),.35))}
.ohg-rwmArt img,.ohg-rwmBadge{width:100%;height:100%;object-fit:contain;display:block}
.ohg-layer.on .ohg-rwmArt{animation:ohgRwmPop .7s cubic-bezier(.2,1.5,.4,1) both}
@keyframes ohgRwmPop{0%{opacity:0;transform:scale(.55)}100%{opacity:1;transform:none}}


.ohg-rwmKicker{position:relative;font-size:11.5px;font-weight:800;letter-spacing:.34em;
  text-indent:.34em;text-transform:uppercase;color:var(--ohg-rwmA);margin-bottom:8px}
.ohg-rwmTitle{position:relative;margin:0 0 10px;text-align:center;
  font-size:clamp(21px,5.6vw,26px);font-weight:800;letter-spacing:-.01em;color:#fff;
  line-height:1.2}
.ohg-rwmBody{position:relative;margin:0 0 20px;text-align:center;font-size:14px;
  line-height:1.6;color:#c2cddb;max-width:30ch}
.ohg-rwmReplay,.ohg-rwmClaim,.ohg-rwmLounge,.ohg-rwmClose{position:relative}
/* ── Three destinations, three colours ─────────────────────────────────
   Replay keeps the panel accent, Claim takes its own pale blue, Lounge takes
   the lounge pink — the same colour that row wears in the menu, so it reads
   as the same place. Only Claim is filled: it's still the commercial action,
   and outlining the other two keeps the hierarchy intact now there are three
   of them rather than one. */
.ohg-btn.ohg-claim.ohg-rwmClaim{
  color:var(--ohg-rwmClaimOn,#04121b);
  background:linear-gradient(135deg,
    var(--ohg-rwmClaimLight,#b6e4fe) 0%,
    rgb(var(--ohg-rwmClaimRgb,140,209,250)) 52%,
    var(--ohg-rwmClaimDeep,#79b4d8) 100%);
  box-shadow:0 0 0 1px rgba(255,255,255,.4) inset,
             0 8px 26px -6px rgba(var(--ohg-rwmClaimRgb,140,209,250),.75),
             0 0 34px -8px rgba(var(--ohg-rwmClaimRgb,140,209,250),.6);
  animation:ohgRwmClaimPulse 2.8s ease-in-out infinite}
.ohg-btn.ohg-claim.ohg-rwmClaim:hover:not(:disabled){
  color:var(--ohg-rwmClaimOn,#04121b);filter:brightness(1.06)}
/* The sheen is a white band. On a pale fill it is invisible at .55 and, more
   to the point, the label here is DARK — so the band has to be dimmed or it
   washes out the one thing that has to stay readable. */
.ohg-rwmClaim .ohg-claimGlow{
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent)}
@keyframes ohgRwmClaimPulse{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.4) inset,
                     0 8px 26px -6px rgba(var(--ohg-rwmClaimRgb,140,209,250),.75),
                     0 0 34px -8px rgba(var(--ohg-rwmClaimRgb,140,209,250),.6)}
  50%    {box-shadow:0 0 0 1px rgba(255,255,255,.62) inset,
                     0 8px 30px -4px rgba(var(--ohg-rwmClaimRgb,140,209,250),.95),
                     0 0 52px -6px rgba(var(--ohg-rwmClaimRgb,140,209,250),.8)}}
.ohg-rwmLounge{margin-top:2px;color:#fff;font-weight:700;
  background:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.16);
  border-color:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.58);
  box-shadow:0 0 16px -4px rgba(var(--ohg-rwmLoungeRgb,255,92,180),.5),
             inset 0 1px 0 rgba(255,255,255,.12)}
.ohg-rwmLounge:hover:not(:disabled){
  background:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.26);
  border-color:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.88)}
.ohg-rwmClose{margin-top:2px}
/* Replay and Lounge sit ABOVE Claim, so they have to read as real, pressable
   choices without stealing the emphasis: outlines in their own accents, next
   to a ghost dismiss row. Claim keeps the only filled gradient on the sheet
   and sits last, which is both the end of the list and the strongest
   treatment on it. */
.ohg-rwmReplay{margin-top:2px;color:#fff;font-weight:700;
  background:rgba(var(--ohg-rwmArgb),.14);
  border-color:rgba(var(--ohg-rwmArgb),.55);
  box-shadow:0 0 16px -4px rgba(var(--ohg-rwmArgb),.5),
             inset 0 1px 0 rgba(255,255,255,.12)}
.ohg-rwmReplay:hover:not(:disabled){background:rgba(var(--ohg-rwmArgb),.24);
  border-color:rgba(var(--ohg-rwmArgb),.85)}

@media (max-height:520px){
  .ohg-rwmGlass{padding:18px 20px 14px}
  .ohg-rwmArt{width:min(96px,26vw);margin-bottom:10px}
  .ohg-rwmBody{margin-bottom:14px;font-size:13px}
}
/* A landscape phone is ~356px of usable panel, and this sheet now carries a
   third row. Before Replay it fitted by luck: the content already overflowed
   and the dismiss row happened to land on the last visible pixels. Adding a
   row pushed it under the fold, and a dismiss control you have to scroll a
   glass panel to find — over a live camera feed — is the trap the rest of
   this file keeps warning about.
   So the panel is made to FIT at this height rather than to scroll: the
   medallion is decoration and gives up the most space, the copy tightens, and
   the rows keep a 44px target because that is not negotiable. */
@media (max-height:430px){
  .ohg-rwmGlass{padding:12px 18px 10px}
  .ohg-rwmArt{width:min(58px,16vw);margin-bottom:4px}
  .ohg-rwmKicker{font-size:10px;letter-spacing:.26em;margin-bottom:4px}
  .ohg-rwmTitle{font-size:19px;margin-bottom:5px}
  .ohg-rwmBody{margin-bottom:8px;font-size:12.5px;line-height:1.4}
  .ohg-rwmReplay,.ohg-rwmClaim,.ohg-rwmLounge,.ohg-rwmClose{
    min-height:44px;padding:10px 16px;margin-top:1px;font-size:14px}
}
/* Respect the OS setting: keep the panel, drop the moving light. */
@media (prefers-reduced-motion:reduce){
  .ohg-rwmSpinning .ohg-rwmSpin,.ohg-rwmSpinning .ohg-rwmSheen,
  .ohg-layer.on .ohg-rwmArt{animation:none}
}
/* @end rwmodal */

/* @section instructions */
/* ── How to claim: a numbered list that carries screenshots ─────────────
   The images are the whole point of this panel, so the sheet is wider than
   the others and scrolls internally — a step you have to scroll the PAGE to
   reach is a step people miss. */
/* .ohg-modal carries no padding of its own — each sheet sets its own, and a
   sheet that forgets puts its text 1px from the border. The menu's 24/22 is
   the house measure; this one keeps it and tightens on a short screen. */
.ohg-ins{position:relative;width:min(460px,calc(100% - 28px));
  max-height:calc(100% - 32px);padding:22px 20px 18px;overflow:hidden;
  display:flex;flex-direction:column;text-align:left;
  background:linear-gradient(180deg,#171a20 0%,#101318 100%)}
.ohg-insTitle{font-size:20px;font-weight:800;margin:0 0 14px;color:#fff;
  letter-spacing:-.01em;position:relative;z-index:1}
.ohg-steps{list-style:none;margin:0 0 16px;padding:0;overflow-y:auto;
  -webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:16px;
  position:relative;z-index:1}
.ohg-step{display:flex;gap:12px;align-items:flex-start}
/* The number is the spine of the list — fixed width so every step's text
   starts on the same line however many steps there are. */
.ohg-stepNum{flex:0 0 26px;width:26px;height:26px;border-radius:50%;
  display:grid;place-items:center;font-size:13px;font-weight:800;
  color:#04121a;background:var(--ohg-accent);
  box-shadow:0 0 12px rgba(var(--ohg-accentRgb),.45)}
.ohg-stepBody{flex:1 1 auto;min-width:0}
.ohg-stepText{margin:2px 0 0;font-size:14px;line-height:1.55;color:#cfd6e2}
.ohg-stepImg{display:block;width:100%;height:auto;margin-top:10px;
  border-radius:10px;border:1px solid #2a2f38;background:#0d1014}
.ohg-stepLink{display:inline-block;margin-top:9px;padding:9px 14px;
  border-radius:10px;font-size:13.5px;font-weight:700;color:#fff;
  text-decoration:none;background:rgba(var(--ohg-accentRgb),.16);
  border:1px solid rgba(var(--ohg-accentRgb),.5);min-height:40px;line-height:22px}
.ohg-stepLink:hover{background:rgba(var(--ohg-accentRgb),.26)}
/* The code is a button because it copies. Monospace so O and 0 can be told
   apart — this one gets retyped into another app by hand. */
.ohg-stepCode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:13.5px;font-weight:700;letter-spacing:.04em;color:#fff;
  background:rgba(255,255,255,.07);border:1px dashed #4b5563;
  border-radius:7px;padding:3px 8px;cursor:pointer;white-space:nowrap}
.ohg-stepCode:hover{background:rgba(255,255,255,.13);border-color:var(--ohg-accent)}
.ohg-stepCode.ohg-copied{color:#7ff0b8;border-color:#7ff0b8;border-style:solid}
/* In the reward panel the steps sit in a centred column, so they get their
   own alignment back and the sheet widens to hold the screenshots. */
.ohg-rwmSteps{text-align:left;margin:4px 0 14px;width:100%}
.ohg-layer.ohg-rwmWide .ohg-rwmShell{width:min(460px,calc(100% - 26px))}
/* The screenshot is a button so it can be focused and pressed. It carries no
   button chrome of its own — the image IS the affordance — but it does get a
   focus ring, because an invisible focus stop is worse than no focus stop. */
.ohg-shot{display:block;width:100%;padding:0;margin:0;border:0;background:none;
  position:relative;cursor:zoom-in;border-radius:10px;-webkit-tap-highlight-color:transparent}
.ohg-shot:focus-visible{outline:2px solid var(--ohg-accent);outline-offset:3px}
.ohg-shot .ohg-stepImg{transition:border-color .16s ease,transform .16s ease}
.ohg-shot:hover .ohg-stepImg{border-color:rgba(var(--ohg-accentRgb),.75)}
/* A magnifier in the corner, because "this image is tappable" is not
   something a still picture communicates on a phone. Small, dark and out of
   the way — it sits over a screenshot, not over content anyone is reading. */
.ohg-shotHint{position:absolute;right:8px;bottom:8px;width:30px;height:30px;
  border-radius:9px;display:grid;place-items:center;color:#fff;pointer-events:none;
  background:rgba(8,12,18,.72);border:1px solid rgba(255,255,255,.22);
  box-shadow:0 2px 10px rgba(0,0,0,.4)}
.ohg-shotHint svg{width:16px;height:16px}
@media (prefers-reduced-motion:reduce){.ohg-shot .ohg-stepImg{transition:none}}
@media (max-height:430px){
  .ohg-ins{padding:16px 16px 14px}
  .ohg-insTitle{font-size:17px;margin-bottom:10px}
  .ohg-steps{gap:12px}
  .ohg-stepImg{margin-top:7px}
}
/* @end instructions */

/* @section lightbox */
/* ── The image viewer ───────────────────────────────────────────────────
   Opens at fit, one tap goes to 2×, and the frame scrolls at 2× so panning
   is the platform's own scrolling rather than drag maths of ours. */
.ohg-lightLayer .ohg-lightScrim{background:rgba(2,5,9,.9)}
.ohg-lightBox{position:absolute;inset:0;display:flex;
  align-items:center;justify-content:center;padding:0}
/* The frame is the viewport onto the image. At fit it clips nothing; zoomed,
   it becomes the scroll container. */
/* Flex, not grid. A max-height of 100% on a GRID item resolves against its row,
   and an auto-sized row is indefinite, so the percentage is dropped and a
   landscape phone gets a 455px-tall image in a 366px frame. A flex item's
   percentage resolves against the container, whose height is definite here
   because the insets give it one. Caught on the 844x390 viewport. */
.ohg-lightFrame{position:absolute;inset:calc(12px + env(safe-area-inset-top)) 12px
  calc(12px + env(safe-area-inset-bottom));
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.ohg-lightImg{display:block;flex:0 0 auto;max-width:100%;max-height:100%;
  width:auto;height:auto;object-fit:contain;cursor:zoom-in;
  border-radius:12px;background:#0d1014;
  box-shadow:0 24px 70px -18px rgba(0,0,0,.9)}
/* Zoomed: the image stops fitting and starts overflowing, which is what makes
   the frame scrollable. place-items goes to start so the top-left of an
   overflowing image isn't centred out of reach of the scroll range. */
.ohg-lightLayer.ohg-zoomed .ohg-lightFrame{overflow:auto;
  align-items:flex-start;justify-content:flex-start}
/* margin:auto rather than centring the flex line. Centring an item that
   overflows its scroll container makes the leading edge unreachable — you can
   scroll right but never back to the left of the image. Auto margins centre it
   only in the axis where there IS room, so a wide screenshot pans all the way
   and a short one still sits mid-screen instead of pinned to the top with a
   gap under it. */
.ohg-lightLayer.ohg-zoomed .ohg-lightImg{max-width:none;max-height:none;
  width:200%;height:auto;margin:auto;cursor:zoom-out;border-radius:0}
.ohg-lightLayer.ohg-zoomed .ohg-lightPlus{display:none}
.ohg-lightLayer:not(.ohg-zoomed) .ohg-lightMinus{display:none}
/* The controls float over the image rather than reserving a strip, so the
   picture gets the whole screen. Both are 44px targets. */
.ohg-lightBar{position:absolute;top:calc(10px + env(safe-area-inset-top));
  right:calc(10px + env(safe-area-inset-right));display:flex;gap:8px;z-index:2}
.ohg-lightZoom,.ohg-lightX{width:44px;height:44px;padding:11px;border-radius:12px;
  display:grid;place-items:center;cursor:pointer;color:#e8ecf2;
  background:rgba(10,14,20,.78);border:1px solid rgba(255,255,255,.2);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.ohg-lightZoom:hover,.ohg-lightX:hover{background:rgba(255,255,255,.14);color:#fff;
  border-color:var(--ohg-accent)}
.ohg-lightZoom:focus-visible,.ohg-lightX:focus-visible{
  outline:2px solid var(--ohg-accent);outline-offset:2px}
.ohg-lightZoom svg,.ohg-lightX svg{width:20px;height:20px}
/* @end lightbox */

/* @section timeout */
/* The timeout panel reuses the reward panel's shell wholesale and only
   re-tints it, so everything already proven about that glass — the 4.5:1
   contrast with the sheen sweeping across, the 44px touch targets, fitting a
   landscape phone — holds here for free. This block is only what differs. */
.ohg-toArt{width:74px;height:74px;margin:2px 0 12px;display:grid;place-items:center;
  border-radius:50%;color:var(--ohg-rwmA);
  background:radial-gradient(circle at 50% 40%,rgba(var(--ohg-rwmArgb),.26),
    rgba(var(--ohg-rwmArgb),.05) 70%,transparent);
  filter:drop-shadow(0 0 18px rgba(var(--ohg-rwmArgb),.4))}
.ohg-toArt svg{width:40px;height:40px}
.ohg-layer.on .ohg-toArt{animation:ohgRwmPop .7s cubic-bezier(.2,1.5,.4,1) both}
/* Two real choices, so the second one is a visible button rather than the
   near-invisible dismissal a ghost usually means. */
.ohg-toLayer .ohg-btn.ohg-ghost{background:rgba(255,255,255,.05);
  border-color:#39414e;font-size:14px}
.ohg-toLayer .ohg-btn.ohg-ghost:hover:not(:disabled){border-color:var(--ohg-rwmA);
  background:rgba(255,255,255,.09)}
@media (max-height:430px){
  .ohg-toArt{width:52px;height:52px;margin:0 0 8px}
  .ohg-toArt svg{width:29px;height:29px}
}
/* @end timeout */

/* @section lounge */
/* ── lounge mode ────────────────────────────────────────────────────────
   Bottom-centre, between the mute (bottom-left) and reset (bottom-right)
   controls. The row wraps rather than overflowing, because four actions plus
   captions do not fit across a 360px phone in one line. */
/* The row is lifted clear of the corner controls, so it can use most of the
   width. It was capped at 100vw-150px to squeeze between the mute and reset
   buttons, which made three actions wrap on a phone for no reason. */
.ohg-loungeBar{display:flex;flex-direction:column;align-items:center;gap:10px;
  pointer-events:none;max-width:min(520px,calc(100vw - 32px))}
/* width:max-content matters. The bar is a shrink-to-fit column, so without it
   the row inherits the width of the widest OTHER child — the exit pill — and
   wraps to fit that rather than to fit the screen. Three buttons were stacking
   2+1 inside a 167px column on a 390px phone. */
.ohg-loungeRow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 18px;
  width:max-content;max-width:100%;pointer-events:none}
.ohg-loungeItem{display:flex;flex-direction:column;align-items:center;gap:7px;
  pointer-events:none}
/* Reuses the Reset control's circular button, so the two read as one family. */
.ohg-loungeBtn{width:58px;height:58px}
.ohg-loungeBtn svg{width:27px;height:27px}
.ohg-loungeBtn .ohg-rwOrb{width:26px;height:26px}
.ohg-loungeExit{pointer-events:auto!important;cursor:pointer;
  padding:7px 15px;border-radius:999px;font:600 12.5px/1 inherit;letter-spacing:.02em;
  color:#fff;background:rgba(20,22,26,.82);
  border:1px solid rgba(var(--ohg-accentRgb),.3);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:border-color .18s,transform .18s}
.ohg-loungeExit:hover{border-color:var(--ohg-accent);transform:translateY(-1px)}
/* Lift the whole row off the bottom edge. A percentage in the bottom property
   resolves against the overlay's HEIGHT, which is what we want; a percentage
   in margin-bottom would resolve against its WIDTH. Overriding the alignment
   class needs !important, and the safe-area var is Mattercraft's, not env(),
   which WebXR Chrome doesn't set correctly.
   The default clears an on-screen joystick — the row used to sit in the same
   band as the thumbstick, so in the real game you'd drag the stick and hit
   "Sleep". */
.ohg-loungeAnchor{
  bottom:calc(var(--safe-area-inset-bottom, 0px) + var(--ohg-loungeLift, 30%))!important}
/* Floor it in pixels on a narrow screen: at a small percentage the row would
   still land on the mute and reset controls, and a wrapped second row needs
   more clearance than a single one. */
@media (max-width:560px){
  /* 96px is the Reset control's full height — a 54px button plus its caption
     plus the anchor padding — so even a lift of 0 stays off it. */
  .ohg-loungeAnchor{
    bottom:calc(var(--safe-area-inset-bottom, 0px) + max(var(--ohg-loungeLift, 30%), 96px))!important}
}
@media (max-width:420px){
  .ohg-loungeRow{gap:10px 12px}
  .ohg-loungeBtn{width:50px;height:50px}
  .ohg-loungeBtn svg{width:23px;height:23px}
}
/* @end lounge */

/* ── quick mute ── */
.ohg-mute{pointer-events:auto!important;width:46px;height:46px;border-radius:14px;cursor:pointer;padding:0;
  display:grid;place-items:center;color:var(--ohg-accent);
  border:1px solid rgba(var(--ohg-accentRgb),.28);background:rgba(20,22,26,.82);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:transform .18s,border-color .18s,color .18s}
.ohg-mute:hover{transform:scale(1.06);border-color:var(--ohg-accent)}
.ohg-mute svg{width:21px;height:21px;grid-area:1/1}
.ohg-mute .ohg-off{display:none}
.ohg-mute.ohg-muted{color:#8a93a3}
.ohg-mute.ohg-muted .ohg-on{display:none}
.ohg-mute.ohg-muted .ohg-off{display:block}
.ohg-legNum{font-size:13px;font-weight:700;color:var(--ohg-accent);font-variant-numeric:tabular-nums}

/* @section reward */
/* ── digital-exclusive celebration ──────────────────────────────────────
   Never interactive. pointer-events:none!important beats core CSS's
   #zcomponent-overlay > * {pointer-events:auto}, which no class selector
   can outrank — without it this full-bleed layer would swallow every tap on
   the AR view for as long as it's mounted, visible or not.                 */
.ohg-rwLayer{--ohg-rwA:#6ff2ff;--ohg-rwB:#a07bff;--ohg-rwIc:#eafcff;
  --ohg-rwArgb:111,242,255;--ohg-rwBrgb:160,123,255;
  position:absolute;left:0;top:0;width:100%;height:100%;
  pointer-events:none!important;overflow:hidden;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
.ohg-noAnim,.ohg-noAnim *{transition:none!important;animation:none!important}

/* ---- wordmark ---- */
.ohg-rwWord{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;padding:0 18px;
  opacity:0;visibility:hidden;transition:opacity .45s ease, visibility 0s .45s}
.ohg-rwWord.on{opacity:1;visibility:visible;transition:opacity .38s ease}
/* Light behind the type. Sized in vmax so it fills the frame in either
   orientation instead of leaving a visible disc edge in landscape. */
.ohg-rwRays{position:absolute;width:150vmax;height:150vmax;border-radius:50%;
  background:radial-gradient(circle,
    rgba(var(--ohg-rwArgb),.26) 0%,
    rgba(var(--ohg-rwBrgb),.12) 26%,transparent 58%);
  opacity:0;transform:scale(.4)}
.ohg-rwWord.on .ohg-rwRays{animation:ohgRwRays 1.5s cubic-bezier(.16,.84,.32,1) forwards}
@keyframes ohgRwRays{0%{opacity:0;transform:scale(.35)}
  22%{opacity:1}100%{opacity:.5;transform:scale(1)}}
.ohg-rwEmblem{position:relative;color:var(--ohg-rwIc);
  filter:drop-shadow(0 0 16px rgba(var(--ohg-rwArgb),.7))}
.ohg-rwEmblem svg{width:clamp(38px,8vmin,58px);height:clamp(38px,8vmin,58px);display:block}
.ohg-rwWord.on .ohg-rwEmblem{animation:ohgRwPop .7s cubic-bezier(.2,1.5,.4,1) both}
@keyframes ohgRwPop{0%{opacity:0;transform:scale(.3) rotate(-16deg)}
  100%{opacity:1;transform:scale(1) rotate(0)}}
.ohg-rwOrb{display:block;width:clamp(38px,8vmin,58px);height:clamp(38px,8vmin,58px);border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 26px 6px rgba(var(--ohg-accentRgb),.5)}
.ohg-rwKicker{position:relative;font-size:clamp(11px,2.4vmin,14px);font-weight:800;
  letter-spacing:.42em;text-indent:.42em;text-transform:uppercase;color:var(--ohg-rwIc);
  opacity:.92;text-shadow:0 2px 14px rgba(0,0,0,.7)}
.ohg-rwWord.on .ohg-rwKicker{animation:ohgRwUp .6s cubic-bezier(.16,.84,.32,1) .08s both}

/* The plate is what stops a bright gradient wordmark from disappearing into
   a bright camera feed — the reference frame does the same thing. */
.ohg-rwPlate{position:relative;overflow:hidden;max-width:100%;
  padding:.16em .4em .2em;border-radius:14px;
  background:linear-gradient(180deg,rgba(12,13,17,.9),rgba(12,13,17,.82));
  box-shadow:0 18px 60px rgba(0,0,0,.6)}
.ohg-rwWord.on .ohg-rwPlate{animation:ohgRwUp .62s cubic-bezier(.16,.84,.32,1) .12s both}
.ohg-rwTitle{font-size:calc(clamp(26px,10.5vw,84px) * var(--ohg-rwScale,1));
  line-height:1;font-weight:900;letter-spacing:.03em;white-space:nowrap;
  background:linear-gradient(180deg,var(--ohg-rwA) 4%,var(--ohg-rwB) 96%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-fill-color:transparent}
/* Sweep is masked by the plate's overflow, so it reads as light crossing the
   letters rather than a bar flying over the screen. */
.ohg-rwSweep{display:none;position:absolute;top:-40%;bottom:-40%;width:30%;left:-40%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);
  transform:skewX(-16deg);mix-blend-mode:overlay}
.ohg-electric .ohg-rwWord.on .ohg-rwSweep{display:block;
  animation:ohgRwSweep 1.15s cubic-bezier(.4,0,.25,1) .34s 2}
@keyframes ohgRwSweep{0%{left:-40%}100%{left:120%}}
.ohg-rwMsg{position:relative;max-width:min(520px,88%);text-align:center;
  font-size:clamp(13px,2.9vmin,17px);font-weight:600;color:#e8ecf2;
  text-shadow:0 2px 14px rgba(0,0,0,.85)}
.ohg-rwWord.on .ohg-rwMsg{animation:ohgRwUp .6s cubic-bezier(.16,.84,.32,1) .2s both}
@keyframes ohgRwUp{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}

/* Filaments. Each i element is a hairline rotated around the centre and flung
   outward; staggered so they read as a discharge, not a starburst frame. */
.ohg-rwArcs{display:none;position:absolute;left:50%;top:50%;width:0;height:0}
.ohg-electric .ohg-rwWord.on .ohg-rwArcs{display:block}
.ohg-rwArcs i{position:absolute;left:0;top:0;width:2px;height:clamp(40px,9vmin,80px);
  margin-left:-1px;border-radius:2px;transform-origin:50% 0;opacity:0;
  background:linear-gradient(180deg,var(--ohg-rwA),transparent);
  filter:drop-shadow(0 0 6px var(--ohg-rwA))}
.ohg-electric .ohg-rwWord.on .ohg-rwArcs i{animation:ohgRwArc .9s ease-out both}
.ohg-rwArcs i:nth-child(1){transform:rotate(18deg)  translateY(6vmin);animation-delay:.30s}
.ohg-rwArcs i:nth-child(2){transform:rotate(74deg)  translateY(7vmin);animation-delay:.38s}
.ohg-rwArcs i:nth-child(3){transform:rotate(131deg) translateY(6vmin);animation-delay:.34s}
.ohg-rwArcs i:nth-child(4){transform:rotate(206deg) translateY(7vmin);animation-delay:.44s}
.ohg-rwArcs i:nth-child(5){transform:rotate(258deg) translateY(6vmin);animation-delay:.36s}
.ohg-rwArcs i:nth-child(6){transform:rotate(322deg) translateY(7vmin);animation-delay:.42s}
@keyframes ohgRwArc{0%{opacity:0;scale:1 .2}
  30%{opacity:1;scale:1 1}100%{opacity:0;scale:1 1.5}}

/* ---- achievement badge ----
   Bottom-centre, clear of the mute (bottom-left) and reset (bottom-right)
   buttons, and clear of the timer at top-centre. */
.ohg-rwBadge{position:absolute;left:50%;
  /* 104px clears the Reset control, which is a 54px button plus its caption
     — measuring only the button leaves the badge sitting on the label.
     --ohg-rwLift is the lounge bar's measured height when that's on screen. */
  bottom:calc(var(--safe-area-inset-bottom, 0px) + 104px + var(--ohg-rwLift, 0px));
  width:min(430px,calc(100% - 28px));display:flex;align-items:center;gap:13px;
  padding:11px 20px 11px 11px;border-radius:999px;
  transform:translate(-50%,26px);opacity:0;visibility:hidden;
  transition:opacity .34s ease, transform .44s cubic-bezier(.16,.84,.32,1), visibility 0s .44s;
  /* Two layers, not color-mix: the tint rides on an OPAQUE base so the pill
     still paints on WebViews without color-mix support. Content sits on this
     surface, so a transparent fallback would be unreadable, not just off-hue. */
  background:
    linear-gradient(135deg,rgba(var(--ohg-rwArgb),.22) 0%,transparent 58%,
                    rgba(var(--ohg-rwBrgb),.24) 100%),
    linear-gradient(rgba(14,16,20,.94),rgba(14,16,20,.94));
  border:1px solid rgba(var(--ohg-rwArgb),.42);
  box-shadow:0 14px 44px rgba(0,0,0,.6),
             0 0 42px -10px rgba(var(--ohg-rwArgb),.8);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.ohg-rwBadge.on{opacity:1;visibility:visible;transform:translate(-50%,0);
  transition:opacity .3s ease, transform .5s cubic-bezier(.16,.84,.32,1)}
.ohg-rwBadgeIc{width:46px;height:46px;border-radius:50%;flex:0 0 auto;
  display:grid;place-items:center;color:var(--ohg-rwIc);
  background:radial-gradient(circle at 34% 30%,rgba(255,255,255,.92) 0%,
    var(--ohg-rwA) 42%,var(--ohg-rwB) 100%);
  box-shadow:0 0 20px -2px rgba(var(--ohg-rwArgb),.85)}
.ohg-rwBadgeIc svg{width:25px;height:25px}
.ohg-rwBadgeIc .ohg-rwOrb{width:30px;height:30px;box-shadow:none}
.ohg-electric .ohg-rwBadge.on .ohg-rwBadgeIc{animation:ohgRwSpark 1.8s ease-in-out 2}
@keyframes ohgRwSpark{0%,100%{box-shadow:0 0 20px -2px rgba(var(--ohg-rwArgb),.85)}
  50%{box-shadow:0 0 34px 2px rgba(var(--ohg-rwArgb),.95)}}
.ohg-rwBadgeTxt{display:flex;flex-direction:column;gap:2px;min-width:0}
.ohg-rwBadgeTitle{font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:#f2f7ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ohg-rwBadgeSub{font-size:12.5px;font-weight:500;color:#b8c3d2;line-height:1.35}
/* @end reward */

/* HUD ducked behind the wordmark. Not display:none — it fades, and it has to
   come back if the player restarts. */
.ohg-anchor.ohg-ducked{opacity:0}

/* Short viewport (landscape phones): the vertical stack has nowhere to go, so
   drop the emblem, tighten the type and lift the badge. */
@media (max-height:480px){
  .ohg-rwWord{gap:6px}
  .ohg-rwEmblem{display:none}
  .ohg-rwTitle{font-size:calc(clamp(22px,7.4vw,52px) * var(--ohg-rwScale,1))}
  .ohg-rwKicker{font-size:10px;letter-spacing:.34em;text-indent:.34em}
  /* The badge carries the same line, and at this height the headline plus its
     kicker is the whole story. Keeping both puts text under the badge. */
  .ohg-rwMsg{display:none}
  .ohg-rwBadge{bottom:calc(var(--safe-area-inset-bottom, 0px) + 92px + var(--ohg-rwLift, 0px));
    padding:8px 16px 8px 8px}
  .ohg-rwBadgeIc{width:38px;height:38px}
  .ohg-rwBadgeIc svg{width:21px;height:21px}
}

/* Respect the OS setting: keep the reveal, drop the motion. */
@media (prefers-reduced-motion:reduce){
  .ohg-rwWord.on .ohg-rwRays,.ohg-rwWord.on .ohg-rwEmblem,.ohg-rwWord.on .ohg-rwKicker,
  .ohg-rwWord.on .ohg-rwPlate,.ohg-rwWord.on .ohg-rwMsg,
  .ohg-electric .ohg-rwWord.on .ohg-rwSweep,
  .ohg-electric .ohg-rwWord.on .ohg-rwArcs i,
  .ohg-electric .ohg-rwBadge.on .ohg-rwBadgeIc,
  .ohg-btn.ohg-claim,.ohg-claimGlow{animation:none}
  .ohg-rwWord.on .ohg-rwRays{opacity:.5;transform:scale(1)}
  .ohg-rwBadge{transition:opacity .3s ease}
}

@media (max-width:520px){
  .ohg-introBody{padding:4px 18px 20px}
  .ohg-h1{font-size:24px}
  .ohg-lead{font-size:13px;margin-bottom:14px}
  .ohg-legend{gap:11px;margin-bottom:18px}
  .ohg-ic{flex-basis:36px;width:36px;height:36px}
  .ohg-val{font-size:22px}
  .ohg-val.ohg-big{font-size:30px}
  .ohg-hudOrb{width:18px;height:18px}
  .ohg-menu{padding:18px}
}
@media (max-height:560px){
  .ohg-hero{aspect-ratio:auto;height:120px}
  .ohg-introBody{margin-top:-18px}
  .ohg-legend{gap:9px}
}
/* Three mode buttons: a shorter hero on laptop-height screens, so all three
   choices are on screen without scrolling the card. */
@media (min-height:561px) and (max-height:940px){
  .ohg-intro.ohg-three .ohg-hero{aspect-ratio:auto;height:clamp(130px,24vh,260px)}
}
`;

  /* ── teardown ─────────────────────────────────────────────────────── */

  public dispose() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onKeyDown);
    this._hudRO?.disconnect();
    if (this._hudRaf) cancelAnimationFrame(this._hudRaf);
    // Mattercraft disposes neither the geometries and materials we created nor
    // the components we constructed by hand, so all of it is ours to clean up.
    for (const o of this._orbs) o.trigger?.dispose();
    this._playerTrigger?.dispose();

    this._orbGeom.dispose();
    this._glowGeom.dispose();
    this._beaconGeom.dispose();
    this._portalGeom.dispose();
    this._orbMat.dispose();
    this._glowMat.dispose();
    this._beaconMat.dispose();
    this._portalMat.dispose();

    this._pickupGltf?.dispose();
    this._pickupImage?.dispose();

    this._sfxCollect.dispose();
    this._sfxWin.dispose();
    this._sfxReward.dispose();
    this._sfxWarn.dispose();
    this._sfxFail.dispose();
    this._sfxHum.dispose();
    this._sfxMusic.dispose();
    this._audio?.dispose();

    [this._root, this._scoreWrap, this._timeWrap, this._menuWrap, this._introWrap]
      .forEach(e => e?.remove());

    return super.dispose();
  }
}