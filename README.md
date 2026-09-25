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
3D demos at `/roblox/activated-retail/` and `/monkey-quest/activated-retail/`, plus the AR
hand-off page `/ar/` and the endcap renderer `/activated-retail/engine/`.

Unlisted SSR routes for the activated-retail tools (see [Activated-retail tools](#activated-retail-tools-admin)):
`/admin/*` (password-protected), `/x/$slug` (published endcaps) and `/api/ar/*`.

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
security: the files stay public). Each page has its own simple password (Roblox: `robloxamp`, Monkey Quest:
`toeimq`; case and spaces ignored), stored as an FNV-1a hash in `GATE_HASH`
near the top of each `index.html` (the comment there has the one-line command to make a new
one); a device that has unlocked once is remembered in `localStorage`.

```
public/roblox/activated-retail/        MEDIALIFE × Roblox (Roblox, Skyrift, EVADE properties)
public/monkey-quest/activated-retail/  Toei Animation × Hypergalactic concept (game + film campaigns)
  index.html          the whole app (CSS + JS inlined), generated — do not edit by hand
  assets/hd/          display graphics, WebP, full + _m (mobile) sizes
  assets/             splash render, charms, reward art, QR codes
  models/*.glb        merch models, binary GLB (meshopt-compressed)
  ar/<theme>.glb      native AR per theme: GLB for Android Scene Viewer,
  ar/<theme>.usdz       USDZ for iOS AR Quick Look,
  ar/<theme>.jpg        and the poster on /ar/ (regenerate: node scripts/export-ar.mjs)
  display.glb         the endcap itself, binary GLB (preloaded from <head>, streamed for the progress bar)
public/vendor/three@0.170.0/   three.js r170 + the addons these pages import (no runtime CDN)
public/vendor/ar-kit/          shared page modules: track.js (analytics + ?c= client links),
                               present.js (presentation mode), lead.js ("Book a call"), ar-launch.js
```

Both pages are exported from the RobloxDisplay project (`web/src` and the Monkey Quest
fork): edit there, rebuild, and replace the folder. Everything they fetch is relative to the
page, so each folder is self-contained apart from the vendored three.js and `/vendor/ar-kit/`.

> **Patched in place — port before the next export.** The commit "Make the activated-retail
> demos responsive…" edited both `index.html` files directly (the exporter wasn't available):
> the stuck product sheet / frozen hotspots fix, face-on product presentation with rotate +
> zoom, the compact sheet, tour-first start, theme-coloured markers, the cart icon and the
> frame-budget / shadow / thumbnail performance changes. Apply the same diff to RobloxDisplay
> (`git show` that commit) or a re-export will undo it. Keep the two pages in step: every
> interaction change goes into both. The same applies to the later in-place work: binary GLB
> loading (the `.glb.txt` copies are gone), the ar-kit script tags, personal links and analytics
> in the password gate, presentation mode (`?present=1`, P), "Book a call" and the AR button
> (`arLaunch()`, native AR via ar-kit instead of the WebXR-only path), and the tour's theme
> reveal (tour steps carry a `theme`; `themeReveal()` / `reskin()` in each page).

The EVADE activation embeds the live Cola Run game (evade.medialife.ai) in the phone mock and
falls back to a scannable QR if the frame is blocked. The Monkey Quest QR codes open the real
Roblox game page.

## Activated-retail tools (`/admin`)

Internal tools for the demos above and for endcaps made without code: analytics, personal
client links and the endcap builder. Everything lives in this app; nothing is sent to third
parties.

### Access

`/admin/login` asks for the shared password in the Netlify env var `AR_ADMIN_PASSWORD`. A
successful sign-in sets a signed, HttpOnly cookie for 14 days, signed with `AR_SESSION_SECRET`
(a secret env var with separate values for production and deploy previews, so a preview
session doesn't work on the live site). Changing either env var signs everyone out; env var
changes take effect on the next deploy. Locally: `AR_ADMIN_PASSWORD=… npm run dev`.

### Storage

[Netlify Blobs](https://docs.netlify.com/blobs/overview/): no database, no migrations. Stores are
named `ar-<kind>-<namespace>`; the namespace comes from the request host, so testing never
mixes with client data: `prod` (medialife.ai), `preview` (deploy previews and branch deploys)
and `dev` (localhost, which writes files under `.data/ar/` instead of Blobs). See
`src/lib/ar/store.server.ts`.

### Analytics (`/admin/analytics`)

`public/vendor/ar-kit/track.js` runs on both demos and on published endcaps. It keeps an
anonymous visitor id in `localStorage` (no cookies, no IP addresses; country and city come
from Netlify's geo header), batches events and sends them to `POST /api/ar/track` every 10 s
and when the tab is hidden. One record per visit. The event list is `AR_EVENTS` in
`src/lib/ar/events.ts`. The dashboard shows visits, engaged time, the tour → product →
activation funnel, a row per client link and each visit's journey.

Your own visits: turn tracking off for a browser with the switch on the dashboard, or open any
demo once with `?notrack=1` (`?track=1` turns it back on). Deploy previews and localhost can
load sample data from the empty state; production refuses it.

### Client links (`/admin/links`)

A link is `…/activated-retail/?c=<code>`. The page greets the client by name ("Prepared for
…") on the password screen, the splash and under the lockup. It can also skip the password,
for that visit only and only for the demo it was made for. Every visit through a link shows
up under that client in the dashboard. `?to=Name` gives the greeting without a stored link.
The public lookup is `GET /api/ar/link?c=CODE`. Archived links stop greeting and unlocking,
but their visits are still counted.

### Endcap builder (`/admin/builder`)

Build an endcap for a prospect without code: start from a template (Roblox, EVADE, Monkey
Quest or Blank), choose themes and graphics, put 3D models or image cut-outs on the seven shelf
zones, write the product and hotspot copy, the activation and the tour, then publish to
`/x/<slug>`. The editor autosaves and shows a live preview.

- **Renderer.** `public/activated-retail/engine/` is one static page that renders any project
  (schema: `src/lib/ar/project.ts`). `/x/<slug>` is an SSR route that injects the published
  project into it. The builder frames the same page with `?preview=1` and drives it with
  `postMessage`. Templates live in `public/activated-retail/templates/`; check them with
  `node scripts/validate-templates.mjs`.
- **Asset library.** Upload `.glb` models (≤ 20 MB; other formats must be exported as `.glb`)
  and PNG, JPEG or WebP images (≤ 10 MB; a phone-sized copy is made automatically). Uploads
  go in 4 MB chunks, because a Netlify function takes at most 6 MB per request. Files are
  public at `/api/ar/asset/<id>` and cached for a year (ids are never reused).
- **Publishing** exports the AR files in your browser from the live preview (GLB + USDZ,
  like the demos), stores them with the project and purges the CDN cache for `/x/<slug>`. If
  the export fails or is slow, "Skip AR" publishes without it.
- **Non-Roblox brands.** The fixture's own letters read ROBLOX and its sample merch carries
  Roblox branding. Set the header letters and plinth line under Overview, and use 3D models,
  cut-outs, colour or printed artwork on the shelves. The builder flags what is still branded.
- **Graphics sizes** (a phone copy at half size is automatic): towers 1088×3200, totem
  1452×3200, video wall 4096×2323 (the hero screen covers its centre, so keep key content in
  the side strips), hero screen 2560×1452, header 2048×500, key art 16:9 at 1920×1080 or larger,
  cut-outs as transparent PNG/WebP with the long side ≥ 1024. A real QR is drawn on the right
  tower for `activation.qrUrl`; if the tower art has no QR of its own, keep the middle of the
  tower clear.
- **Colour and print** apply to the sample merch only. Colour: cap, tee, hoodie and figure box.
  Print: figure box front (3:4, ≥ 900×1200) and desk mat (2:1, e.g. 2048×1024).
- Share a published endcap with a personal link from `/admin/links` (demo "x:<slug>").

### Native AR

The AR button opens the current theme in the phone's own AR viewer. **iPhone/iPad:** AR
Quick Look, with a "Book a call" button in its banner. **Android:** Google Scene Viewer (needs
Google Play Services for AR; without it the page says so). **Desktop:** a QR code to `/ar/`,
a "View in your space" page for the phone that also has a 3D view for devices without AR.
`/ar/` takes `?m=<path without extension>` or `?glb=&usdz=&p=` (same-site paths only) and
`&t=<title>&d=<demo>`.

The files are exported from the live scene by `public/vendor/ar-kit/ar-export.js`: an
export-only copy with standard materials, UV-baked texture offsets, and JPEG textures unless
alpha is needed. It writes GLB and USDZ (`ar-kit/usdz-exporter.js` is three's exporter with
JPEG, double-sided and size changes). Quick Look refuses a `.usdz` not served as
`model/vnd.usdz+zip`, so `netlify.toml` sets both MIME types. After changing a demo's graphics,
merch or fixture, run `node scripts/export-ar.mjs [demo] [themes…]` and commit the new files
(several minutes per theme without a GPU).

### Presentation mode and "Book a call"

`?present=1` (or P, or "Presentation mode" in the end-of-tour dialog) runs the tour on a loop
with large captions and no UI, for meetings and kiosks. Esc stops, Space pauses, ←/→ step;
touching the scene pauses it and it resumes after 20 s. "Book a call" opens a short form
(`public/vendor/ar-kit/lead.js`) that posts to the Netlify form **`activated-retail-lead`**
(declared in `public/__forms.html`). **Turn on email notifications for that form** under
Project configuration → Notifications, or leads only show in Netlify → Forms.
