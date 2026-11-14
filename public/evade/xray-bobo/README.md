# EVADE AR: Bobo X-Ray

`/evade/xray-bobo/`: point the phone at Bobo (the cat charm on the EVADE keychain, or the same picture printed on a
tee). The print opens into a box that goes back *into* the surface, and Bobo floats in the middle of it. A scanner
line sweeps through the box: above it Bobo is an X-ray (see-through cyan body with a skeleton inside), below it he
is himself. On a tee this reads as an X-ray window into the wearer.

## How the hole works (depth-only occluder, no stencil)
- An invisible sheet (20 prints across) lies on the print with the window cut out of it. It is drawn first
  (`renderOrder -10`) with `colorWrite: false`, so it writes depth only: the camera picture still shows, but anything
  behind the print plane is hidden except through the window.
- Everything else sits behind the print plane: five flat walls with a grid (`box`, built one unit deep and scaled to
  the depth), floating specks, Bobo. Moving the phone slides them against the
  window's edge, which is the parallax.
- Not stencil: the 8th Wall engine creates the WebGL context itself without a stencil buffer, so a stencil portal
  would silently draw nothing. Depth-only needs nothing from the context.
- Window shape (Options): a rounded rectangle (the whole print) or the cat's die-cut line
  (`/evade/spray-bobo/art/cat-outline.json`). The cyan rim is a flat ribbon just outside the window.
- Opening (`makeShatter`, one instanced draw): the picture as a grid of tiles over the real print (identical at
  first). From the middle out each tile turns digital (pixelates, posterises into scanner cyan with a cyan edge),
  lifts off, flies outwards and turns, and dissolves block by block, uncovering the box as the walls grow. It lasts `OPEN_S` (3.6 s; Dapo asked for at least 3).
- The can is different (Dapo 2026-11-14: "truly look like we X-rayed inside of it"): no box and no grid. The window
  is the drawn can traced exactly (Spray Bobo's can-outline.json: lid, pull tab, shoulders, body, base). Behind it is
  the back half of the can, a lathe whose radius at each height is the outline's widest half-width (`canTube`, 41
  samples), so it covers the window, tab included. Brushed aluminium lit by a lamp inside the can so the round back
  reads, a domed base and bead grooves. Inside: the soda (`buildCan`: tinted wall, see-through front face, surface, bubbles).
  X-ray: dark walls with cyan bead rings, cyan soda, white bubbles. Depth: Deep = a round can; Shallow / Deeper flatten
  or stretch it. Its reveal is a light burn, not the tiles (`makeBurn`, `OPEN_CAN_S` = 5.2 s): a pin of light, cracks running out, then the
  print burns away behind a white-hot edge with a cyan rim, only inside the can's outline. Balls float in the soda
  (buoyancy and drag in `tubeWalls`), Fizz blasts them out.
- Pieces (`PIECES`): Bobo (`kc-bobo`, `kc-bobo-l`) with Bobo floating inside, and the Eclipse can (`kc-can`,
  `kc-can-back`), which opens into the can itself (above). The 3D
  Bobo is mirrored so his tail is on the same side as the print (as in Off the Chain).

## Bobo, ghost and bones
The Off the Chain Bobo (`/evade/keychain/ar/bobo-keychain.glb`, its `Sit`, `PawRaise`, `TailWag` clips). Skin
materials are clipped by one world-space plane, the ghost and bones by the opposite plane, so the scan line is a
clean cut. The ghost is each skinned part again (same skeleton) in flat cyan at 20 %. The skeleton is built at load
from the vertices each bone moves most (skull with sockets, spine and ribs, leg bones and paws, tail vertebrae),
parented to the bones with the bone's inverse bind matrix, so it follows every clip.

## Tracking
Targets `kc-bobo` and `kc-bobo-l` (shared with Off the Chain and Spray Bobo; the back side flips x). Spray Bobo's
PR #47 rules: the scene is only drawn where the print is tracked now; a drop holds the pose 250 ms only while the
motion sensors say the phone is still (120 ms without sensors); a target the engine stops updating counts as lost
after 3 of its usual update gaps. Lost for 2.5 s: the box opens again with its intro.

## Balls and the paw swipe (game)
- Physics is a small custom sphere solver in `main.js` (`tickBalls`), not Rapier: the scene is one box, a round bumper
  (Bobo or the can) and up to 10 balls, which a few dozen lines handle exactly, while Rapier's WASM would add about
  2 MB to a page that has to load fast on a phone. The OSS 8th Wall engine has no physics of its own.
- Everything runs in the print's own frame (x across, y up the print, z out of it), 3 substeps a frame, toy gravity
  `G = 7 H`. Walls, floor (with friction), back wall, Bobo as a sphere, ball against ball.
- Tap the box or press Ball: a ball is thrown from the phone on an arc that lands where you tapped, mid-box. Balls that
  miss the window bounce off the print (rim shot). A loose ball stays in the box: it rolls back off the window's lip.
- Swipe (Fizz on the can): Bobo turns to the nearest ball, lunges and bats every ball near his paw out through the
  window. Each ball out scores, several within 1.2 s is a combo, best score kept in localStorage. Milestones at 5, 10,
  25, 50. The can's Fizz blasts every ball out at once. Shaking the phone rattles the balls.

## Controls
View pill above the shutter: Scan / X-ray / Skin. Ball and Swipe stacked on the right, Ball on top, so one thumb
reaches both while the other hand holds the keychain (both only once the box is open). Tap the box: throw a ball. Drag: turn Bobo.
Shutter bottom centre (tap photo, hold video; the Cola Run recorder, source `xray-bobo`). Options: window shape,
depth (Shallow / Deep / Deeper), sound, how it works, test picture link. Settings are kept in localStorage.

## Switches
`?test` exposes `window.__xr` (`game`, `throwBall`, `doSwipe` for the ball test); `?nolog` sends nothing; `?dpr=2` sharper drawing; `?macro=0` standard iPhone camera.
Test logs go to `/api/ar/kc-diag` (records with `page: 'xray-bobo'`) on previews and local dev, or with `?diag`.

## Tested
Headless Chromium with a fake camera (the kc-bobo picture swinging ±28 deg and tilting): found in under 3 s, box
opens, all three views, cut-out window and the deepest box. Not yet tried on a phone or on a real tee.
