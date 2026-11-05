# Cola Run recorder (Mattercraft)

A record button for the Cola Run AR game. Players tap it, play, tap again (or
hit the time limit), watch the clip back, then **Send to Where is Bobo?** (one
tap, straight into the Media Library's review queue) or **Save** it to their
phone.

| File | What it is |
| --- | --- |
| `ColaRunRecorder.ts` | The Mattercraft component (property panel, game hookup). |
| `CaptureCore.ts` | The recorder, review sheet and uploader. No Mattercraft imports. |

Both go into the Mattercraft project's Scripts folder. `CaptureCore.ts` is also
what the browser test lab runs: `/evade/cola-run-lab/` loads
`capture-core.js`, generated from it with `node scripts/build-cola-capture.mjs`
(add `--check` to confirm the lab copy matches).

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

`onRecordStart`, `onRecordStop` ({ seconds }), `onReviewOpen` (pause the round
here if you want), `onReviewClose`, `onSent` ({ id }), `onSaved`.

## Where clips go

`POST /api/media/uploads` as a *web capture* (see
`src/lib/bobo/captures.server.ts`): private, tagged *AR capture*, *Needs
review*, *Web capture*, in the *Where is Bobo · AR captures* collection, with the
player's city from their IP. A one-time key returned at the start of each
upload is required for its chunks, so nobody else can write into it. The team
reviews it in `/admin/media` and switches **Public** on to put it on the globe.
