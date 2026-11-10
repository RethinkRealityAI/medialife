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

`/` · `/technology` · `/technology/$slug` · `/insights` · `/brand` · `/fan-reactions` · `/contact` · `/activated-retail` · `/creator-hub` (see [Creator Hub](#creator-hub-creator-hub))

Unlisted static pages, served straight from `public/` rather than the SSR router:
`/<slug>` (business cards), `/creators` (Roblox creator program), and the activated-retail
3D demos at `/roblox/activated-retail/` and `/monkey-quest/activated-retail/`, plus the AR
hand-off page `/ar/` and the endcap renderer `/activated-retail/engine/`.

`/cln/` (short link `/clan`) is the cLaN Entertainment Activated Merchandise partnership
page and signable Statement of Work. It has no build step. Submissions go to the
`sow_submissions` table in the SOW Supabase project, the same table the medialife-sow admin
reads. Talent assets upload to that project's private `sow-uploads` bucket under
`cln/<SOW id>/`. The anon key can only insert there, never read or list. File paths are
stored in each submission's `full_state.roster[].files`.
The talent roster step (`#s3`) is hidden for now as a fill-in-later item; remove its
`hidden` attribute and restore its TOC link to bring it back.

Unlisted SSR routes for the activated-retail tools (see [Activated-retail tools](#activated-retail-tools-admin)):
`/admin/*` (password-protected), `/x/$slug` (published endcaps) and `/api/ar/*`, plus
`/shelf` and `/shelf/$slug` (see [Creator Merch Shelf](#creator-merch-shelf-shelf)).
The Media Library (see [Media Library](#media-library-adminmedia)) adds `/admin/media`,
`/api/media/*` and the public file URLs `/m/<id>/<filename>`.

Tech stack slugs live in `src/lib/tech-stacks.ts`. **Adding one means adding its URL
to `public/sitemap.xml`** — the sitemap is static and does not generate itself.

## Homepage hero (`/`)

The hero simulates pointing a real phone at a product (image-target AR, like
`/activated-merch/`). Code: `src/components/home/ar-stage.ts` (plain three.js, lazy
loaded), `hero-slides.ts` (the pieces) and `Hero.tsx` (copy, tabs, and the DOM layer
laid over the phone's screen: drag handle, hints, the piece's button, joystick, reward card).

- The visitor drags the phone (or taps where it should go, or presses the Scan button
  in the tab bar). A piece only comes alive while the phone is over it; move it away and
  the experience stops.
- Nobody touching it: the phone glides over the piece by itself, plays it, then the tour
  moves on. Any drag, tap or joystick input pauses the tour for 10 s.
- Apparel and Print play the design's AR video on the phone. Game (the EVADE charms):
  Bobo and 3 cola cans pop out, the joystick on the phone steers Bobo, cans disappear when
  collected, and after 3 a "Digital reward unlocked" card with Claim (links to `/evade/`).
- Reduced motion: no tour and no video (stills); the phone moves only when the visitor
  moves it, and snaps instead of gliding.
- Debug: `?debug` exposes `window.__ar`, `?fast` speeds up the clock (headless capture),
  `?slide=N` picks the first piece.
- Posters `public/home/hero-poster-{wide,tall}.webp` are the first paint and the WebGL
  fallback: regenerate them when the pieces or layout change.

**Parked: the Retail piece.** An EVADE in-store sign that pops out a mini EVADE retail
display. It was taken out of the hero (Nov 2026) but everything is kept for later use:
`RETAIL_SLIDE` in `hero-slides.ts`, the `DisplayPop` class in `ar-stage.ts`, and the
assets `public/home/ar/evade-sign.webp` (the sign texture) and
`public/home/ar/evade-display.glb` (the EVADE fixture from the activated-retail demo,
compressed, with the channel letters removed). To bring it back, add `RETAIL_SLIDE` to
`HERO_SLIDES`.

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

### Live demos (`/admin/demos`)

Change the guided tour of the two live demos (`/roblox/activated-retail/`,
`/monkey-quest/activated-retail/`) without a code change: for each stop, its title, its text,
whether it highlights View in AR, and whether it is shown at all.

1. Pick the demo, edit the stops. Edits save as a draft automatically. A field left empty (or
   "Reset") uses the page's own copy.
2. **Preview** opens the real demo with `?draft=1`: it shows your draft (with a "Draft preview"
   badge) only because you are signed in; everyone else still gets the published copy.
3. **Publish** puts the draft live for clients within seconds (the CDN cache is purged).
   **⋯ → Unpublish changes** puts back the tour written into the page; the draft stays.

How it works: the pages keep their tour inline, and each stop has a stable `id`. At load they
fetch `GET /api/ar/demo-content/<demo>` (only what differs from the page) and apply it from the
next tour card. Nothing waits for it, and any failure leaves the page's own copy. The camera,
theme and dashboard of each stop stay as built. Overrides are stored in the `content` Blobs
store (`src/lib/ar/demo-content*.ts`); product copy can join the same document later.

If you edit a tour in the page itself, update `src/lib/ar/demo-tours.ts` to match (it is the
copy the admin shows as the default) and run `npm run check:demo-tours`.

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

---

## Creator Merch Shelf (`/shelf`)

A 3D merch shop made for one creator: a lit product shelf with their name in neon, their logo
printed on every product (a small chest mark on apparel, a big back panel), click-to-inspect,
a cart, and the activation flow, meaning what a fan sees when they scan the merch (AR, a 3D
model, a video, a mini-game or a reward). The products mirror the activated lineup on
shop.medialife.ai. It's a pitch tool: the team and agency partners like Snowday Media send a
creator a link to _their_ shelf in an outreach email, and the "Make this real" button leads to
the Creator Hub application.

### Three ways to configure a shelf

Every shelf is a `ShelfConfig` (`src/lib/shelf/config.ts`, the contract for both sides).

1. **Published:** `/shelf/<slug>`, made in `/admin/shelves`. The SSR route injects the config
   into the page as `window.__SHELF` (and the slug as `window.__SHELF_SLUG`).
2. **Quick link:** `/shelf?name=PixelPine&neon=8fd8ff&invite=snowday`. No admin needed; anything
   not given comes from the default shelf (`public/merch-shelf/default.json`).
3. **In the page:** a visitor drops in their own logo, renames the sign, picks colours. It stays
   in their browser and is never uploaded.

Quick-link parameters (`QUICK_LINK_PARAMS` in `src/lib/shelf/shelves.ts`): `name` (the sign,
≤ 28 characters), `handle`, `neon` and `accent` (hex without `#`), `shelf` (walnut, black,
white, maple), `backdrop` (midnight, sunset, arcade, snow), `logo` (a site path or https URL),
`for` ("Prepared for …"), `by` ("Presented by …", text only), `invite` (a Creator Hub invite
code), `audience` (the estimator's starting audience) and `products` (types to show, in order,
e.g. `tee,hoodie,cap`). The Quick link panel on `/admin/shelves` builds one for you.

### Making and publishing a shelf (`/admin/shelves`)

**New shelf** asks for the creator's name (on the sign), a label for the team and the link, and
starts from the default shelf or a copy of another. The editor has Creator (sign, handle, logo
from the asset library), Theme (presets including Snowday's icy blue, neon and accent colours,
shelf finish, backdrop), Products (on/off, order, name, type, price, colour, front and back
prints, blurb and what happens when a fan scans it) and Pitch ("Prepared for", "Presented by",
the invite code, the earnings estimator, and the link and label). The invite code is checked
against the Creator Hub invites: an unknown code is only a warning. "Presented by" is text only,
e.g. "Snowday Media × MEDIALIFE"; never put a partner's logo on a shelf.

The right half is the real page (`/merch-shelf/index.html?preview=1`) in a same-origin iframe,
updated on every change over `postMessage` (`ShelfPreviewMessage` in `config.ts`). Drafts
autosave; a draft with a problem (an empty sign, say) isn't saved until it's fixed, and the
preview keeps the last valid version. **Open draft** shows `/shelf/<slug>?draft=1`, which only
signed-in admins see; it is never cached.

**Publish** asks the preview for a 1200×630 snapshot of the hero view, uploads it to the asset
library and publishes. That image is the `og:image`: the link preview in email, Discord, Slack
and iMessage, with the title "<name>'s activated merch · MEDIALIFE". If the preview can't send
one, the shelf still publishes and previews use the site card. Publishing purges the CDN cache
for `/shelf/<slug>` (cache tag `shelf-<slug>`), so changes are live at once. The link can change
until the first publish. **Unpublish** makes the link show "This shelf isn't available" (as
does any unknown slug); the draft stays.

### Personal links and analytics

A published shelf is a demo called `shelf:<slug>`, and quick links are the built-in demo
`merch-shelf`. Both are listed under "Merch shelves" when you make a personal link in
`/admin/links` (or from the shelf's **Create personal link**) and in the Analytics demo filter.
A personal link is `/shelf/<slug>?c=<code>`; for a quick link, add `&c=<code>` to its URL. The
page reports to the same first-party analytics as the endcaps (`ARTrack.init({ demo })`), with
three shelf events on top of the usual product, cart and activation ones: `shelf_customize`,
`estimator_use` and `apply_open`.

### Files

- `public/merch-shelf/`: the page (static, plain JS, three.js). `default.json` mirrors
  `DEFAULT_SHELF`; `npm run check:shelf` checks they agree (`-- --write` regenerates it).
- `src/lib/shelf/config.ts` (contract), `shelves.ts` (slugs, quick links, presets),
  `shelves.server.ts` (storage: the `ar-shelves-<namespace>` Blobs store, one record per slug
  with the draft, the published copy and the snapshot), `shelves.functions.ts` (admin server
  functions), `page.server.ts` (serving the page with the config and preview tags injected).
- `src/routes/shelf.index.ts` (`/shelf`), `shelf.$slug.ts` (`/shelf/<slug>`),
  `admin.shelves*.tsx` and `src/components/admin/shelves/` (the admin).
- Slugs: 2–40 lowercase letters, numbers and dashes, unique; words like `admin`, `new` or
  `preview` are reserved. `/shelf` and `/merch-shelf` are unlisted (robots.txt,
  `x-robots-tag`, `src/server.ts` and `netlify.toml`).

---

## Creator Hub (`/creator-hub`)

The creator side of the Activated Merchandise Program. Creators (YouTube, Twitch, TikTok,
X, Kick…) apply, and MEDIALIFE designs, produces, fulfils and sells activated merch with
them. The hub shows every product's progress through the pipeline, the immersive
experience it unlocks, its triggers (QR, NFC, activation link) and launch collateral, and
the orders and earnings it brings in. Built for general creators; the Roblox portal under
`/roblox/portal` stays as it is.

| URL | What it is |
| --- | --- |
| `/creator-hub` | Public landing page (in the sitemap). `?invite=<code>` carries an agency invite through to sign-up |
| `/creator-hub/join`, `/sign-in`, `/forgot-password`, `/reset-password`, `/verify-email`, `/terms` | Accounts |
| `/creator-hub/onboarding` | The application (intake): profile, channels, Discord and contacts, products, review |
| `/creator-hub/dashboard`, `/products`, `/products/:id`, `/artwork`, `/experiences`, `/launch-kit`, `/earnings`, `/account` | The creator dashboard |
| `/admin/creators`, `/admin/creators/:id` | The team side: applications, terms, products and stages, proofs, experiences, files, orders, payouts, invite links |
| `/creator-hub/live`, `/overlay/<token>` | Live Drop: the stream overlay and its setup page (below) |
| `/go/<code>` | The activation link a product's QR encodes and its NFC tag opens. Counts the scan, then redirects to the experience |

Everything under `/creator-hub/` except the landing page, and `/go/`, is `noindex`
(`src/server.ts`, `public/robots.txt`).

### How it fits together

```
src/lib/hub/model.ts            types, catalogue (SKUS), pipeline (STAGES), earnings maths — client-safe
src/lib/hub/store.server.ts     Netlify Blobs stores hub-<ns> (records) and hub-files-<ns> (file chunks)
src/lib/hub/auth.server.ts      scrypt passwords, sessions, one-time tokens, rate limits
src/lib/hub/discord.server.ts   "Continue with Discord" (sign in / sign up / connect)
src/lib/hub/mail.server.ts      transactional email (Resend)
src/lib/hub/data.server.ts      repositories: creators, products, experiences, files, orders, activity…
src/lib/hub/files.server.ts     private chunked uploads (artwork, proofs, collateral)
src/lib/hub/commerce.server.ts  Shopify webhooks and generic order ingest → per-creator orders
src/lib/hub/*.functions.ts      server functions the pages call (auth, creator, admin)
src/lib/hub/sample.server.ts    a complete sample creator for previews and localhost
```

Storage follows the activated-retail tools: Netlify Blobs, no database, namespaced by host
(`prod` / `preview` / `dev`, with `dev` on local files under `.data/ar/`), so testing on a
deploy preview never touches a real creator.

**Accounts.** Email + password (scrypt N=2¹⁶), optional Discord sign-in, email
verification and password reset by one-time links (hashed at rest; reset links last an
hour and end every other session). Sessions are server-side records behind a signed,
HttpOnly cookie. Sign-in and email sending are rate-limited. Emailed links use a pinned
origin, never the request's Host header.

**The pipeline.** Every product moves through Brief → Artwork → Design approval → Sample →
Production → Shipping → Live (`STAGES`). The team moves it in the admin; a creator approving
a proof moves it from Design approval to Sample. Each product carries "waiting on" (creator
or MEDIALIFE) and a next step, which is what the creator's dashboard leads with.

**Money.** A creator earns `revenueShare` (set per creator, overridable per product) of
**net merchandise revenue**: unit price × quantity, less discounts and refunds, never tax or
shipping. Each order line keeps the share in force when it was sold. Earnings are "pending"
for `HUB.holdDays` (30) days — the returns window — then "available" until a payout is
recorded. All amounts are stored in cents. `npm run test:hub` checks this maths and the
Shopify normalisation.

**Orders in.** An order line is matched to a product by Shopify product id or by SKU (both
set on the product in the admin; a product id or SKU can belong to only one product). One
order with several creators' products is split per creator. Orders are keyed by source and
external id, so a re-delivered or updated webhook overwrites rather than double-counts.
Lines that match nothing are listed under **Unmatched orders** in `/admin/creators`. No buyer
names, emails or addresses are stored — only the country.

**Triggers.** Each product gets a short code at creation. Print the QR (or program the NFC
tag) with `https://medialife.ai/go/<code>`, never the experience URL itself: the experience
can then be rebuilt or swapped without reprinting, and every scan is counted. Link-preview
bots aren't counted.

**Files** are private (the creator and the team only), uploaded in 4 MB chunks up to 50 MB,
checked by magic bytes, and served with `nosniff` and a sandbox CSP.

### Configuration (Netlify env vars)

| Variable | Needed for |
| --- | --- |
| `HUB_SESSION_SECRET` | Signing creator sessions (≥16 chars; falls back to `AR_SESSION_SECRET`). **Production refuses sign-in without one.** |
| `RESEND_API_KEY`, `HUB_EMAIL_FROM` | Verification, password-reset and notification emails. Verify the sender domain in Resend. Without it, previews and localhost show the link on screen instead; production tells the creator to contact support |
| `HUB_TEAM_EMAIL` | Where new applications and proof decisions are announced |
| `SHOPIFY_WEBHOOK_SECRET` | The Shopify order webhook (below) |
| `HUB_INGEST_KEY` | `POST /api/hub/orders` for other channels (≥24 chars) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | "Continue with Discord". Register `<origin>/api/hub/auth/discord/callback` as a redirect URL for each environment |
| `AR_ADMIN_PASSWORD` | The existing shared password for `/admin`, which now includes Creators |

### Shopify

In Shopify admin → Settings → Notifications → Webhooks, create **Order payment**
(`orders/paid`), **Order update** (`orders/updated`) and **Order cancellation**
(`orders/cancelled`) webhooks, format JSON, URL `https://medialife.ai/api/hub/webhooks/shopify`,
and put the signing secret shown there in `SHOPIFY_WEBHOOK_SECRET`. Then, for each creator
product in `/admin/creators`, add its Shopify product id (the number in the product's admin
URL) or its variant SKUs. Refunds arrive through `orders/updated`.

### Other channels

```http
POST /api/hub/orders
Authorization: Bearer <HUB_INGEST_KEY>
Content-Type: application/json

{ "channel": "TikTok Shop", "externalId": "5761234", "number": "TT-5761234",
  "createdAt": "2026-10-09T15:04:00Z", "currency": "USD", "country": "US",
  "lines": [{ "sku": "PIXELPINE-TEE-M", "qty": 1, "unitPrice": 3900, "discount": 0 }] }
```

Prices are in cents. Send the same `channel` + `externalId` again to update an order
(refunds: `refunded`, `refundedQty` per line; `status`). Channels with no integration at all
can be entered by hand in the creator's **Orders & payouts** tab.

### Agency partners and invite links

`/admin/creators` → Invite links. A link (`/creator-hub/join?invite=<code>`) tags every creator
who signs up through it with the agency and the rep who sent it, so the team can filter by
agency and the agency's sales team can onboard their roster without forms or email chains.

### Live Drop (stream overlay)

`/creator-hub/live` (Go live) sets up a browser source creators add to OBS, Streamlabs or TikTok
LIVE Studio: a sales goal that fills as orders land, an alert for every order ("Someone in 🇨🇦
Canada just grabbed 2× Hidden Grove Tee"), the QR viewers scan, and a celebration when the goal
is hit. The page previews the overlay over a stand-in stream, sends test alerts, restarts the
goal and regenerates the link.

- The overlay is `/overlay/<token>`; OBS has no cookies, so the secret token is the credential.
  Regenerating it kills the old URL. Its feed (`/api/hub/overlay/<token>`, polled every 5 s)
  carries product names, quantities, buyer **country** and totals — never names or order numbers,
  and revenue only if the creator turns it on. A switched-off overlay renders nothing; an expired
  link says so.
- Built for OBS's embedded Chromium: transparent page, hex/rgba colours (no oklch), one canvas
  particle engine, no growth over hours. `?bg=1` previews it over a sample scene; `?scale=0.5–2`.
- Code: `src/lib/hub/overlay.*`, `src/routes/overlay.$token.tsx`, `src/components/hub/overlay/`.

### Trying it

On a deploy preview or localhost, `/admin/creators` → **Load sample creator** creates a
complete creator (products at several stages, a proof awaiting approval, a live experience,
collateral, two months of orders, scans and a payout) and shows its sign-in. Production
refuses it.

## EVADE UGC Hub (`/ugc-hub`, `/admin/ugc`)

A workspace for accepted EVADE UGC creators (brief, assets, package tracking, uploads, review,
perks) and its admin side. Sign-ups come from the Netlify form `evade-ugc-creator` on
`/evade/creators/` (admin "Sync from Netlify Forms", or a CSV export). Creators sign in by magic
link (`ugc_session` cookie, separate from the Creator Hub). Uploads use the Creator Hub's 4 MB
chunk pipeline on Netlify Blobs behind a storage adapter (2 GB per file, 5 GB per creator).
Server, data model, endpoints, env vars and local sample data: `src/lib/ugc/README.md`.
Tests: `npm run test:ugc`.

## Media Library (`/admin/media`)

The site-wide home for video, images, audio, 3D (GLB, glTF, USDZ), PDFs, ZIPs, fonts and
JSON / CSV / TXT files, for the site and for clients. Admin only (the `/admin` password).
There's no cap on file count or total storage. Files go up through the same resumable 4 MB
chunk pipeline as the Creator Hub, up to 5 GB each, and a gentle warning above 1 GB suggests
a 1080p web export.

- **Upload**: drop files anywhere on the page or choose them. Before sending, set the client
  / property, collection, purpose, tags, rights, AI flag and visibility once for the batch.
  The queue shows per-file progress with pause, resume, retry and cancel. An upload cut off by
  a reload resumes when the same file is added again. Poster frames, duration, dimensions,
  thumbnails and average colour are worked out in the browser (no server ffmpeg). The server
  sniffs the first bytes, so a file whose content doesn't match its type is refused.
- **Organise**: kind tabs, search (title, file name, tags, description, client, collection,
  notes, rights), filters (client, collection, purpose, visibility, AI-generated,
  orientation, tags), sort, grid or list. Multi-select (shift-click for a range) gives bulk
  tag add/remove, move (client / collection), public / private, AI flag and delete (with a
  confirm). The detail drawer has the preview, every field, *Copy URL*, *Copy embed* and
  *Download*. 3D previews use the vendored three.js viewer (`/hub-viewer/`); USDZ is
  download-only.
- **Private by default.** Private files are served from `/api/media/files/<id>`, which needs
  the admin session or the API token. Switching **Public** on gives a stable, cacheable,
  Range-capable URL, `/m/<id>/<filename>`, that any page can embed. The CDN may keep serving
  it for up to an hour after you switch it off. Every file is served with `nosniff` and a
  sandbox CSP (PDFs aside, so they can render), so an SVG or text file can never run script
  on medialife.ai. Anything that isn't safe to show inline downloads as an attachment.
- **Clients and AI**: the `aiGenerated` flag is filterable everywhere. EVADE assets carry a
  `clientPolicy`: EVADE forbids image-to-image and image-to-3D generation from its assets,
  so never feed them to a generative model as a reference.

Code: `src/lib/media/` (model, storage interface, uploads, catalogue, admin functions, dev
seed), `src/components/media/` (page, upload queue, drawer), `src/routes/admin.media.tsx`,
`src/routes/api.media.*`, `src/routes/m.$id.$filename.ts`. Bytes live in their own Netlify
Blobs stores, `media-<ns>` (records) and `media-files-<ns>` (chunks and thumbnails), where
`<ns>` is `prod`, `preview` or `dev`. Storage sits behind `MediaStorage` in
`storage.server.ts`, so R2 can be swapped in later (`MEDIA_STORAGE=r2`, not built yet).
Tests: `npm run test:media` (also part of `npm run test:hub`).

### Configuration (Netlify env vars)

| Variable | What it does |
| --- | --- |
| `AR_ADMIN_PASSWORD` | The `/admin` password; the session cookie covers the whole library. |
| `MEDIA_API_TOKEN` | Read-only bearer token for agents, 24+ random characters (`openssl rand -hex 24`). Unset means only a signed-in admin can read the catalogue. It can never upload, edit or delete: writes answer 403. |
| `MEDIA_STORAGE` | `blobs` (default). `r2` is reserved for the future adapter. |

### Querying it from an agent

Two read-only endpoints return the whole catalogue. Without the admin cookie or the
bearer token they answer 401.

- `GET /api/media/index.json`: JSON. Each record has `id`, `title`, `filename`, `type`,
  `mime`, `size`, `width`, `height`, `aspect`, `orientation`, `durationSeconds`, `tags`,
  `collection`, `client`, `clientPolicy`, `purpose`, `description`, `altText`,
  `usageNotes`, `rights`, `aiGenerated`, `public`, `publicUrl` (null when private),
  `embedHtml`, `downloadUrl`, `thumbnailUrl`, `color`, `uploader`, `createdAt` and
  `updatedAt`. The page also carries `facets`, paging (`total`, `nextOffset`,
  `links.next`) and `howToQuery`.
- `GET /api/media/llms.txt`: the same catalogue as Markdown, for pasting into a prompt.

Both take the same filters:

| Param | Meaning |
| --- | --- |
| `q` | Words, all of which must appear (title, file name, tags, description, client, collection, notes, rights). |
| `tags` | A comma list (or repeat `tag=`). Every tag must be on the file. |
| `type` | `video`, `image`, `audio`, `model` (or `3d`), `document` (or `pdf`), `archive` (or `zip`), `font`, `data`, or a MIME type. |
| `client` / `property` | Exact client or property, case-insensitive. |
| `collection` | Exact collection, case-insensitive. |
| `purpose` | `marketing`, `gameplay`, `product-shot`, `logo-brand`, `ugc`, `3d-model`, `audio`, `doc`, `other`. |
| `public` / `ai` | `true` or `false`. |
| `orientation` | `landscape`, `portrait` or `square`. |
| `sort` | `relevance`, `new`, `old`, `updated`, `title`, `size`, `duration`. |
| `limit` / `offset` | Paging: 500 a page by default, up to 5000. |

```sh
# Every EVADE gameplay video, as JSON
curl -H "Authorization: Bearer $MEDIA_API_TOKEN" \
  "https://medialife.ai/api/media/index.json?client=EVADE&type=video&tags=gameplay"

# Public marketing images, as Markdown for an LLM
curl -H "Authorization: Bearer $MEDIA_API_TOKEN" \
  "https://medialife.ai/api/media/llms.txt?type=image&purpose=marketing&public=true"

# Download a private file (Range works too)
curl -H "Authorization: Bearer $MEDIA_API_TOKEN" -OJ \
  "https://medialife.ai/api/media/files/<id>?download=1"
```

On web pages, use `publicUrl` (or `embedHtml`). It needs no auth and caches well. A private
file has `publicUrl: null`, so ask an admin to make it public rather than embedding
`downloadUrl`. Always respect `rights`, `usageNotes` and `clientPolicy`.

### Local sample data

On localhost and deploy previews the empty library offers **Load sample data**, which
imports real repo art: EVADE creator images, keychain sources, the portal key art, the
activated-retail GLBs and two labelled SAMPLE video clips. Or run
`curl -X POST -H "x-media: 1" -b <admin cookie> http://localhost:5175/api/media/dev/seed`
(add `?reset=1` to reload it). Production refuses it.

## Where is Bobo? (`/evade/where-is-bobo/`)

EVADE's public 3D globe: Bobo walks on a cartoon planet with raised continents (a colour per country, snow caps, gold for countries he's visited), every city he's been seen in is a
hotspot, and tapping one flies the camera there and raises a holographic beam playing that
place's video or photo. Also: a trip replay (oldest sighting first, arcs drawn between
cities), a live ticker of keychain scans and plays, a sightings list, share links
(`?at=<place>`), and a "Play Cola Run" call to action. Short links: `/where-is-bobo`, `/bobo`.

**Launch sightings.** The two real clips in the repo, Bobo at the Golden Gate (San Francisco)
and Bobo at RDC (San Jose), are added to the Media Library automatically the first time the
feed is requested on any deploy, production included (`src/lib/bobo/launch.server.ts`).
They're ordinary files after that: edit, unpublish or delete them in `/admin/media`, and a
marker stops them coming back.

**Landmarks.** When a place's venue (or city) names a famous landmark, a chunky toon 3D
model of it pops out of the ground beside Bobo while the hologram plays, placed so it never
covers Bobo or the video. Built procedurally in `assets/js/landmarks.js` (no generated
assets): Golden Gate Bridge, Eiffel Tower, Big Ben, Tokyo Tower, Sydney Opera House,
Statue of Liberty. Add one by writing a builder and a regex in its `CATALOG`.

**Sound and haptics.** Tiny Web Audio sounds (no files) for taps, hovers, picking a place,
the camera whoosh, the hologram arriving, a landmark popping, tapping Bobo, live scans and
the summon fanfare, plus short vibrations on Android (iOS Safari has no vibration API).
Nothing plays before the first tap; the speaker button in the header mutes both, remembered
per device (`assets/js/sfx.js`).

**"Bring Bobo to me".** The hero button spins the globe to the visitor's city, fires a pink
beacon from the ground, draws an arc from Bobo's latest sighting, and Bobo runs over to a
confetti burst and a shareable "Bobo ran 8,616 km to London!" toast. The city comes from
`GET /api/bobo/near` (Netlify's IP geolocation, snapped to the nearest big city, no prompt);
if that's unknown the browser's location prompt is the fallback, and `?lat=&lng=` on the
same endpoint names the nearest city. Nothing is stored. It's a moment for the visitor
only: it doesn't add a pin (a real keychain scan does).

**Where the pins come from.** Any Media Library video or image that has a location, the
**Public** link on and **Show on the globe** switched on. Set all three in the file drawer
(*Where was this?*: city search, optional venue, date seen). The library filter *Where is
Bobo?* lists what's on the globe, tagged, or untagged. Unpublishing a file takes it off the
globe within a minute or so (the feed's CDN cache).

**3D stack.** Vanilla three.js (the vendored r180 under `/roblox/creators/vendor/three/`),
no framework and no post-processing, so the page ships ~85 KB of its own JS (uncompressed) and runs on
mid-range phones: glows are additive shaders, the pixel ratio adapts to the frame rate, and
rendering pauses in a background tab. React Three Fiber / Drei were considered; they'd add a
React runtime and a build step to a standalone landing page for no visual gain. Without
WebGL (or with reduced motion) the page falls back to the sightings list. Bobo is the same
`catbobo.glb` + `bobo-clips.glb` as the retail displays (walk, run, idle, sit, sleep).

Files: `public/evade/where-is-bobo/` (page, `assets/js/globe.js` scene, `bobo.js`
character, `holo.js` hologram, `landmarks.js`, `sfx.js` sounds, `main.js` UI), `src/lib/bobo/` (locations, feed, events,
geo lookup, preview sample), `src/routes/api.bobo.*`, the drawer section in
`src/components/media/globe-location.tsx`.

### The AR experience → globe contract

Everything the game sends shows up on the next feed refresh (the page polls every 45 s).

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /api/bobo/feed.json` | Anyone (CORS `*`) | Places with their media, the journey order, recent events, totals. Cached 15 s in browsers, 60 s at the edge. |
| `POST /api/bobo/events` | Game server (bearer token) or the game in a browser (allowed `Origin`) | One event `{type, …}` or `{events: [...]}` (max 50). |
| `POST /api/media/uploads` + chunks + `complete` | Game server (bearer token) | A player capture (video or image) into the Media Library. |
| `GET /api/bobo/places?q=` | Admin or bearer token | City search (the drawer's picker). |
| `GET /api/bobo/near` | The page | The visitor's approximate city for "Bring Bobo to me" (never cached or stored). |

Event fields: `type` (`scan`, `play`, `reward`, `sighting`, `share`, `capture`, `custom`),
`at` (ISO or ms, clamped to the last 7 days), `lat`/`lng` or `city`+`countryCode`,
`source` (`cola-run`), `sessionId` (hashed before storage), `mediaId`, `props` (≤ 20 flat
values). With the token, coordinates are trusted and kept exact; from a browser they're
rounded to ~5 km, rate limited (120/min per IP) and, when missing, filled from Netlify's IP
geolocation. The public feed never carries more than a city.

```sh
curl -X POST https://medialife.ai/api/bobo/events \
  -H "Authorization: Bearer $BOBO_INGEST_TOKEN" -H "content-type: application/json" \
  -d '{"type":"scan","lat":6.45,"lng":3.39,"source":"ar-keychain"}'
```

Captures: `POST /api/media/uploads` with the bearer token and `{name, size, mime,
location: {lat, lng, place?, seenAt?}, source, title?, description?}`, then `PUT` each
chunk to `/api/media/uploads/<id>/chunks/<n>` (`chunkSize` from the reply) and `POST
/api/media/uploads/<id>/complete`. Ingested files are images or videos ≤ 512 MB, land
**private** in collection *Where is Bobo · AR captures* tagged `AR capture`, `Needs review`,
with *Show on the globe* already on: one Public switch in the drawer after review puts them
live. The token can only touch uploads it started, for 24 hours.

### Clips straight from the game (record button)

The Cola Run record button (`mattercraft/cola-run/`, test lab at
`/evade/cola-run-lab/`) uploads from the player's phone, where no secret can be
kept, so the upload API also accepts an allowed browser **Origin**
(`BOBO_INGEST_ORIGINS`, the site itself, localhost on dev) in place of the
token, with tighter rules: videos and images only, 80 MB max, 8 uploads per
visitor per 10 minutes, city from the visitor's IP (or coordinates rounded to
~5 km), title and description only (everything else is fixed), and a one-time
`captureKey` from init that every later call for that upload must send as
`x-capture-key`. Clips land private and *Needs review* like token captures,
plus a *Web capture* tag. `BOBO_WEB_CAPTURES=off` turns this path off.
Code: `src/lib/bobo/captures.server.ts`.

On the globe a clip shows straight away as an **In review** pin at its city
(the feed carries city, time and length only, never the file). Init also
returns a read-only `viewKey`; the record button's "See it on the globe" link
(`/evade/where-is-bobo/?clip=<id>#k=<viewKey>`, key in the fragment) lets the
player watch their own clip there through `GET /api/bobo/clips/<id>?k=…`
(JSON, `as=file`, `as=poster`; 30 days). New clips beam in on every open
globe within ~15 s: the page polls, and the feed's CDN copy (tag `bobo-feed`)
is purged when a clip lands or the team changes globe media. The media
drawer's **Approve for the globe** makes it public (and removes *Needs
review*); **Keep it off the globe** hides the pin.

### Configuration (Netlify env vars)

| Variable | What it does |
| --- | --- |
| `BOBO_INGEST_TOKEN` | Bearer token for the AR game's server, 24+ random characters (`openssl rand -hex 24`). Unset: only allowed browser origins can post events, and nothing can upload captures. |
| `BOBO_INGEST_ORIGINS` | Comma list of browser origins allowed to post events (and upload record-button clips) without the token. Default: `https://evade.medialife.ai,https://medialife.ai`. Add the published AR experience's origin here. |
| `BOBO_WEB_CAPTURES` | `off` stops browsers uploading clips (events still work). Default: on. |
| `BOBO_CAPTURE_REVIEW` | `off` publishes game clips straight to the globe without review (tagged *Auto-published*). For a supervised event or demo only; players are often under 18. Default: on. |

Preview and dev deploys can load sample sightings (made-up places, using the other
committed Bobo clips) with `POST /api/bobo/dev/seed` while signed in; production refuses it.
City data: GeoNames (CC BY 4.0) and Natural Earth via `world-atlas`, rebuilt with
`node scripts/build-bobo-geo.mjs` into `src/lib/bobo/*.json`, `assets/data/globe.bin`
(dots, outlines) and `assets/data/land.bin` (the raised continent mesh, ~240 KB).
