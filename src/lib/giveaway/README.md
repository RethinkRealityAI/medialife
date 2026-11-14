# Points giveaways

People enter with their email, confirm it from an emailed link, then complete tasks for
points. Every point is one ticket in a weighted, reproducible draw. The team builds and runs
campaigns in `/admin/giveaways`; the public page is `/giveaway/<slug>`.

## What's verified

| Task kind         | How                                                                                                                     | Verified                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Confirmed entry   | Emailed one-time link (double opt-in)                                                                                   | Yes                       |
| `newsletter`      | Unticked checkbox on the form or "Yes, sign me up"; counts once the email is confirmed; consent text + time kept (CASL) | Yes                       |
| Referral          | `?ref=<code>`; paid when the friend confirms; capped; same network/device is held (voided row) for review               | Yes                       |
| `discord`         | Discord OAuth (`identify guilds`), server id must be in their list; one Discord account per entry                       | Yes                       |
| `code`            | Code typed matches one of the campaign's codes (e.g. shown in Cola Run after the keychain scan)                         | Yes                       |
| `follow`, `visit` | Honour system: link must be opened 3s+ before "I did it"; follows need the handle; capped by `honourCap`                | No: check winners by hand |

## Files

| File                  | What                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `model.ts`            | Types, labels, eligibility, email folding, go-live checks. Client-safe.                                                |
| `draw.ts`             | Weighted draw without replacement (HMAC-SHA256 of a 32-byte seed), snapshot hash, skill-testing question. Client-safe. |
| `rules.ts`            | Generated official rules + the rules text parser. Client-safe.                                                         |
| `giveaway.server.ts`  | Campaigns, entrants, points ledger, sessions/links, tasks, referrals, flags, draw, CSV.                                |
| `public.functions.ts` | Server functions for the public pages.                                                                                 |
| `admin.functions.ts`  | Server functions for `/admin/giveaways` (admin cookie).                                                                |
| `discord.server.ts`   | Discord membership check; routes `src/routes/api.giveaway.discord*.ts`.                                                |
| `turnstile.server.ts` | Cloudflare Turnstile check on entry.                                                                                   |
| `store.server.ts`     | Blobs store `giveaway-<ns>` and its keys.                                                                              |

Tests: `npm run test:giveaway` (`scripts/hub-tests/giveaway.test.ts`).

## Environment (Netlify)

- `RESEND_API_KEY` (and `HUB_EMAIL_FROM`): confirm and winner emails. Without it, previews show
  the link on the page ("test mode") and production can't confirm entries.
- `HUB_SESSION_SECRET`: signs the `gw_session` cookie (already used by the hubs).
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: bot check on the entry form (optional but recommended).
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: the Creator Hub's Discord app; add the redirect URL
  `<origin>/api/giveaway/discord/callback` to it.

## Draw

Admin runs it from the Draw tab: one winner per prize unit + 5 alternates, from confirmed entries
with ≥1 point. Each draw stores its seed and the SHA-256 of the ticket snapshot ("id:tickets"
lines sorted by id), so `weightedDraw(seed, snapshot, n)` reproduces it. Forfeiting a winner
promotes the next waiting alternate. Each winner gets a generated skill-testing question.
