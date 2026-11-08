# LOOT BREAK (TBH: Task Bar Hero)

A 60-second WebAR desk raid for the TBH activated merch drop. One custom
component, `LootBreakGame.ts`, draws the whole game: the taskbar lane, the
party (Knight, Ranger, Sorcerer, Priest), the monsters, the boss, the loot
chest and the screen UI. All pixel art is drawn in code, so there are no
assets to upload.

**Try it first in the browser:** `/labs/loot-break/` runs this exact file
(bundled by `node scripts/build-loot-break.mjs`, with
`mattercraft/lab-shim/zcomponent.ts` standing in for Mattercraft).

## Files

| File | Goes where in Mattercraft |
|---|---|
| `LootBreakGame.ts` | `src/`, as a component |
| `index.html` | replaces the project's `index.html` (the splash screen) |
| `index.ts` | replaces the project's `index.ts` (launch + analytics) |

`index.html` is **generated**: edit `index.src.html` and run
`node scripts/build-loot-break.mjs`. The build copies the game's pixel sprites
into the splash so the two never drift.

## The splash screen (index.html)

About 4 seconds, drawn entirely in code (no images to download), so it paints
on the first frame:

1. The screen boots and a desktop taskbar slides up, clock at 11:59.
2. The party marches along the taskbar while a slime hops ahead.
3. The clock flips to 12:00 PM, the TBH taskbar icon pings and a Windows-style
   notification says the party has gone on a loot break.
4. The heroes jump off the taskbar, the chest drops in, the LOOT BREAK logo
   slams down with a screen shake and coins burst out.
5. The tagline and **Start lunch break** button rise. While Mattercraft is
   still downloading the scene, the button shows a pixel loading bar.
   Afterwards the chest slowly cycles through TBH's ten rarities.

Tapping anywhere (or **Skip intro**) jumps to the end. Reduced-motion users
get the end state straight away. It fits portrait phones down to iPhone SE
size, landscape phones and desktop.

Preview: `/labs/loot-break/splash.html` (the lab's copy uses a fake loader
that enables the button after 1.8 s; add `?loading=1` to keep it loading).

## Analytics (index.ts)

Same GA property and event names as the other MEDIALIFE activations, with
`experience: 'tbh_lootbreak'`: `activate_click`, `camera_granted`,
`camera_denied`, `scene_placed`, `placement_reset`, `game_start`, `boss_reached`, `game_complete` (score, tier,
seconds) and one `session_summary` per visit. `index.ts` imports
`./Scene.zcomp`; if the project's scene file has another name, change that
import.

## Placement (Place and Re-place buttons)

Works like EVADE: **no round starts until the player taps Place.** There is no
surface detection step; the player points the phone wherever they want the lane
and taps Place.

1. Put the LootBreakGame node **inside** the Instant World Tracker (the instant
   world tracking template already has one). A User Placement Anchor Group
   works too. The game finds the tracker above it, or else the first one in the
   scene; `placementGroup` lets you pick one.
2. Remove (or hide) the template's own Place and Reset buttons. If a User
   Placement Anchor Group is used, the game hides its built-in buttons itself.

How it plays:

- **Intro card → Start lunch break → placing.** The tracker's
  `placementMode` is on, so the lane follows the phone, with corner brackets
  on the desk under it. **Place on desk** is always enabled.
- **Place on desk** sets `placementMode` to false (the lane locks where it
  is), plays `placeTimeline`, fires `onPlace`, then the 3-2-1 countdown starts.
- **Re-place** (top right, under the speaker, during a round) drops the round
  (no score, no chest), turns `placementMode` back on (on an anchor group, its
  own restart, so its Restart Placement Mode still applies), plays
  `resetTimeline`, fires `onResetPlacement` and goes back to placing.
- **Play again** goes straight to the countdown while the lane is placed.
- If something else changes `placementMode` (a template button left in, or the
  anchor group's long-press move), the game follows it.
- If no tracker is found, Place still gates the round and the console says so;
  wire `placeTimeline` / `resetTimeline` to move the content yourself.

## Sound on iPhone

iOS only starts web audio inside a real tap, so the game unlocks it on the
first tap (Start, Place, or any touch). `playOnSilent` (on by default) lets the
sound play with the iPhone's silent switch on, as games usually do; players
can still mute with the speaker button. Turn it off to follow the switch.

## How a round plays

1. The intro card explains the round. **Start lunch break** runs 3, 2, 1, GO.
2. The party walks the lane and fights on its own. The player is the cursor:
   tapping a monster hits it, stuns it and builds a combo (10 hits = 1.5x points,
   up to 3x). A tap that hits nothing breaks the combo, so spamming doesn't pay.
3. Monsters sometimes drop loot. Tapping it before it fades adds points.
4. The boss steps out of the portal at 12:45 (75% of the round).
5. At 12:59 the chest opens on one of TBH's ten rarities, from Common to
   Cosmic, and the results card offers Share, Play again and an optional Redeem
   link.

## Install in Mattercraft

1. Copy `LootBreakGame.ts` into the project's `src/` folder, and replace the
   project's `index.html` and `index.ts` with the ones here.
2. Add a **LootBreakGame** node inside the Instant World Tracker and remove
   the template's own place buttons. It needs nothing else in the scene.
3. The lane is 1 unit long and about 0.045 units tall. If it looks too large or
   too small on a desk, change `sceneScale` in the Look group.
4. Fill in `shareUrl` (the drop's landing page) and, if there's a reward,
   `redeemUrl`.

Nothing else needs wiring. For timelines or analytics, the component emits
**onRoundStart**, **onBoss**, **onRoundEnd(score, tierName)**, **onPlace** and **onResetPlacement**, and exposes
**score** and **tierIndex** as values you can read.

## Properties

| Group | Property | Default | What it does |
|---|---|---|---|
| Round | `roundSeconds` | 60 | 20 to 180. The clock always runs 12:00 to 12:59. |
| Round | `bossAt` | 0.75 | Share of the round before the boss shows up. |
| Round | `difficulty` | 0.5 | How fast monsters come and how hard they hit. |
| Round | `tierScale` | 1 | Multiplies every rarity threshold. Raise it if too many players hit the top tiers. |
| Look | `sceneScale` | 1 | Size of the whole game. |
| Look | `showTaskbar` | on | The taskbar face on the front of the lane. |
| Look | `faceCamera` | on | Sprites turn toward the viewer. |
| Screens | `showIntroOnLoad` | on | Off if you open it from a timeline with `showIntro()`. |
| Screens | `title`, `subtitle`, `footer` | | Text on the cards. |
| Screens | `shareUrl`, `redeemUrl`, `redeemLabel` | | Buttons on the results card. Redeem only shows when a link is set. |
| Screens | `sound` | on | The synthesised sound effects. |
| Screens | `playOnSilent` | on | iPhone: play even with the silent switch on (speaker button still mutes). |
| Placement | `placementEnabled` | on | Use the game's Place and Re-place buttons. |
| Placement | `placementGroup` | empty | The Instant World Tracker or anchor group to drive. Empty = the one the game sits in. |
| Placement | `placeHint`, `placeButtonLabel`, `replaceButtonLabel` | | Placement copy. |
| Placement | `placeTimeline`, `resetTimeline` | | Timelines played on Place and Re-place. |

## Rarity thresholds

Tuned with a perfect-aim bot over 60-second rounds at difficulty 0.5. Real
players miss more than the bot, so real scores run a little lower.

| Player | Bot score (median) | Lands on |
|---|---|---|
| No taps at all | 4,500 | Common |
| A few taps | 6,700 | Uncommon |
| Casual | 14,300 | Legendary |
| Engaged | 19,000 | Immortal |
| Spamming the screen | 17,400 | Legendary |
| Near perfect | 28,700 | Beyond (best runs reach Divine) |

Cosmic needs 41,000 points: a near-perfect run that picks up every loot drop.

## What's verified

- Type-checks against `@zcomponent/core@1.29.1`, `@zcomponent/three@1.38.2`
  and `three@0.164.0`.
- Played headlessly in the lab on phone (390x844) and desktop sizes: intro,
  countdown, real taps on monsters, the boss, the chest and the results card,
  with no console errors.
- **Not yet opened in the Mattercraft editor.** If a property doesn't show in
  the panel, swap `@zui` for `@zprop` on that property.

## Notes

- Fonts (Pixelify Sans, Silkscreen) load from Google Fonts. Without a network
  connection the UI falls back to the system monospace font.
- The score saves the player's best on the device (`localStorage`). Nothing
  is sent to a server yet. A reward that has to be account-bound (as planned
  for TBH) needs a server-side claim, which isn't built.
- Test hooks for scripts: `window.__lootBreak` has `startRound()`,
  `endRound()`, `skip(seconds)`, `tapFront()`, `collectAllLoot()` and
  `debugState`.
