/**
 * The Creator Hub asset library: how a creator's files are organised.
 *
 * Every file lives in one **section** (Branding, Social, Photos & art, Video &
 * motion, 3D, Audio, Documents, Other), optionally inside one of the creator's
 * **folders** in that section, and carries **tags**:
 *   - a media type, worked out from the file itself (Image, Vector, Video, 3D
 *     model, Audio, Document, Font, Archive, Design file). It can't be edited:
 *     it's what the file *is*.
 *   - content tags: presets (Logo, Brand guidelines, Thumbnail…) plus anything
 *     the creator types. Tags are free-form, compared case-insensitively.
 *
 * Shared by the server (validation, defaults) and the browser (the library,
 * the upload modal's suggestions). Files uploaded before the library existed
 * have no section or tags: `sectionOf` / `tagsOf` derive them from the old
 * artwork category, so nothing needs migrating.
 */
import type { AssetFolder, HubFile } from "./model";

/* ---------------------------------------------------------------------------
   Sections
   --------------------------------------------------------------------------- */

export const ASSET_SECTIONS = [
  "branding",
  "social",
  "art",
  "video",
  "3d",
  "audio",
  "documents",
  "other",
] as const;
export type AssetSection = (typeof ASSET_SECTIONS)[number];

export const SECTION_META: Record<AssetSection, { label: string; blurb: string }> = {
  branding: {
    label: "Branding",
    blurb: "Logos, brand guidelines, fonts, colour palettes and your design system.",
  },
  social: {
    label: "Social content",
    blurb: "Posts, stories, thumbnails, banners, emotes and overlays.",
  },
  art: {
    label: "Photos & art",
    blurb: "Characters, illustrations, photography and key art.",
  },
  video: { label: "Video & motion", blurb: "Clips, intros, animations and b-roll." },
  "3d": { label: "3D", blurb: "Models and scenes: GLB, glTF, FBX, OBJ, STL, USDZ, Blender." },
  audio: { label: "Audio", blurb: "Sounds, music, voice lines and stingers." },
  documents: { label: "Documents", blurb: "Briefs, decks, scripts and spreadsheets." },
  other: { label: "Other", blurb: "Anything that doesn't fit the sections above." },
};

/* ---------------------------------------------------------------------------
   Media types (from the file itself)
   --------------------------------------------------------------------------- */

export const MEDIA_TYPES = [
  "image",
  "vector",
  "video",
  "3d",
  "audio",
  "document",
  "font",
  "design",
  "archive",
  "other",
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_LABEL: Record<MediaType, string> = {
  image: "Image",
  vector: "Vector",
  video: "Video",
  "3d": "3D model",
  audio: "Audio",
  document: "Document",
  font: "Font",
  design: "Design file",
  archive: "Archive",
  other: "Other",
};

const EXT_TYPE: Record<string, MediaType> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  avif: "image",
  heic: "image",
  tif: "image",
  tiff: "image",
  svg: "vector",
  eps: "vector",
  ai: "vector",
  mp4: "video",
  mov: "video",
  webm: "video",
  m4v: "video",
  glb: "3d",
  gltf: "3d",
  fbx: "3d",
  obj: "3d",
  stl: "3d",
  usdz: "3d",
  blend: "3d",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  flac: "audio",
  pdf: "document",
  docx: "document",
  pptx: "document",
  xlsx: "document",
  key: "document",
  txt: "document",
  csv: "document",
  md: "document",
  otf: "font",
  ttf: "font",
  woff: "font",
  woff2: "font",
  psd: "design",
  fig: "design",
  sketch: "design",
  xd: "design",
  procreate: "design",
  indd: "design",
  zip: "archive",
};

export const extOf = (name: string) =>
  name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

export function mediaTypeOf(f: { name: string; mime?: string }): MediaType {
  return EXT_TYPE[extOf(f.name)] ?? "other";
}

/** 3D formats the hub's viewer can show. */
export const PREVIEW_3D = new Set(["glb", "gltf", "fbx", "obj", "stl"]);

/* ---------------------------------------------------------------------------
   Tags
   --------------------------------------------------------------------------- */

/** Suggested content tags, grouped for the tag picker. */
export const PRESET_TAGS: Record<string, string[]> = {
  Brand: [
    "Logo",
    "Wordmark",
    "Icon",
    "Brand guidelines",
    "Design system",
    "Colour palette",
    "Typography",
    "Mascot",
  ],
  Social: [
    "Thumbnail",
    "Banner",
    "Story",
    "Post",
    "Emote",
    "Overlay",
    "Profile picture",
    "Sticker art",
  ],
  Art: ["Character", "Illustration", "Photo", "Key art", "Pattern", "Background"],
  Motion: ["Intro", "Outro", "Animation", "B-roll", "Stinger", "Sound effect", "Music"],
  Production: [
    "Merch idea",
    "Reference",
    "Moodboard",
    "Print-ready",
    "Transparent",
    "Final",
    "Draft",
  ],
};
export const ALL_PRESET_TAGS = Object.values(PRESET_TAGS).flat();

export const ASSET_LIMITS = {
  tagsPerFile: 20,
  tagLength: 32,
  folderName: 48,
  foldersPerCreator: 200,
};

/** Trim, collapse spaces, cap the length; "" for nothing usable. */
export function cleanTag(raw: string): string {
  return Array.from(raw)
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join("")
    .replace(/[#,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ASSET_LIMITS.tagLength);
}
export const tagKey = (t: string) => cleanTag(t).toLowerCase();

/** Unique by key, preset spelling preferred, capped. */
export function normaliseTags(tags: readonly string[]): string[] {
  const out = new Map<string, string>();
  for (const raw of tags) {
    const t = cleanTag(raw);
    if (!t) continue;
    const k = t.toLowerCase();
    if (out.has(k)) continue;
    out.set(k, ALL_PRESET_TAGS.find((p) => p.toLowerCase() === k) ?? t);
    if (out.size >= ASSET_LIMITS.tagsPerFile) break;
  }
  return [...out.values()];
}

/* ---------------------------------------------------------------------------
   Files before the library: derive a section and tags from the old category
   --------------------------------------------------------------------------- */

const LEGACY_ARTWORK: Record<string, { section: AssetSection; tags: string[] }> = {
  logo: { section: "branding", tags: ["Logo"] },
  character: { section: "art", tags: ["Character"] },
  reference: { section: "other", tags: ["Reference"] },
  font: { section: "branding", tags: ["Typography"] },
  guidelines: { section: "branding", tags: ["Brand guidelines"] },
};
const LEGACY_COLLATERAL: Record<string, { section: AssetSection; tags: string[] }> = {
  poster: { section: "social", tags: ["Poster"] },
  social: { section: "social", tags: ["Post"] },
  qr: { section: "branding", tags: ["QR"] },
  mockup: { section: "art", tags: ["Mockup"] },
  video: { section: "video", tags: [] },
};

const SECTION_BY_TYPE: Partial<Record<MediaType, AssetSection>> = {
  video: "video",
  "3d": "3d",
  audio: "audio",
  font: "branding",
  document: "documents",
};

export function sectionOf(
  f: Pick<HubFile, "name" | "mime" | "kind" | "category"> & {
    section?: string | null;
  },
): AssetSection {
  if (f.section && (ASSET_SECTIONS as readonly string[]).includes(f.section))
    return f.section as AssetSection;
  if (f.kind === "artwork" && LEGACY_ARTWORK[f.category]) return LEGACY_ARTWORK[f.category].section;
  if (f.kind === "collateral" && LEGACY_COLLATERAL[f.category])
    return LEGACY_COLLATERAL[f.category].section;
  if (f.kind === "proof" || f.kind === "mockup") return "art";
  return SECTION_BY_TYPE[mediaTypeOf(f)] ?? suggestFor(f.name, f.mime ?? "").section;
}

export function tagsOf(
  f: Pick<HubFile, "kind" | "category"> & { tags?: string[] | null },
): string[] {
  if (f.tags) return f.tags;
  if (f.kind === "artwork") return LEGACY_ARTWORK[f.category]?.tags ?? [];
  if (f.kind === "collateral") return LEGACY_COLLATERAL[f.category]?.tags ?? [];
  if (f.kind === "proof") return ["Proof"];
  if (f.kind === "mockup") return ["Mockup"];
  return [];
}

/* ---------------------------------------------------------------------------
   Suggestions for a new upload: from its name and type
   --------------------------------------------------------------------------- */

const NAME_RULES: Array<{ re: RegExp; section?: AssetSection; tags: string[] }> = [
  {
    re: /brand.?(guide|book|bible)|guidelines?|style.?guide/,
    section: "branding",
    tags: ["Brand guidelines"],
  },
  { re: /design.?system|tokens?/, section: "branding", tags: ["Design system"] },
  { re: /palette|colou?rs?\b|swatch/, section: "branding", tags: ["Colour palette"] },
  { re: /wordmark|logotype/, section: "branding", tags: ["Wordmark", "Logo"] },
  { re: /logo|monogram|lockup/, section: "branding", tags: ["Logo"] },
  { re: /\bicon|favicon|avatar|pfp|profile/, section: "branding", tags: ["Icon"] },
  { re: /mascot/, section: "branding", tags: ["Mascot"] },
  { re: /font|typeface|typography/, section: "branding", tags: ["Typography"] },
  { re: /thumb(nail)?/, section: "social", tags: ["Thumbnail"] },
  { re: /banner|header|cover/, section: "social", tags: ["Banner"] },
  { re: /story|stories|reel/, section: "social", tags: ["Story"] },
  { re: /\bpost\b|insta|tiktok|tweet/, section: "social", tags: ["Post"] },
  { re: /emote|emoji/, section: "social", tags: ["Emote"] },
  { re: /overlay|alert|panel|webcam|frame/, section: "social", tags: ["Overlay"] },
  { re: /sticker/, section: "social", tags: ["Sticker art"] },
  { re: /character|char\b|oc\b|model.?sheet|turnaround/, section: "art", tags: ["Character"] },
  { re: /illustration|illo|artwork|drawing|sketch/, section: "art", tags: ["Illustration"] },
  { re: /key.?art|poster/, section: "art", tags: ["Key art"] },
  { re: /photo|shoot|headshot|img_|dsc/, section: "art", tags: ["Photo"] },
  { re: /pattern|texture/, section: "art", tags: ["Pattern"] },
  { re: /background|bg\b|wallpaper/, section: "art", tags: ["Background"] },
  { re: /intro/, section: "video", tags: ["Intro"] },
  { re: /outro|end.?screen/, section: "video", tags: ["Outro"] },
  { re: /b.?roll/, section: "video", tags: ["B-roll"] },
  { re: /stinger|transition/, tags: ["Stinger"] },
  { re: /sfx|sound/, section: "audio", tags: ["Sound effect"] },
  { re: /music|song|track|beat/, section: "audio", tags: ["Music"] },
  { re: /moodboard|mood.?board|inspo|inspiration/, tags: ["Moodboard"] },
  { re: /\bref\b|reference/, tags: ["Reference"] },
  { re: /merch|tee|hoodie|shirt|keychain|charm/, tags: ["Merch idea"] },
  { re: /print|cmyk|300.?dpi/, tags: ["Print-ready"] },
  { re: /transparent|no.?bg|cutout/, tags: ["Transparent"] },
  { re: /final|approved/, tags: ["Final"] },
  { re: /draft|wip|v\d+_?draft/, tags: ["Draft"] },
];

/** Best guess of section and tags for a file about to be uploaded. */
export function suggestFor(name: string, mime: string): { section: AssetSection; tags: string[] } {
  const n = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[_\-.]+/g, " ");
  const type = mediaTypeOf({ name, mime });
  const tags: string[] = [];
  let section: AssetSection | undefined;
  for (const r of NAME_RULES) {
    if (!r.re.test(n)) continue;
    tags.push(...r.tags);
    section ??= r.section;
  }
  // Video, 3D, audio and fonts only belong in one place, whatever the name.
  // A document goes where its name says (brand guidelines → Branding).
  if (type === "video" || type === "3d" || type === "audio" || type === "font")
    section = SECTION_BY_TYPE[type];
  section ??=
    type === "document"
      ? "documents"
      : type === "image" || type === "vector" || type === "design"
        ? "art"
        : "other";
  if (type === "image" && /png|webp|avif|gif/.test(extOf(name)) && tags.includes("Logo"))
    tags.push("Transparent");
  return { section, tags: normaliseTags(tags) };
}

/* ---------------------------------------------------------------------------
   The brand kit: what MEDIALIFE needs to design merch, and whether it's here
   --------------------------------------------------------------------------- */

export type KitItem = { id: string; label: string; hint: string; have: boolean };

export function brandKit(
  files: Array<Pick<HubFile, "name" | "mime" | "kind" | "category"> & { tags?: string[] | null }>,
): KitItem[] {
  const has = (tag: string, test?: (f: (typeof files)[number]) => boolean) =>
    files.some(
      (f) =>
        tagsOf(f).some((t) => t.toLowerCase() === tag.toLowerCase()) && (test ? test(f) : true),
    );
  const vector = (f: { name: string }) => ["svg", "ai", "eps", "pdf"].includes(extOf(f.name));
  const raster = (f: { name: string }) => ["png", "webp"].includes(extOf(f.name));
  return [
    {
      id: "logo-vector",
      label: "Vector logo",
      hint: "SVG, AI, EPS or PDF: sharp at any print size.",
      have: has("Logo", vector) || has("Wordmark", vector),
    },
    {
      id: "logo-png",
      label: "Transparent PNG logo",
      hint: "For quick mockups and digital use.",
      have: has("Logo", raster) || has("Wordmark", raster),
    },
    {
      id: "guidelines",
      label: "Brand guidelines",
      hint: "Colours, spacing, do's and don'ts.",
      have: has("Brand guidelines") || has("Design system"),
    },
    {
      id: "fonts",
      label: "Fonts",
      hint: "The typefaces in your logo and graphics.",
      have: has("Typography") || files.some((f) => mediaTypeOf(f) === "font"),
    },
    {
      id: "character",
      label: "Character or key art",
      hint: "Hi-res art we can build merch and experiences around.",
      have: has("Character") || has("Key art") || has("Mascot") || has("Illustration"),
    },
  ];
}

/* ---------------------------------------------------------------------------
   Changes to a file's place and labels (the server and the UI's instant update)
   --------------------------------------------------------------------------- */

export type AssetPatch = {
  section?: AssetSection;
  /** A folder id, or null for loose in the section. */
  folderId?: string | null;
  setTags?: string[];
  addTags?: string[];
  removeTags?: string[];
  starred?: boolean;
  name?: string;
  note?: string;
};

/** A rename can't change what the file is: the extension stays. */
export function keepExtension(old: string, name: string) {
  const clean = Array.from(name)
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && c !== "/" && c !== "\\")
    .join("")
    .trim();
  const ext = old.includes(".") ? old.slice(old.lastIndexOf(".")) : "";
  const base =
    ext && clean.toLowerCase().endsWith(ext.toLowerCase()) ? clean.slice(0, -ext.length) : clean;
  return `${base.trim() || "file"}${ext}`.slice(0, 140);
}

/** `folder` is the folder named by `p.folderId`, already looked up (null when none). */
export function applyAssetPatch(f: HubFile, p: AssetPatch, folder: AssetFolder | null): HubFile {
  const next: HubFile = { ...f };
  if (folder) {
    next.folderId = folder.id;
    next.section = folder.section;
  } else if (p.folderId === null) {
    next.folderId = null;
  }
  if (p.section && !folder) {
    // A new section takes the file out of a folder from another section.
    if (sectionOf(next) !== p.section) next.folderId = null;
    next.section = p.section;
  }
  if (p.setTags || p.addTags || p.removeTags) {
    const removing = new Set((p.removeTags ?? []).map(tagKey));
    next.tags = normaliseTags(
      [...(p.setTags ?? tagsOf(f)), ...(p.addTags ?? [])].filter((t) => !removing.has(tagKey(t))),
    );
  }
  if (p.starred !== undefined) next.starred = p.starred;
  if (p.name !== undefined) next.name = keepExtension(f.name, p.name);
  if (p.note !== undefined) next.note = p.note.trim().slice(0, 500);
  // Pin the section once touched, so a file from before the library stops deriving it.
  next.section ??= sectionOf(f);
  return next;
}

/** Files that belong in the library. Proofs stay with their product's approval history. */
export const inLibrary = (f: Pick<HubFile, "complete" | "kind">) =>
  f.complete && f.kind !== "proof";
