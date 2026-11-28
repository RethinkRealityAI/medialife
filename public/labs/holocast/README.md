# MEDIALIFE Holocast

`/labs/holocast/` (AR) + `/labs/holocast/control/` (control room). A world-tracked holo projector on your floor or
table whose floating screens show live data sent from any phone or laptop. Purely MEDIALIFE (not EVADE), built to
answer: how do we transmit data live from different sources straight into an AR experience?

## What's in the hologram
| Screen | Source | Interaction in AR |
|---|---|---|
| Notice board | typed in the control room (pin one big) | the newest types itself in; tap to pull closer |
| Live sketch | drawn in the control room, any number of devices at once | strokes stream in while drawn |
| Where is Bobo? | the live globe feed `/api/bobo/feed.json` | drag to spin, tap a pin to play that clip beside it |
| Photo drop | the control room's camera roll (resized in the browser, last 6 kept) | tap it (pulled closer) for the next one |
| Live poll | question + 2-4 answers from the control room | 3D bars grow with the votes; tap a bar to vote (one per phone, can change) |
| Captions | the control room's mic (the browser's own speech-to-text) | types across a ribbon as they speak |
| Ticker ring | recent MEDIALIFE platform events (same feed) | runs round the projector |
| Live video | the control room's camera (Go live tab), with sound | every other screen folds away; one big rectangular holo screen (scanlines, flicker, theme tint, light cone from the lens) shows the feed; tap it for sound |
| Reactions | tapped on the right edge of any phone watching | float up out of the projector everywhere + show in the control room |

Delivery: every update rides up the beam as a packet of light and the screen flickers in. Swipe a notice or photo
up in the control room ("fling") and it shoots out of the projector, arcs and slams into its screen. The control
room can also change the hologram's colour and fire a beam pulse on every phone watching.

## Rooms and links
- A room is made when someone first taps Start on the AR page (or "Start a new Holocast" in the control room). It has
  a 6-letter code and a secret write key.
- Watch link `/labs/holocast/?room=CODE`: any phone sees the same hologram. Control link
  `/labs/holocast/control/?room=CODE#k=KEY`: can change it. The key never goes in the address bar after load
  (it's kept in localStorage per device).
- In AR, Invite (bottom left) opens a sheet with a QR on the phone's screen (Watch or Control) for a friend standing
  next to you, plus Share link. Never a QR inside the hologram (Dapo, 2026-11-18: a friend can't scan it through
  your phone).
- Control room > Hologram > What viewers see switches screens off for everyone (op `hide`: notice, globe, sketch,
  photo, poll, caption, ticker, reacts).
- Everything persists in the room (Netlify Blobs). Options > Start a fresh room makes a new one.

## Data layer
`src/lib/holocast/server.ts`, routes `src/routes/api.holocast.*`. One JSON record per room in the store
`holocast-<ns>` (prod / preview / dev by host), etag-checked writes so two people drawing at once don't lose
strokes; photos as bytes beside it. Clients (`room.js`) poll: 450 ms for a few seconds after anything changes,
1.2 s when quiet, paused in hidden tabs. `?r=<rev>` returns `{same:true}` when nothing changed, `?s=<sketch rev>`
returns only the strokes that changed. Updates land in about a second.

Next step if it needs to feel instant (and to cut function calls at scale): lay a Supabase Realtime broadcast
channel over the same record (Spray Studio already has the client code; `SPRAY_SUPABASE_URL/KEY` are not set on
the live site yet). Keep the stored record as the source of truth.

Limits: notices 160 chars (24 kept, pinned one never dropped), 500 strokes / 40k points, 6 photos at <= 900 KB,
polls 2-4 answers (5000 voters), captions 220 chars.

## Live video
`live.js`. Go live in the control room starts the camera (and mic), sets `room.live` (op `live`), and the control
room becomes a WebRTC hub: one peer connection per phone watching. Signalling is `/api/holocast/<CODE>/rtc`
(polled, no trickle ICE: join -> offer -> answer, ~5-9 s to tune in). The feed stays live while the control room's
presence ping carries its id (beat); phones drop it after 25 s without one, and closing the tab ends it at once
(sendBeacon). Phones that can't connect directly (strict mobile NAT, no TURN) ask for the relay: the control room
posts a 480 px JPEG ~2x a second to `/api/holocast/<CODE>/frame` and they show that, without sound.
**TURN:** set `HOLOCAST_ICE_SERVERS` (JSON RTCIceServer[]) or Cloudflare TURN keys `HOLOCAST_CF_TURN_KEY_ID` +
`HOLOCAST_CF_TURN_TOKEN` on the site and every phone gets the real stream. Cloudflare TURN is set on medialife-ai
(key "medialife-holocast", 2026-11-28; token is secret, production + deploy previews). `?nop2p` forces the TURN path. `?relay` on the AR page forces the relay
(testing).

## Mic and camera permissions
The site's `Permissions-Policy` (netlify.toml + src/server.ts, keep in sync) must allow `microphone=(self)` or the
browser never shows the mic prompt (it was `microphone=()` until 2026-11-18). The control room asks with
getUserMedia before starting speech-to-text so the prompt shows reliably, and explains each error.

## World tracking
`@8thwall/engine-binary@1.0.0` (Niantic Spatial licence, unmodified from jsDelivr, credited under Options >
Licences), responsive scale, floor = ray to y = 0 (Bobo Hoops / Spray Bobo Street set-up). Pinch while placing, or any
time after, sizes the whole rig (0.3x-2.4x, default 0.8, so up to 3x the default: screens at ~0.7-1.3 m on the floor; shrink for a desk). Move (bottom
right) is always on screen once placed and keeps every screen's content. Tapping a screen pulls it in front of the
camera at a distance where it fills ~80% of the view (world space, not screen-locked); tap again sends it back.

## Switches
`?room=CODE`, `?test` (`window.__hc`: `floorAt(dz)`, `place()`, `move()`, `focus(name)`, `vote(i)`, `react(e)`,
`openPlace(key)`, `pulseBeam()`, `live()`), `?diag`, `?nolog`, `?desktop`, `?dpr=2`, `?verbose`. Test logs go to
`/api/ar/kc-diag` (`page: 'holocast'`) on previews.

## Tested
Headless Chromium with a fake 4:3 floor camera and faked motion sensors: tracking NORMAL, placement, power-up, and
a driver script posting to the API while the page ran: a flung pinned notice, two streamed strokes, a photo, a poll
with votes (3D bars), captions (interim then final), a second notice, reactions, a theme change. Focus, globe pin
-> clip, vote from AR, Move all checked. Control room checked at 390 and 1280 px (notice, fling card, drawing pad
streaming, poll results, voice card). **Not yet on a real phone.** Speech-to-text needs Chrome, Edge or Safari.
