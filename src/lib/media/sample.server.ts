import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { getRequest } from "@tanstack/react-start/server";

import { deleteAssets, listAssets, saveAssets } from "./data.server";
import {
  MEDIA,
  imageSize,
  kindOf,
  normaliseTags,
  resolveMediaMime,
  type MediaAsset,
  type MediaPurpose,
} from "./model";
import { mediaStorage } from "./storage.server";
import type { MediaNamespace } from "./store.server";

// Dev seed for the Media Library: imports the real EVADE art, product shots,
// 3D models and the two labelled "SAMPLE" placeholder clips from the repo, so
// the library isn't empty on localhost and deploy previews. Every record is
// flagged `sample: true`. Production refuses it (seedMediaSample checks the
// namespace, and so do POST /api/media/dev/seed and adminSeedMediaSample).

const DAY = 86_400_000;

type Spec = {
  file: string;
  title: string;
  client?: string;
  collection: string;
  purpose: MediaPurpose;
  tags: string[];
  description: string;
  usageNotes?: string;
  rights: string;
  public?: boolean;
  color?: string;
};

const EVADE_ART = "Client-supplied (EVADE)";
const IN_HOUSE = "Created in-house (MEDIALIFE)";
const EVADE_NOTE = "EVADE IP. No image-to-image or image-to-3D generation from this file.";

const SPECS: Spec[] = [
  // ---- EVADE creators landing page art ------------------------------------
  {
    file: "evade/creators/assets/img/cola-run-splash.webp",
    title: "Cola Run splash screen",
    collection: "Cola Run gameplay",
    purpose: "marketing",
    tags: ["Key art", "Hero", "Vertical", "Cola Run"],
    description:
      "Cola Run splash screen: Bobo and Eclipse sprinting through a neon city towards a giant cola can.",
    usageNotes: "Hero image on /evade/creators/. Works as an end card for UGC edits.",
    rights: EVADE_ART,
    public: true,
    color: "#3a1d5c",
  },
  {
    file: "evade/creators/assets/img/cola-run-splash-sm.webp",
    title: "Cola Run splash screen (small)",
    collection: "Cola Run gameplay",
    purpose: "marketing",
    tags: ["Key art", "Thumbnail", "Cola Run"],
    description: "Smaller web version of the Cola Run splash screen.",
    usageNotes: "Use on phones and for link previews.",
    rights: EVADE_ART,
    color: "#3a1d5c",
  },
  {
    file: "evade/creators/assets/img/bobo-cat.png",
    title: "Bobo the cat (transparent)",
    collection: "Bobo + Eclipse can art",
    purpose: "logo-brand",
    tags: ["Character", "Mascot", "Transparent", "Bobo"],
    description: "Bobo, EVADE's cat mascot, full body on a transparent background.",
    usageNotes: EVADE_NOTE,
    rights: EVADE_ART,
    color: "#e8a23a",
  },
  {
    file: "evade/creators/assets/img/bobo-cat.webp",
    title: "Bobo the cat (web)",
    collection: "Bobo + Eclipse can art",
    purpose: "logo-brand",
    tags: ["Character", "Mascot", "Transparent", "Bobo"],
    description: "Bobo, EVADE's cat mascot, web-sized WebP with transparency.",
    usageNotes: EVADE_NOTE,
    rights: EVADE_ART,
    public: true,
    color: "#e8a23a",
  },
  {
    file: "evade/creators/assets/img/eclipse-can.png",
    title: "Eclipse can (transparent)",
    collection: "Bobo + Eclipse can art",
    purpose: "logo-brand",
    tags: ["Character", "Transparent", "Eclipse", "Cola"],
    description: "Eclipse, the cola can character, on a transparent background.",
    usageNotes: EVADE_NOTE,
    rights: EVADE_ART,
    color: "#c2242f",
  },
  {
    file: "evade/creators/assets/img/eclipse-can.webp",
    title: "Eclipse can (web)",
    collection: "Bobo + Eclipse can art",
    purpose: "logo-brand",
    tags: ["Character", "Transparent", "Eclipse", "Cola"],
    description: "Eclipse, the cola can character, web-sized WebP.",
    usageNotes: EVADE_NOTE,
    rights: EVADE_ART,
    public: true,
    color: "#c2242f",
  },
  {
    file: "evade/creators/assets/img/og-card.jpg",
    title: "EVADE creators share card",
    collection: "EVADE creators landing page",
    purpose: "marketing",
    tags: ["Poster", "Horizontal", "Social"],
    description: "The 1200×630 link-preview card for the EVADE creators page.",
    usageNotes: "Open Graph / Twitter card image for /evade/creators/.",
    rights: IN_HOUSE,
    public: true,
    color: "#1b1235",
  },
  // ---- Keychain source art --------------------------------------------------
  {
    file: "evade/keychain/src/charm-bobo.png",
    title: "Bobo keychain charm",
    collection: "Bobo keychain",
    purpose: "product-shot",
    tags: ["Keychain", "Merch", "Transparent", "Bobo", "Print-ready"],
    description: "Die-cut acrylic charm artwork of Bobo, with the keyring hole at the top.",
    usageNotes: "Production art for the keychain (14 px/mm). " + EVADE_NOTE,
    rights: IN_HOUSE,
    color: "#e8a23a",
  },
  {
    file: "evade/keychain/src/charm-eclipse.png",
    title: "Eclipse keychain charm",
    collection: "Bobo keychain",
    purpose: "product-shot",
    tags: ["Keychain", "Merch", "Transparent", "Eclipse", "Print-ready"],
    description: "Die-cut acrylic charm artwork of the Eclipse can, keyring hole at the top.",
    usageNotes: "Production art for the keychain (14 px/mm). " + EVADE_NOTE,
    rights: IN_HOUSE,
    color: "#c2242f",
  },
  {
    file: "evade/keychain/src/cat_art.png",
    title: "Bobo flat art",
    collection: "Bobo + Eclipse can art",
    purpose: "logo-brand",
    tags: ["Character", "Transparent", "Bobo"],
    description: "Flat illustration of Bobo used for the keychain print.",
    usageNotes: EVADE_NOTE,
    rights: EVADE_ART,
    color: "#e8a23a",
  },
  {
    file: "evade/keychain/src/can_upright_art.png",
    title: "Eclipse can flat art",
    collection: "Bobo + Eclipse can art",
    purpose: "logo-brand",
    tags: ["Character", "Transparent", "Eclipse"],
    description: "Flat upright illustration of the Eclipse can used for the keychain print.",
    usageNotes: EVADE_NOTE,
    rights: EVADE_ART,
    color: "#c2242f",
  },
  // ---- Roblox portal product shots --------------------------------------------
  {
    file: "roblox/portal/img/evade/cola-run.jpg",
    title: "Cola Run in-game screenshot",
    collection: "Cola Run gameplay",
    purpose: "gameplay",
    tags: ["Gameplay", "Screenshot", "Vertical", "Cola Run"],
    description: "In-game screenshot of the Cola Run mode in EVADE on Roblox.",
    rights: EVADE_ART,
    color: "#2b2f6b",
  },
  {
    file: "roblox/portal/img/evade/bobo-reward.jpg",
    title: "Bobo in-game reward",
    collection: "Bobo keychain",
    purpose: "gameplay",
    tags: ["Gameplay", "Reward", "Bobo"],
    description: "The in-game Bobo reward a keychain scan unlocks.",
    rights: EVADE_ART,
    color: "#5b3a7a",
  },
  {
    file: "roblox/portal/img/evade/keychain-set.png",
    title: "Keychain set product shot",
    collection: "Bobo keychain",
    purpose: "product-shot",
    tags: ["Keychain", "Merch", "Mockup"],
    description: "Product shot of the Bobo and Eclipse keychain set.",
    rights: IN_HOUSE,
    color: "#d9d3e8",
  },
  {
    file: "roblox/portal/img/evade/tshirt.jpg",
    title: "EVADE tee product shot",
    collection: "EVADE merch",
    purpose: "product-shot",
    tags: ["Apparel", "Merch", "Mockup"],
    description: "Product shot of the EVADE activated T-shirt.",
    rights: IN_HOUSE,
    color: "#2a2a33",
  },
  {
    file: "roblox/portal/img/evade/details.jpg",
    title: "Merch detail close-up",
    collection: "EVADE merch",
    purpose: "product-shot",
    tags: ["Merch", "Detail"],
    description: "Close-up of the print and NFC tag on EVADE merch.",
    rights: IN_HOUSE,
    color: "#3b3545",
  },
  {
    file: "roblox/activated-retail/assets/ev_intro.webp",
    title: "EVADE activated retail intro",
    collection: "EVADE activated retail",
    purpose: "marketing",
    tags: ["Key art", "Horizontal", "Retail"],
    description: "Intro card for the EVADE activated-retail endcap demo.",
    rights: IN_HOUSE,
    color: "#241b3f",
  },
  // ---- 3D -------------------------------------------------------------------
  {
    file: "evade/keychain/evade-keychain.glb",
    title: "EVADE keychain (3D)",
    collection: "Bobo keychain",
    purpose: "3d-model",
    tags: ["Keychain", "Merch", "3D"],
    description: "Compressed GLB of the Bobo + Eclipse keychain used on the drop stage.",
    usageNotes: "Draco/meshopt compressed for the web. " + EVADE_NOTE,
    rights: IN_HOUSE,
  },
  {
    file: "evade/creators/assets/models/bobo-clips.glb",
    title: "Bobo clips (3D)",
    collection: "EVADE creators landing page",
    purpose: "3d-model",
    tags: ["Keychain", "3D", "Bobo"],
    description: "Keyring clips model for the creators page 3D stage.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/models/ev_tee.glb",
    title: "EVADE tee (3D)",
    collection: "EVADE merch",
    purpose: "3d-model",
    tags: ["Apparel", "Merch", "3D"],
    description: "3D T-shirt with the EVADE print, for the activated-retail endcap.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/models/ev_hoodie.glb",
    title: "EVADE hoodie (3D)",
    collection: "EVADE merch",
    purpose: "3d-model",
    tags: ["Apparel", "Merch", "3D"],
    description: "3D hoodie with the EVADE print, for the activated-retail endcap.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/models/ev_cap.glb",
    title: "EVADE cap (3D)",
    collection: "EVADE merch",
    purpose: "3d-model",
    tags: ["Apparel", "Merch", "3D"],
    description: "3D cap with the EVADE logo, for the activated-retail endcap.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/models/ev_boboplush.glb",
    title: "Bobo plush (3D)",
    collection: "EVADE merch",
    purpose: "3d-model",
    tags: ["Plush", "Merch", "3D", "Bobo"],
    description: "3D Bobo plush for the activated-retail endcap.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/models/ev_mat.glb",
    title: "EVADE desk mat (3D)",
    collection: "EVADE merch",
    purpose: "3d-model",
    tags: ["Merch", "3D"],
    description: "3D desk mat with Cola Run art.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/models/cola.glb",
    title: "Cola can (3D)",
    collection: "EVADE activated retail",
    purpose: "3d-model",
    tags: ["3D", "Eclipse", "Cola"],
    description: "3D cola can prop for the activated-retail endcap.",
    rights: IN_HOUSE,
  },
  {
    file: "roblox/activated-retail/ar/evade.glb",
    title: "EVADE AR scene",
    collection: "EVADE activated retail",
    purpose: "3d-model",
    tags: ["3D", "AR"],
    description: "The full AR scene that plays when an EVADE product is scanned.",
    rights: IN_HOUSE,
  },
];

/** Bytes of a file in /public: from disk on localhost, else fetched from the deploy itself. */
async function publicBytes(p: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(path.join(process.cwd(), "public", p)));
  } catch {
    /* not on disk (a deployed function, or the tests' sandbox) */
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

async function writeFile(ns: MediaNamespace, id: string, data: Uint8Array) {
  const storage = mediaStorage(ns);
  const ref = { kind: "blobs" as const, key: `files/${id}` };
  const chunks = Math.max(1, Math.ceil(data.byteLength / MEDIA.chunkBytes));
  for (let n = 0; n < chunks; n++)
    await storage.putChunk(ref, n, data.slice(n * MEDIA.chunkBytes, (n + 1) * MEDIA.chunkBytes));
  return { ref, chunks };
}

const seedId = (i: number, file: string) =>
  `seed${String(i).padStart(2, "0")}${file
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 40);

type Built = Omit<MediaAsset, "storage" | "chunks"> & { data: Uint8Array; poster?: Uint8Array };

function record(
  i: number,
  now: number,
  s: Omit<Spec, "file"> & { name: string; mime: string; data: Uint8Array },
): Built {
  const kind = kindOf(s.mime);
  const dims = kind === "image" ? imageSize(s.mime, s.data) : null;
  // spread over the last five weeks, newest first in the spec order
  const createdAt = now - (i * 1.3 + 0.4) * DAY;
  return {
    id: "",
    name: s.name,
    title: s.title,
    mime: s.mime,
    kind,
    size: s.data.byteLength,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    durationS: null,
    color: s.color ?? null,
    thumb: null,
    tags: normaliseTags(s.tags),
    client: s.client ?? "EVADE",
    collection: s.collection,
    purpose: s.purpose,
    description: s.description,
    usageNotes: s.usageNotes ?? "",
    rights: s.rights,
    aiGenerated: false,
    public: !!s.public,
    uploader: "Dev seed",
    fingerprint: null,
    complete: true,
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    sample: true,
    data: s.data,
  };
}

export async function seedMediaSample(
  ns: MediaNamespace,
  opts: { reset?: boolean } = {},
): Promise<{ created: boolean; count: number; skipped: string[] }> {
  if (ns === "prod") throw new Error("The media seed never runs in production.");
  const existing = await listAssets(ns, { includeIncomplete: true });
  const samples = existing.filter((a) => a.sample);
  if (samples.length && !opts.reset) return { created: false, count: samples.length, skipped: [] };
  if (samples.length) await deleteAssets(ns, samples);

  const now = Date.now();
  const built: Built[] = [];
  const skipped: string[] = [];

  // The two labelled placeholder clips from the UGC Hub seed, as gameplay stand-ins.
  const media = (await import("@/lib/ugc/sample-media.server")).SAMPLE_MEDIA;
  const clips = [
    {
      id: "seed00samplevertical",
      name: "SAMPLE-cola-run-vertical.mp4",
      title: "SAMPLE · Cola Run vertical placeholder",
      data: b64(media.verticalMp4),
      poster: b64(media.verticalPoster),
      width: 360,
      height: 640,
      durationS: 4,
      tags: ["Gameplay", "Vertical", "Cola Run", "Placeholder"],
      description:
        "Labelled placeholder clip (9:16) standing in for real Cola Run gameplay footage.",
    },
    {
      id: "seed00samplelandscape",
      name: "SAMPLE-cola-run-landscape.mp4",
      title: "SAMPLE · Cola Run landscape placeholder",
      data: b64(media.landscapeMp4),
      poster: b64(media.landscapePoster),
      width: 640,
      height: 360,
      durationS: 3,
      tags: ["Gameplay", "Horizontal", "Cola Run", "Placeholder"],
      description:
        "Labelled placeholder clip (16:9) standing in for real Cola Run gameplay footage.",
    },
  ];
  for (const [k, c] of clips.entries()) {
    const r = record(k, now - DAY * 0.2, {
      name: c.name,
      mime: "video/mp4",
      data: c.data,
      title: c.title,
      collection: "Cola Run gameplay",
      purpose: "gameplay",
      tags: c.tags,
      description: c.description,
      usageNotes:
        "Placeholder only: replace with the real gameplay footage before using on a page.",
      rights: IN_HOUSE,
      color: "#2a1f4d",
    });
    built.push({
      ...r,
      id: c.id,
      width: c.width,
      height: c.height,
      durationS: c.durationS,
      poster: c.poster,
    });
  }

  for (const [i, s] of SPECS.entries()) {
    const data = await publicBytes(s.file);
    const name = s.file.split("/").pop()!;
    const mime = resolveMediaMime(name);
    if (!data || !mime) {
      skipped.push(s.file);
      continue;
    }
    const { file: _file, ...rest } = s;
    built.push({ ...record(i + 1, now, { ...rest, name, mime, data }), id: seedId(i + 1, s.file) });
  }

  const storage = mediaStorage(ns);
  const records: MediaAsset[] = [];
  for (const b of built) {
    const { data, poster, ...r } = b;
    const { ref, chunks } = await writeFile(ns, b.id, data);
    let thumb: MediaAsset["thumb"] = null;
    if (poster) {
      const key = `thumbs/${b.id}`;
      await storage.putObject(key, poster);
      thumb = { key, mime: "image/jpeg", size: poster.byteLength };
    }
    records.push({ ...r, storage: ref, chunks, thumb });
  }
  await saveAssets(ns, records);
  return { created: true, count: records.length, skipped };
}
