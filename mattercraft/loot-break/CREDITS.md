# LOOT BREAK art credits

## Pixel sprites: Kenney, "Tiny Dungeon" (CC0)

Every character, monster, chest and loot sprite in LOOT BREAK (in the game and
on the splash screen) comes from **Tiny Dungeon 1.0** by **Kenney**
(www.kenney.nl), released under **Creative Commons Zero (CC0 1.0, public
domain dedication)**.

- Pack page: https://kenney.nl/assets/tiny-dungeon
- Downloaded from: https://opengameart.org/content/tiny-dungeon
  (posted by Kenney, licence shown as CC0), file `kenney_tinydungeon.zip`,
  on 2026-11-08
- Licence: https://creativecommons.org/publicdomain/zero/1.0/
- The licence file from the pack is kept next to the source sheet:
  [art/kenney-tiny-dungeon/License.txt](art/kenney-tiny-dungeon/License.txt)

From the licence: "This content is free to use in personal, educational and
commercial projects. Support us by crediting Kenney or www.kenney.nl (this is
not mandatory)." We credit Kenney anyway.

### Which tiles are used

Tile numbers refer to `tilemap_packed.png` (12 x 11 tiles of 16 px), read left
to right, top to bottom, starting at 0.

| In the game | Tile | Changes |
| --- | --- | --- |
| Knight | 96 | none |
| Ranger | 112 | none |
| Sorcerer | 84 | none |
| Priest | 99 | none |
| Brute (tough monster) | 109 | none |
| Slime | 108 | none |
| Bat | 120 | none |
| Boss | 110 | none (drawn 1.9x larger) |
| Chest / open chest | 90 / 89 | none |
| Coin | 101 | recoloured gold |
| Shield, sword, axe | 102, 104, 118 | none |
| Potion, elixir | 116, 115 | none |
| Cursed slime | 108 | recoloured purple |
| Cosmic potion | 116 | recoloured purple |

`scripts/loot-break-sprites.py` turns the sheet into the pixel-row grids in
`LootBreakGame.ts` (`PAL` and `SPRITES`), so the conversion can be repeated
and checked.

## Everything else

The lane, portal, effects, UI and sounds are drawn or synthesised by the
component's own code. The fonts, Pixelify Sans and Silkscreen, load from Google
Fonts and are licensed under the SIL Open Font License 1.1.

## MEDIALIFE badge

The splash's "Activated by MEDIALIFE" badge is MEDIALIFE's own brand-kit badge
(`public/email/activated-by-medialife.png`), saved as WebP in
[art/medialife/](art/medialife/). The build copies it next to the splash.

## TBH: Task Bar Hero art

The splash screen's "Merch Exclusive" lockup shows TBH's logo, cropped
(unaltered) from the official main capsule on the game's Steam store page
(Steam app 3678970, fetched 2026-11-08 through Steam's public store API). The
source image and the crop are in [art/tbh/](art/tbh/). It's a stand-in until
TBH sends its logo as SVG or transparent PNG; swap
`art/tbh/tbh-logo.webp` (360x204 WebP of the same crop, the file the splash
uses; also in the Mattercraft project root) and rebuild.

No other TBH art is used. Their sprite sheets will replace these sprites
once the studio sends them. The first hand-drawn concept sprites (not from
any pack, and not TBH's) are archived in [archive/](archive/).
