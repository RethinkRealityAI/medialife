# Keychain pop-out (EVADE)

Point the camera at the EVADE acrylic keychain and Bobo and the Eclipse can jump out of their
charms in 3D, land on glowing pads in front of the keychain, and come alive: Bobo sits in the
keychain pose, waves, wags his tail; the can idles with fizz coming out of the open tab.

- Component: `KeychainPopOut.ts` (type-checks against `@zcomponent/three@1.38.2`; not yet opened in the editor).
- Browser test version (same logic): `/labs/keychain-pop/`.
- Models: `public/evade/keychain/ar/bobo-keychain.glb` and `eclipse-can.glb`, built in Blender by
  `scripts/build-keychain-ar/` (see that README). No generative AI or image-to-3D was used.

## Set-up in Mattercraft
1. Add an **Image Tracker** and train it on the Bobo charm art (`public/evade/keychain/src/charm-bobo.png`,
   or a straight-on photo of the real charm). The Bobo charm has far more detail than the can charm, so it tracks better.
2. Drop `KeychainPopOut.ts` into the project and add it **inside** the Image Tracker group.
3. Leave the model URLs as they are (they load from medialife.ai) or import the two GLBs into the project and paste their URLs.
4. Tune **Layout** (heights and landing spots are in tracker units: 1 = the height of the tracked image).

It pops out automatically when the tracker becomes visible and resets after the keychain has been out
of view for **Reset After Lost** seconds. If your tracker never hides its group, call `popOut()` from an
"on seen" action instead and set **Pop On Found** off. Public actions: `popOut()`, `wave()`, `wagTail()`, `hideCharacters()`.

## Clips in the GLBs
Bobo: `PopOut` (squashed flat to full 3D), `Sit` (keychain pose idle), `PawRaise`, `TailWag`, plus the
original Bobo's `ClassicWalk`, `ClassicSit`, `ClassicChill`, `ClassicSleep`, `ClassicExcited`. The new
Bobo uses the original Bobo's skeleton (same bone names and rest orientations: HRP, FakeTorso, CatHead,
Ear, Ear2, FrontLeg, FrontLeg2, BackLeg, BackLeg2, Tail) plus Tail2–Tail5 for a smooth tail, so any clip made
for the old Bobo plays on this one. Can: `PopOut` (spins out, tab snaps open) and `Idle` (fizz loop).
