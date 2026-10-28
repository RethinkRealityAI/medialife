# EVADE UGC Hub: server + data contract

Everything the creator pages (`/ugc-hub/*`) and admin pages (`/admin/ugc/*`) need. The UI
calls only the server functions and HTTP endpoints below, and imports only the
client-safe modules (`model.ts`, `import.ts`, `upload-client.ts`, `media-client.ts`).
Never import a `*.server.ts` file from a component.

Product spec: `/mnt/project-files/evade-creators/ugc-hub-spec.md`. Not built on purpose:
licence signing and any age gate (both undecided; `UgcCreator.licence` and `ageBand` are
placeholders that stay null), Shopify discount APIs (codes are pasted in), Cloudflare R2
(see `storage.server.ts`).

## Files

| File | What |
| --- | --- |
| `model.ts` | Types, constants (`UGC`), labels, status pipeline, timeline/next-action helpers, URL builders. Client-safe. |
| `import.ts` | Form field mapping + CSV parse/format. Client-safe (the import page can preview a CSV). |
| `upload-client.ts` | `uploadUgcFile`, `UgcUploadTask` (pause/resume/cancel), `cancelUgcUpload`, `downloadUgcFile`. Browser only. |
| `media-client.ts` | `readUgcMedia` (poster JPEG + duration + size), `fingerprintUgcFile`. Browser only. |
| `auth.functions.ts` | Creator sign-in server functions. |
| `creator.functions.ts` | Creator server functions. |
| `admin.functions.ts` | Admin server functions. |
| `*.server.ts` | Storage, auth, logic. Server only. |
| `src/routes/api.ugc.*` | Upload/download HTTP endpoints and the dev seed. |

## Routes to create

Use the same structure as `creator-hub.*` (pathless `_app` layout with a `beforeLoad` guard) and
the existing `/admin` layout (which already enforces the admin password; add a "UGC" nav item
in `src/routes/admin.tsx` `GROUPS`). Paths are also in `UGC_ROUTES` in `model.ts`; server emails
link to them, so keep them exactly.

Creator (`/ugc-hub` is already `noindex` via `src/server.ts`; also add the robots meta):

| URL | Suggested file | Notes |
| --- | --- | --- |
| `/ugc-hub/sign-in` | `ugc-hub.sign-in.tsx` | Email field → `requestUgcSignInLink`. Accepts `?next=`. |
| `/ugc-hub/check-email` | `ugc-hub.check-email.tsx` | "Check your inbox". In dev, show the returned `devLink` as a button. |
| `/ugc-hub/auth?token=…` | `ugc-hub.auth.tsx` | Landing page of every emailed link (sign-in and join). Calls `consumeUgcLink` **from the browser** (button or `useEffect`), never in a loader, so email scanners that prefetch the link don't use it up. On ok → navigate to `next`; on error show message + email form. |
| `/ugc-hub` | `ugc-hub._app.tsx` (guard) + `ugc-hub._app.index.tsx` | Home. Guard: `getUgcSession()`; if `!signedIn` redirect to `/ugc-hub/sign-in?next=<path>`. |
| `/ugc-hub/brief` | `ugc-hub._app.brief.tsx` | |
| `/ugc-hub/assets` | `ugc-hub._app.assets.tsx` | |
| `/ugc-hub/upload` | `ugc-hub._app.upload.tsx` | Upload + My content (one screen). |
| `/ugc-hub/perks` | `ugc-hub._app.perks.tsx` | |
| `/ugc-hub/profile` | `ugc-hub._app.profile.tsx` | |

Admin (all under the existing `/admin` guard):

| URL | Suggested file |
| --- | --- |
| `/admin/ugc` | `admin.ugc.index.tsx`: pipeline / list with status tabs + bulk actions |
| `/admin/ugc/creators/$creatorId` | `admin.ugc.creators.$creatorId.tsx` |
| `/admin/ugc/campaigns` | `admin.ugc.campaigns.index.tsx` |
| `/admin/ugc/campaigns/$campaignId` | `admin.ugc.campaigns.$campaignId.tsx`: brief builder + asset library + assigned creators |
| `/admin/ugc/shipping` | `admin.ugc.shipping.tsx` |
| `/admin/ugc/review` | `admin.ugc.review.tsx` |
| `/admin/ugc/import` | `admin.ugc.import.tsx` |

## Calling conventions

Server functions are TanStack `createServerFn`s: `await fn()` or `await fn({ data: {...} })`.
For the ones whose input is optional, pass `{ data: {} }` when you have nothing to filter by.

- **Reads** (`GET`) return data, or `null` when the thing doesn't exist.
- **Changes** (`POST`) return `{ ok: true, ... } | { ok: false, error: string }` (show `error`
  as-is; it's written for the user), or `{ results: [...] }` for bulk actions with one entry per
  row (`{ ok, error? }`).
- Creator functions throw `UgcAuthError("signed-out")` when there's no valid `ugc_session`
  cookie (guard routes with `getUgcSession`). Admin functions throw `HubAuthError("forbidden")`
  without the admin cookie (the `/admin` layout already redirects to `/admin/login`).
- Zod validation errors throw. Ids match `/^[A-Za-z0-9]{6,60}$/`.
- After a mutation, `router.invalidate()` to refresh loaders.

Auth model: a UGC creator has **no password and no Creator Hub account**. They sign in by
magic link; the session cookie is `ugc_session` (HttpOnly, 30 days), separate from the Creator
Hub's `hub_session`. Only statuses other than `applied` and `declined` can sign in
(`canSignIn`); `paused` can sign in but not upload (`canUpload`). Declining signs them out.

## Constants (`model.ts`)

```ts
UGC.maxFileBytes   // 2 GiB per file (submissions and brief assets)
UGC.quotaBytes     // 5 GiB per creator: every stored submission, finished or uploading
UGC.recommendedFileBytes // 1 GiB ("keep each file under ~1 GB")
UGC.chunkBytes     // 4 MiB
UGC.maxPosterBytes // 2 MiB
UGC.maxCommentChars// 2000
UGC.supportEmail   // creators@medialife.ai
formatBytes(n)     // "1.4 GB"
```

Status pipeline (creator): `UGC_STATUSES`, `UGC_PIPELINE` (order, without declined/paused),
`UGC_STATUS_LABELS`, `UGC_STATUS_TONES` (slate/sky/violet/amber/emerald/rose),
`UGC_TRANSITIONS`, `canTransition(from, to)`.

| status | label | moves on its own when |
| --- | --- | --- |
| `applied` | Applied | (import) |
| `approved` | Approved | admin approves (join email sent) |
| `shipped` | Package shipped | admin marks shipped |
| `delivered` | Delivered | admin marks delivered with `startContent: false` |
| `content-due` | Content due | admin marks delivered (default), or all uploads removed/rejected |
| `submitted` | Submitted | first upload completes (in review) |
| `changes-requested` | Changes requested | a review asks for changes |
| `approved-content` | Content approved | a review approves |
| `posted` | Posted | creator pastes the live link |
| `declined` / `paused` | Declined / Paused | admin only; never changed automatically |

Content statuses are derived from submissions (`contentStatusFrom`): any posted → posted,
else any approved → approved-content, else any changes-requested → changes-requested, else
any in-review → submitted.

Submissions: `UGC_SUBMISSION_STATUSES` = `uploading | in-review | changes-requested | approved |
posted | rejected`, labels in `UGC_SUBMISSION_STATUS_LABELS` ("Not used" for rejected).

Platforms: `UGC_PLATFORMS` = `roblox, instagram, youtube, discord, x, tiktok` (profile handles,
labels `UGC_PLATFORM_LABELS`, links `ugcHandleUrl(p, handle)`). Where a submission is posted:
`UGC_POST_PLATFORMS` = `tiktok, instagram, youtube, x, roblox, other` (`UGC_POST_PLATFORM_LABELS`).
Audience bands: `UGC_AUDIENCE_BANDS`.

Assets: `UGC_ASSET_GROUPS` (`logos, art, gameplay, sounds, overlays, splash, zip, other`) with
`UGC_ASSET_GROUP_LABELS` (e.g. "Bobo + Eclipse can art", "Cola Run gameplay clips"; `zip` is the
prebuilt "Download all").

Aspects: `UGC_ASPECTS` (`9:16 | 16:9 | 1:1 | 4:5 | other`), `aspectOf(w, h)`,
`aspectHint(actual, wanted)` → `"Looks like 16:9. This brief asks for 9:16."` or null.

Perks: `UGC_PERK_KINDS` (`discount | early-access | collab`), `UGC_PERK_KIND_LABELS`.

Other helpers: `liveUrlProblem(url)` (null when ok; https only), `daysLeft(deadline)`,
`trackingUrlFor(carrier, tracking)`, `UGC_CARRIERS` (carrier suggestions),
`UGC_SUBMISSION_ACCEPT` / `UGC_ASSET_ACCEPT` for `<input accept>`,
`UGC_DEFAULT_DISCLOSURE` (the #ad paragraph shown on every brief).

URL builders (same-origin, cookie-authenticated, support `Range` so `<video src>` streams):
`ugcSubmissionUrl(id, download?)`, `ugcPosterUrl(id)`, `ugcAssetUrl(campaignId, id, download?)`.
Views already carry these as `url`, `downloadUrl`, `posterUrl`.

## Types the UI receives

All in `model.ts` unless noted.

- `UgcCreator` (admin) / `UgcCreatorView` (creator; no `source`, no `hubUserId`). Fields: `id,
  status, statusChangedAt, campaignIds, name` (person), `creatorName` (channel name), `email,
  country, platforms, mainPlatform, handles, audiences, applicationNotes, consent, deletionRequest
  ({at, note} | null), createdAt, approvedAt, joinedAt, lastLoginAt, sample?`.
- `UgcPii` (admin only; creators get their own phone/address via `getUgcProfile`): `phone,
  address: ShippingAddress | null, purgeAfter, purgedAt`. `ShippingAddress = { name, line1, line2,
  city, region, postalCode, country }`. Addresses are purged automatically 90 days after delivery.
- `UgcCampaign`: `id, title, drop, summary, status (draft|live|closed), version, publishedAt,
  deadline (ms|null), keyMessages[], dos[], donts[], hashtags[] ("#…"), mentions[] ("@…"),
  shots: {id, label, required, tip?}[], howTo: {title, steps[], exampleAssetId} | null,
  disclosure, preferredAspect, items[] (package contents), assetFileIds[] (display order),
  coverAssetId, zipAssetId`.
- `UgcAssetView`: `id, campaignId, name, mime, size, group, note, url, downloadUrl, isImage,
  isVideo`.
- `UgcShipment`: `carrier, tracking, trackingUrl, packedAt, shippedAt, deliveredAt, items[]`.
- `UgcSubmissionView`: `id, campaignId, name, mime, size, mediaType (video|image), durationS,
  width, height, aspect, shotIds[], platform, note, status, liveUrl, disclosureConfirmed,
  postedAt, reviewedAt, briefVersion, createdAt, completedAt, url, downloadUrl, posterUrl,
  comments: UgcComment[]`. `url`/`downloadUrl` are null while uploading.
- `UgcComment`: `id, author ("creator"|"medialife"), name, body, atSeconds (always null in v1), at`.
- `UgcPerk`: `id, kind, title, description, code, url, percentOff, expiresAt, createdAt`.
- `UgcActivity`: `id, at, kind, title, body, actor ("creator"|"medialife"|"system"), submissionId`.
- `UgcTimelineStep`: `id (approved|packed|shipped|delivered|content-due|submitted|content-approved
  |posted|perk), label, state ("done"|"current"|"upcoming"), at, detail ("USPS · 9400…",
  "5 days left"), href (tracking page)`.
- `UgcNextAction`: `id, title, body, cta: {label, href, external?} | null, tone
  ("info"|"action"|"success"|"muted")`. ids: `paused, fix-changes, post-live-link, packing,
  on-its-way, film-and-upload, in-review, enjoy-perks`.
- `UgcQuota`: `{ usedBytes, limitBytes, fileLimitBytes }`.

## Creator server functions

`import { … } from "@/lib/ugc/auth.functions"` / `"@/lib/ugc/creator.functions"`.

| Function | Input | Output |
| --- | --- | --- |
| `getUgcSession()` | – | `{ signedIn: false, configured } \| { signedIn: true, configured: true, creator: { id, name, creatorName, email, status, statusLabel } }`. Never throws. |
| `requestUgcSignInLink` | `{ email, next? }` | `{ ok: true, email, devLink: string \| null } \| { ok: false, error }`. Always ok for unknown/applicant emails (no account enumeration). Rate limited (5 per email per 15 min). `devLink` only on localhost/previews without `RESEND_API_KEY`. |
| `consumeUgcLink` | `{ token }` | `{ ok: true, next, firstVisit } \| { ok: false, reason: "invalid"\|"expired"\|"not-allowed", error }`. Sets the cookie. `firstVisit` = first ever sign-in (confetti / welcome). |
| `signOutUgc()` | – | `{ ok: true }` |
| `getUgcHome()` | – | `UgcHome`: `{ creator, campaign: UgcCampaignSummary \| null, shipment, timeline: UgcTimelineStep[], nextAction, perks, quota, submissionCounts: {status: n}, activity (20 newest), briefUpdated }`. `UgcCampaignSummary` = `{ id, title, drop, summary, status, version, deadline, preferredAspect, coverUrl }`. |
| `getUgcBrief` | `{ campaignId? }` | `UgcBrief \| null` (null = no published brief yet): `{ campaign: UgcCampaign, tickedShotIds, lastSeenVersion (0 = first visit; < campaign.version → show "Updated"), cover: UgcAssetView \| null, howToExample: UgcAssetView \| null, otherCampaigns }`. Reading records the version as seen. |
| `setUgcShotTicks` | `{ campaignId, shotIds: string[] }` (whole list) | `{ ok: true, tickedShotIds }` |
| `listUgcAssets` | `{ campaignId? }` | `{ campaign, groups: { group, label, assets: UgcAssetView[] }[], zip: UgcAssetView \| null } \| null` (empty groups omitted) |
| `listUgcSubmissions` | `{ campaignId? }` | `{ campaign, shots, tickedShotIds, submissions: UgcSubmissionView[] (newest first), quota }`. Use `tickedShotIds` to pre-fill which shots an upload covers. |
| `updateUgcSubmission` | `{ submissionId, platform?, shotIds?, note? }` | `{ ok, submission }`; not allowed once approved/posted |
| `deleteUgcSubmission` | `{ submissionId }` | `{ ok }`; frees quota; not allowed once approved/posted |
| `postUgcComment` | `{ submissionId, body }` | `{ ok, comment }` |
| `setUgcLiveUrl` | `{ submissionId, url, disclosureConfirmed: boolean }` | `{ ok, submission }`. Only for approved/posted uploads; **`disclosureConfirmed` must be `true`** (checkbox "My caption includes #ad or the platform's paid-partnership label"); `url` must pass `liveUrlProblem`. Moves the submission and creator to posted. |
| `listUgcPerks()` | – | `UgcPerk[]` (expired ones drop off after 7 days) |
| `getUgcProfile()` | – | `{ creator, phone, address, addressPurged }` |
| `updateUgcProfile` | any of `{ creatorName, name, country, handles: {platform: string} ("" clears), phone, address: ShippingAddress \| null }` | `{ ok, profile }` |
| `requestUgcDataDeletion` | `{ note?, cancel? }` | `{ ok, deletionRequest }` (flags it for the team; shows in admin) |

## Admin server functions

`import { … } from "@/lib/ugc/admin.functions"`. Emails go out through Resend when
`RESEND_API_KEY` is set; otherwise (localhost/previews) results carry `devLink` where a link
was involved and the console logs every email.

Pipeline and creators

| Function | Input | Output |
| --- | --- | --- |
| `adminUgcPipeline` | `{ status?: UgcStatus \| "all" \| "deletion-requested", campaignId?, q? }` | `{ creators: UgcCreatorSummary[], counts: {status \| "all" \| "deletion-requested": n} (unfiltered, for tabs), campaigns: {id,title,status}[] }`. `UgcCreatorSummary` = `{ id, name, creatorName, email, status, statusChangedAt, country, platforms, mainPlatform, campaignIds, createdAt, approvedAt, deletionRequested, sample }`. |
| `adminGetUgcCreator` | `{ id }` | `{ creator, admin: {internalNotes, tags}, pii, campaigns, shipments, submissions: UgcSubmissionView[], perks, activity, quota } \| null` |
| `adminSetUgcStatus` | `{ ids[], status, force?, notify? (default true), campaignId? }` | `{ results: { id, ok, error?, status?, devLink?, emailed? }[] }`. Single and bulk. Respects `UGC_TRANSITIONS` unless `force`. First approval assigns `campaignId` (or the only live campaign) and emails the join link (7 days). `shipped`/`delivered` also stamp the shipment. |
| `adminResendUgcJoinLink` | `{ id }` | same row shape |
| `adminSaveUgcNotes` | `{ id, internalNotes, tags[] }` | `{ ok }` |
| `adminEditUgcCreator` | `{ id, name?, creatorName?, email?, country?, handles?, mainPlatform?, phone?, address? }` | `{ ok, creator }` |
| `adminAddUgcCreator` | `{ name, creatorName, email, country?, handles?, phone?, address?, notes?, status?: "applied"\|"approved", notify?, campaignId? }` | `{ ok, creatorId, result, devLink? }` |
| `adminDeleteUgcCreatorData` | `{ id, mode: "pii" \| "all" }` | `{ ok }`. `pii` purges phone + address and clears the request; `all` deletes the creator, uploads, files, sessions (a later Netlify sync won't bring them back). |

Import

| Function | Input | Output |
| --- | --- | --- |
| `adminUgcImportStatus()` | – | `{ netlify: { configured: true, formIdSet } \| { configured: false, missing: string[], help: string[] }, log: {at, kind, total, created, duplicates, skipped}[] }` |
| `adminSyncUgcNetlify` | `{ deleteAfterImport?, dryRun? }` | `{ configured: false, missing, help }` (show `help` as setup steps) \| `{ configured: true, ok: false, error }` \| `{ configured: true, ok: true, formId, total, created, duplicates, skipped, deleted, deleteErrors, rows: ImportRowResult[] }` |
| `adminImportUgcCsv` | `{ csv, dryRun? }` | `{ total, created, duplicates, skipped, rows }` |

`ImportRowResult` = `{ submissionId, email, result: "created" \| "duplicate-submission" \|
"duplicate-email" \| "deleted-before" \| "skipped", creatorId, reason? }`. Imports are
idempotent (by Netlify submission id, or a fingerprint of a CSV row without one) and never
create two creators for one email. The CSV importer accepts a Netlify Forms export: headers are
matched to the form's field names case/space/dash-insensitively (`UGC_FORM_FIELDS` in
`import.ts`; `mapSignup` + `normaliseFields` let the page preview rows).

Campaigns and brief builder

| Function | Input | Output |
| --- | --- | --- |
| `adminListUgcCampaigns()` | – | `(UgcCampaign & { creatorCount })[]` |
| `adminGetUgcCampaign` | `{ id }` | `{ campaign, assets: UgcAssetView[] (complete, in order), creators: UgcCreatorSummary[] } \| null` |
| `adminSaveUgcCampaign` | `{ id? (none = create), title?, drop?, summary?, deadline?, keyMessages?, dos?, donts?, hashtags?, mentions?, shots?: {id?, label, required, tip?}[], howTo?, disclosure?, preferredAspect?, items?, assetFileIds? (reorder), coverAssetId?, zipAssetId?, notify? }` | `{ ok, campaign, bumped, notified }`. Shot ids are slugged from labels when absent. Editing a **live** brief's content bumps `version`; with `notify`, assigned creators get a "Brief updated" email. |
| `adminSetUgcCampaignStatus` | `{ id, status, notify? }` | `{ ok, campaign, notified }`. Publishing (→ live) bumps the version. |
| `adminDeleteUgcCampaign` | `{ id }` | drafts without uploads only |
| `adminAssignUgcCampaign` | `{ campaignId, creatorIds[], assign: boolean }` | `{ ok, updated }` |
| `adminUpdateUgcAsset` | `{ campaignId, id, name?, group?, note? }` | `{ ok, asset }` |
| `adminDeleteUgcAsset` | `{ campaignId, id }` | `{ ok }` |

Brief assets are uploaded with `uploadUgcFile(file, { target: "asset", campaignId, group })`
(admin cookie). They are appended to `assetFileIds`; a `zip` becomes `zipAssetId` if none is set.

Shipping

| Function | Input | Output |
| --- | --- | --- |
| `adminUgcShipping` | `{ campaignId?, onlyUnshipped? }` | `ShippingRow[]`: `{ creatorId, name, creatorName, email, status, campaignId, campaignTitle, phone, address, shipment }` |
| `adminExportUgcShippingCsv` | `{ campaignId?, onlyUnshipped? (default true) }` | `{ filename, csv, count, missingAddress: creatorId[] }`. Columns: `reference,name,address_line1,address_line2,city,region,postal_code,country,phone,email,items,creator_name,campaign,carrier,tracking`. Save with `new Blob([csv], {type: "text/csv"})` + `saveBlob` from `@/lib/hub/download-client`. |
| `adminMarkUgcPacked` | `{ creatorIds[], campaignId? }` | `{ results }` |
| `adminMarkUgcShipped` | `{ entries: {creatorId, carrier, tracking, url?}[], campaignId?, notify? }` | `{ results }`. Tracking URL derived for USPS/UPS/FedEx/DHL/Royal Mail/Canada Post/Evri unless `url`. Moves approved → shipped; emails the tracking link. |
| `adminImportUgcTrackingCsv` | `{ csv ("email,carrier,tracking[,url]", header optional), campaignId?, notify? }` | `{ results: {creatorId, email, ok, error?}[] }` |
| `adminMarkUgcDelivered` | `{ creatorIds[], campaignId?, startContent? (default true) }` | `{ results }`. Schedules the address purge (+90 days). |

Review

| Function | Input | Output |
| --- | --- | --- |
| `adminUgcReviewQueue` | `{ status?: UgcSubmissionStatus \| "all" (default "in-review"), campaignId? }` | `ReviewItem[]`, oldest first: `{ submission: UgcSubmissionView, creator: {id,name,creatorName,email,status,handles} \| null, campaign: {id,title,shots,preferredAspect} \| null }` |
| `adminGetUgcSubmission` | `{ id }` | `ReviewItem \| null` |
| `adminReviewUgcSubmission` | `{ submissionId, decision: "approve" \| "changes" \| "reject", comment? (required for changes), notify? }` | `{ ok, submission }`. Emails the creator. |
| `adminPostUgcComment` | `{ submissionId, body }` | `{ ok, comment }` |
| `adminSetUgcLiveUrl` | `{ submissionId, url, disclosureConfirmed: true }` | `{ ok, submission }` (record a link on the creator's behalf) |

Perks

| Function | Input | Output |
| --- | --- | --- |
| `adminSaveUgcPerk` | `{ creatorId, id? (edit), kind, title, description?, code?, url?, percentOff?, expiresAt?, notify? }` | `{ ok, perk }` |
| `adminDeleteUgcPerk` | `{ creatorId, id }` | `{ ok }` |
| `adminImportUgcPerkCodes` | `{ csv ("email,code"), title, description?, percentOff?, expiresAt?, notify? }` | `{ results: {email, ok, error?, creatorId?}[] }` |

Sample data: `adminSeedUgcSample({ data: { reset? } })` → `{ ok: true, created, campaignId,
logins: {email, creatorName, status}[] } | { ok: false, error }` (production refuses). Put it
behind a "Load sample data" button on the empty pipeline, like `/admin/creators`.

## Uploads from the browser

```ts
import { readUgcMedia, fingerprintUgcFile } from "@/lib/ugc/media-client";
import { uploadUgcFile, UgcUploadTask, UgcUploadError } from "@/lib/ugc/upload-client";
import { aspectHint, UGC_SUBMISSION_ACCEPT } from "@/lib/ugc/model";

// <input type="file" accept={UGC_SUBMISSION_ACCEPT} multiple>
const meta = await readUgcMedia(file);        // { mediaType, durationS, width, height, aspect, poster: Blob|null }
const hint = aspectHint(meta.aspect, brief.campaign.preferredAspect);
const fingerprint = await fingerprintUgcFile(file); // optional

const task = new UgcUploadTask(file, {
  target: "submission",
  campaignId,                       // optional: defaults to the current campaign
  platform: "tiktok",
  shotIds: ["scan-reveal"],
  note: "",
  meta, poster: meta.poster, fingerprint,
});
const off = task.subscribe((t) => render(t.state, t.progress.fraction, t.error?.message));
await task.start();     // resolves with { kind: "submission", submission } or null (paused/error/cancelled)
task.pause();           // AbortController under the hood
await task.resume();    // asks the server which chunks it has, sends the rest
await task.cancel();    // deletes the unfinished upload
```

- `uploadUgcFile(file, opts)` is the same thing as a function (`signal` to pause, `onProgress({
  phase, fraction, sentBytes, totalBytes })`, `onStarted(id)`); a pause rejects with
  `UgcUploadError { paused: true, uploadId }`.
- Resume survives reloads: the upload id is kept in `localStorage` per file (name + size +
  lastModified). When the user picks the same file again, `pendingUploadId(file, {target,
  campaignId})` tells you there's something to resume, and `uploadUgcFile` resumes it
  automatically. A tab switch on mobile only needs `task.resume()` (or re-run on `online`).
- 3 chunks in flight, each retried 5 times with backoff on network errors/5xx; a wake lock
  is held while uploading.
- Errors: `UgcUploadError.status` 413 = over 2 GB or over quota (`error.quota` has the numbers),
  415 = not a video/photo or the bytes don't match the name, 403 = uploads closed (paused) or no
  permission, 409 = campaign not live. `message` is user-ready.
- Poster: sent right after init, so the "Uploading" card already has `posterUrl`.
- The quota is enforced on the server at init and on every chunk; show `quota` from
  `listUgcSubmissions`/`getUgcHome` as a bar.

HTTP contract (for reference; the helper does this): `POST /api/ugc/uploads` → `GET|DELETE
/api/ugc/uploads/:id` → `PUT /api/ugc/uploads/:id/chunks/:n` → `POST
/api/ugc/uploads/:id/complete`, `PUT /api/ugc/uploads/:id/poster`. Non-GET requests need
header `x-ugc: 1`. Downloads: `GET /api/ugc/files/submissions/:id`, `/api/ugc/files/posters/:id`,
`/api/ugc/files/assets/:campaignId/:id` (`?download=1` for attachment). Responses to `Range`
requests are capped at 16 MB, which `<video>` handles by itself; for "Download" buttons on big
files use `downloadUgcFile(assetOrSubmission, { onProgress })` (takes `{ downloadUrl, size,
mime, name }`).

Permissions: a creator reads only their own submissions/posters and the assets of campaigns
they're assigned to (live or closed, not draft). Admin reads everything and is the only one who
uploads brief assets.

## Run it locally with sample data

1. `AR_ADMIN_PASSWORD=devpass npm run dev` → http://localhost:8080 (no other env needed; data
   goes to `.data/ar/ugc-dev/` and `.data/ar/ugc-files-dev/`, gitignored).
2. Sign in as admin at http://localhost:8080/admin/login with `devpass`.
3. Load sample data: the "Load sample data" button (calls `adminSeedUgcSample`), or from the
   browser console on any `/admin` page:
   `fetch("/api/ugc/dev/seed", { method: "POST", headers: { "x-ugc": "1" } }).then(r => r.json())`
   (`/api/ugc/dev/seed?reset=1` wipes and reloads the sample). Production returns 404.
4. Sign in as a sample creator: open http://localhost:8080/ugc-hub/sign-in, enter one of the
   emails below; with no `RESEND_API_KEY` the response carries `devLink` (the check-email page
   should show it; it's also printed in the dev server console). Open it →
   `/ugc-hub/auth?token=…` → home. Admin and creator sessions are different cookies, so one
   browser can be signed in as both.

The seed creates the live campaign **EVADE × Bobo keychain launch** (id `evadeBoboLaunch01`,
deadline in 14 days, version 1) with key messages, do/don't, `#EVADE #ColaRun #ad`, shot list
(`scan-reveal` "The scan reveal" required; `unbox`, `gameplay`, `keys-bag` optional), the
"How to film the scan reveal" card with an example clip, and 11 brief assets (EVADE logo, Bobo
and Eclipse art + keychain charms from `public/evade/…`, Cola Run splash as the cover, the
creators card, and two "SAMPLE · placeholder video" clips). Creators (all `sample: true`):

| Email | Creator | Status | What's there |
| --- | --- | --- | --- |
| maya.sample@medialife.test | MayaPlays | applied | can't sign in (applicant) |
| jordan.sample@medialife.test | JordyBuilds | approved | package being packed |
| sam.sample@medialife.test | SamOnRoblox | shipped | USPS tracking |
| priya.sample@medialife.test | PriyaPixels | content-due | delivered, one shot ticked |
| leo.sample@medialife.test | LeoLoops | submitted | 9:16 video in review |
| ava.sample@medialife.test | AvaAnimates | changes-requested | 16:9 video + feedback thread |
| noah.sample@medialife.test | NoahKnows | approved-content | approved video waiting for a live link, a rejected one, a discount code |
| zoe.sample@medialife.test | ZoeZoomies | posted | live TikTok link, discount + early access + collab perks |
| ethan.sample@medialife.test | EthanW | declined | can't sign in |
| riley.sample@medialife.test | RileyRuns | paused | signs in, can't upload |

Every sample creator has a sample address and phone. Sample uploads are tiny real H.264 MP4s
with poster frames, so `<video>` playback and posters work.

## Environment (Netlify)

| Variable | For |
| --- | --- |
| `AR_ADMIN_PASSWORD`, `AR_SESSION_SECRET` | `/admin` (existing) |
| `HUB_SESSION_SECRET` (or `AR_SESSION_SECRET`) | signing `ugc_session`; production refuses sign-in without one |
| `RESEND_API_KEY`, `HUB_EMAIL_FROM` | join, sign-in and notice emails (existing Creator Hub mailer) |
| `NETLIFY_API_TOKEN` | "Sync from Netlify Forms" (personal access token) |
| `NETLIFY_SITE_ID` | the site's API id (Netlify also injects `SITE_ID`) |
| `UGC_NETLIFY_FORM_ID` | optional: skip looking up the form "evade-ugc-creator" by name |
| `UGC_STORAGE` | `blobs` (default). `r2` is reserved; see the TODO in `storage.server.ts` |

## Tests

`npm run test:ugc` (also part of `npm run test:hub`): import mapping and idempotency (CSV and a
mocked Netlify API, delete-after-import), 2 GB / 5 GB limits at init and on chunks, magic-byte
sniffing, magic-link sign-in (single use, applicants refused, off-site `next` dropped), one
creator can't read another's files or submission, the disclosure rule on live links, status
transitions, shipping/home/brief, and the seed.
