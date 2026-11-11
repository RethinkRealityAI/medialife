# Keychain pop-out (EVADE)

Point the camera at the EVADE acrylic keychain and Bobo and the Eclipse can jump out of their
charms in 3D, land on glowing pads in front of the keychain, and come alive. Each one starts lying
exactly over its printed art, shivers, then springs off: the can first, landing beside Bobo's spot,
then Bobo, who lands wagging his tail and settles into the keychain sit. Where they were, a black
silhouette is left on each charm, so the printed keychain does not show behind the 3D characters.

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
Bobo: `PopOut` (flat and full size like the print, then full 3D), `Sit` (keychain pose idle), `PawRaise`, `TailWag`, plus the
original Bobo's `ClassicWalk`, `ClassicSit`, `ClassicChill`, `ClassicSleep`, `ClassicExcited`. The new
Bobo uses the original Bobo's skeleton (same bone names and rest orientations: HRP, FakeTorso, CatHead,
Ear, Ear2, FrontLeg, FrontLeg2, BackLeg, BackLeg2, Tail) plus Tail2–Tail5 for a smooth tail, so any clip made
for the old Bobo plays on this one. Can: `PopOut` (starts tipped toward the viewer like the print, stands up, spins once, tab kicks) and `Idle` (fizz loop).

## Silhouettes
Each GLB has a `Silhouette` node: a flat unit quad showing the black shape of that charm's printed art
(`public/evade/keychain/ar/silhouette-bobo.png` / `silhouette-eclipse.png`, transparent PNGs in the same
pixel frame as `src/charm-*.png`). It is placed where the model is in the first frame of `PopOut`. The
component takes it off the model, pins it to the charm (Bobo: the tracked image; can: **Can Charm Offset**)
and starts the model at (charm frame) x (Silhouette matrix)^-1, so model, silhouette and print line up.
Train the tracker on `charm-bobo.png` (the whole picture, not a crop) so the Bobo silhouette sits exactly
on the print; the can charm swings freely on the real keychain, so its silhouette is only as accurate as
**Can Charm Offset**. Turn them off with **Show Silhouettes**.
