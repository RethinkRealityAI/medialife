# Cola Run recorder (Mattercraft)

A record button for the Cola Run AR game. Players tap it, play, tap again (or
hit the time limit), watch the clip back, then **Send to Where is Bobo?** (one
tap, straight into the Media Library's review queue) or **Save** it to their
phone.

| File | What it is |
| --- | --- |
| `ColaRunRecorder.ts` | The Mattercraft component (property panel, game hookup). |
| `CaptureCore.ts` | The recorder, review sheet and uploader. No Mattercraft imports. |
| `OrbHuntGame.ts` | The Cola Run game itself (a copy of the Mattercraft project's file, kept here so the lab runs the real thing). |

Both go into the Mattercraft project's Scripts folder. `CaptureCore.ts` is also
what the browser test lab runs: `/evade/cola-run-lab/` loads
`capture-core.js`, generated from it with `node scripts/build-cola-capture.mjs`
(add `--check` to confirm the lab copies match).

The lab also runs the real game: the same script bundles `OrbHuntGame.ts` into
`orb-hunt-game.js`, with `mattercraft/lab-shim/zcomponent.ts` standing in for
the `@zcomponent/*` packages. So when the game changes in Mattercraft, copy the
new `OrbHuntGame.ts` over this one and rebuild; the lab's menu, intro, HUD,
lounge bar and modals then match what players see.

## Add it to the project

1. Copy both `.ts` files next to `OrbHuntGame.ts`.
2. Hierarchy → **+** → **ColaRunRecorder**, anywhere under the scene root.
3. Optional: set **Recording → Game** to the OrbHuntGame node (it finds the
   game on its own when left empty). The score and "Run complete!" are drawn on
   the video from the game's events.
4. Publish, then have the experience's origin (for example
   `https://<id>.zappar.io`, or the custom domain) added to `BOBO_INGEST_ORIGINS`
   on Netlify. Until then the server refuses its uploads (Save still works).

To test against a deploy preview, set **Sending → Endpoint** to the preview URL
and add the experience's origin to that preview's `BOBO_INGEST_ORIGINS`.

## What gets recorded

The WebGL canvas (camera image plus the 3D scene) with a small branded badge
and the score, plus the game's music and effects (every Mattercraft audio
layer). The microphone is never used. The game's HTML HUD is not part of the
canvas, which is why the score is redrawn onto the video.

Clips are up to 30 s by default (5 to 60), at most 1280 px on the long side and
~4 Mbps, so a 30 s clip is roughly 15 MB. MP4 where the browser can make it
(Safari, recent Chrome), WebM otherwise.

**WebXR:** inside an immersive-ar session (Android Chrome after placement) the
camera image never reaches the page, so a recording would show the 3D scene on
black. The button hides itself while a session runs (**Hide In WebXR**).

## Events

Recording works in rounds and in lounge mode (the video gets a "Lounging with Bobo" badge there instead of the score; **Lounge Badge** changes it).

`onRecordStart`, `onRecordStop` ({ seconds }), `onReviewOpen` (pause the round
here if you want), `onReviewClose`, `onSent` ({ id, globeUrl }), `onSaved`.

## Where clips go

`POST /api/media/uploads` as a *web capture* (see
`src/lib/bobo/captures.server.ts`): private, tagged *AR capture*, *Needs
review*, *Web capture*, in the *Where is Bobo · AR captures* collection, with the
player's city from their IP. A one-time key returned at the start of each
upload is required for its chunks, so nobody else can write into it. The team
reviews it in `/admin/media` (**Approve for the globe** in the clip's drawer).

Meanwhile the globe shows an **In review** pin at the city, with a beam-in
animation on every open globe. After sending, the sheet's **See it on the
globe** button opens `globeUrl?clip=<id>#k=<viewKey>`: the globe flies to the
pin and plays the player's own clip for them (nobody else can watch it until
it's approved).

---

# Bobo's Hideout (Collector Hub mode)

The MEDIALIFE Collector Hub as a Cola Run mode. A **Bobo's Hideout** button
sits bottom left (in lounge mode and on menu screens, never mid-round). Tap it:

1. **First time:** an unlock form asks for the code on the fan's merch card
   (BOBO-XXXX-XXXX) and their email. The first email to use a code owns it for
   good; after that, code + email is their sign-in on any device. Scanning a
   product's QR (`…?hub=BOBO-XXXX-XXXX`) opens the form with the code filled in.
2. A portal opens a few steps ahead of Bobo. **Walk Bobo into it** and his room
   builds in around him (wireframe first, then the surfaces).
3. In the room: tap anything. The computer boots **BOBO OS**, a desktop with app
   windows: Alerts, Where's Bobo? (the globe), Leaderboard, Cola Run, Collection,
   Shop, Me. The collection wall shows the keychain plus holographic slots for
   the hoodie, tee, desk mat and a mystery drop.
4. Alerts the team sends from **Admin → Collector Hub** reach every open room
   within ~15 s: a pop-up on the in-room monitor and a hologram that beams out
   of the screen.
5. **Cola Run → Play / Record a run** folds the room back into the portal, Bobo
   walks out, and a round starts (recording too, if asked).

| File | What it is |
| --- | --- |
| `CollectorHubMode.ts` | The Mattercraft component (button, portal, player, game hookup). |
| `HubCore.ts` | The hub itself: room, build-in, unlock form, BOBO OS, alerts, collection. No Mattercraft imports. |

`HubCore.ts` is also what the labs run (`/labs/collector-hub/` on its own,
and the **Bobo's Hideout** button in `/evade/cola-run-lab/`), compiled to
`/labs/collector-hub/hub-core.js` by `node scripts/build-hub-core.mjs`
(`--check` confirms the copy matches).

## Add it to the project

1. Copy `CollectorHubMode.ts` and `HubCore.ts` next to `OrbHuntGame.ts`
   (update `ColaRunRecorder.ts` too: it gained `startRecording()`, used by
   "Record a run").
2. Hierarchy → **+** → **CollectorHubMode**, as a sibling of the game (same
   parent, so it follows the game's placement).
3. Leave **Game** and **Player Node** empty: it finds OrbHuntGame and uses the
   game's own player.
4. For a test build, tick **Site → Show Test Code** to print `BOBO-TEST-CATS`
   under the form (it only works where the site allows it, see below).

The component never moves the camera. While Bobo is in his room the player is
hidden and held at the portal (so the joystick can't wander off), and the
game's HUD and the record button are hidden; both come back when he leaves.
**Room → Room Size**, **Portal Distance** and **Enter Radius** are the knobs if
the room is too big for a table-top AR scene.

Events: `onPortal`, `onEnter`, `onRoomReady`, `onLeave`, `onUnlocked`
({ firstClaim, owned }), `onAlert` ({ title }). Methods: `open()`, `leave()`.

**Verified:** type-checks against `@zcomponent/three@1.38.2` / three 0.164;
the same core runs in both labs, tested headlessly end to end (unlock, wrong
codes, portal walk-in, OS apps, live alert from the admin page, back to a
round, phone size). **Not yet opened in the Mattercraft editor.** If a property
doesn't show in the panel, swap `@zui` for `@zprop`; if the room doesn't load
on the published experience, check the browser console for a CORS error on
`room.glb`.

## Site settings (Netlify)

| Variable | What it does |
| --- | --- |
| `COLLECTOR_CODE_SECRET` | 24+ random characters. Makes the codes; required on medialife.ai before printing any. Never change it after codes are printed. |
| `COLLECTOR_TEST_CODE` | `on` lets `BOBO-TEST-CATS` work on medialife.ai (it always works on previews and dev; `off` disables it everywhere). |
| `HUB_SESSION_SECRET` | Signs fans' room keys (shared with the Creator Hub). |
| `RESEND_API_KEY` | Sends the "your key" email on first unlock. Without it the unlock still works, the email is skipped. |
