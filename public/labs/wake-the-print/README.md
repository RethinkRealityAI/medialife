# Wake the Print (Labs proof of concept)

MEDIALIFE showcase for AI + activated merch. Point the phone at a print and **Spark**, a character built in code, pops
out and hovers over it. Spark:
- **sees the room**: object detection, brightness and main colour, all worked out on the phone (MediaPipe)
- **talks by voice**: an ElevenLabs agent with four client tools the page implements (`act`, `look_around`,
  `set_color`, `remember`)
- **hops onto your open palm**: MediaPipe hand tracking, then back onto the print when the hand goes away
- **remembers you between visits**: localStorage, keyed by `?item=`

Image tracking is the open-source 8th Wall engine (vendored at `/evade/keychain-ar/vendor/xr/`) with three.js r180,
built from the immersive skill's 8th Wall template. Static files, no build step.

Target: the Sukeban tee from Spray Bobo (`/evade/spray-bobo/targets/tee-sukeban.json`, print 304.8 x 406.4 mm).
To test without the tee, open `target/` on a laptop screen and point the phone at it.

## URL parameters
| Param | What it does |
|---|---|
| `?item=<id>` | Which piece of merch this is. Memory is stored per item (`wtp:<id>`, letters/digits/`_`/`-`, max 40). Default `demo`. |
| `?text` | Mic sessions are text-only (no microphone, no audio) and the typing bar shows from the start. |
| `?debug` | Draws the target frame on the print (alignment check). |
| `?test` | Exposes `window.__ar` (template) and `window.__wtp` for the simulator: `{ spark, senses, voice, tools, mem, getVars, describe, perch, camera, printShown, fakeHand(cx, cy, palmPx, open = true) }`. `fakeHand(null)` stops the fake hand. |
| `?nolog` / `?diag` | Test log off / on (on by default on localhost and deploy previews). Records have `page: 'wake-the-print'` and a `wtp` block: senses status, hand stats, perch count, rejected hand samples, tool call counts, voice state changes with reasons, visits, last look. |
| `?dpr=2` | Draw at 2x (sharper, slower pickup). |

## Files
- `index.html`: all DOM and CSS (flat colours; shutter bottom centre, mic left of it, menu right of it).
- `main.js`: the template's engine boot, pose maths, follow(), grace/stale handling, canvas sizing, photo, test log and
  error sheets, unchanged; plus Spark placement (print <-> palm), the pop moment (magenta ring + shadow on the print),
  senses wiring, the agent tools, captions, memory, menu and `?test` hooks.
- `spark.js`: the character (placeholder until a designed mascot is picked). `root`, `update`, `act`, `setColor`,
  `setMouth`, `setListening`, `setLook`, `pop`, `arrive`.
- `senses.js`: MediaPipe Hand Landmarker (~12 Hz) and Object Detector (on demand), loaded from jsDelivr / Google
  storage after the camera starts; never blocks Start.
- `voice.js`: the ElevenLabs agent session (WebRTC voice with WebSocket fallback, or WebSocket text-only), energy
  limit (180 s per visit), scene events.
- `vendor/elevenlabs-client.js`: the bundled ElevenLabs client SDK.
- `target/`: the test picture page.

## How Spark moves
- On the print: scene-level object placed every frame from the print anchor. Height = 0.32 x print height; it sits
  `H*0.08 + popLift*H*0.6` out from the print (pressed flat at the start of the pop, then springs up).
- On the palm: the hand centre from MediaPipe is mapped to the screen (camera feed drawn "cover"), its distance comes
  from the palm's width in the video (a palm is about 75 mm wide), and Spark is 75 mm tall there, facing the phone.
  An open hand for 350 ms after the pop moves Spark on; no hand for 700 ms moves it back. Spark only shows while the
  print is tracked now, or while it is on a hand seen in the last 700 ms.
- **Drawn hands are ignored**: a hand whose distance (from its size) is not nearer than the print is dropped. The
  Sukeban art has two drawn hands and the real hand model finds them; without this check Spark hopped onto the
  artwork in the simulator.

## Caveat: the agent is public
The agent id is in the page with no key (see `voice.js`). It is capped on the ElevenLabs side (100 conversations a
day, 3 at once) and each visit is capped by Spark's energy. **Before any client work, switch the agent to signed URLs
from a Netlify function (key in Netlify env).**

## Tested / Not tested
Tested 2026-11-15 in the headless camera simulator only (Chromium + SwiftShader, fake camera from a y4m of
`tee-sukeban.jpg`, 390x844 phone viewport). Not yet on a real phone.

Tested (simulator):
- Target found in 1.6-3.1 s (static and moving/rotating videos); `?debug` frame on the picture edges; Spark centred on
  the print at ~0.35-0.38 of the print's on-screen height (0.32 x print height plus the perspective of hovering
  in front of it); pop, ring, visit counted once per page load; mic enabled with the nudge and hint after the pop;
  tap on the camera view plays a jump; no console errors from our code.
- Tools called directly: `act` (incl. unknown action message), `set_color` (incl. unknown colour), `remember`
  (trim, dedupe, newest 8, 120 chars). Memory survives a reload, `getVars()` reflects it, menu sheet text, Forget me
  clears it and says so, the typing bar toggles from the menu.
- Palm perch with `__wtp.fakeHand(0.5, 0.6, 180)`: perch reaches 1, Spark lands exactly over the hand's screen point
  with an on-screen height equal to the palm width (0.075 m), "Spark is on your hand" hint, a closer hand gives a
  bigger Spark, `fakeHand(null)` returns it to the print, a closed hand does not perch.
- Real MediaPipe (hands + object detector) downloaded and ran through the sandbox proxy: the detector reported
  "1 person" (the drawn girl); the hand model found the drawn hand on the print and the depth check rejected it.
- One real text-only agent session (`?text`, WebSocket): Spark greeted first using the `seen` variable, then for
  "My name is Sam, do a spin" the agent called `act` (x2), `look_around` (x1) and `remember` (x1, "Name is Sam").

Not tested:
- Any real phone (Android Chrome, iPhone Safari), glare, focus, real hands, real palm distances.
- Voice with a microphone (WebRTC), lip sync from real audio, the energy timeout and goodbye.
- Frame rate on phones with the hand model running: in the simulator the hand model ran at ~410 ms a call (2 Hz,
  software GL) inside the render loop, and everything slowed (the 0.8 s hop took ~4 s). Phones should get the GPU
  delegate; a phone that falls back to CPU will stutter. Check `fpsAvg` and `wtp.hand.handMsAvg` in the phone log.
- Landscape layout, reduced motion, photo save/share, storage blocked (private mode).
