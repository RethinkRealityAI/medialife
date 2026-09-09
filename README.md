# MEDIALIFE™ Virtual Business Cards

Unlisted, mobile-first contact pages for MEDIALIFE team members. Each card lives at `/c/<slug>/`, is
never linked from the main site, carries `noindex` headers, and is reached by scanning the printed /
on-screen QR code.

What a visitor gets in one tap:

- **Save to Contacts** — a `.vcf` with name, title, company, mobile, email, LinkedIn, Instagram,
  WhatsApp and an embedded photo (opens straight into iOS / Android Contacts).
- **WhatsApp** (pre-filled opener), **LinkedIn**, **Instagram** (@medialife.ai), **Email**, **Call**, **Website**.
- **Branded QR** (tap to enlarge into a bright, high-contrast scan mode that keeps the screen awake).
- **Share card** via the native share sheet, or copy the link.

## Adding a team member

1. Create `team/<slug>.json` (copy `team/dapo.json`).
2. Drop a `portrait.webp` (transparent cut-out, ~900px wide) and a square `avatar.jpg` (~320px, used in the
   vCard and link previews) into `team/<slug>/`.
3. Run the build:

```bash
npm install
npm run build
```

This writes `c/<slug>/` with `index.html`, `qr.svg`, `<slug>.vcf`, and the images. Commit the output —
the site is fully static and needs no build step on the host.

`cardUrl` in the JSON must be the final public URL of the page; it is what the QR code encodes. If the
host or path changes, update it and rebuild.

## Local preview

```bash
npm run preview   # serves the repo at http://localhost:4173 → open /c/dapo/
```

## Structure

```
team/<slug>.json          member data (single source of truth)
team/<slug>/              source images
scripts/build-cards.mjs   generator (QR, vCard, page)
scripts/templates/card.html
c/_shared/                card.css, card.js, brand assets
c/<slug>/                 generated, deployable card
netlify.toml              noindex + vCard headers (adapt for other hosts)
robots.txt                disallows /c/
```

## Design

Follows medialife.ai tokens: `#020202` background, Space Grotesk / JetBrains Mono, and the "ember"
gradient (`#19affe → #ff37ae`) as the accent. Motion respects `prefers-reduced-motion`.
