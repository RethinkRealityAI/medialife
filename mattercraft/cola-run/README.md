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

The MEDIALIFE Collector Hub as the third Cola Run mode, next to the round and
the lounge. It's in the game's own menus: **Visit Bobo's Hideout** sits under
Start playing and Lounge with Bobo Cat on the opening card, and in the game
menu next to the other mode rows. A small round icon (bottom left, over the
sound button) opens it between rounds too; its label slides out the first time
it appears and on hover.

1. **Placement first, same as the other modes.** Pick the hideout before the
   scene is placed and the game shows Place; the room opens once you tap it.
2. **First time:** an unlock form asks for the code on the fan's merch card
   (BOBO-XXXX-XXXX) and their email. The first email to use a code owns it for
   good; after that, code + email is their sign-in on any device. Scanning a
   product's QR (`…?hub=BOBO-XXXX-XXXX`) opens the form with the code filled in.
3. A portal opens a few steps ahead of Bobo. **Walk Bobo into it** and his room
   builds in around him (wireframe first, then the surfaces).
4. In the room: coloured hotspot dots mark what you can tap (Cola blue = apps,
   Cola red = play, EVADE yellow = collection, indigo = Bobo), and a short
   welcome tour runs on the first visit (replay it from **Room items**). The
   computer opens **BOBO OS** as a window over the room (80% of the screen by
   default, slightly see-through; tap the room around it to close it), with
   Alerts, Where's Bobo? (the globe), Leaderboard, Cola Run, Digital
   Collection (the EVADE vault), Shop and Me.
5. **Moving the room:** the game's **Reset placement** button stays in the
   room. Tap it and the room disappears at once; Place again (bigger, smaller,
   somewhere else) and the room builds straight back in at the new spot and
   size, no second walk through the portal.
6. **Leaving:** the game menu's **Start Cola Run** or **Lounge with Bobo Cat**
   (the room folds away and Bobo is back at once), the top bar's exit button
   (Bobo walks out, then the lounge), or **Cola Run → Play / Record a run** on
   the computer.
7. Alerts the team sends from **Admin → Collector Hub** reach every open room
   within ~15 s: a pop-up on the in-room monitor and a hologram that beams out
   of the screen.

| File | What it is |
| --- | --- |
| `CollectorHubMode.ts` | The Mattercraft component (icon, portal, player, placement, game hookup). |
| `HubCore.ts` | The hub itself: room, build-in, unlock form, BOBO OS, alerts, collection. No Mattercraft imports. |
| `OrbHuntGame.ts` | The game, which now owns the hideout mode (intro button, menu row, placement, HUD). |

`HubCore.ts` runs in both labs: `/labs/collector-hub/` on its own (compiled to
`hub-core.js` by `node scripts/build-hub-core.mjs`), and
`/evade/cola-run-lab/`, which now runs the real `OrbHuntGame.ts` **and** the
real `CollectorHubMode.ts` together through the lab shim
(`node scripts/build-cola-capture.mjs`). Add `?place=1` to the Cola Run lab for
the Place / Reset placement flow; its Lab panel has the BOBO OS settings and the
scene size for the next Place.

## Add it to the project

1. Copy `OrbHuntGame.ts`, `CollectorHubMode.ts` and `HubCore.ts` over the
   copies in the Scripts folder (and `ColaRunRecorder.ts`, which has
   `startRecording()` for "Record a run").
2. Hierarchy → **+** → **CollectorHubMode**, as a sibling of the game (same
   parent, so it follows the game's placement).
3. Leave **Game** and **Player Node** empty: it finds OrbHuntGame and uses the
   game's own player. (If the console says it couldn't find the game, pick it
   in **Game**.)
4. For a test build, tick **Site → Show Test Code** to print `BOBO-TEST-CATS`
   under the form (it only works where the site allows it, see below).

### Properties worth knowing

| Group | Property | Default | What it does |
| --- | --- | --- | --- |
| Game | Show In Menus | on | "Visit Bobo's Hideout" on the opening card and in the menu (sets the game's **Bobo's Hideout → Hideout Enabled**). |
| Game | Show Button | on | The small round icon between rounds. |
| Game | Hide Game Ui | off | Hide the game's menu, sound and Reset placement buttons in the room. Leave off so placement and mode switching work in the room. |
| Room | Room Scale / Portal Distance / Enter Radius | 1 / 3 / 0.7 | Size of the room relative to your Bobo, how far ahead the portal opens, how close he has to get. The room follows the placed scene's scale. |
| BOBO OS | OS Size | 0.8 | Share of the screen the computer takes (0.5 to 1; 1 = full screen). |
| BOBO OS | OS Opacity | 0.88 | How solid the computer is (1 = fully solid; lower shows more of the room through it). |
| BOBO OS | OS Dim | 0.18 | How much the room around the computer is darkened. |

On the game (**Bobo's Hideout** group): **Hideout Button Label** ("Visit
Bobo's Hideout") and **Hideout Accent** (EVADE yellow: the menu and buttons turn
yellow in the room, as they turn pink in the lounge). Game events:
`onHideoutEnter`, `onHideoutExit`; methods `enterHideout()`, `exitHideout()`,
`isInHideout`.

The hideout's top bar keeps clear of the game's menu button (whichever top
corner it's in), and sits under the game's dialogs, so the game menu opens over
the room. Skip (during the build-in) is bottom centre, clear of Reset placement.

The component never moves the camera (the welcome tour's cards still work; the
labs fly their own camera to each stop). While Bobo is in his room the player is
hidden and held at the portal (so the joystick can't wander off), and the
record button is hidden; both come back when he leaves.

Events: `onPortal`, `onEnter`, `onRoomReady`, `onLeave`, `onUnlocked`
({ firstClaim, owned }), `onAlert` ({ title }). Methods: `open()`, `leave()`.

**Verified:** type-checks against `@zcomponent/three@1.38.2` / three 0.164;
the real game and the real hideout component run together in the Cola Run lab,
tested headlessly end to end on desktop and phone sizes (intro → hideout,
unlock, portal walk-in, BOBO OS window, game menu in the room, Reset placement
→ Place bigger → room rebuilds, switching to the lounge and to a round).
**Not yet opened in the Mattercraft editor.** If a property doesn't show in the
panel, swap `@zui` for `@zprop`; if the room doesn't load on the published
experience, check the browser console for a CORS error on `room.glb`.

## Site settings (Netlify)

| Variable | What it does |
| --- | --- |
| `COLLECTOR_CODE_SECRET` | 24+ random characters. Makes the codes; required on medialife.ai before printing any. Never change it after codes are printed. |
| `COLLECTOR_TEST_CODE` | `on` lets `BOBO-TEST-CATS` work on medialife.ai (it always works on previews and dev; `off` disables it everywhere). |
| `HUB_SESSION_SECRET` | Signs fans' room keys (shared with the Creator Hub). |
| `RESEND_API_KEY` | Sends the "your key" email on first unlock. Without it the unlock still works, the email is skipped. |
