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
seconds, outcome wiped/survived, boss slain/escaped, ults, weak_hits,
cursed_hits, accuracy, best_combo, badges), `reward` (action: offer, claim,
upgrade, quest_step_N, quest_claim, save, shop; percent) and one
`session_summary` per visit (with `codes` claimed). No email or code is sent
to GA.
Those round fields are there to tune difficulty from real players. `index.ts` imports
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

1. The intro card explains the round. **Start lunch break** → place → 3, 2, 1, GO.
2. **The party can't win alone.** Heroes auto-attack, but monsters push harder
   as lunch runs out: a player who never taps is wiped (around 12:50). The
   player is the cursor: tapping a monster hits and stuns it and builds a
   combo (10 hits = 1.5x points, up to 3x).
3. **Misses count.** A tap on nothing breaks the combo; three misses in quick
   succession **jam the cursor** for about a second, so mashing doesn't pay.
4. **Cursed slimes** (purple, glowing, from about 12:12): tapping one bursts it,
   breaks the combo and costs the party 10 HP. Leave them to the heroes.
5. **Ultimates.** Hits charge the ULT meter (faster on a combo). When it's full
   the four hero buttons light up; tap one (or the hero on the lane, or keys
   1-4): **Shield** (no damage for 6 s), **Volley** (14 arrows, good on the
   boss), **Meteor** (hits every monster) or **Heal** (+50 HP).
6. **The boss** steps out at 12:45 and shrugs off most party damage (25%). A
   glowing **weak spot** appears on it for about a second at a time: tapping it
   deals big damage and stuns it. If the boss is still standing at 12:59 it
   **escapes and the chest drops one rarity**.
7. At 12:59 bonuses are added (**Boss slain** +1,500, **Iron party** +1,000 for
   never dropping below half HP, **Combo x30** +1,000), then the chest opens on
   one of TBH's ten rarities. The results card shows the badges, earned or
   not, so players know what to go for next time.
8. One-line coach tips appear the first time each thing matters (tap the
   monsters, cursed slimes, the weak spot, ULT ready, party in danger).

## Rewards (discount codes and the bonus quest)

The results card has three parts: the result (rarity, score and a rarity bar
with the next threshold), **Rewards**, and **Your round** (stats and badges).
The rewards are run from the MEDIALIFE site
(**Admin > LOOT BREAK**, `/admin/lootbreak`). Nothing to set up in Mattercraft:
`rewardsApi` already points at https://medialife.ai.

- **Score codes.** Reaching a rarity on the reward ladder unlocks a code
  (default Immortal 5 %, Beyond 10 %, Celestial 15 %). The player taps Claim,
  enters their email (and can tick "email me new drops", unticked by default)
  and gets a code like `TBH10-7KQM-X3PF`. One score code per email: a better
  round later upgrades it and the old code stops working. Below the ladder,
  the strip shows how far they are from the next reward, so there's always a
  reason to play again.
- **Bonus quest.** The results card only asks "Want an extra 10% off?"; the
  next screen explains it. Follow every account listed in the admin (by
  default MEDIALIFE and Snowday on Instagram, and join Task Bar Hero's Discord;
  the game words each step from the link), then share a story card (a 1080x1920 image of their result, made on the phone) for an
  extra code (default 10 %). Follows can't be checked through any API, so the
  code is issued straight away, marked "Check follows" in the admin, and the
  team looks at the Instagram handle before the order ships. The quest only
  shows once every account has a link in the admin.
- **The coupon.** Copy the code, or Save coupon: a 1080x1350 image goes to the
  share sheet (Save to Photos) or downloads. Codes are also kept on the phone
  (`localStorage`) and, when `RESEND_API_KEY` is set on Netlify, emailed.

Why codes can't be faked or shared: codes are random, made and stored on the
server and tied to the claiming email. In the admin, **Check a code** shows
whether a code exists, who it belongs to and whether it's been used; Mark used
once it's applied. A round has to bring a signed ticket that the game asks
for when the round starts, can't be claimed twice, and has to have lasted long
enough for its score. The score itself still comes from the phone, so someone
who scripts the API can claim the top code for an email they own; that's why
it's one code per email, small percentages, and checked at checkout.

Rewards use the standard rarity thresholds. If you change `tierScale`, the
rarity on screen moves but the reward still needs the standard score.

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
**onRoundStart**, **onBoss**, **onRoundEnd(score, tierName)**, **onPlace**, **onResetPlacement** and
**onReward(action, percent)**, and exposes **score**, **tierIndex**, **ultReady**, **roundStats** and
**rewardState** as values you can read, **fireUlt(hero)** to fire an ultimate and **openRewards(view)**
to open the player's codes from a timeline.

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
| Rewards | `rewardsEnabled` | on | Discount codes and the bonus quest. Off hides them. |
| Rewards | `rewardsApi` | https://medialife.ai | The site that makes and checks codes. A deploy preview's address tests against that preview's codes. |

## Rarity thresholds

Tuned with bots over 60-second rounds at difficulty 0.5 (16 rounds each). Bots
aim better than thumbs, so real scores run a little lower; use `tierScale` to
shift the whole ladder.

| Player | Median score | Lands on |
|---|---|---|
| No taps at all | 2,600 (always wiped) | Common |
| A few taps | 6,500 (half wiped) | Common / Uncommon |
| Casual | about 15,000 | Rare to Legendary |
| Engaged | 22,000 | Immortal |
| Mashing the screen | 20,700 | Legendary |
| Near perfect | 27,000 | Arcana / Beyond |
| Master (every weak spot, every loot, smart ultimates) | 28,000 (best 38,900) | Arcana to Divine |

Thresholds: Uncommon 6,000 · Rare 11,000 · Legendary 16,000 · Immortal 21,000 ·
Arcana 25,000 · Beyond 28,500 · Celestial 32,000 · Divine 35,500 · Cosmic 39,000
(just above the best master run).

All combat numbers sit in one `TUNE` table at the top of `LootBreakGame.ts`.

## What's verified

- Type-checks against `@zcomponent/core@1.29.1`, `@zcomponent/three@1.38.2`
  and `three@0.164.0`.
- Played headlessly in the lab on phone (390x844), iPhone SE (375x667) and
  landscape (844x390): intro, placing, countdown, real taps on monsters, a real
  tap on an ultimate button and on the boss's weak spot, the chest and the
  results card with badges, with no console errors.
- Placement tested against a stand-in Instant World Tracker (as parent and as
  a sibling elsewhere in the scene) and with no tracker at all.
- Rewards: the API was hit with forged, reused, too-old and too-fast tickets,
  mismatched rarities, upgrades and downgrades, and refused each one
  correctly. In the lab, a full round → Claim → email → coupon → Save, and
  the bonus quest (3 follows + story image → handle → code) ran on 390x844,
  375x667 and 844x390, and the admin page checked, verified and exported
  the codes. With the rewards server unreachable, the strip simply doesn't
  show. The share sheet itself (Save to Photos, Instagram story) needs a real
  phone; headless Chrome takes the download fallback.
- Sound unlock and `playOnSilent` are written to Safari's documented rules but
  **not yet heard on a real iPhone**.
- **Not yet opened in the Mattercraft editor.** If a property doesn't show in
  the panel, swap `@zui` for `@zprop` on that property.

## Notes

- Fonts (Pixelify Sans, Silkscreen) load from Google Fonts. Without a network
  connection the UI falls back to the system monospace font.
- The score saves the player's best on the device (`localStorage`). Only a
  reward claim sends anything to a server (the score, the rarity, the email
  and, for the quest, the Instagram handle).
- Test hooks for scripts: `window.__lootBreak` has `startRound()`,
  `endRound()`, `skip(seconds)`, `tapFront()`, `tapWeakPoint()`,
  `tapCursed()`, `fireUlt(id)`, `collectAllLoot()`, `openRewards(view)`,
  `rewardState` and `debugState`. The lab's `?rewards=0` turns rewards off.
