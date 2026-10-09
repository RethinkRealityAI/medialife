# Creator Merch Shelf (`public/merch-shelf/`)

A static, no-build page: one creator's activated merch on a floating lit shelf,
their name in neon above it. Plain ES modules, three.js r180 via an importmap.
Served at `/merch-shelf/` (quick links) and, through the server, at `/shelf` and
`/shelf/<slug>` (published shelves). All asset URLs are absolute (`/merch-shelf/…`)
because the same HTML is served from `/shelf/<slug>`.

## Config resolution (`config.js` → `resolveConfig`)

The contract is `ShelfConfig` in `src/lib/shelf/config.ts`. `default.json` is
generated from it (`npm run check:shelf -- --write`); never hand-edit it.

1. `window.__SHELF` — a published shelf. The server replaces the
   `<!--SHELF_CONFIG-->` marker in `<head>` with
   `<script>window.__SHELF=…;window.__SHELF_SLUG="…"</script>` (+ meta tags).
2. Otherwise `/merch-shelf/default.json`, then the quick-link params below.
3. `?preview=1` (admin builder iframe) additionally listens for `postMessage`.

Every field is re-validated in the page (`sanitize`) and falls back to the
default field by field, so a bad value never blanks the shelf.

## Quick-link params

| param            | effect                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `name`           | sign text (max 28). Clears the placeholder handle unless `handle` is given                         |
| `handle`         | under the sign (`@` added if missing)                                                              |
| `neon`, `accent` | hex without `#`                                                                                    |
| `shelf`          | `walnut` \| `black` \| `white` \| `maple`                                                          |
| `backdrop`       | `midnight` \| `sunset` \| `arcade` \| `snow`                                                       |
| `logo`           | https URL or same-site path; loaded with CORS, falls back to the generated wordmark on error/taint |
| `for` / `by`     | `pitch.preparedFor` / `pitch.presentedBy` (text only)                                              |
| `invite`         | invite code carried to `/creator-hub/join?invite=`                                                 |
| `audience`       | estimator starting audience                                                                        |
| `products`       | comma list of types to show, in order (e.g. `tee,hoodie,sticker`)                                  |

Also: `#activate=<productId>` opens that product's fan experience straight away
(full-screen on a phone — it's what the "Try it on your phone" QR points to).
`?c=CODE` / `?to=Name` personal links come from `ARTrack.link`.

## Preview protocol (`?preview=1`, same origin only)

No loader/tour, a "Preview" badge, no analytics.

- page → parent: `{type:"shelf:ready"}`, re-posted every 500 ms until the first config arrives
- parent → page: `{type:"shelf:config", config}` — re-render live (models are cached; only what changed is rebuilt)
- parent → page: `{type:"shelf:snapshot", width, height}` — waits for the current build, renders the hero view at that size
- page → parent: `{type:"shelf:snapshot-result", dataUrl}` (PNG, or `null` on failure)

## Files

| file                                                                                             | what                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`                                                                                     | shell: head (marker, importmap, fonts), DOM for bar/dock/panels, loader, no-WebGL fallback                                                                         |
| `app.css`                                                                                        | all styling (site tokens: dark, cyan→magenta, Space Grotesk + JetBrains Mono; Tilt Neon for the sign)                                                              |
| `main.js`                                                                                        | boot, config → scene, render/re-render diffing, hover, focus (lift-out + turntable), preview protocol, fallback, hash activation                                   |
| `config.js`                                                                                      | resolution, sanitising, quick links, product meta, lineup swatches, money formatting                                                                               |
| `scene.js`                                                                                       | renderer, bloom, limited orbit + parallax, lights, backdrops + particles, picking, camera flights, snapshots, thumbnails, sleep-when-idle loop                     |
| `shelf.js`                                                                                       | the cubby unit (layout chosen for the viewport), finishes, LED strips + washes                                                                                     |
| `neon.js`                                                                                        | per-letter neon tubes, ignition flicker and hum, backer, wires, halo                                                                                               |
| `products.js`                                                                                    | model table (model + print zones per type, with fallbacks), loader with byte progress, vintage wash shader, decals, displays (hanger/stand/peg), hang + price tags |
| `prints.js`                                                                                      | art kit: logo or generated wordmark, framed back panel, sleeve type, badge, distress/embroidery                                                                    |
| `keychain.js`                                                                                    | procedural clear-acrylic two-charm set on a silver clasp                                                                                                           |
| `sticker.js`                                                                                     | procedural holographic die-cut 3-pack                                                                                                                              |
| `art.js`                                                                                         | canvas helpers: wordmark, die-cut, wood/fluted textures, QR drawing                                                                                                |
| `ui.js`                                                                                          | layer stack (Esc, focus trap/return), icons, toast, fly-to-cart, analytics wrapper                                                                                 |
| `sheet.js`, `cart.js`, `activation.js`, `tour.js`, `customise.js`, `estimator.js`, `snapshot.js` | the panels                                                                                                                                                         |
| `models/`                                                                                        | the lineup's boxy tee / hoodie / long-sleeve GLBs                                                                                                                  |

Reused, not copied: `/roblox/creators/vendor/three` (r180 + addons),
`/roblox/creators/vendor/qrcode`, and `buildDecal` / `resolveZone` / `PRINT_ZONES`
from `/roblox/creators/assets/js/product.js` (cap, plush and desk mat models also
come from `/roblox/creators/assets/models/`). If those move, update the importmap
and the imports in `products.js`.

## Adding a product type

1. Add it to `PRODUCT_TYPES` (+ defaults) in `src/lib/shelf/config.ts` and regenerate `default.json`.
2. `config.js`: add it to `PRODUCT_TYPES` and `PRODUCT_META` (label, apparel?, tintable?, sizes, fallback image).
3. Modelled: add an entry to `MODELS` in `products.js` (`url` + `zones`, first entry wins, later ones are fallbacks),
   a `TARGET` size, and a display branch in `buildProduct` (where it sits in the cubby, its hang tag).
   Procedural: write a `buildX()` like `keychain.js` / `sticker.js` returning `{ group, materials, size, idle, dispose }`.
4. Optional: an icon/label for a new activation kind lives in `ui.js` (`KIND_ICON`, `KIND_LABEL`) and `activation.js`.

## Analytics

`ARTrack.init({ demo: "shelf:<slug>" | "merch-shelf" })` (skipped in preview). Events:
`enter`, `product_open`, `add_to_cart`, `cart_open`, `checkout`, `activation_open`,
`activation_launch`, `game_start`, `game_end`, `reward_redeem`, `ar_qr`, `tour_step`,
`tour_finish`, `tour_skip`, `shelf_customize` (`what`: open/logo/neon/…/share/snapshot),
`estimator_use`, `apply_open` (`from`: dock/sheet/checkout/activation/tour/estimator).
