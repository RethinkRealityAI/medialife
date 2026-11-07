# LOOT BREAK (TBH: Task Bar Hero)

A 60-second WebAR desk raid for the TBH activated merch drop. One custom
component, `LootBreakGame.ts`, draws the whole game: the taskbar lane, the
party (Knight, Ranger, Sorcerer, Priest), the monsters, the boss, the loot
chest and the screen UI. All pixel art is drawn in code, so there are no
assets to upload.

**Try it first in the browser:** `/labs/loot-break/` runs this exact file
(bundled by `node scripts/build-loot-break.mjs`, with
`mattercraft/lab-shim/zcomponent.ts` standing in for Mattercraft).

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

1. Copy `LootBreakGame.ts` into the project's `src/` folder.
2. Add a **LootBreakGame** node under the tracked content (an Instant
   Tracking Group or a World Tracker's anchor). It needs nothing else in the
   scene.
3. The lane is 1 unit long and about 0.045 units tall. If it looks too large or
   too small on a desk, change `sceneScale` in the Look group.
4. Fill in `shareUrl` (the drop's landing page) and, if there's a reward,
   `redeemUrl`.

Nothing else needs wiring. For timelines or analytics, the component emits
**onRoundStart**, **onBoss** and **onRoundEnd(score, tierName)**, and exposes
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
