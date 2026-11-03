import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { getRequest } from "@tanstack/react-start/server";

import {
  addComment,
  claimCreatorEmail,
  deleteAsset,
  deleteCampaignRecord,
  deleteCreatorEverything,
  emptyShipment,
  getCampaign,
  listAssets,
  listCreatorSummaries,
  logActivity,
  saveAsset,
  saveBriefProgress,
  saveCampaign,
  saveCreator,
  savePerk,
  savePii,
  saveShipment,
  saveSubmission,
} from "./data.server";
import { newCreatorFrom } from "./import.server";
import {
  UGC,
  UGC_DEFAULT_DISCLOSURE,
  aspectOf,
  trackingUrlFor,
  type UgcAsset,
  type UgcAssetGroup,
  type UgcCampaign,
  type UgcPlatform,
  type UgcStatus,
  type UgcSubmission,
  type UgcSubmissionStatus,
} from "./model";
import { ugcStorage } from "./storage.server";
import { UKEYS, newId, ugcStore, type UgcNamespace } from "./store.server";

// Sample data for the UGC Hub on localhost and deploy previews: a live EVADE
// campaign with the real art as brief assets, and ten sample creators spread
// across the pipeline with sample uploads (tiny "SAMPLE · placeholder video"
// clips), comments, a shipment each and perks. Everything is flagged
// `sample: true` and every email ends in @medialife.test.
//
// Production refuses it: adminSeedUgcSample and POST /api/ugc/dev/seed both
// check the namespace, and so does seedUgcSample itself.

export const SAMPLE_CAMPAIGN_ID = "evadeBoboLaunch01";
const DAY = 86_400_000;

/** Bytes of a file in /public: from disk on localhost, else fetched from the deploy itself. */
async function publicBytes(p: string): Promise<Uint8Array | null> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", p));
    return new Uint8Array(buf);
  } catch {
    /* not on disk (a deployed function) */
  }
  try {
    const origin = new URL(getRequest().url).origin;
    const res = await fetch(new URL(p, origin));
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function writeBytes(ns: UgcNamespace, key: string, data: Uint8Array) {
  const storage = ugcStorage(ns);
  const ref = { kind: "blobs" as const, key };
  const chunks = Math.max(1, Math.ceil(data.byteLength / UGC.chunkBytes));
  for (let n = 0; n < chunks; n++)
    await storage.putChunk(ref, n, data.slice(n * UGC.chunkBytes, (n + 1) * UGC.chunkBytes));
  return { ref, chunks };
}

async function addAsset(
  ns: UgcNamespace,
  campaignId: string,
  input: {
    name: string;
    mime: string;
    group: UgcAssetGroup;
    note: string;
    data: Uint8Array | null;
  },
): Promise<UgcAsset | null> {
  if (!input.data) return null;
  const id = newId(10);
  const { ref, chunks } = await writeBytes(ns, `files/${id}`, input.data);
  const asset: UgcAsset = {
    id,
    campaignId,
    name: input.name,
    mime: input.mime,
    size: input.data.byteLength,
    chunks,
    storage: ref,
    group: input.group,
    note: input.note,
    complete: true,
    createdAt: Date.now(),
    sample: true,
  };
  await saveAsset(ns, asset);
  await (
    await ugcStore(ns)
  ).setJSON(UKEYS.upload(id), {
    id,
    target: "asset",
    creatorId: null,
    campaignId,
    createdAt: asset.createdAt,
  });
  return asset;
}

type SampleCreator = {
  first: string;
  last: string;
  creatorName: string;
  status: UgcStatus;
  country: string;
  city: string;
  region: string;
  postalCode: string;
  handles: Partial<Record<UgcPlatform, string>>;
  main: UgcPlatform;
  daysAgo: number;
  notes?: string;
};

const CREATORS: SampleCreator[] = [
  {
    first: "Maya",
    last: "Chen",
    creatorName: "MayaPlays",
    status: "applied",
    country: "United States",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    handles: { tiktok: "@mayaplays", roblox: "MayaPlays" },
    main: "tiktok",
    daysAgo: 1,
    notes: "I post Roblox obby runs most days. Would love to film the scan in one take!",
  },
  {
    first: "Jordan",
    last: "Ellis",
    creatorName: "JordyBuilds",
    status: "approved",
    country: "United Kingdom",
    city: "Leeds",
    region: "West Yorkshire",
    postalCode: "LS1 4AP",
    handles: { youtube: "@jordybuilds", roblox: "JordyBuilds" },
    main: "youtube",
    daysAgo: 4,
  },
  {
    first: "Sam",
    last: "Okafor",
    creatorName: "SamOnRoblox",
    status: "shipped",
    country: "United States",
    city: "Atlanta",
    region: "GA",
    postalCode: "30303",
    handles: { roblox: "SamOnRoblox", tiktok: "@samonroblox" },
    main: "roblox",
    daysAgo: 9,
  },
  {
    first: "Priya",
    last: "Nair",
    creatorName: "PriyaPixels",
    status: "content-due",
    country: "Canada",
    city: "Toronto",
    region: "ON",
    postalCode: "M5V 2T6",
    handles: { instagram: "@priyapixels", tiktok: "@priyapixels" },
    main: "instagram",
    daysAgo: 12,
  },
  {
    first: "Leo",
    last: "Martins",
    creatorName: "LeoLoops",
    status: "submitted",
    country: "United States",
    city: "Denver",
    region: "CO",
    postalCode: "80202",
    handles: { tiktok: "@leoloops", x: "@leoloops" },
    main: "tiktok",
    daysAgo: 13,
  },
  {
    first: "Ava",
    last: "Brooks",
    creatorName: "AvaAnimates",
    status: "changes-requested",
    country: "United States",
    city: "Portland",
    region: "OR",
    postalCode: "97205",
    handles: { youtube: "@avaanimates", instagram: "@avaanimates" },
    main: "youtube",
    daysAgo: 14,
  },
  {
    first: "Noah",
    last: "Kim",
    creatorName: "NoahKnows",
    status: "approved-content",
    country: "United States",
    city: "Seattle",
    region: "WA",
    postalCode: "98101",
    handles: { tiktok: "@noahknows", discord: "noahknows" },
    main: "tiktok",
    daysAgo: 15,
  },
  {
    first: "Zoe",
    last: "Alvarez",
    creatorName: "ZoeZoomies",
    status: "posted",
    country: "United States",
    city: "Miami",
    region: "FL",
    postalCode: "33130",
    handles: { tiktok: "@zoezoomies", instagram: "@zoezoomies", roblox: "ZoeZoomies" },
    main: "tiktok",
    daysAgo: 16,
  },
  {
    first: "Ethan",
    last: "Wright",
    creatorName: "EthanW",
    status: "declined",
    country: "Australia",
    city: "Sydney",
    region: "NSW",
    postalCode: "2000",
    handles: { x: "@ethanw" },
    main: "x",
    daysAgo: 6,
  },
  {
    first: "Riley",
    last: "Shaw",
    creatorName: "RileyRuns",
    status: "paused",
    country: "United States",
    city: "Chicago",
    region: "IL",
    postalCode: "60601",
    handles: { tiktok: "@rileyruns" },
    main: "tiktok",
    daysAgo: 11,
  },
];

export const sampleEmail = (first: string) => `${first.toLowerCase()}.sample@medialife.test`;

/** The sample sign-ins, for the README and the admin "Load sample data" toast. */
export const SAMPLE_LOGINS = CREATORS.map((c) => ({
  email: sampleEmail(c.first),
  creatorName: c.creatorName,
  status: c.status,
}));

const PIPE: UgcStatus[] = [
  "approved",
  "shipped",
  "content-due",
  "submitted",
  "changes-requested",
  "approved-content",
  "posted",
];
const reached = (s: UgcStatus, step: UgcStatus) =>
  (s === "paused" ? "content-due" : s) !== "declined" &&
  PIPE.indexOf(s === "paused" ? "content-due" : s) >= PIPE.indexOf(step);

async function removeSample(ns: UgcNamespace) {
  for (const c of await listCreatorSummaries(ns))
    if (c.sample) await deleteCreatorEverything(ns, c.id);
  const campaign = await getCampaign(ns, SAMPLE_CAMPAIGN_ID);
  if (campaign) {
    for (const a of await listAssets(ns, campaign, true)) await deleteAsset(ns, a);
    await deleteCampaignRecord(ns, SAMPLE_CAMPAIGN_ID);
  }
}

export async function seedUgcSample(ns: UgcNamespace, opts: { reset?: boolean } = {}) {
  if (ns === "prod") throw new Error("UGC sample data is never written in production");
  const existing = await getCampaign(ns, SAMPLE_CAMPAIGN_ID);
  if (existing && !opts.reset)
    return { created: false, campaignId: SAMPLE_CAMPAIGN_ID, logins: SAMPLE_LOGINS };
  if (existing) await removeSample(ns);

  const now = Date.now();
  const media = (await import("./sample-media.server")).SAMPLE_MEDIA;

  // ---- campaign ---------------------------------------------------------------
  const campaign: UgcCampaign = {
    id: SAMPLE_CAMPAIGN_ID,
    title: "EVADE × Bobo keychain launch",
    drop: "Bobo + Eclipse can keychain",
    summary:
      "Show your audience the first EVADE keychains: Bobo the cat and the Eclipse can. Tap or scan the keychain with your phone and it drops you straight into Cola Run. We want the moment it happens, your real reaction, and a taste of the game.",
    status: "live",
    version: 1,
    publishedAt: now - 10 * DAY,
    deadline: now + 14 * DAY,
    keyMessages: [
      "Tap or scan the keychain and you're in Cola Run: merch that plays.",
      "Bobo and the Eclipse can are the first EVADE keychains, and the first drop is limited.",
      "It's a real keychain: it lives on your keys or your bag, and the game is always one tap away.",
    ],
    dos: [
      "Get the keychain and your phone in the same shot for the scan.",
      "Film vertical (9:16) in good light; daylight by a window is perfect.",
      "Show your real reaction when Cola Run opens.",
      "Use the sounds and overlays from Assets, or the platform's licensed music.",
      "Add #ad or turn on the paid-partnership label.",
    ],
    donts: [
      "Don't show other brands' logos or merch in the frame.",
      "Don't promise prizes, codes or rewards we haven't announced.",
      "Don't use music you don't have the rights to.",
      "Don't film anyone who hasn't agreed to be in your video.",
    ],
    hashtags: ["#EVADE", "#ColaRun", "#ad"],
    mentions: ["@EVADE"],
    shots: [
      {
        id: "scan-reveal",
        label: "The scan reveal",
        required: true,
        tip: "Phone in frame, keychain in your other hand. Tap or scan, then cut to Cola Run opening.",
      },
      {
        id: "unbox",
        label: "Unbox the package",
        required: false,
        tip: "Open it on camera; first look at Bobo and the Eclipse can.",
      },
      {
        id: "gameplay",
        label: "Cola Run gameplay",
        required: false,
        tip: "10 to 15 seconds of you playing. Screen record or film the screen.",
      },
      {
        id: "keys-bag",
        label: "Bobo on your keys / bag",
        required: false,
        tip: "Where it lives day to day: keys, backpack, belt loop.",
      },
    ],
    howTo: {
      title: "How to film the scan reveal",
      steps: [
        "Hold your phone in one hand, screen towards the camera.",
        "Hold the keychain in your other hand, close to the phone.",
        "Tap the keychain to the back of the phone (or scan the code).",
        "Cut to Cola Run opening on screen, then your reaction.",
      ],
      exampleAssetId: null,
    },
    disclosure: UGC_DEFAULT_DISCLOSURE,
    preferredAspect: "9:16",
    items: ["Bobo keychain", "Eclipse can keychain"],
    assetFileIds: [],
    coverAssetId: null,
    zipAssetId: null,
    createdAt: now - 12 * DAY,
    updatedAt: now,
    sample: true,
  };
  await saveCampaign(ns, campaign);

  const assetSpecs: {
    file: string;
    name: string;
    mime: string;
    group: UgcAssetGroup;
    note: string;
  }[] = [
    {
      file: "brand/evade-logo.webp",
      name: "EVADE logo.webp",
      mime: "image/webp",
      group: "logos",
      note: "Use on dark backgrounds.",
    },
    {
      file: "evade/creators/assets/img/bobo-cat.png",
      name: "Bobo the cat.png",
      mime: "image/png",
      group: "art",
      note: "Transparent PNG.",
    },
    {
      file: "evade/creators/assets/img/eclipse-can.png",
      name: "Eclipse can.png",
      mime: "image/png",
      group: "art",
      note: "Transparent PNG.",
    },
    {
      file: "evade/keychain/src/charm-bobo.png",
      name: "Bobo keychain charm.png",
      mime: "image/png",
      group: "art",
      note: "The keychain as made.",
    },
    {
      file: "evade/keychain/src/charm-eclipse.png",
      name: "Eclipse can keychain charm.png",
      mime: "image/png",
      group: "art",
      note: "The keychain as made.",
    },
    {
      file: "evade/keychain/src/cat_art.png",
      name: "Bobo art (flat).png",
      mime: "image/png",
      group: "art",
      note: "",
    },
    {
      file: "evade/keychain/src/can_upright_art.png",
      name: "Eclipse can art (flat).png",
      mime: "image/png",
      group: "art",
      note: "",
    },
    {
      file: "evade/creators/assets/img/cola-run-splash.webp",
      name: "Cola Run splash screen.webp",
      mime: "image/webp",
      group: "splash",
      note: "Use as an end card.",
    },
    {
      file: "evade/creators/assets/img/og-card.jpg",
      name: "EVADE creators card.jpg",
      mime: "image/jpeg",
      group: "overlays",
      note: "",
    },
  ];
  const assets: UgcAsset[] = [];
  for (const s of assetSpecs) {
    const a = await addAsset(ns, campaign.id, { ...s, data: await publicBytes(s.file) });
    if (a) assets.push(a);
  }
  const clip = await addAsset(ns, campaign.id, {
    name: "SAMPLE gameplay placeholder.mp4",
    mime: "video/mp4",
    group: "gameplay",
    note: "Sample placeholder; real Cola Run clips go here.",
    data: b64(media.landscapeMp4),
  });
  const example = await addAsset(ns, campaign.id, {
    name: "SAMPLE scan reveal example.mp4",
    mime: "video/mp4",
    group: "gameplay",
    note: "Sample placeholder for the 15-second scan reveal example.",
    data: b64(media.verticalMp4),
  });
  for (const a of [clip, example]) if (a) assets.push(a);
  await saveCampaign(ns, {
    ...campaign,
    assetFileIds: assets.map((a) => a.id),
    coverAssetId: assets.find((a) => a.group === "splash")?.id ?? null,
    howTo: campaign.howTo && { ...campaign.howTo, exampleAssetId: example?.id ?? null },
  });

  // ---- creators -------------------------------------------------------------
  const store = await ugcStore(ns);
  let k = 0;
  for (const s of CREATORS) {
    k++;
    const id = `sample${String(k).padStart(2, "0")}${s.first.toLowerCase()}`;
    const email = sampleEmail(s.first);
    await claimCreatorEmail(ns, email, id);
    const created = now - s.daysAgo * DAY;
    const name = `${s.first} ${s.last}`;
    const creator = newCreatorFrom(
      id,
      {
        name,
        creatorName: s.creatorName,
        email,
        country: s.country,
        platforms: Object.keys(s.handles) as UgcPlatform[],
        mainPlatform: s.main,
        handles: s.handles,
        audiences: Object.fromEntries(
          Object.keys(s.handles).map((p, i) => [p, ["1K–10K", "10K–50K", "Under 1K"][i % 3]]),
        ),
        applicationNotes: s.notes ?? "",
        consent: { contact: true, at: created },
        source: {
          kind: "seed",
          submissionId: null,
          submittedAt: created,
          page: "/evade/creators/",
          source: "sample",
          utm: { source: "sample" },
        },
      },
      s.status,
      created,
    );
    creator.sample = true;
    creator.createdAt = created;
    creator.statusChangedAt = now - Math.max(0, s.daysAgo - 3) * DAY;
    creator.approvedAt = s.status === "applied" ? null : created + DAY;
    creator.campaignIds = s.status === "applied" || s.status === "declined" ? [] : [campaign.id];
    creator.joinedAt = reached(s.status, "shipped") ? created + 2 * DAY : null;
    await saveCreator(ns, creator);
    await savePii(ns, {
      creatorId: id,
      phone: `+1 555 01${String(k).padStart(2, "0")}`,
      address: {
        name,
        line1: `${100 + k * 7} Sample Street`,
        line2: k % 3 === 0 ? `Apt ${k}` : "",
        city: s.city,
        region: s.region,
        postalCode: s.postalCode,
        country: s.country,
      },
      purgeAfter: null,
      purgedAt: null,
      updatedAt: 0,
    });
    await logActivity(ns, id, {
      kind: "account",
      title: "Applied",
      body: "Sample sign-up.",
      at: created,
    });
    if (s.status === "declined" || s.status === "applied") continue;
    await logActivity(ns, id, {
      kind: "status",
      actor: "medialife",
      title: "You're in! Application approved",
      at: created + DAY,
    });

    // shipment
    const sh = emptyShipment(id, campaign.id, campaign.items);
    if (reached(s.status, "shipped")) {
      sh.packedAt = created + 2 * DAY;
      sh.shippedAt = created + 3 * DAY;
      sh.carrier = "USPS";
      sh.tracking = `9400 1000 0000 0000 00${String(k).padStart(2, "0")}`.replace(/\s/g, "");
      sh.trackingUrl = trackingUrlFor(sh.carrier, sh.tracking);
      await logActivity(ns, id, {
        kind: "shipment",
        actor: "medialife",
        title: "Your package shipped",
        body: `USPS · ${sh.tracking}`,
        at: sh.shippedAt,
      });
    }
    if (reached(s.status, "content-due")) {
      sh.deliveredAt = created + 6 * DAY;
      await logActivity(ns, id, {
        kind: "shipment",
        actor: "medialife",
        title: "Your package was delivered",
        at: sh.deliveredAt,
      });
    }
    await saveShipment(ns, sh);
    await saveBriefProgress(ns, id, campaign.id, {
      shotIds: reached(s.status, "submitted")
        ? ["scan-reveal", "unbox"]
        : reached(s.status, "content-due")
          ? ["unbox"]
          : [],
      seenVersion: reached(s.status, "shipped") ? 1 : 0,
      updatedAt: now,
    });

    // submissions
    const subs: {
      status: UgcSubmissionStatus;
      vertical: boolean;
      comment?: string;
      reply?: string;
      live?: string;
    }[] = [];
    if (s.status === "submitted") subs.push({ status: "in-review", vertical: true });
    if (s.status === "changes-requested")
      subs.push({
        status: "changes-requested",
        vertical: false,
        comment:
          "Love the energy! This brief asks for vertical (9:16), and we need to see the keychain tap the phone before Cola Run opens. Could you reshoot the scan in portrait?",
        reply: "Totally, refilming tomorrow in portrait!",
      });
    if (s.status === "approved-content") {
      subs.push({
        status: "approved",
        vertical: true,
        comment: "Perfect scan reveal. Approved, go post it!",
      });
      subs.push({
        status: "rejected",
        vertical: false,
        comment: "We'll use your vertical cut instead of this one.",
      });
    }
    if (s.status === "posted")
      subs.push({
        status: "posted",
        vertical: true,
        comment: "Approved, thank you!",
        live: "https://www.tiktok.com/@zoezoomies/video/7400000000000000000",
      });

    let j = 0;
    for (const sub of subs) {
      j++;
      const sid = `${id}sub${j}`;
      const bytes = b64(sub.vertical ? media.verticalMp4 : media.landscapeMp4);
      const poster = b64(sub.vertical ? media.verticalPoster : media.landscapePoster);
      const { ref, chunks } = await writeBytes(ns, `files/${sid}`, bytes);
      await ugcStorage(ns).putObject(`posters/${sid}`, poster);
      const w = sub.vertical ? 360 : 640;
      const h = sub.vertical ? 640 : 360;
      const at = (sh.deliveredAt ?? now) + j * DAY;
      const rec: UgcSubmission = {
        id: sid,
        creatorId: id,
        campaignId: campaign.id,
        storage: ref,
        name: sub.vertical
          ? `SAMPLE ${s.creatorName} scan reveal.mp4`
          : `SAMPLE ${s.creatorName} unboxing (landscape).mp4`,
        mime: "video/mp4",
        size: bytes.byteLength,
        chunks,
        mediaType: "video",
        durationS: sub.vertical ? 4 : 3,
        width: w,
        height: h,
        aspect: aspectOf(w, h),
        poster: { key: `posters/${sid}`, mime: "image/jpeg", size: poster.byteLength },
        fingerprint: null,
        shotIds: sub.vertical ? ["scan-reveal"] : ["unbox"],
        platform: "tiktok",
        note: "",
        status: sub.status,
        liveUrl: sub.live ?? null,
        disclosureConfirmed: !!sub.live,
        postedAt: sub.live ? at + 2 * DAY : null,
        reviewedAt: sub.status === "in-review" ? null : at + DAY,
        briefVersion: 1,
        createdAt: at,
        updatedAt: at,
        completedAt: at,
        sample: true,
      };
      await saveSubmission(ns, rec);
      await store.setJSON(UKEYS.upload(sid), {
        id: sid,
        target: "submission",
        creatorId: id,
        campaignId: campaign.id,
        createdAt: at,
      });
      await logActivity(ns, id, {
        kind: "upload",
        actor: "creator",
        title: `You uploaded ${rec.name}`,
        submissionId: sid,
        at,
      });
      if (sub.comment)
        await addComment(ns, sid, { author: "medialife", name: "MEDIALIFE", body: sub.comment });
      if (sub.reply)
        await addComment(ns, sid, { author: "creator", name: s.creatorName, body: sub.reply });
    }

    // perks
    if (s.status === "posted" || s.status === "approved-content") {
      await savePerk(ns, {
        id: newId(8),
        creatorId: id,
        kind: "discount",
        title: "20% off your audience's first order",
        description: "Share this code with your followers. Pasted from Shopify (sample).",
        code: `SAMPLE-${s.creatorName.toUpperCase()}20`,
        url: null,
        percentOff: 20,
        expiresAt: now + 60 * DAY,
        createdAt: now - DAY,
        updatedAt: now - DAY,
      });
    }
    if (s.status === "posted") {
      await savePerk(ns, {
        id: newId(8),
        creatorId: id,
        kind: "early-access",
        title: "Early access: the next EVADE drop",
        description: "You'll see the next keychain a week before anyone else (sample).",
        code: null,
        url: null,
        percentOff: null,
        expiresAt: null,
        createdAt: now - DAY,
        updatedAt: now - DAY,
      });
      await savePerk(ns, {
        id: newId(8),
        creatorId: id,
        kind: "collab",
        title: "Cola Run speedrun collab",
        description: "Join a group video with other EVADE creators next month (sample).",
        code: null,
        url: "https://medialife.ai",
        percentOff: null,
        expiresAt: null,
        createdAt: now - DAY,
        updatedAt: now - DAY,
      });
    }
  }
  return { created: true, campaignId: SAMPLE_CAMPAIGN_ID, logins: SAMPLE_LOGINS };
}
