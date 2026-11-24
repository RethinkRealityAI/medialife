# Camera Swap (camera-swap)

Source: the legacy 8th Wall sample project `swap-camera` (three.js), rebuilt in plain three.js on the shared Labs shell
(`../shared/`, swap mode). What was kept and what changed is written at the top of `main.js`.

What it does: a cube on your floor with the back camera (world tracking, tap to place, Move bottom right) and the
sample's shades, face paint and occluder on your face with the selfie camera. Flip (bottom left) switches cameras.
One colour runs through both: the cube and the right lens share it, so you can see the state carry over.

How the swap works: ONE engine session, as in the sample, with no page reload. The engine binary
(`@8thwall/engine-binary@1.0.0` from jsDelivr, `data-preload-chunks="slam,face"`) ships both the slam and the face
chunks, so the shell does:
`XR8.stop()` -> `XR8.removeCameraPipelineModules(['reality'])` (or `['facecontroller']`) ->
`XR8.XrController.configure(...)` or `XR8.FaceController.configure(...)` -> `XR8.addCameraPipelineModule(<the other tracker>)` ->
`XR8.run({ ..., cameraConfig: { direction: BACK | FRONT } })`.
Every run hands over a new three.js scene, camera and renderer (same GL context); the shell moves its persistent
content across and hands on the GL textures. After a flip back, world tracking restarts from zero: the cube stays
hidden ("Hold still a moment, finding the floor…") until SLAM has settled (`wh.settled()`, world-health.js), then goes
back at the same spot relative to the phone's pose at that moment. (Android phone test of Wear It, Meet It: restoring
or placing before the settle made content fly away.)

Assets (in `../media/`): stereo-glasses.glb, head-occluder.glb, face-alpha.png. Cube and face paint art are our own flat
canvas designs (the sample's were the engine maker's logo, from its CDN, which is gone).

Credits: Stereo glasses by jau0gan (TurboSquid, free), as credited by the sample.

Engine: 8th Wall engine binary 1.0.0 (Niantic Spatial XR Engine License), loaded unmodified from jsDelivr; three.js r180.
Licences are on the Licences page (menu > Licences, `/evade/licences/`), never on screen.

Status: simulator-tested only (headless Chromium: floor video as the back camera, a face photo as the front camera,
faked motion). Back -> front -> back three times: placement, colour and face rig survive, console clean, swap 45-90 ms.
**Not tested on a phone yet.** On phones expect a slower swap (camera hardware restart) and check whether iOS asks for
camera permission again when the camera direction changes.
