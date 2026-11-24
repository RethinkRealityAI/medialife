# Hypergalactic Monkey Quest Hub

`/monkey-quest/hub/`: one AR experience for the Monkey Quest enamel pin. The splash leads to a
"Choose Your Experience" menu, and the chosen mode runs inside the same camera session. Switching
modes (top-right menu, or Options > Choose experience) never reloads the page or restarts the camera.

## Modes

- **Spray the Pin** (`?mode=spray`): the pin is image-tracked. It scans, shivers and pops off the print
  as a 3D enamel pin, with the 3D Monkey Quest logo beside its head. Hold on the screen to spray. Caps,
  nozzle sizes, undo and Clean the pin are available.
- **Launch It** (`?mode=launch`): the same pop-out, then Launch hands the pin over to world tracking
  (Bobo Hoops pattern). Pinch to size it, tap Place it, then tap the pin (hop) or the logo (spin and
  stars). Move is always on screen and keeps the paint.

The paint persists across modes because both modes use the same painter on the same pin.

## Files

- `main.js`: flow, modes, handoff, recorder (ColaCapture), ARTrack events, and `?test` hooks (`window.__mq`).
- `paint.js`: the projective GPU painter, copied verbatim from Spray Bobo Enhanced (`public/evade/spray-bobo-enhanced/`).
- `models/pin.glb`, `models/logo.glb`: built in Blender from the photo by `scripts/build-monkey-quest/`
  (`build.sh`; it needs the original pin photo as `PIN_PHOTO`). The `.blend` sources are in the project files.
- `targets/mq-pin.*`: image target of the pin only (the card behind it is cut away), 3:4 frame.
- `target/`: test picture page for testing without the pin.

## Assumptions

- **Pin height is 50 mm.** Tracking works at any size, but the pop-out scale and the target `heightMm`
  assume 50 mm. Change `PIN` / `FRAME_H` in `main.js` and rebuild the target if the real pin differs.
- The logo is traced from the Monkey Quest card art.

## Switches

`?mode=spray|launch` (skip the menu), `?desktop` (skip the open-on-phone QR), `?test` (test hooks),
`?diag` (on-screen test log), `?nolog` (no remote test log).

## Tested

Simulator only (headless Chromium with a fake camera video): splash on iPhone 13, iPhone SE and desktop;
both modes end to end. Not yet tested on a phone.

## Licences

The 8th Wall engine binary and three.js are credited on `/evade/licences/`, linked from Options > Licences.
