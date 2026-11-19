# Robot Path (nav-mesh)

Source: the legacy 8th Wall sample project `nav-mesh` (A-Frame or three.js), rebuilt in plain three.js on the shared
Labs shell (`../shared/`). What was kept and what changed is written at the top of `main.js`.

Assets (in `../media/`): nav-env.glb, nav-mesh.glb, robot.glb.

Credits: Environment from Kenney Platformer Kit (https://kenney.nl/assets/platformer-kit, CC0). Nav-mesh idea from the Navigation Mesh component in AdaRoseCannon/aframe-xr-boilerplate (our grid + A* is new code). Robot: RobotExpressive (three.js examples).

Engine: 8th Wall engine binary 1.0.0 (world tracking), three.js r180. Licences are on the Licences page (menu > Licences, `/evade/licences/`), never on screen.

Status: simulator-tested only (headless Chromium, fake camera, faked motion). Not tested on a phone yet.
