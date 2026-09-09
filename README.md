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
