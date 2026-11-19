# Picture to Room (image-to-world)

Source: the legacy 8th Wall sample project `image-slam` (A-Frame or three.js), rebuilt in plain three.js on the shared
Labs shell (`../shared/`). What was kept and what changed is written at the top of `main.js`.

Assets (in `../media/`): target/ (glyphs.json, glyphs.jpg, glyphs_luminance.png), sand-castle.glb.

Credits: Glyph target picture and sand castle from the image-slam sample.

Engine: 8th Wall engine binary 1.0.0 (world tracking), three.js r180, image target loaded with XrController.configure({imageTargetData}). Licences are on the Licences page (menu > Licences, `/evade/licences/`), never on screen.

Status: simulator-tested only (headless Chromium, fake camera, faked motion). Not tested on a phone yet.
