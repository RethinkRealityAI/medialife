# Wear It, Meet It (wear-it-meet-it)

The example use of the camera swap: **wear it, then meet it.**

1. Selfie camera: the fan wears the robot's visor (see-through window, scanner light), antenna and ear bolts in the
   colour they pick, and takes a selfie (shutter, bottom centre). The selfie is cropped round their head.
2. "Meet your robot" flips to the back camera in the same engine session: aim at the floor, Place here, and the same
   robot stands life-size (1.4 m, pinch 0.4x-1.3x while placing) in their room, in their colour, waving, holding the
   selfie up on a floating frame. It turns to face them; tap it for a move.
3. Shutter again: one branded photo of the room scene. Flip goes back for a new selfie or colour; the robot keeps its
   spot (Move, bottom right, moves it), and the new selfie and colour are waiting on it when you come back.

After each flip to the room, Place (or putting the robot back) waits until world tracking has settled, about 1.5 s
in the simulator. The first Android phone test, before this gate, had the robot fly away after the flip.

State that survives every swap: selfie, colour, placement, robot. Built on the shared shell's swap mode (see
`../camera-swap/README.md` for the exact XR8 calls).

Assets: `../media/robot.glb` (RobotExpressive by Tomás Laulhé, CC0, as in Robot Run), `../media/head-occluder.glb`
(face-effects sample), flat three.js shapes for the visor and antenna, flat canvas art for the empty frame. No EVADE
assets, no generative tools.

Engine: 8th Wall engine binary 1.0.0 (slam + face chunks, Niantic Spatial XR Engine License), loaded unmodified from
jsDelivr; three.js r180. Licences are on the Licences page (menu > Licences), never on screen.

Status: simulator-tested only (headless Chromium: face photo as the front camera, floor video as the back camera,
faked motion): selfie -> room -> photo, then two more selfie/colour round trips; the robot's spot relative to the phone,
colour and selfie survive each swap; console clean. **Not tested on a phone yet.** Check on phones: iOS camera
permission on the direction change, swap time, the visor and antenna fit on real faces, and the robot's life-size
scale on a real floor.
