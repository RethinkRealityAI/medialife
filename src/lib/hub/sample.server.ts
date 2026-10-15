import { getRequest } from "@tanstack/react-start/server";

import { writeSampleShelfSessions } from "@/lib/ar/shelf-sample.server";
import { ensurePartnerCreatorShelves } from "@/lib/shelf/partner-seed.server";

import { claimEmail, findUserByEmail, hashPassword, saveUser, type HubUser } from "./auth.server";
import { CURRENT, agreementText, termsFor } from "./agreements";
import {
  createCreator,
  getCreator,
  getInvite,
  logActivity,
  newTriggerCode,
  postToThread,
  saveCreator,
  saveCreatorAdmin,
  saveExperience,
  saveFolder,
  saveInvite,
  saveOrder,
  savePayout,
  saveProduct,
} from "./data.server";
import type { AssetSection } from "./assets";
import { writeFile } from "./files.server";
import {
  SKUS,
  type Experience,
  type HubFile,
  type Invite,
  type Order,
  type Product,
  type ScanStats,
  type SkuId,
  type StageId,
} from "./model";
import { SNOWDAY_PRESET } from "./partners";
import { getPartner, listMembers, saveMember, savePartner, saveSignature } from "./partners.server";
import { KEYS, hubStore, newId, sha256Hex, type HubNamespace } from "./store.server";

// A complete sample creator for deploy previews and localhost: an account you
// can sign in to, products at every stage, a live experience, a proof waiting
// for approval, collateral, two months of orders, scans and a payout. Production
// refuses it (see adminSeedSample).

export const SAMPLE_LOGIN = {
  email: "sample.creator@medialife.test",
  password: "creator-hub-demo",
} as const;

const DAY = 86_400_000;

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  try {
    const origin = new URL(getRequest().url).origin;
    const res = await fetch(new URL(path, origin));
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** A seeded pseudo-random stream, so the sample data looks the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function seedSampleCreator(ns: HubNamespace) {
  const existing = await findUserByEmail(ns, SAMPLE_LOGIN.email);
  if (existing) {
    await seedSamplePartner(ns, existing.creatorId);
    return {
      creatorId: existing.creatorId,
      login: SAMPLE_LOGIN,
      partnerLogin: SAMPLE_PARTNER_LOGIN,
      created: false,
    };
  }

  const now = Date.now();
  const userId = newId();
  if (!(await claimEmail(ns, SAMPLE_LOGIN.email, userId))) {
    return { creatorId: null, login: SAMPLE_LOGIN, created: false };
  }
  const creator = await createCreator(ns, userId, SAMPLE_LOGIN.email);
  Object.assign(creator, {
    status: "approved",
    submittedAt: now - 70 * DAY,
    approvedAt: now - 68 * DAY,
    intakeStep: 4,
    revenueShare: 0.2,
    agency: { ...SNOWDAY_AGENCY },
    inviteCode: SNOWDAY_PRESET.id,
  });
  creator.profile = {
    ...creator.profile,
    displayName: "PixelPine",
    legalName: "Sam Rivera",
    country: "Canada",
    timezone: "America/Toronto",
    bio: "Minecraft builds, cozy survival series and the occasional speedrun.",
    categories: ["Gaming", "Minecraft"],
    audienceRegions: "US, Canada, UK",
  };
  creator.channels = [
    {
      platform: "youtube",
      handle: "@pixelpine",
      url: "https://youtube.com/@pixelpine",
      audience: 1_240_000,
      primary: true,
    },
    {
      platform: "twitch",
      handle: "pixelpine",
      url: "https://twitch.tv/pixelpine",
      audience: 86_000,
      primary: false,
    },
    {
      platform: "x",
      handle: "@pixelpine",
      url: "https://x.com/pixelpine",
      audience: 41_000,
      primary: false,
    },
  ];
  creator.contact = {
    ...creator.contact,
    discordUsername: "pixelpine",
    discordId: "184736251908374528",
  };
  creator.interests = {
    ...creator.interests,
    skus: ["tee", "keychain", "sticker"],
    designSupport: "mix",
    timing: "asap",
    experienceIdeas:
      "A hidden build fans can explore, and a shout-out video for the first 500 scans.",
  };
  creator.payout = { method: "paypal", email: "payouts@pixelpine.test", note: "" };
  creator.consent = { termsAt: now - 70 * DAY, marketing: true };
  await saveCreator(ns, creator);
  await saveCreatorAdmin(ns, creator.id, {
    internalNotes: "Sample creator for previews.",
    manager: {
      name: "Jordan (MEDIALIFE)",
      email: "creators@medialife.ai",
      discord: "jordan.medialife",
    },
    tags: ["sample"],
  });

  const user: HubUser = {
    id: userId,
    email: SAMPLE_LOGIN.email,
    emailVerified: true,
    passwordHash: await hashPassword(SAMPLE_LOGIN.password),
    discord: null,
    creatorId: creator.id,
    createdAt: now - 70 * DAY,
    lastLoginAt: null,
    disabled: false,
  };
  await saveUser(ns, user);

  // Files: product mockups from the site's own merch art, and a small asset
  // library (sections, folders, tags) built from the site's own media.
  const file = async (
    path: string,
    name: string,
    kind: HubFile["kind"],
    category: string,
    productId: string | null,
    extra: Partial<Pick<HubFile, "mime" | "section" | "folderId" | "tags" | "starred" | "note">> & {
      ageDays?: number;
    } = {},
  ) => {
    const bytes = await fetchBytes(path);
    if (!bytes) return null;
    const { ageDays, ...meta } = extra;
    return writeFile(
      ns,
      {
        creatorId: creator.id,
        name,
        mime: "image/webp",
        kind,
        category,
        productId,
        note: "",
        uploadedBy: kind === "artwork" ? "creator" : "medialife",
        ...(ageDays ? { createdAt: now - ageDays * DAY } : {}),
        ...meta,
      },
      bytes,
    );
  };
  const folder = async (name: string, section: AssetSection, ageDays: number) =>
    saveFolder(ns, {
      id: newId(10),
      creatorId: creator.id,
      name,
      section,
      createdAt: now - ageDays * DAY,
      createdBy: "creator",
    });

  const experience: Experience = {
    id: newId(),
    creatorId: creator.id,
    name: "The Hidden Grove",
    kind: "ar",
    status: "live",
    description:
      "Scan the merch and PixelPine's secret build grows out of the table in AR, with a hidden chest to find.",
    reward: "An exclusive in-world banner code and a behind-the-scenes video",
    url: "https://medialife.ai/activated-retail",
    previewUrl: "https://medialife.ai/activated-retail",
    imageFileId: null,
    createdAt: now - 50 * DAY,
    updatedAt: now - 10 * DAY,
  };
  await saveExperience(ns, experience);

  const plan: Array<{
    sku: SkuId;
    name: string;
    stage: StageId;
    price: number;
    ageDays: number;
    waitingOn: Product["waitingOn"];
    nextStep: string;
    eta: number | null;
  }> = [
    {
      sku: "keychain",
      name: "Grove Spirit Keychain",
      stage: "live",
      price: 1800,
      ageDays: 64,
      waitingOn: "medialife",
      nextStep: "",
      eta: null,
    },
    {
      sku: "tee",
      name: "Hidden Grove Tee",
      stage: "live",
      price: 3900,
      ageDays: 60,
      waitingOn: "medialife",
      nextStep: "",
      eta: null,
    },
    {
      sku: "sticker",
      name: "Holo Sticker Pack",
      stage: "approval",
      price: 900,
      ageDays: 12,
      waitingOn: "creator",
      nextStep: "Review design v2 and approve it or ask for changes.",
      eta: 24,
    },
    {
      sku: "tee",
      name: "Winter Build Tee",
      stage: "production",
      price: 4200,
      ageDays: 30,
      waitingOn: "medialife",
      nextStep: "Tags are being programmed. Stock ships next week.",
      eta: 12,
    },
  ];
  const order: StageId[] = [
    "brief",
    "artwork",
    "approval",
    "sampling",
    "production",
    "shipping",
    "live",
  ];
  const products: Product[] = [];
  for (const p of plan) {
    const created = now - p.ageDays * DAY;
    const upto = order.indexOf(p.stage);
    const history = order.slice(0, upto + 1).map((s, i) => ({
      stage: s,
      at: created + Math.round(((now - created) * i) / Math.max(1, upto + 1)),
      note: i === 0 ? "Product created" : "",
    }));
    const product: Product = {
      id: newId(),
      creatorId: creator.id,
      sku: p.sku,
      name: p.name,
      campaign: p.stage === "live" ? "Launch Drop" : "Winter Drop 2026",
      stage: p.stage,
      stageUpdatedAt: history[history.length - 1].at,
      history,
      waitingOn: p.waitingOn,
      nextStep: p.nextStep,
      eta: p.eta ? new Date(now + p.eta * DAY).toISOString().slice(0, 10) : null,
      price: p.price,
      currency: "USD",
      revenueShare: null,
      units: p.sku === "sticker" ? 1000 : 250,
      proofs: [],
      artworkIds: [],
      imageFileId: null,
      experienceId: experience.id,
      trigger: {
        method: p.sku === "tee" ? "both" : "qr",
        code: await newTriggerCode(ns),
        placement:
          p.sku === "tee"
            ? "NFC patch on the sleeve, QR inside the back print"
            : "Printed QR on the back",
      },
      commerce: {
        shopUrl: p.stage === "live" ? "https://shop.medialife.ai/" : "",
        shopifyProductIds: [],
        skus: [`SAMPLE-${p.sku.toUpperCase()}-${products.length + 1}`],
      },
      createdAt: created,
      updatedAt: now,
    };
    const art = SKUS[p.sku].image;
    const mock = await file(art, `${p.name} mockup.webp`, "mockup", "mockup", product.id);
    if (mock) product.imageFileId = mock.id;
    if (p.stage === "approval") {
      const v1 = await file(art, `${p.name} proof v1.webp`, "proof", "proof", product.id);
      const v2 = await file(art, `${p.name} proof v2.webp`, "proof", "proof", product.id);
      if (v1 && v2) {
        product.proofs = [
          {
            id: newId(6),
            version: 1,
            fileId: v1.id,
            note: "First pass: holo foil on the outline.",
            createdAt: now - 6 * DAY,
            decision: "changes",
            decidedAt: now - 5 * DAY,
            feedback: "Love it! Can the pine be greener and the QR smaller?",
          },
          {
            id: newId(6),
            version: 2,
            fileId: v2.id,
            note: "Greener pine, QR moved to the backing card.",
            createdAt: now - 1 * DAY,
            decision: "pending",
            decidedAt: null,
            feedback: "",
          },
        ];
      }
    } else if (p.stage !== "brief") {
      const v1 = await file(art, `${p.name} proof v1.webp`, "proof", "proof", product.id);
      if (v1) {
        product.proofs = [
          {
            id: newId(6),
            version: 1,
            fileId: v1.id,
            note: "Final design.",
            createdAt: created + 6 * DAY,
            decision: "approved",
            decidedAt: created + 7 * DAY,
            feedback: "",
          },
        ];
      }
    }
    if (p.stage === "live") {
      await file(art, `${p.name} poster.webp`, "collateral", "poster", product.id);
      await file(art, `${p.name} social post.webp`, "collateral", "social", product.id);
    }
    await saveProduct(ns, product);
    products.push(product);
  }

  const logos = await folder("Logos", "branding", 66);
  const launch = await folder("Launch drop posts", "social", 58);
  const models = await folder("Game models", "3d", 40);
  await file("/merch/keychain-cutout.webp", "pixelpine-character.webp", "artwork", "asset", null, {
    section: "art",
    tags: ["Character", "Key art", "Transparent"],
    starred: true,
    note: "Grove Spirit, the main character. Use this pose for merch.",
    ageDays: 65,
  });
  await file("/merch/evade-wordmark.png", "pixelpine-wordmark.png", "artwork", "asset", null, {
    mime: "image/png",
    section: "branding",
    folderId: logos.id,
    tags: ["Wordmark", "Logo", "Transparent"],
    starred: true,
    ageDays: 66,
  });
  await file("/merch/keychain-hand.webp", "launch-teaser-post.webp", "artwork", "asset", null, {
    section: "social",
    folderId: launch.id,
    tags: ["Post", "Merch idea"],
    ageDays: 57,
  });
  await file("/merch/keychain-qr.webp", "scan-me-story.webp", "artwork", "asset", null, {
    section: "social",
    folderId: launch.id,
    tags: ["Story"],
    ageDays: 56,
  });
  await file("/work/sakamoto-motion-character.mp4", "channel-intro.mp4", "artwork", "asset", null, {
    mime: "video/mp4",
    section: "video",
    tags: ["Intro", "Animation"],
    ageDays: 45,
  });
  await file(
    "/roblox/activated-retail/models/catbobo.glb",
    "grove-spirit.glb",
    "artwork",
    "asset",
    null,
    {
      mime: "model/gltf-binary",
      section: "3d",
      folderId: models.id,
      tags: ["Character", "Merch idea"],
      note: "Game-ready model. Good base for a plush or a figure.",
      ageDays: 40,
    },
  );
  await file(
    "/roblox/activated-retail/models/ev_hoodie.glb",
    "hoodie-concept.glb",
    "artwork",
    "asset",
    null,
    {
      mime: "model/gltf-binary",
      section: "3d",
      tags: ["Merch idea", "Draft"],
      ageDays: 20,
    },
  );

  // Orders and scans for the live products, over the last 60 days. Built in
  // memory and written in parallel batches: a function has seconds, not minutes.
  const rand = rng(42);
  const live = products.filter((p) => p.stage === "live");
  const countries = ["US", "US", "US", "CA", "CA", "GB", "AU", "DE"];
  const orders: Order[] = [];
  const scans = new Map<string, ScanStats>();
  let n = 1001;
  for (let d = 58; d >= 0; d--) {
    const perDay = Math.floor(rand() * 6) + (d < 20 ? 3 : 1);
    for (let k = 0; k < perDay; k++) {
      const p = live[Math.floor(rand() * live.length)];
      const qty = rand() < 0.15 ? 2 : 1;
      const createdAt = now - d * DAY - Math.floor(rand() * DAY * 0.8);
      const refunded = rand() < 0.03;
      orders.push({
        id: `shopify-sample-${n}`,
        creatorId: creator.id,
        source: "shopify",
        channel: rand() < 0.85 ? "shop.medialife.ai" : "TikTok Shop",
        externalId: `sample-${n}`,
        number: `#${n}`,
        createdAt,
        currency: "USD",
        status: refunded ? "refunded" : "paid",
        country: countries[Math.floor(rand() * countries.length)],
        lines: [
          {
            productId: p.id,
            name: p.name,
            sku: p.commerce.skus[0],
            qty,
            unitPrice: p.price ?? 0,
            discount: rand() < 0.2 ? Math.round((p.price ?? 0) * qty * 0.1) : 0,
            refunded: refunded ? (p.price ?? 0) * qty : 0,
            refundedQty: refunded ? qty : 0,
            share: 0.2,
          },
        ],
      });
      n++;
      const st = scans.get(p.id) ?? { total: 0, byDay: {}, lastAt: null };
      const count = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < count; s++) {
        const at = Math.min(now, createdAt + DAY * rand() * Math.min(d, 5));
        const day = new Date(at).toISOString().slice(0, 10);
        st.byDay[day] = (st.byDay[day] ?? 0) + 1;
        st.total++;
        st.lastAt = Math.max(st.lastAt ?? 0, at);
      }
      scans.set(p.id, st);
    }
  }
  for (let i = 0; i < orders.length; i += 25) {
    await Promise.all(orders.slice(i, i + 25).map((o) => saveOrder(ns, o)));
  }
  const store = await hubStore(ns);
  await Promise.all(
    [...scans].map(([productId, st]) => store.setJSON(KEYS.scans(creator.id, productId), st)),
  );

  await savePayout(ns, {
    id: newId(),
    creatorId: creator.id,
    amount: 21_450,
    currency: "USD",
    periodLabel: `${new Date(now - 60 * DAY).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })} sales`,
    paidAt: now - 15 * DAY,
    reference: "PP-SAMPLE-0001",
  });

  const sticker = products.find((p) => p.stage === "approval")!;
  await postToThread(ns, creator.id, sticker.id, {
    author: "medialife",
    name: "Jordan (MEDIALIFE)",
    body: "Here's v1 of the holo pack. The outline is foil, the rest is matte.",
  });
  await postToThread(ns, creator.id, sticker.id, {
    author: "creator",
    name: "PixelPine",
    body: "Love it! Can the pine be greener and the QR smaller?",
  });
  await postToThread(ns, creator.id, sticker.id, {
    author: "medialife",
    name: "Jordan (MEDIALIFE)",
    body: "Done in v2 — QR moved to the backing card so the art stays clean.",
  });

  const events: Array<Parameters<typeof logActivity>[2]> = [
    {
      kind: "application",
      title: "Application approved",
      body: "Welcome to the Activated Merchandise Program.",
      at: now - 68 * DAY,
    },
    {
      kind: "stage",
      title: "Grove Spirit Keychain is live",
      body: "Every scan now opens The Hidden Grove.",
      at: now - 40 * DAY,
      productId: products[0].id,
    },
    {
      kind: "stage",
      title: "Hidden Grove Tee is live",
      body: "On sale at shop.medialife.ai.",
      at: now - 36 * DAY,
      productId: products[1].id,
    },
    {
      kind: "payout",
      title: "Payout sent: $214.50",
      body: "Earnings for your first month.",
      at: now - 15 * DAY,
    },
    {
      kind: "stage",
      title: "Winter Build Tee: Production",
      body: "The run is being manufactured.",
      at: now - 4 * DAY,
      productId: products[3].id,
    },
    {
      kind: "proof",
      title: "Design v2 of Holo Sticker Pack is ready for you",
      body: "Greener pine, QR moved to the backing card.",
      at: now - 1 * DAY,
      productId: sticker.id,
      actionable: true,
    },
  ];
  for (const e of events) await logActivity(ns, creator.id, e);

  // They signed the program agreement when they were approved.
  const terms = termsFor(creator);
  await saveSignature(ns, {
    id: newId(8),
    creatorId: creator.id,
    agreementId: CURRENT.id,
    version: CURRENT.version,
    title: CURRENT.title,
    signedName: creator.profile.legalName || creator.profile.displayName,
    legalName: creator.profile.legalName,
    email: SAMPLE_LOGIN.email,
    terms,
    textHash: await sha256Hex(agreementText(CURRENT, terms)),
    signedAt: now - 67 * DAY,
    ip: "sample",
    userAgent: "sample",
    guardian: null,
  });

  await seedSamplePartner(ns, creator.id);
  return {
    creatorId: creator.id,
    login: SAMPLE_LOGIN,
    partnerLogin: SAMPLE_PARTNER_LOGIN,
    created: true,
  };
}

export const SAMPLE_PARTNER_LOGIN = {
  email: "sample.partner@medialife.test",
  password: "partner-hub-demo",
} as const;

/** Snowday's contact for the program, who brings the sample creators in. */
const SNOWDAY_REP = "Fay Chukwueke";
/** Pictures of the seeded shelves (scripts: see the PR), one per slug. */
const SNOWDAY_SNAPSHOTS = "/partner-kit/snowday/shelf/snapshots";
/** Her own invite link: the code createPartnerLink derives for her name. */
const SNOWDAY_REP_CODE = "snowday-fay-chukwueke";
const SNOWDAY_AGENCY = { id: SNOWDAY_PRESET.id, name: SNOWDAY_PRESET.name, rep: SNOWDAY_REP };

/**
 * Snowday Media's own creators, as listed on snowdaymedia.ca: handles and
 * audiences from their channels, contact emails in the agency's format. No
 * orders or earnings: they're new to the program. Avatars (cropped from
 * Snowday's roster cards) live in public/partner-kit/snowday/creators/.
 */
const SNOWDAY_CREATORS: Array<{
  name: string;
  /** file name in public/partner-kit/snowday/creators/ and the email's local part */
  key: string;
  status: "submitted" | "approved";
  signed: boolean;
  /** applied this many days ago */
  days: number;
  bio: string;
  categories: string[];
  youtube: { handle: string; audience: number };
  x: { handle: string; audience: number };
}> = [
  {
    name: "JellyBean",
    key: "jellybean",
    status: "approved",
    signed: true,
    days: 12,
    bio: "Variety gaming.",
    categories: ["Gaming", "Variety"],
    youtube: { handle: "@JellyBean", audience: 6_150_000 },
    x: { handle: "@BeanNotHere", audience: 159_100 },
  },
  {
    name: "SmokeeBee",
    key: "smokeebee",
    status: "approved",
    signed: false,
    days: 8,
    bio: "Art and animation, and gaming.",
    categories: ["Animation / Art", "Gaming"],
    youtube: { handle: "@SmokeeBee", audience: 2_100_000 },
    x: { handle: "@Smokee_Bee", audience: 36_200 },
  },
  {
    name: "Augusttheduck",
    key: "augusttheduck",
    status: "submitted",
    signed: false,
    days: 1,
    bio: "Commentary and creator news.",
    categories: ["Commentary"],
    youtube: { handle: "@augusttheduck", audience: 2_160_000 },
    x: { handle: "@oohgust", audience: 10_100 },
  },
];

const snowdayAvatar = (key: string) => `/partner-kit/snowday/creators/${key}.webp`;

/** Made-up creators earlier versions of this seed tied to Snowday. */
const RETIRED_SAMPLE_EMAILS = ["frostbyte@sample.test", "mochilune@sample.test"];

/**
 * Snowday Media as a sample partner: the partner, its invite links, a team
 * admin you can sign in as (Fay), Snowday's real creators at different steps,
 * and a live merch shelf already built for each of them. Safe to run again,
 * and it brings stores seeded by earlier versions up to date.
 */
async function seedSamplePartner(ns: HubNamespace, sampleCreatorId: string | null) {
  const now = Date.now();
  let partner = await getPartner(ns, SNOWDAY_PRESET.id);
  if (!partner) {
    partner = await savePartner(ns, {
      ...SNOWDAY_PRESET,
      brand: { ...SNOWDAY_PRESET.brand },
      status: "active",
      notes: "Sample partner for previews.",
      createdAt: now - 75 * DAY,
      updatedAt: now,
    });
  }
  if (!(await getInvite(ns, SNOWDAY_PRESET.id))) {
    await saveInvite(ns, {
      code: SNOWDAY_PRESET.id,
      agencyId: SNOWDAY_PRESET.id,
      agencyName: SNOWDAY_PRESET.name,
      rep: "",
      note: "Default link",
      createdAt: now - 75 * DAY,
      uses: 1,
      archived: false,
    });
  }
  if (!(await getInvite(ns, SNOWDAY_REP_CODE))) {
    await saveInvite(ns, {
      code: SNOWDAY_REP_CODE,
      agencyId: SNOWDAY_PRESET.id,
      agencyName: SNOWDAY_PRESET.name,
      rep: SNOWDAY_REP,
      note: "Snowday roster",
      createdAt: now - 72 * DAY,
      uses: SNOWDAY_CREATORS.length,
      archived: false,
    });
  }
  // Earlier versions made a link for a made-up rep, Alex; nothing uses it now.
  // Read directly: getInvite hides archived links.
  const store = await hubStore(ns);
  const oldLink = await store.getJSON<Invite>(KEYS.invite("snowday-alex"));
  if (oldLink?.agencyId === SNOWDAY_PRESET.id && oldLink.rep === "Alex")
    await store.del(KEYS.invite(oldLink.code));

  if (sampleCreatorId) {
    const c = await getCreator(ns, sampleCreatorId);
    if (c && (c.agency?.id !== SNOWDAY_PRESET.id || c.agency.rep !== SNOWDAY_REP))
      await saveCreator(ns, { ...c, agency: { ...SNOWDAY_AGENCY } });
  }

  await seedSamplePartnerAdmin(ns, now);
  await retireOldSampleCreators(ns);

  const shelfFor: Array<{
    id: string;
    name: string;
    logo: string;
    handle: string;
    snapshot: string;
  }> = [];
  for (const sc of SNOWDAY_CREATORS) {
    const id = await seedSnowdayCreator(ns, sc, now);
    if (id)
      shelfFor.push({
        id,
        name: sc.name,
        logo: snowdayAvatar(sc.key),
        handle: sc.youtube.handle,
        snapshot: `${SNOWDAY_SNAPSHOTS}/${sc.key}.webp`,
      });
  }
  // Their shelves, already built and live, with link-preview pictures shipped
  // with the site. The hub and the shelves share a namespace.
  const slugs = await ensurePartnerCreatorShelves(ns, partner, shelfFor, {
    snapshot: `${SNOWDAY_SNAPSHOTS}/${SNOWDAY_PRESET.id}.webp`,
  });
  // A fortnight of visits to each shelf, so "Shelf activity" has a story to
  // tell. Never written in prod; cleared with the other sample data.
  await writeSampleShelfSessions(ns, [SNOWDAY_PRESET.id, ...Object.values(slugs)]).catch(() => {});
}

/** The team admin you sign in as. Renames the earlier "Alex (Snowday)" in place. */
async function seedSamplePartnerAdmin(ns: HubNamespace, now: number) {
  const existing = await findUserByEmail(ns, SAMPLE_PARTNER_LOGIN.email);
  if (existing) {
    if (existing.name !== SNOWDAY_REP) await saveUser(ns, { ...existing, name: SNOWDAY_REP });
    const member = (await listMembers(ns, SNOWDAY_PRESET.id)).find((m) => m.userId === existing.id);
    if (member && member.name !== SNOWDAY_REP)
      await saveMember(ns, { ...member, name: SNOWDAY_REP });
    return;
  }
  const userId = newId();
  if (!(await claimEmail(ns, SAMPLE_PARTNER_LOGIN.email, userId))) return;
  await saveUser(ns, {
    id: userId,
    email: SAMPLE_PARTNER_LOGIN.email,
    emailVerified: true,
    passwordHash: await hashPassword(SAMPLE_PARTNER_LOGIN.password),
    discord: null,
    creatorId: null,
    partner: { id: SNOWDAY_PRESET.id, role: "admin" },
    name: SNOWDAY_REP,
    createdAt: now - 74 * DAY,
    lastLoginAt: null,
    disabled: false,
  });
  await saveMember(ns, {
    userId,
    partnerId: SNOWDAY_PRESET.id,
    email: SAMPLE_PARTNER_LOGIN.email,
    name: SNOWDAY_REP,
    role: "admin",
    joinedAt: now - 74 * DAY,
    invitedBy: "The MEDIALIFE team",
  });
}

/**
 * Takes the made-up creators earlier versions seeded (Frostbyte, Mochi Lune)
 * off every list: their profile and index entry go, their login is disabled.
 * Only ever those sample addresses, and only while they're tied to Snowday.
 */
async function retireOldSampleCreators(ns: HubNamespace) {
  const store = await hubStore(ns);
  for (const email of RETIRED_SAMPLE_EMAILS) {
    const user = await findUserByEmail(ns, email);
    if (!user?.creatorId) continue;
    const c = await getCreator(ns, user.creatorId);
    if (c && c.agency?.id !== SNOWDAY_PRESET.id) continue;
    const id = user.creatorId;
    await store.del(KEYS.creator(id));
    await store.update<Record<string, unknown>>(KEYS.creatorIndex(), (cur) => {
      const next = { ...(cur ?? {}) };
      delete next[id];
      return next;
    });
    await saveUser(ns, { ...user, creatorId: null, disabled: true });
  }
}

/** One of Snowday's creators; returns their creator id (made now or before). */
async function seedSnowdayCreator(
  ns: HubNamespace,
  sc: (typeof SNOWDAY_CREATORS)[number],
  now: number,
): Promise<string | null> {
  const email = `${sc.key}@snwdy.ca`;
  const existing = await findUserByEmail(ns, email);
  if (existing) return existing.creatorId;
  const uid = newId();
  if (!(await claimEmail(ns, email, uid))) return null;
  const c = await createCreator(ns, uid, email);
  const submittedAt = now - sc.days * DAY;
  const approvedAt = sc.status === "approved" ? submittedAt + 2 * DAY : null;
  Object.assign(c, {
    status: sc.status,
    createdAt: submittedAt - DAY,
    submittedAt,
    approvedAt,
    intakeStep: 4,
    revenueShare: 0.2,
    agency: { ...SNOWDAY_AGENCY },
    inviteCode: SNOWDAY_REP_CODE,
  });
  c.profile = {
    ...c.profile,
    displayName: sc.name,
    email,
    bio: sc.bio,
    categories: sc.categories,
  };
  c.channels = [
    {
      platform: "youtube",
      handle: sc.youtube.handle,
      url: `https://www.youtube.com/${sc.youtube.handle}`,
      audience: sc.youtube.audience,
      primary: true,
    },
    {
      platform: "x",
      handle: sc.x.handle,
      url: `https://x.com/${sc.x.handle.replace(/^@/, "")}`,
      audience: sc.x.audience,
      primary: false,
    },
  ];
  c.contact = { ...c.contact, managerName: SNOWDAY_REP };
  c.consent = { termsAt: submittedAt, marketing: false };
  await saveCreator(ns, c);
  await saveUser(ns, {
    id: uid,
    email,
    emailVerified: true,
    passwordHash: null,
    discord: null,
    creatorId: c.id,
    createdAt: submittedAt - DAY,
    lastLoginAt: null,
    disabled: false,
  });
  if (approvedAt) {
    await logActivity(ns, c.id, {
      kind: "application",
      title: "Application approved",
      body: "Welcome to the Activated Merchandise Program.",
      at: approvedAt,
    });
  }
  if (approvedAt && sc.signed) {
    const terms = termsFor(c);
    await saveSignature(ns, {
      id: newId(8),
      creatorId: c.id,
      agreementId: CURRENT.id,
      version: CURRENT.version,
      title: CURRENT.title,
      signedName: c.profile.legalName || c.profile.displayName,
      legalName: c.profile.legalName,
      email,
      terms,
      textHash: await sha256Hex(agreementText(CURRENT, terms)),
      signedAt: approvedAt + DAY,
      ip: "sample",
      userAgent: "sample",
      guardian: null,
    });
  }
  return c.id;
}
