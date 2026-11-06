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

1. **One placement for everything.** Pick the hideout before the scene is
   placed and the game shows Place; the room opens once you tap it. Placed
   already (lounge, after a round)? The room stands on the spot where Bobo was
   placed, on the same floor.
2. **First time:** an unlock form asks for the code on the fan's merch card
   (BOBO-XXXX-XXXX) and their email. The first email to use a code owns it for
   good; after that, code + email is their sign-in on any device. Scanning a
   product's QR (`…?hub=BOBO-XXXX-XXXX`) opens the form with the code filled in.
3. **The code goes in, the room builds.** No portal: a glowing wireframe races
   out from Bobo, past the viewer, then the room materialises floor to ceiling
   (about 6 s; Skip is bottom centre). Bobo plays **Build Timeline** (his
   excited animation) as it starts and **Room Timeline** once it's done.
4. **Built around the viewer.** With **Room Fit = Around Viewer** (default) the
   room slides toward the person holding the phone and grows (up to **Max Room
   Scale**) until they're standing inside it, Bobo in the back half by his
   things, the open side of the can behind the viewer. It's never smaller than
   **Room Scale** (1.3 Bobo-sized rooms). The room's open side always faces the
   camera, and it stays centred on the line from the camera to Bobo, which is
   the middle of the screen at placement.
5. **One Bobo.** The game's own Bobo is Bobo in the room; the room's model Bobo
   is never shown. The joystick walks him around his room, and **Keep Bobo
   Inside** stops him at the wall.
6. In the room: coloured hotspot dots mark what you can tap (Cola blue = apps,
   Cola red = play, EVADE yellow = collection, indigo = Bobo), and a short
   welcome tour runs on the first visit (replay it from **Room items**). The
   computer (up on the loft) opens **BOBO OS** as a window over the room (80% of
   the screen by default, slightly see-through; tap the room around it to close
   it), with Alerts, Where's Bobo? (the globe), Leaderboard, Cola Run, Digital
   Collection (the EVADE vault), Shop and Me.
7. **Moving the room:** the game's **Reset placement** button stays in the
   room, and you stay in the hideout. The room turns into a faint outline that
   travels with the reticle and Bobo; tap **Place** and it builds back in (twice
   as fast) on Bobo's new spot. Placing the scene bigger or smaller resizes it.
8. **Leaving:** the game menu's **Start Cola Run** or **Lounge with Bobo Cat**
   (the room folds back into Bobo in about a second), the top bar's exit button
   (a slower fold, then the lounge), or **Cola Run → Play / Record a run** on
   the computer.
9. Alerts the team sends from **Admin → Collector Hub** reach every open room
   within ~15 s: a pop-up on the in-room monitor and a hologram that beams out
   of the screen.

| File | What it is |
| --- | --- |
| `CollectorHubMode.ts` | The Mattercraft component (icon, room placement on Bobo's anchor, game hookup, Bobo's timelines). |
| `HubCore.ts` | The hub itself: room, build-in, unlock form, BOBO OS, alerts, collection. No Mattercraft imports. |
| `OrbHuntGame.ts` | The game, which owns the hideout mode (intro button, menu row, placement, HUD) and `playCharacterClip()`. |

`HubCore.ts` runs in both labs: `/labs/collector-hub/` on its own (compiled to
`hub-core.js` by `node scripts/build-hub-core.mjs`; that lab keeps the portal
and the room's own Bobo), and `/evade/cola-run-lab/`, which runs the real
`OrbHuntGame.ts` **and** the real `CollectorHubMode.ts` together through the lab
shim (`node scripts/build-cola-capture.mjs`). **Add `?place=1` to the Cola Run
lab to test it the way AR works:** you are the phone (drag to look around,
scroll or pinch to step forward and back), the scene follows a reticle in the
middle of the screen until you tap Place, like Mattercraft's Instant World
Tracker, and Reset placement puts it back on the reticle. The Lab panel has the
BOBO OS and room-size settings and the scene size for the next Place.

## How it stays put in AR

Mattercraft's **Instant World Tracker** rewrites its own transform every frame
from the tracking anchor (and follows the reticle while its Placement Mode is
on). Anything that should stay on the floor has to be **inside** it. When the
room opens, CollectorHubMode moves the room into **Bobo's parent**, the same
space the game's player walks in, so it rides the same anchor as Bobo. It
doesn't matter where the CollectorHubMode node itself sits in the Hierarchy.
The game's Place / Reset placement timelines should switch the tracker's
**Placement Mode** off and on, as they do now.

Bobo is moved through his component's **position** property (when he's kept
inside the room or brought back to his spot), because the EVADE joystick
behaviour integrates `position.value` each frame and would undo a write to the
three.js object alone.

The first open never stalls: the room model loads and its shaders compile
(`renderer.compileAsync`) and textures upload (one per frame) about 1.5 s after
the scene starts, while nobody is waiting on it.

## Add it to the project

1. Copy `OrbHuntGame.ts`, `CollectorHubMode.ts` and `HubCore.ts` over the
   copies in the Scripts folder (and `ColaRunRecorder.ts`, which has
   `startRecording()` for "Record a run").
2. Hierarchy → **+** → **CollectorHubMode** (anywhere; next to the game is
   tidiest).
3. Leave **Game** and **Player Node** empty: it finds OrbHuntGame and uses the
   game's own player. (If the console says it couldn't find the game, pick it
   in **Game**.)
4. Optional: **Room → Build Timeline** = Bobo's excited animation, **Room
   Timeline** = a settle (purr). Set the game's **Lounge Character** so they
   blend cleanly with the joystick, as the lounge buttons do.
5. For a test build, tick **Site → Show Test Code** to print `BOBO-TEST-CATS`
   under the form (it only works where the site allows it, see below).

### Properties worth knowing

| Group | Property | Default | What it does |
| --- | --- | --- | --- |
| Game | Show In Menus | on | "Visit Bobo's Hideout" on the opening card and in the menu (sets the game's **Bobo's Hideout → Hideout Enabled**). |
| Game | Show Button | on | The small round icon between rounds. |
| Game | Hide Game Ui | off | Hide the game's menu, sound and Reset placement buttons in the room. Leave off so placement and mode switching work in the room. |
| Room | Room Fit | Around Viewer | Around Viewer: the room grows and slides until the viewer stands inside it. Match Bobo: sized to Bobo only. |
| Room | Room Scale | 1.3 | Smallest room size, in Bobo-sized rooms (1 = the room's own Bobo would be as tall as yours). Follows the placed scene's scale. |
| Room | Max Room Scale | 3 | With Around Viewer, the most it may grow. Someone standing further back just walks in. |
| Room | Keep Bobo Inside | on | The joystick stops Bobo at the wall. |
| Room | Build Timeline / Room Timeline | none | Bobo's animations as the room starts building / once it's done. |
| BOBO OS | OS Size | 0.8 | Share of the screen the computer takes (0.5 to 1; 1 = full screen). |
| BOBO OS | OS Opacity | 0.88 | How solid the computer is (1 = fully solid; lower shows more of the room through it). |
| BOBO OS | OS Dim | 0.18 | How much the room around the computer is darkened. |

On the game (**Bobo's Hideout** group): **Hideout Button Label** ("Visit
Bobo's Hideout") and **Hideout Accent** (EVADE yellow: the menu and buttons turn
yellow in the room, as they turn pink in the lounge). Game events:
`onHideoutEnter`, `onHideoutExit`; methods `enterHideout()`, `exitHideout()`,
`isInHideout`, `playCharacterClip(id)`.

The hideout's top bar keeps clear of the game's menu button (whichever top
corner it's in), and sits under the game's dialogs, so the game menu opens over
the room. The record button steps aside in the room (BOBO OS has its own
Record a run) and comes back when you leave or move the room.

Events: `onEnter` (the room started building), `onRoomReady`, `onRoomMoving`
(Reset placement in the room), `onLeave`, `onUnlocked` ({ firstClaim, owned }),
`onAlert` ({ title }). Methods: `open()`, `leave()`.

**Verified:** type-checks against `@zcomponent/three@1.38.2` / three 0.164
(and `@zcomponent/zappar-three@4.3.4` was read for how the Instant World Tracker
places its anchor); the real game and the real hideout component run together
in the Cola Run lab's AR-style camera, tested headlessly end to end on desktop
and phone sizes (intro → hideout, Place on the reticle, unlock, build around
the viewer, one Bobo walking in the room and stopped at the wall, Reset
placement → outline follows the reticle → Place → quick rebuild, BOBO OS,
switching to the lounge). **Not yet opened in the Mattercraft editor.** If a
property doesn't show in the panel, swap `@zui` for `@zprop`; if the room
doesn't load on the published experience, check the browser console for a CORS
error on `room.glb`.

## Site settings (Netlify)

| Variable | What it does |
| --- | --- |
| `COLLECTOR_CODE_SECRET` | 24+ random characters. Makes the codes; required on medialife.ai before printing any. Never change it after codes are printed. |
| `COLLECTOR_TEST_CODE` | `on` lets `BOBO-TEST-CATS` work on medialife.ai (it always works on previews and dev; `off` disables it everywhere). |
| `HUB_SESSION_SECRET` | Signs fans' room keys (shared with the Creator Hub). |
| `RESEND_API_KEY` | Sends the "your key" email on first unlock. Without it the unlock still works, the email is skipped. |
