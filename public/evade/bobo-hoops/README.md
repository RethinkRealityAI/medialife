# EVADE AR: Bobo Hoops

`/evade/bobo-hoops/`: the first MEDIALIFE experience that starts on an **image target** and hands off to
**world-tracked AR** in the same camera session.

## The flow
1. **Find**: point at the Eclipse can charm on the EVADE keychain (targets `kc-can`, `kc-can-back`, the Off the Chain
   pictures). A cyan scan line runs up the charm (Bobo X-Ray's scanner), the printed can turns into a dark cut-out with
   a pulsing cyan rim, and the 3D Eclipse can (Off the Chain's Blender GLB, its `PopOut` clip) shivers and pops out,
   then hovers and fizzes (`Idle`).
2. **Play Some Hoops** (bottom centre, only while the charm is tracked).
3. **Grow**: the can leaves the charm, spins and grows out in front of the phone.
4. **Place**: "Point at the floor or a table". A ring follows the floor in the middle of the screen, the can hovers over
   it, pinch to size it (25 cm to 1.2 m tall, default 60 cm, remembered), tap **Place the can**.
5. **Drop**: it slams down (squash, dust ring, thud) and its lid pops off: an open-top can.
6. **Play**: 10 balls (the basket is the dot row at the bottom; the 10th is the cyan money ball). Bobo sits beside the can
   and reacts (PawRaise on a make, TailWag + mew on a swish).

## The shooting mechanic
- **Swipe up** from anywhere on the screen. The camera is the aim: where you point is the direction, and how far up or
  down you look sets where the arc starts (higher arc when you look up). The **length of the swipe is the power**
  (1.6 to 8 m/s over 42% of the screen height); leaning the swipe sideways curves the aim up to about 25 degrees.
- **Aim guide** (Options): Off / **Short** (default: the first third of the arc, so you see the direction and the climb
  but have to judge the distance) / Full.
- Scoring: in = 2, swish (no rim, no wall) = 3, +1 from more than 2.5 m away (measured at release), +1 for every make
  from the third in a row, the money ball doubles. Best score in localStorage.
- Physics (`tickBalls`): real gravity in metres, 4 substeps, the can's measured profile (body radius 0.2705, shoulder
  in to the 0.222 neck at 0.945 of its height), a rim torus, inner wall and floor, the floor round the can, ball against
  ball (balls pile up in the can). No physics engine: the scene is one can and 10 spheres.

## One engine for both kinds of tracking
`@8thwall/engine-binary@1.0.0` (Niantic Spatial licence, loaded unmodified from jsDelivr, credited on the splash):
`XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive', imageTargetData })` runs the image
targets AND SLAM at once, and reports the image target pose in the same world frame as the floor. The handoff is just
taking the can's world transform off the charm (`scene.attach`) and animating it on in world space.
- The target pose is in SLAM units, not the print's real size. At the handoff the can is slid along the camera ray to
  30 cm away and shrunk by the same factor (`takeOffCharm`): identical on screen, then it grows from a sensible depth.
- Floor = the plane y = 0 (responsive scale: the camera starts 1.3 units above it), ray from just below the screen
  centre, as in 8th Wall's own world-effects example and Cola Run World.
- No iPhone macro-lens switch here (Off the Chain and X-Ray pick the multi-lens camera for close focus): SLAM needs the
  standard back camera. Hold the keychain a little further away on iPhones if it looks soft.
- Licence: fine for EVADE's campaign (AR is one part of a wider deliverable), never for a sold AR toolkit.

## Switches
`?test` exposes `window.__bh` (`play`, `place`, `floorAt(dx, dz)`, `shoot(power, side)`, `aimAt`, `game`, `diag`);
`?nolog` sends nothing; `?diag` shows the status line on the live site; `?dpr=2` sharper drawing (default 1.5);
`?desktop` lets a laptop try (no motion sensors: it will not track); `?verbose` engine camera logs.
Test logs go to `/api/ar/kc-diag` (records with `page: 'bobo-hoops'`) on previews and local dev, or with `?diag`.
Platform events: source `bobo-hoops` (`scan`, `found`, `custom` hoops-play / hoops-score).

## Tested
Headless Chromium with a fake 3:4 portrait camera of the kc-can picture and faked motion sensors: the engine binary
finds the can charm while world tracking reports NORMAL, the reveal, Play Some Hoops, grow, placement (test hook),
drop, and shots across the power range (see the PR for numbers). **Not yet tried on a phone**: real floor tracking,
the handoff feel, and how the swipe power feels at real distances all need Dapo's phone test.
