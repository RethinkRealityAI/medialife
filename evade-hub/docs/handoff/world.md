# World handoff: Bobo, the hideout, the arcade, AR walk-in, mini games

Everything below was tested in the headless Playwright simulator (SwiftShader, fake floor camera, fake IMU) and
desktop Chromium only. **Nothing has been tested on a real phone.**

## What was built

**Bobo** (`src/evade/world/Bobo.ts`, behind `src/bear/index.ts` `loadBear`)
- Implements `BearCharacter`. The body is `catbobo.glb`; the extra clips come from `bobo-clips.glb`.
- Bone and mesh names collide in the export, so the loader adds a "_1" suffix. Bones get their plain names back and
  meshes get "-mesh". Tracks from both files are renamed to match: the extra clips did not bind at all before this
  fix, and that is why Bobo faced away in Idle.
- Clip map:
  - idle and talkIdle: Idle (fallback Chill)
  - wave and cheer: Excited, played once; dance: Excited, looped
  - walk: Walk; run: Run (falls back to Walk at 1.7x)
  - sway: Purr; present: Alert, played once; shiver: Alert at 1.6x
  - sleep: Sleep; wakeUp: Alert, played once
- `playMove(name)` and `hasMove(name)` play any clip by its own name.
- No face and no lip sync: `say()` resolves at once, and `setVisemes` and `setSpeechStream` do nothing.
- lookAt turns his head a little. Expressions become a head tilt and an ear flick.
- Deleted: `bear/Bear.ts`, `bear/face.ts` and all of `src/lipsync/`. Kept: `src/audio/context.ts`, which the app's
  voice level, capture sounds and play audio use.

**Actions menu** (`src/evade/world/moves.ts`)
- Bobo's real moves in plain words: Hello, Sit, Chill, Purr, Alert, Excited, Run, Dance, Party, Sparkle, Fizz, Nap.
- Moments (`scene/moments.ts`) are Wave, Sit, Chill, Purr, Alert, Cheer, Dance, Running, Sparkle, Magic, Party, Sleep
  and WakeUp, with aliases.
- Dropped: House, Rainbow, Stare and Cold. Everything is recoloured to the flat EVADE palette in `scene/fx.ts`.

**The hideout** (`src/evade/world/hideout.ts`)
- One place, measured in door-local metres: a round hall (r 4.6 m) with the Collector Hub room
  (`/hub/evade/room.glb`) at its back.
- The room is turned −42.5° so its open side faces the entrance. The room's own Bobo, portal, steps and paws are
  removed, and its transmission and emissive materials are toned down.
- Hall shell: a flat canvas floor (rings and a yellow lane), an EVADE wall band, a ceiling, cyan trims and point
  lights.
- The hall floor sits 1.2 cm under the can's floor, so the two don't z-fight.
- `preloadHideout` runs on the splash and loads the room, the catalogue and the thumbnails.

**Bobo's Arcade** (`src/evade/world/arcade.ts`)
- One machine per `loadArcade()` item from `src/evade/catalog.ts` (11 today: 9 games and 2 places). Nothing is
  hard-coded.
- Machines stand left and right on an arc (30° to 104° from the door axis) and face the hall centre.
- Each machine shows:
  - a thumbnail screen with the item's accent bezel;
  - a marquee in the accent colour, with the text in ink or white by contrast;
  - a padlock screen for locked items and a "SOON" band for soon items.
- Flat colours only.
- Performance:
  - The bodies are merged vertex-colour geometry with one Lambert material.
  - The screen, marquee and pad geometry is shared.
  - Canvas textures are small, have no mipmaps, and are redrawn after fonts load.

**3D showcase** (`modes/showcase/index.ts`, `scene/house/index.ts`)
- The 3D world is the hideout at `SHOW_K = 1.33`. Bobo's home is the can's ground floor.
- The default view is a little to his side (yaw 0.55, FOV 58 in portrait). Drag to look: either side shows a row of
  machines. The first hint is "Drag to see the arcade", then "Tap a machine to play".
- Tapping a machine:
  1. Bobo walks to its play spot. If he takes more than 6 s, he pops the rest of the way.
  2. The camera glides to frame the machine over his shoulder. It stays out of the can's wall.
  3. The page emits `arcade {id, source:'cabinet'}`.
- Walking Bobo up to a machine shows a "Play <name>" pill, which emits `arcade {id, source:'walk'}`.
- The Arcade button emits `arcade {id:'', source:'button'}`. The shell owns the sheet.
- Splash hero: the same `setHero` / `preview` as before, with Bobo in the hideout.

**AR** (`modes/ar/index.ts`, `modes/ar/house-walk.ts`, `scene/house/index.ts`)
- Bobo is placed on the floor:
  - default size 0.45 (about cat-sized; Bobo is 1 stage unit tall), pinch from 0.22 to 0.9;
  - Move always visible;
  - "Place Bobo" button.
- Walk-in door: a freestanding frame (pillars with red and white can stripes, cyan neon, a "BOBO'S HIDEOUT" sign,
  and a yellow door with a porthole) about 1 m behind Bobo. The hideout behind it is life size.
- The portal uses the existing DoorClip shader patch: every hideout material is cloned, clip-patched and gets a
  plain twin. Nothing compiles when the door opens or when you cross it.
- Step inside, Leave, walking in with the phone, and Bobo walking in first all work as before.
- Inside the hideout:
  - Tap a machine and Bobo walks to it, then the page emits `arcade … 'cabinet'`.
  - Walk him up to a machine and the Play pill appears, which emits `'walk'`.
  - From outside you can tap a machine through the open door; that opens its card straight away.
- The Arcade button replaces Games. The door frame pops away while a game runs, as the house used to.

**Mini games** (`play/`)
- **Can Dash** (id `heart-run`): collect Eclipse cans. The cans are the real `/evade/keychain/ar/eclipse-can.glb`,
  baked to static instanced parts by `src/evade/world/can.ts`. Also in the round: fizz arcs, a star magnet and the
  grumpy cloud.
- **Paw Hoops** (id `heart-hoops`): toss 10 hearts through a ring standing on a big Eclipse can.
- The ring bands, arcs and beacons use flat EVADE colours.
- The score icon is a can in Can Dash and a heart in Paw Hoops.
- `PLAY_GAMES` has `color` and `icon` for each game.
- In `play.css` and `toss.css`, text on `--cb-pink` (now yellow) fills is ink.

**Other**
- Removed: the plaza, sky, kit3d, Happi.ts, the happi moves list, the old house exterior, room, music and photos
  files, the mailbox, car, rainbow, TV and Stare beam, and the theme video.
- Removed every Happi, Japan, Parade and blossom reference in my files.
- The engine's page id is `evade-hub`.
- `loadExternalModes` fix (reported by shell): a real face or photo mode that finishes loading while its placeholder
  is on screen is kept in `pending`. It is swapped in when you leave that mode.

## How to test

```bash
cd /home/user/medialife
npm run typecheck:evade-hub && npm run build:evade-hub
(cd public && python3 -m http.server 8771 --bind 127.0.0.1)    # serves /evade/hub/
# simulator scripts: evade-hub/docs/handoff/world-sim/ (Playwright from the global install)
sh evade-hub/docs/handoff/world-sim/make-videos.sh             # floor.y4m (~280 MB, never commit)
node evade-hub/docs/handoff/world-sim/show.cjs   # splash, 3D, drag, tap a machine, arcade event, programs
node evade-hub/docs/handoff/world-sim/focus.cjs  # Bobo walks to 3 machines, camera framing
node evade-hub/docs/handoff/world-sim/game.cjs   # Can Dash + Paw Hoops in 3D, programs
node evade-hub/docs/handoff/world-sim/ar.cjs     # AR: place, door, walk in (test pose), inside, machine
```

- Hooks: `?test` exposes `window.__cbx` (with `debug()` and `internals`). `?desktop` lets AR run on a computer or
  in the simulator.
- The `arcade` event is checked by subscribing with `__cbx.on('arcade', …)`.

Screenshots (390x844, simulator) are in `/mnt/project-files/evade-hub/progress/`:
- **3D:** `world-01-splash`, `world-02-3d-after-start`, `world-03-3d-drag-arcade`, `world-04-3d-cabinet-tap-walk`,
  `world-05-3d-cabinet-card`
- **Mini games:** `world-06-3d-can-dash`, `world-07-3d-paw-hoops`
- **AR:** `world-08-ar-placing`, `world-09-ar-placed`, `world-10-ar-door`, `world-11-ar-walked-in`,
  `world-12-ar-inside-arcade`, `world-13-ar-machine-card`

## Simulator-tested vs untested

Simulator-tested:
- Bobo loads, and faces the camera in Idle and Excited.
- Splash hero framing: Bobo projects inside the hero rect, once shell's opaque panel fix is in.
- 3D after Start, drag look, and the default framing.
- Tapping a machine (where-is-bobo, bobo-portal, vault, bobo-booth, cola-run): Bobo walks, the camera frames the
  machine, and `arcade {id, source:'cabinet'}` fires. The shell's card then opens.
- Can Dash and Paw Hoops start and draw: the cans render, nothing z-fights, and there are no console errors.
- Shader programs stay constant: 3D 35 → 35 through moments, a cabinet tap and both games; AR 68 → 68 through
  Place, the door opening, the crossing and a machine tap.
- AR: placing, Place, the door opening, the view through the door, crossing in by test pose ("crossed in"), the
  hideout and arcade inside, a machine tap inside, and the `arcade` event.
- Typecheck and build are clean. There are no console errors in any run.

Untested:
- Everything on a real phone: fps, fill cost, SLAM drift, real walking through the door.
- The walk-source Play pill, by hand in AR. The code path is shared with 3D, where it was not screenshotted either.
- The Actions sheet look.
- Reduced motion.
- Landscape and desktop framing of the hideout.
- Locked and soon machine screens: no item is locked in the test catalogue, so only eclipse-night's "SOON" was seen
  in passing.

## Open issues

- **AR cost:** about 60 room materials, doubled by the plain twins, plus about 360 room meshes. Programs are compiled
  at load (68), but draw calls inside the hideout are high. If phones struggle, merge the room by material in
  `prepareRoom` and convert MeshPhysical to MeshStandard (pitfall 14: frame rate drives SLAM quality).
- **3D portrait framing:** the can sits in the middle of the hall, so the default view shows Bobo and the can, and
  the machines are found by dragging (either side). A layout that puts a few machines straight ahead would need the
  can moved back.
- **Paw Hoops in 3D:** the court camera can sit low, so the lower half is plain navy floor. It works, but it is dull.
- **Bobo is large in 3D** (about 0.75 m in a 1.33x hall). The game ring distances (DIST_M) were tuned for Happi.
- **Unused files:** `src/happi/blossom.ts` is no longer imported (it isn't in my list of files; delete it, or leave
  it, as the shell sees fit). The `src/happi/` folder name is still there.
- **Comment formatting accident, code unaffected:** a bad pronoun-replacing command ran over the comments in nine of
  my files (scene/actor, stage, fx; showcase; play/hoops, game; physics/world, playground, toss). I repaired them by
  line matching and checked the result. The rebuilt JS bundle is **byte-identical** to the build from before the
  accident, so no code changed. A few blank lines next to comments may have been lost.

## Skill findings (immersive)

- **GLB name collisions:** when a GLB's bones and meshes share names, GLTFLoader adds "_1" to one of each pair. Clips
  from a *second* GLB of the same rig carry their own suffixes. Normalise track names against the *target* bone set
  (strip `_\d+` when the base is a bone), not only through a rename map. Otherwise the clips silently bind only the
  root bones, and the character looks turned around.
- **Facing:** decide a model's facing from a render of the animated pose, never from the bind pose or from bone
  world positions alone.
- **Floors:** a room GLB's floor at y=0 z-fights with any floor of your own at y=0. Drop yours a centimetre.
- **Camera framing:** in a portrait view (about 26° horizontal at FOV 52), anything more than about 15° off-axis is
  out of view. Put the things you want seen straight ahead, or give the first hint about dragging.
