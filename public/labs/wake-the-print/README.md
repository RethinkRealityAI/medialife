# Wake the Print (Labs proof of concept)

MEDIALIFE showcase for AI + activated merch. Point the phone at a print and **Spark**, a character built in code, pops
out and hovers over it. Spark:
- **sees the room**: object detection, brightness and main colour, all worked out on the phone (MediaPipe)
- **talks by voice**: an ElevenLabs agent with four client tools the page implements (`act`, `look_around`,
  `set_color`, `remember`)
- **reacts to your hand**: MediaPipe Gesture Recognizer on the back camera. Gestures held beside the print make Spark
  act; an open palm held still makes it hop onto your hand, and back onto the print when the hand goes away
- **remembers you between visits**: localStorage, keyed by `?item=`

Image tracking is the open-source 8th Wall engine (vendored at `/evade/keychain-ar/vendor/xr/`) with three.js r180,
built from the immersive skill's 8th Wall template. Static files, no build step.

Target: the Sukeban tee from Spray Bobo (`/labs/medialife-spray/targets/tee-sukeban.json`, print 304.8 x 406.4 mm).
To test without the tee, open `target/` on a laptop screen and point the phone at it.

## URL parameters
| Param | What it does |
|---|---|
| `?item=<id>` | Which piece of merch this is. Memory is stored per item (`wtp:<id>`, letters/digits/`_`/`-`, max 40). Default `demo`. |
| `?text` | Mic sessions are text-only (no microphone, no audio) and the typing bar shows from the start. |
| `?debug` | Draws the target frame on the print (alignment check). |
| `?test` | Exposes `window.__ar` (template) and `window.__wtp` for the simulator: `{ spark, senses, voice, tools, mem, getVars, describe, perch, camera, printShown, handInfo, lose(), fakeHand(...) }`. See **Test hooks**. |
| `?nolog` / `?diag` | Test log off / on (on by default on localhost and deploy previews). Records have `page: 'wake-the-print'` and a `wtp` block, see **Test log**. |
| `?dpr=2` | Draw at 2x (sharper, slower pickup). |
| `?hand=cpu` / `?hand=gpu` | Forces the hand model's delegate, to compare on a phone: no fallback to the other delegate and no watchdog. The canary still runs and is logged (the model is used even if it fails). |
| `?canaryfail=gesture-GPU,...` / `?handwatch=<n>` | Test only (with `?test`): those canary runs report no hands / the GPU watchdog fires after n runs, counting every run as handless. |

## Files
- `index.html`: all DOM and CSS (flat colours; shutter bottom centre, mic left of it, menu right of it).
- `main.js`: the template's engine boot, pose maths, follow(), grace/stale handling, canvas sizing, photo, test log and
  error sheets, unchanged; plus Spark placement (print <-> palm), the pop moment (magenta ring + shadow on the print),
  senses wiring, the agent tools, captions, memory, menu and `?test` hooks.
- `spark.js`: the character (placeholder until a designed mascot is picked). `root`, `update`, `act`, `setColor`,
  `setMouth`, `setListening`, `setLook`, `pop`, `arrive`.
- `hand-check.jpg`: the hand canary, a real thumbs-up photo (MediaPipe sample asset, 382x406, 33 KB).
- `senses.js`: MediaPipe Gesture Recognizer (~12 Hz; falls back to the Hand Landmarker if it does not load) and
  Object Detector (on demand), `@mediapipe/tasks-vision@0.10.14` from jsDelivr, models from Google storage, loaded
  after the camera starts; never blocks Start. `senses.hand` = `{ seen, at, open, cx, cy, palmPx, landmarks, gesture, score }`.
- `voice.js`: the ElevenLabs agent session (WebRTC voice with WebSocket fallback, or WebSocket text-only), energy
  limit (180 s per visit), scene events.
- `vendor/elevenlabs-client.js`: the bundled ElevenLabs client SDK.
- `target/`: the test picture page.

## Hand gestures
Hold a gesture **beside the print** (not over it) for about 0.4 s. It fires once; then nothing fires for 2.5 s, and
never while another action is playing (a gesture still held then fires when it may).

| Gesture (MediaPipe name) | Spark | Chip |
|---|---|---|
| Thumb_Up | `confetti` | Thumbs up |
| Victory | `dance` | Peace sign |
| Pointing_Up | `jump` | Pointing up |
| ILoveYou | `spin` | Love you sign |
| Closed_Fist | `nod` | Fist |
| Thumb_Down | `shake` | Thumbs down |
| Open palm moving side to side (2 direction changes in 1.2 s, at least 8% of the frame width) | `wave` | Wave |
| Open palm held still 0.7 s (on screen, nearer than the print) | hops onto the palm | Open hand |

- Score must be at least 0.6. A wave always wins over the perch: any movement over 5% of the frame restarts the
  0.7 s still timer, and a wave that fires while Spark is still hopping on cancels the hop.
- Each fired gesture also sends the voice agent a short scene event ("The fan gave you a thumbs up"), rate limited.
- While a real hand is in view Spark looks toward it (unless it is standing on it), otherwise at the phone.
- The `#sees` row shows a chip: "Hand seen" while a real hand is in view, replaced by the gesture's name while one is
  recognised. Once per page load, 6 s after the pop, the hint says "Show Spark a thumbs up beside the print"
  (skipped if a gesture has already fired).
- **Real hand or the artwork?** The Sukeban art has two drawn hands and the model finds them. A hand whose centre is
  inside the print's on-screen outline (the whole 3:4 target frame, projected from the anchor each sample) is the
  artwork unless its size says it is clearly nearer than the print (< 0.8 x the print's distance). A hand whose
  centre is outside the outline is real at any distance: that is a hand held beside the print. The perch keeps the
  stricter rule on top: nearer than 0.92 x the print's distance and on screen. With no print pose from the last
  second (and Spark not on the hand) nothing is judged and nothing fires.
- **Short print losses with a hand in view**: the house rule stays (Spark shows only while the print is tracked now,
  plus the template's 120 ms grace, or on a fresh palm). A gesture's hold is not reset by the loss and fires when
  Spark shows again, and when the print is found again within 1.5 s with a real hand in view Spark does not replay
  the climb out of the print.
- The time windows stretch on a phone whose hand model runs slowly (gap allowance 1.5x, "in view" 2.5x the measured
  time between samples).

## Hand model: canary and watchdog
On a real Samsung phone (Samsung Browser 31 / Chrome 148) the GPU delegate created fine, ran at ~23 ms a call and
returned no hands at all (`handSeen: 0` in 611 and 869 runs), while the CPU object detector on the same video worked.
Creating without an error is not proof that a delegate works, so:
- **Canary**: every hand model, once created, is run on `hand-check.jpg`. It is used only if a hand comes back. Order:
  gesture GPU, gesture CPU, landmarker GPU, landmarker CPU; the first that passes wins; none -> `hands: 'failed'`. A
  model that fails is closed. The canary call uses the same rising timestamp clock as the video frames (VIDEO mode).
- **Watchdog**: a GPU model with no hand at all in its first 60 video runs (~5 s) is closed and rebuilt on CPU
  (canary again), once; it never flips back. Note: a print with no hands in it and no fan hand for 12 s also trips it
  (harmless, just slower).
- **CPU input**: on CPU the model gets a 384 px (long side) copy of the frame at 8 Hz, timed from the END of the last
  call so slow calls never pile up. Landmarks are 0..1, so `palmPx` is still worked out in real video pixels.

## How Spark moves
- On the print: scene-level object placed every frame from the print anchor. Height = 0.32 x print height; it sits
  `H*0.08 + popLift*H*0.6` out from the print (pressed flat at the start of the pop, then springs up).
- On the palm: the hand centre from MediaPipe is mapped to the screen (camera feed drawn "cover"), its distance comes
  from the palm's width in the video (a palm is about 75 mm wide), and Spark is 75 mm tall there, facing the phone.
  An open palm held still for 700 ms after the pop moves Spark on; no hand for 700 ms moves it back. Spark only
  shows while the print is tracked now, or while it is on a hand seen in the last 700 ms.
- **Drawn hands are ignored**: see "Real hand or the artwork?" above.

## Test hooks (`?test`)
- `__wtp.fakeHand(cx, cy, palmPx, open = true)`: feeds `senses.hand` every frame (cx, cy in 0..1 of the video frame,
  palmPx in video pixels). `fakeHand(cx, cy, palmPx, { gesture: 'Thumb_Up', score: 0.9, open: false })` also sets
  the gesture; `open` defaults to true for no gesture or `Open_Palm`, false otherwise; `score` defaults to 0.9.
  `fakeHand(null)` stops.
- `__wtp.handInfo`: the last sample's verdict (`cls`: real / art / unknown), screen point, `onScreen`, `inQuad`,
  `depthRatio` (hand distance / print distance), the print's outline on screen, the current gesture and hold.
- `__wtp.lose()`: the same path as an engine `imagelost` event (the engine's next update finds the print again).
- `__wtp.senses.setPaused(true)` stops the hand model (it is slow in the simulator);
  `__wtp.senses.analyse(imageOrCanvas)` runs the hand model once on a picture as if it were the camera frame.

## Test log
`wtp` block: `senses` (status incl. `handModel`: gesture / landmarker, `handDelegate`, `handForced`), `hand` (model Hz,
ms per run, runs, `handErrors`: failed calls), `handDelegate` (GPU / CPU now), `handCanary` (one entry per model tried:
`{ model, delegate, ok, hands, gesture, score, ms, error? }`), `handSwitched` (the watchdog moved GPU -> CPU), `perch`
(times Spark landed on a palm), tool call counts, voice state changes with reasons, visits, last look, and the hand
counters: `handSeen` (samples with a hand; a fake hand gives one per frame), `handOpen`, `handAccepted` (real),
`handRejected` (read as the artwork), `handNoPrint` (no print pose to judge by), `handOverPrint` (centre inside the
print's outline), `depthOverPrint` ([min, max] of hand distance / print distance over the print), `perchTooFar`
(real, on screen, but not near enough to perch), `palmPxMin` / `palmPxMax`, `gestures` (samples per gesture name, any
score), `fired` (actions fired by gestures), `lostWithHand` (print losses, from `imagelost` or the stale check, while
a real hand was in view; `targets.*.lost` counts `imagelost` events only).

## Caveat: the agent is public
The agent id is in the page with no key (see `voice.js`). It is capped on the ElevenLabs side (100 conversations a
day, 3 at once) and each visit is capped by Spark's energy. **Before any client work, switch the agent to signed URLs
from a Netlify function (key in Netlify env).**

## Tested / Not tested
### Hand canary round (2026-11-16)
Real phone, before this round (Samsung Browser 31 and Chrome 148 on Android, two sessions): the gesture model on the
**GPU delegate** loaded with no error, ran 611 / 869 times at ~23 ms and returned **no hands** (`handSeen: 0`), although
the print's drawn hands are found in most frames in the simulator. The CPU object detector found a person on the same
video. This round adds the canary, the watchdog and the CPU input (see **Hand model** above).

Tested, headless simulator only (same setup as below; note its "GPU" delegate is SwiftShader software GL, which
works, so the real phone's GPU failure could only be simulated):
- Earlier checks still pass (a-d on the static video, a + gestures on the moving print).
- Canary: GPU gesture model passes (Thumb_Up 0.74). `?hand=cpu` uses CPU only and passes (Thumb_Up 0.74). With a
  test hook making canaries fail, the next candidate is used and every attempt is in `handCanary`; all four failing
  gives `hands: 'failed'`. `?hand=gpu` keeps GPU even when its canary fails.
- Watchdog (test hook: threshold 10 runs, every run counted as handless): exactly one switch to CPU,
  `handSwitched: true`, and the CPU model then found the print's drawn hands (handSeen 4 -> 40). `?hand=gpu` never
  switches. No timestamp / run errors, no console errors.
- CPU timing (isolated calls, 960x720 video): ~75 ms with palm detection at either size, tracking ~45 ms full size
  vs ~35 ms at 384 px. So the downscale saves little in the model itself (MediaPipe resizes to fixed tensor sizes);
  inside the sim's render loop each call took ~300 ms because the page competes for the same CPU.

Not tested (needs the real phone):
- Whether the canary catches this phone's GPU failure. The canary feeds a still photo (an `<img>`), the camera feeds a
  `<video>`; if the phone's GPU path breaks only on video frames the canary passes and the watchdog has to catch it
  (~12 s with no hand). Compare `?hand=gpu` and `?hand=cpu` on the phone and read `wtp.handCanary`, `handSwitched`,
  `handSeen` and `hand.handMsAvg`.
- CPU speed on the phone with the 384 px input, and the frame rate (`fpsAvg`) with it running.

### Gestures round (2026-11-16), headless simulator only
Same simulator (Chromium + SwiftShader, 390x844, fake camera from y4m videos of the print: a static one and a moving
and rotating one). The hand model ran at ~0.5 s a call there (GPU delegate on SwiftShader software GL), so the
fake-hand checks pause it.

Tested:
- The gesture model (`gesture_recognizer.task`, HTTP 200) loads through the proxy and runs on the print video with no
  console errors. With the model blocked, the Hand Landmarker fallback loads and the perch still works.
- The drawn hands on the Sukeban art, 10 s of the real model on the moving print: every hand sample was read as
  artwork (inside the outline, 1.6-3.6 x the print's distance). No gesture name was reported, nothing fired, no perch.
- Real photos from MediaPipe's sample assets through the real model on the page: thumb_up.jpg -> Thumb_Up 0.70,
  thumbs_up.jpg -> Thumb_Up 0.73, victory.jpg -> Victory 0.78, pointing_up.jpg -> Pointing_Up 0.85. Fed as frames
  through the whole page, the thumbs-up photo fired `confetti` and showed the "Thumbs up" chip.
- Fake hands (`fakeHand` with a gesture) beside the print: each of the six gestures fired its action exactly once
  with the right chip. Score 0.5 and a 200 ms flash did not fire. A 6.5 s hold fired once. The second gesture waited
  for the 2.5 s cooldown, and a gesture shown during an action waited for it to end. A wave fired `wave` and did not
  perch. A still open palm perched ("Open hand" chip). A still palm off the screen crop did not perch. Going from
  beside to over the art mid-hold fired nothing. A hand over the print but clearly nearer fired. Chips appear and go
  away. Spark looks left / right / up toward the hand and back at the phone after it leaves. A print loss with a hand
  in view counts in `lostWithHand` and does not replay the climb-out. The gesture hint shows once, 6 s after the pop.
  Chips sit under a two-line caption and the hint sits above the buttons at 390x844.
- Earlier checks still pass (found, pop, tools, memory, perch placement and size, look). The perch timeout in the
  test was raised for the 700 ms hold.

Not tested (needs a real phone):
- A real hand in front of a real back camera: gesture scores in real light, at arm's length beside the print, side
  on, with motion blur; whether 0.6 / 0.4 s feel right; the wave thresholds with a real wave at ~10 Hz.
- Whether the ART_NEAR (0.8) and PERCH_NEAR (0.92) depth rules hold for real hands and real palm sizes. Check
  `wtp.depthOverPrint`, `handRejected` vs `handAccepted` and `perchTooFar` in the phone log.
- Gesture model speed on phones (MediaPipe logs that the gesture classifier runs on CPU / XNNPACK even with the GPU
  delegate). Check `wtp.hand.handMsAvg`. (Later on a real Samsung phone: GPU ran at ~23 ms but found no hands, see
  the hand canary round.)
- How often a hand beside the print still makes tracking drop (`lostWithHand`), and how the chips and the hint read
  on a real screen, in landscape and with reduced motion.

### First round (2026-11-15)
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
- Palm perch with `__wtp.fakeHand(0.5, 0.6, 180)` (then a 350 ms hold): perch reaches 1, Spark lands exactly over the hand's screen point
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
  software GL) inside the render loop, and everything slowed (the 0.8 s hop took ~4 s). (Correction: the simulator
  runs the GPU delegate on SwiftShader software GL, not the CPU delegate. On a real Samsung phone the GPU delegate was
  fast but returned no hands; see the hand canary round.) Check `fpsAvg` and `wtp.hand.handMsAvg` in the phone log.
- Landscape layout, reduced motion, photo save/share, storage blocked (private mode).
