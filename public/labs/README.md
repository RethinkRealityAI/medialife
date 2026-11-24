# MEDIALIFE Labs catalogue

`/labs/` (noindex, unlisted) renders whatever `catalog.json` holds. To add an experience, add **one object** to the
array in `catalog.json`, put a 640px-wide WebP thumbnail in `img/<slug>.webp`, and you're done: search, filter chips,
counts, sections and jump links all update on their own. No HTML to edit.

Files: `index.html` (shell + shared site header), `labs.css`, `labs.js`, `catalog.json`, `img/`.

## Entry shape

```json
{
  "slug": "sakamoto-days",
  "title": "Sakamoto Days",
  "lead": "One sentence on what you do with it.",
  "url": "/labs/x/sakamoto-days/",
  "extraLinks": [{ "label": "Test picture", "url": "/labs/x/sakamoto-days/target/" }],
  "thumb": "/labs/img/sakamoto-days.webp",
  "alt": "What the thumbnail shows (optional, defaults to the title)",
  "client": "Netflix",
  "categories": ["anime", "streaming", "print", "capture"],
  "tech": ["image-target"],
  "status": "lab",
  "year": 2025,
  "featured": false,
  "tested": "not yet",
  "notes": ["Short warning pills, optional"],
  "source": "mattercraft/cola-run/ (optional, shown as 'Source:')"
}
```

Required: `slug` (unique), `title`, `url`. Everything else is optional but should be filled so filters work.
Extra link labels in use: "Test picture(s)", "Watch a phone recording", plus mode links ("Kiosk mode", "Graffiti mode").

## Allowed values

| field | values |
|---|---|
| `client` | EVADE, Netflix, Animebae, Brooklyn Nets, dentsu, Bushido, VVBG Comics, Sport Magazine, TBH, MEDIALIFE (a new client is fine: it gets its own chip automatically) |
| `categories` | anime, sports, gaming, comics, beverage, apparel, print, packaging, streaming, events, agency, showcase, tech-demo, collectibles, 3d-character, capture (photo & video), game, live-data |
| `tech` | image-target (Image target), world (Place in room), face (Face), sky (Sky), web-3d (Web 3D), mattercraft (Mattercraft), cms (Studio / CMS) |
| `status` | live (public), preview (shipped, not promoted), lab (test build / conversion), archive (past campaign, kept for reference) |
| `tested` | "phone" (run on a real phone), "simulator", "not yet" |
| `year` | number, e.g. 2025, 2026 |

`gaming` = gaming IP / gaming clients; `game` = the experience is a playable game.
`featured: true` puts the card in the Featured strip at the top (shown only with no filters on).

## Where a card appears

Each entry lands in one section, first match wins: `tech` has `mattercraft` -> Mattercraft tests; `categories` has
`tech-demo` -> Tech demos; then by client: EVADE, Netflix, Animebae, Sports (Brooklyn Nets, Sport Magazine),
MEDIALIFE originals, and everything else -> Brands & agencies. Edit `SECTIONS` in `labs.js` to add a client group.

## Shareable filters

URL params mirror the filters: `q`, `client`, `cat`, `tech`, `status`, `year`; comma-separate several values
(OR within a group, AND across groups), case-insensitive. Example: `/labs/?client=Netflix&cat=anime`,
`/labs/?tech=world,face&status=lab`.

House rules apply to thumbnails too: flat colours, no gradients, never an image with 8th Wall or Orygen logos.

## Client share pages (`/evade/labs/`)

`/evade/labs/` is the EVADE-only view of this catalogue, made to send to the EVADE team: no site nav, no links to
`/labs/` or other clients. It lists every entry with `"client": "EVADE"`, so a new EVADE card shows up there on its own.
An optional `share` field controls the client view:

- `"share": false` keeps an entry off the share page (team-only tools, superseded test builds).
- `"share": { ... }` overrides what the client sees: `title`, `lead`, `needs` (the "What you need" line, e.g.
  "The EVADE keychain"), `links` (replaces `extraLinks`), `start` (1, 2, 3… puts the card in "Start here" in that
  order) and `section` (`start`, `merch`, `room` (place in room and face), `screen`; otherwise picked from `tech`).

`notes`, `source` and `tested` never show there, and any link into `/labs/` is dropped. Write `share.lead` when the
normal lead mentions internal things (Mattercraft, test builds, engines).
