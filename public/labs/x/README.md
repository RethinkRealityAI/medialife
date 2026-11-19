# MEDIALIFE AR Player (`/labs/x/`)

One shared runtime for image-target AR experiences. Every experience is a folder with **one JSON file** that
says everything about it; the code lives once in `player/`. Built 2026-11-18 by porting 19 legacy A-Frame +
xrextras image-target campaigns (Animebae, Netflix Sakamoto Days, Brooklyn Nets, SPORT, dentsu, Bushido, VVBG,
MEDIALIFE showcases) onto plain three.js + the open-source image tracker (MIT, vendored at
`/evade/keychain-ar/vendor/xr/`, image targets only).

```
labs/x/
  player/            player.js + player.css (runtime), target.js/.css (test pictures page),
                     page.template.html + target.template.html (copy these for a new experience)
  media/             shared videos, images and models (each file once; experiences point at /labs/x/media/...)
  <slug>/            index.html (thin), experience.json, image-targets/, target/index.html, optional hero.jpg
```

## Add a new experience

1. Make the folder `public/labs/x/<slug>/` and copy `player/page.template.html` to `<slug>/index.html` and
   `player/target.template.html` to `<slug>/target/index.html` (replace `{{TITLE}}` and `{{LEAD}}`).
2. Put each target in `<slug>/image-targets/`: `<name>.json` + `<name>_luminance.(png|jpg)` (the 480x640 grey
   picture the engine tracks) + `<name>.jpg` (the original art, for the splash and the test pictures page).
   Set `imagePath` in the JSON to the absolute path of the luminance picture (`/labs/x/<slug>/image-targets/...`).
   New targets: build them with the immersive skill's `snippets/build_target.py` from a photo of the real item.
   Max 10 targets per experience.
3. Put new media in `media/` (H.264 MP4, faststart, <= 960 px; GLB without Draco: meshopt + webp is fine).
4. Write `<slug>/experience.json`:

```jsonc
{
  "slug": "my-drop", "title": "My Drop", "client": "Animebae", "wordmark": "Animebae",   // wordmark = text, top left
  "accent": "#e8313a", "onAccent": "#ffffff", "background": "#0f1519",                  // flat colours only
  "lead": "One line under the title.", "hint": "Point your camera at the print",          // never "line up"
  "hero": "image-targets/my-print.jpg", "heroAspect": "3/4",                               // default: first target's picture
  "targets": [{
    "name": "my-print",                     // must equal "name" inside the target JSON (the engine reports it)
    "label": "My print", "what": "Tee print",              // test pictures page captions
    "json": "image-targets/my-print.json", "picture": "image-targets/my-print.jpg",
    "content": [                            // drawn in this order; 1 unit = the tracked picture's height (3:4 = 0.75 x 1)
      { "type": "chromakey-video", "src": "/labs/x/media/clip.mp4", "width": 0.75, "height": 1, "offset": [0, 0, 0],
        "chroma": { "color": "#19ae31", "similarity": 0.159, "smoothness": 0.082, "spill": 0.214 }, "sound": true },
      { "type": "video", "src": "/labs/x/media/clip.mp4", "scale": [1, 1.02], "fadeIn": 800, "restart": true },
      { "type": "image", "src": "/labs/x/media/mask.png", "width": 2.16, "height": 1.37, "offset": [0.1, 0, -0.01] },
      { "type": "model", "src": "/labs/x/media/char.glb", "rotation": [90, 0, 0], "modelScale": [0.5, 0.5, 0.5], "rotate": { "factor": 3 } }
    ]
  }],
  "cta": [{ "label": "Win $300", "url": "https://...", "whileTracked": false }],      // first one gets the accent colour
  "capture": { "photo": true, "video": true, "filePrefix": "my-drop",                // shutter bottom centre: tap photo, hold video
               "watermark": [{ "src": "/labs/x/media/banner.png", "pos": "bottom", "w": 0.62 }] },  // Activated by MEDIALIFE is always added
  "banner": { "src": "/labs/x/media/banner.png", "alt": "Now playing on Netflix" }  // optional strip above the buttons
}
```

Content rules: `width`/`height` are absolute (the old `<a-plane width height>`), `scale: [mx, my]` is relative to
the target frame (the old `xrextras-target-video-fade` width/height) and is the only option on a cylinder target
(the label geometry comes from the engine: radius, height, arc). `restart` = start the clip from 0 each time the
target is found (pause + rewind when lost); `fadeIn` in ms. `sound: true` marks a clip with an audio track: it
plays muted and a "Tap for sound" button appears while it is on screen. Models spin with a one-finger drag
about their own up axis when `rotate` is set.

5. Test in the simulator (below), add a card in `/labs/` (catalog.json), preview, then a phone test.

## What the player does
- Full branded splash: wordmark, hero art, client, title, lead, Start (disabled "Loading…" until the engine, the
  target JSONs and any models are loaded), loading bar, Activated by MEDIALIFE. Menu (top right): Test picture,
  Licences (`/evade/licences/`), MEDIALIFE Labs.
- Computers (user agent, not touch) see an "open on your phone" QR on the splash; Start becomes "Use this
  computer's camera". `?desktop` hides the QR. Engine device errors go to the QR sheet.
- Content shows only while the target is tracked (120 ms grace, stale timeout), follows the pose without lag.
- Videos are muted and play only while their target is on screen; one `<video>` per file, shared by targets.
- Capture (only where the source campaign had a recorder: the three Sakamoto Days experiences): XR8 screenshot +
  watermarks for photos, a 2D-canvas MediaRecorder (<= 1280 px, 15 s, with clip sound when sound is on) for video.
- `?debug` draws each target's frame; `?test` exposes `window.__ar` (`TS`, `screen(name)`, `photo()`); test
  logs go to `/api/ar/kc-diag` (page `labs-x-<slug>`) on previews/localhost or with `?diag`.

## Experiences (ported from the legacy campaigns)
| slug | targets | content |
|---|---|---|
| sukeban-syndicate | 2 | chroma-key videos |
| train-frame | 1 | video fade |
| helltrain | 2 | chroma-key + video fade |
| bunny-girls | 3 | chroma-key videos |
| dashie | 1 | chroma-key video |
| moneymaker-bunny | 1 | video fade |
| bunny-girl-3d | 2 | 3D models, drag to spin |
| sakamoto-days | 2 | image + chroma-key video, video; photo/video capture |
| sakamoto-anime-expo | 3 | images + chroma-key videos; capture |
| sakamoto-graffiti | 1 | chroma-key video (yellow key); capture |
| brooklyn-nets | 2 | chroma-key videos |
| sport-magazine | 1 | video fade (sound) |
| dentsu-products | 7 | chroma-key + video fades |
| ces-2026 | 7 | chroma-key + video fades |
| demo-reel | 10 | chroma-key + video fades |
| bushido-can | 1 (cylinder) | video fade wrapped on the can label; buttons only while tracked |
| vvbg-comic | 1 | video fade (tall, above the bookmark) |
| violence-family | 1 | chroma-key video |
| heart-of-darkness | 1 | image |

## Changes from the legacy versions (deliberate)
- All 8th Wall / Niantic / Orygen branding, loading screens and links removed (orygen.ai, orygen.co.uk,
  orygen.8thwall.app, activated.orygen.io). "Activate in 3D/2D" now links between `moneymaker-bunny` and
  `bunny-girl-3d`; "Contact us" and "Claim offer" (Orygen links) dropped. Google Analytics, Make.com webhooks and
  device fingerprinting from the old campaigns are not carried over.
- Sukeban Syndicate: the old page looked for "syndicate" but the target is named "Syndicate", so the Syndicate
  print never played; fixed. Train Frame's placeholder button labels ("Button#1/#2") became Win $300 / Follow IG
  (same links). dentsu: only the 7 targets that had both a loaded target and content (the "back" print was never
  loaded; "brooklyn" and "AB_trainframe" had no content). Demo reel: 10 targets ("Money Trigger" was not loaded
  in the source; the engine's limit is 10). Tribunny folded into Bunny Girls (same target name).
- Models spin about their own up axis (the old A-Frame `rotation.y` with Euler order YXZ tumbled them sideways).
- Sakamoto Days "Fan Feature / Get Featured" competition modal and the instruction modal are not ported.
- `comic-panels` (VVBG's panel switcher) is not built: it was unused in the shipped VVBG page.
- Models were recompressed: bunny-girl GLB was 10.7 MB Draco with ~2 M vertices; now meshopt + webp, simplified
  to ~0.3 M vertices (2.7 MB). Rug bunny 5.7 MB -> 0.7 MB.
- Some printed target artworks themselves carry a small printed "Activated by Orygen" mark or an orygen.ai
  signature (Afterhours cards, SPORT cover). They are the real prints, so the test pictures show them as they
  are; splash heroes are cropped to avoid them.

## Tested (2026-11-18, headless camera simulator only; nothing is phone-tested)
- Simulator (Chromium fake camera, portrait 720x960, Android UA with facingMode stripped): target found and content
  on the print with `?debug` frame for sukeban-syndicate (chroma), train-frame (fade), sakamoto-days (image +
  chroma; photo with watermarks and a 3.5 s MP4 recording), bunny-girl-3d (both models; drag spin), bushido-can
  (cylinder, from a rendered rotating can), demo-reel (two targets tracked at once, landscape), and the last
  target of every other experience found (all 19 experiences: target found in 3-9 s, console clean).
- Every splash screenshotted at 390x844 (and 375x667, 1440x900 with QR); console clean; test pictures pages load.
- NOT tested: real phones (iPhone Safari, Android Chrome), sound on a device, iOS recording/share, real prints,
  glare, distance range, the cylinder on a real can.
