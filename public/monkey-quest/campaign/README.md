# Monkey Quest, Activated (title campaign proposal)

`/monkey-quest/campaign/` (short link `/monkey-quest-campaign`): an unlisted proposal page for Toei Animation,
pitching activated merch, an activated pop-up tour and the Monkey Quest Hub as the title campaign for the 2027
film. Unlisted like the rest of `/monkey-quest/*` (X-Robots-Tag noindex in netlify.toml, robots Disallow).

## Files

- `index.html`, `mq.css`, `mq.js`: the page (static, no framework). Flat colours only.
- `mq3d.js`: the 3D hero (real logo + pin from `/monkey-quest/hub/models/`) and the "1 Pin, 2 Experiences" stage.
  The stage runs the Hub's two modes in the browser: the pin hangs on a keychain (drag to swing), Spray the Pin
  uses the Hub's own GPU painter (`/monkey-quest/hub/paint.js`), Launch It drops it on a floor (tap to hop,
  tap the logo to spin). `window.__mqc` exposes test hooks (`setMode`, `sprayAt`, `hop`, `spinLogo`).
- `assets/hub-*.webp`: real screens of the live Hub, captured in the headless camera simulator.
- The pop-up section loads the activated-retail engine on demand with
  `/activated-retail/templates/monkey-quest-popup.json` (pop-up shop + convention venues, film theme first,
  pop-up copy instead of the Walmart endcap copy in `monkey-quest.json`).
- Case-study media is reused from `/anpanman/assets/` and `/evade/img/`.

## Open points

- Pricing tiers ($35K / $75K / $140K) are a proposal to confirm with Dapo.
- Release date is not announced (2027), so the countdown uses phases, not dates.
