import { getRequest } from "@tanstack/react-start/server";

import { claimEmail, findUserByEmail, hashPassword, saveUser, type HubUser } from "./auth.server";
import {
  createCreator,
  logActivity,
  newTriggerCode,
  postToThread,
  saveCreator,
  saveCreatorAdmin,
  saveExperience,
  saveOrder,
  savePayout,
  saveProduct,
} from "./data.server";
import { writeFile } from "./files.server";
import {
  SKUS,
  type Experience,
  type HubFile,
  type Order,
  type Product,
  type ScanStats,
  type SkuId,
  type StageId,
} from "./model";
import { KEYS, hubStore, newId, type HubNamespace } from "./store.server";

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
  if (existing) return { creatorId: existing.creatorId, login: SAMPLE_LOGIN, created: false };

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
    agency: { id: "sample-agency", name: "Sample Agency", rep: "Alex" },
    inviteCode: "sample",
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

  // Files: product mockups from the site's own merch art.
  const file = async (
    path: string,
    name: string,
    kind: HubFile["kind"],
    category: string,
    productId: string | null,
  ) => {
    const bytes = await fetchBytes(path);
    if (!bytes) return null;
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
      },
      bytes,
    );
  };

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
        shopUrl: "https://shop.medialife.ai/",
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

  await file(
    "/merch/keychain-cutout.webp",
    "pixelpine-character.webp",
    "artwork",
    "character",
    null,
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

  return { creatorId: creator.id, login: SAMPLE_LOGIN, created: true };
}
