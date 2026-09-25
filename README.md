# medialife.ai

Marketing site for MEDIALIFE™ — AR media infrastructure for global brands, live events, retail and print.

**Stack:** TanStack Start (SSR) · React 19 · Tailwind v4 · shadcn/ui · Nitro
**Host:** Netlify · **Domain:** https://medialife.ai

---

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Nitro's `netlify` preset emits:

| Artifact | Path |
| --- | --- |
| Static assets (publish dir) | `dist/` |
| SSR function | `.netlify/functions-internal/server/` |

`NITRO_PRESET=netlify` is pinned in `netlify.toml`. Without it the Lovable Vite
config defaults Nitro to the **Cloudflare** target and the deploy silently produces
a Worker bundle Netlify can't run.

Two static pages are generated ahead of the Vite build and committed:

```bash
npm run build:cards      # → public/<slug>/  (virtual business cards)
npm run build:creators   # → public/creators/ (Roblox creator program)
```

Both write into `public/`, so they ship with the normal `npm run build`. Re-run the
relevant one after editing its source data — the output is committed, not built on
Netlify.

## Deploy

Netlify builds from the `main` branch. Config lives in `netlify.toml`:
build command, publish dir, the `www` → apex 301, and security headers.

## Contact form

Uses **Netlify Forms**, form name `deployment-inquiry`.

Netlify detects forms by scanning **static HTML at deploy time**. This site is
server-rendered, so the real form in `src/routes/contact.tsx` is invisible to that
scan. `public/__forms.html` is the static declaration Netlify scans; the React form
POSTs urlencoded data to `/__forms.html`.

> **If you add, remove, or rename a field in `contact.tsx`, make the same change in
> `public/__forms.html`.** Fields missing from the static declaration are dropped
> from the submission without an error — leads arrive silently incomplete.

Submissions land in **Netlify → Forms**. Email notifications are configured under
**Project configuration → Notifications → Form submission notifications**.

Spam protection: a `bot-field` honeypot, declared via `netlify-honeypot`.

## Routes

`/` · `/technology` · `/technology/$slug` · `/insights` · `/brand` · `/fan-reactions` · `/contact`

Unlisted static pages, served straight from `public/` rather than the SSR router:
`/<slug>` (business cards), `/creators` (Roblox creator program), and the activated-retail
3D demos at `/roblox/activated-retail/` and `/monkey-quest/activated-retail/`.

Tech stack slugs live in `src/lib/tech-stacks.ts`. **Adding one means adding its URL
to `public/sitemap.xml`** — the sitemap is static and does not generate itself.

## Known gaps

- `/fan-reactions` "Submit your capture" points at `/contact`. The original design
  linked `medialife.ai/upload`, which does not exist — build that route and repoint
  the CTA when fan uploads are ready.
- Fan-reaction images are hot-linked from `framerusercontent.com`. Move them to
  Netlify Image CDN or the repo before relying on them in production.
- No OG share image. Add `public/og.png` (1200×630) and reference it from
  `src/routes/__root.tsx` so link previews aren't blank.

## Virtual business cards (`/<slug>`)

Unlisted, QR-first contact pages for team members, folded into this site as
static files and served from the site root — `medialife.ai/dapo`. They are
deliberately **not** linked from the site or the sitemap: each card carries a
`noindex` meta tag, an `X-Robots-Tag` header from `netlify.toml`, and a
`Disallow` line in `robots.txt`. They are reached by scanning the printed or
on-screen QR code.

| Path | What it is |
| --- | --- |
| `team/<slug>.json` | Member data — the single source of truth |
| `team/<slug>/` | Source images (`portrait.webp`, `avatar.jpg`) |
| `scripts/build-cards.mjs` | Generator (QR codes, vCard, page, host config) |
| `scripts/templates/card.html` | Page template |
| `public/card/` | Shared `card.css`, `card.js`, brand assets (served at `/card/`) |
| `public/<slug>/` | Generated output — committed, deployed as-is |

### Adding a team member

1. Copy `team/dapo.json` to `team/<slug>.json` and edit it. `cardUrl` must be
   exactly `https://medialife.ai/<slug>` — the generator refuses anything else,
   because that string is what the link QR encodes.
2. Drop a `portrait.webp` (transparent cut-out, ~900px wide) and a square
   `avatar.jpg` (~320px — it goes into the vCard and link previews) into
   `team/<slug>/`.
3. `npm run build:cards`, then commit the generated `public/<slug>/` **and** the
   updated `netlify.toml` and `public/robots.txt`.

Output is committed on purpose: the Netlify build stays a plain `vite build`
with no QR generation on the deploy path.

### Slugs share a namespace with the site

Cards sit at the root, so `team/x.json` claims `medialife.ai/x`. A slug that
would shadow a real route — or be shadowed by one — is rejected at build time by
`RESERVED` in `scripts/build-cards.mjs`. Add to that list when you add a route.

The generator also owns a marked block in `netlify.toml` and `public/robots.txt`
and rewrites it on every run, so the noindex headers and crawl rules cannot
drift from the set of cards that actually exists. Do not hand-edit inside the
markers.

### Why the asset paths are root-absolute

Cards resolve at both `/<slug>` and `/<slug>/`, and the link QR encodes the
first. Relative asset paths (`portrait.webp`, `card.css`) resolve against `/` on
that URL and 404 — the card renders unstyled for anyone who scans the code.
Every card-local asset is therefore prefixed with `{{base}}` (`/<slug>/`) and
every shared asset with `/card/`. `card.js` reads the same value from
`data-base`.

### Layout

The card is sized to the viewport and never scrolls: `body` is `height: 100dvh`
with `overflow: hidden`, and `.card` is a flex column in which only `.hero`
grows. The portrait absorbs whatever slack the screen has, so the QR and the
Save button stay on screen from a 320x568 phone upward. `dvh` rather than `vh`
so a collapsing mobile URL bar cannot push the QR out of view.

Two layouts, one markup. Narrow screens get six icon-only action buttons on a
single row; from 800px wide (or any screen at least 640px wide and under 480px
tall — a landscape phone) the card becomes two columns and the buttons regain
their labels. The labels are always in the DOM, so an icon-only button is never
an unlabelled control for a screen reader.

---

## Roblox creator program (`/creators`)

Creator-facing onboarding for the MEDIALIFE × Roblox Activated Merchandising Program:
what the program is, what a creator gets, what they have to do, and an application.
Unlisted — `noindex` via `netlify.toml` and disallowed in `robots.txt`, like the cards.

Static, like the business cards, and for the same reason: it is a self-contained page
with its own WebGL runtime, and keeping it out of the SSR bundle means it cannot slow
down or break the marketing site.

```
public/creators/index.html            generated — do not edit by hand
public/creators/assets/js/program.js  SINGLE SOURCE OF TRUTH (facts, catalogue, economics)
public/creators/assets/js/app.js      page behaviour, projection model, Drop Pass, application
public/creators/assets/js/studio.js   the 3D configurator
public/creators/assets/css/app.css    design system (same tokens as public/card/card.css)
public/creators/assets/img/           generated brand imagery (webp + jpg fallback)
public/creators/activate/             the fan-side "what happens when they scan" preview
public/creators/vendor/               three.js r180 and qrcode, vendored — no runtime CDN
scripts/build-creators.mjs            renders index.html from program.js
```

### Changing the copy or the numbers

Edit `public/creators/assets/js/program.js`, then `npm run build:creators`.

Every fact — pilot shape, product catalogue, prices, royalty rates, phases,
responsibilities, track record, FAQ — renders from that file into static HTML at build
time, so the page reads completely with JavaScript disabled. The interactive layer
enhances it; it never supplies it.

### What is deliberately not on this page

MEDIALIFE contribution margins and platform-side fee splits from the commercialization
deck. The page carries creator-facing economics only — royalty rates, price bands, lead
times — and labels them indicative, because they are. The earnings projection is an
illustrative model driven by inputs the creator controls, capped by pilot inventory, and
disclaimed in place.

### The Drop Studio

A merch configurator with no downloaded models or textures. Each product is a 2D signed
distance field inflated into a soft closed shell, so colourway, print placement,
activation-tag position and the activation cinematic are all parametric. Surfaces are
painted to a canvas texture with the front print in the top half of the UV space, which
is how a logo lands on the front only.

Uploaded logos are read with `FileReader` and never leave the browser.

The **Drop Pass** captures the live render, composites a branded sheet, and encodes the
whole build into the URL hash — so a configuration is shareable, scannable and
re-openable. `window.__mlStudio` exposes the scene for debugging on a live page.

### Application form

Declared in `public/__forms.html` alongside the contact form and POSTed there as
urlencoded data, same as `src/routes/contact.tsx`. **The reserved-name rule applies** —
the contact field is `contact-name`, not `name`, and the free-text field is `notes`, not
`body`. Keep the declaration in sync with `scripts/build-creators.mjs`.

If the POST fails the visitor is told plainly and handed a JSON download plus a
`mailto:` fallback; the draft stays in `localStorage`. An application is never silently
lost.

---

## Activated-retail demos (`/roblox/activated-retail/`, `/monkey-quest/activated-retail/`)

Interactive 3D Walmart endcaps used in pitches: orbit the fixture, pull merch off the shelf,
add it to a mock cart, run the activation flow, switch the featured property or campaign.
Short links: `/roblox-activated-retail` and `/monkey-quest-activated-retail` (301s in
`netlify.toml`). Unlisted — `noindex` headers and disallowed in `robots.txt`.
Both pages open behind a simple password modal (a courtesy lock for client previews, not
security: the files stay public). The password is stored as an FNV-1a hash in `GATE_HASH`
near the top of each `index.html` (the comment there has the one-line command to make a new
one); a device that has unlocked once is remembered in `localStorage`.

```
public/roblox/activated-retail/        MEDIALIFE × Roblox (Roblox, Skyrift, EVADE properties)
public/monkey-quest/activated-retail/  Toei Animation × Hypergalactic concept (game + film campaigns)
  index.html          the whole app (CSS + JS inlined), generated — do not edit by hand
  assets/hd/          display graphics, WebP, full + _m (mobile) sizes
  assets/             splash render, charms, reward art, QR codes
  models/*.glb.txt    merch models, base64 GLB (meshopt-compressed)
  display.glb.txt     the endcap itself, base64 GLB
public/vendor/three@0.170.0/   three.js r170 + the addons these pages import (no runtime CDN)
```

Both pages are exported from the RobloxDisplay project (`web/src` and the Monkey Quest
fork): edit there, rebuild, and replace the folder. Everything they fetch is relative to the
page, so each folder is self-contained apart from the vendored three.js.

> **Patched in place — port before the next export.** The commit "Make the activated-retail
> demos responsive…" edited both `index.html` files directly (the exporter wasn't available):
> the stuck product sheet / frozen hotspots fix, face-on product presentation with rotate +
> zoom, the compact sheet, tour-first start, theme-coloured markers, the cart icon and the
> frame-budget / shadow / thumbnail performance changes. Apply the same diff to RobloxDisplay
> (`git show` that commit) or a re-export will undo it. Keep the two pages in step: every
> interaction change goes into both.

The EVADE activation embeds the live Cola Run game (evade.medialife.ai) in the phone mock and
falls back to a scannable QR if the frame is blocked. The Monkey Quest QR codes open the real
Roblox game page.
