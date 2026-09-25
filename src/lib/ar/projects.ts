import { z } from "zod";

import {
  PROJECT_VERSION,
  VIEWS,
  ZONES,
  ZONE_IDS,
  projectSchema,
  slugSchema,
  type Project,
  type ZoneId,
} from "./project";

// Builder-side helpers around the project schema (src/lib/ar/project.ts), shared by
// the /admin/builder UI and the server: a valid starting project, the lenient
// schema drafts are stored with, and readable validation issues.

/** Uploaded files are served from here (src/routes/api.ar.asset.$id.ts). */
export const ASSET_PREFIX = "/api/ar/asset/";
export const assetUrl = (id: string) => `${ASSET_PREFIX}${id}`;
/** The asset id inside "/api/ar/asset/<id>", or null for a site file. */
export function assetIdFromRef(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith(ASSET_PREFIX)) return null;
  const id = ref.slice(ASSET_PREFIX.length);
  return /^[a-z0-9]{10,40}$/.test(id) ? id : null;
}
/** Every uploaded asset id referenced anywhere in a value (a project, a doc). */
export function referencedAssetIds(value: unknown): string[] {
  const text = JSON.stringify(value ?? null);
  const ids = new Set<string>();
  for (const m of text.matchAll(/"\/api\/ar\/asset\/([a-z0-9]{10,40})"/g)) ids.add(m[1]);
  return [...ids];
}

/** Starting points offered in "New endcap"; JSON lives at /activated-retail/templates/<id>.json. */
export const TEMPLATES = [
  {
    id: "roblox",
    label: "Roblox",
    description: "MEDIALIFE × Roblox, with Roblox, Skyrift and EVADE themes.",
  },
  { id: "evade", label: "EVADE", description: "The EVADE pilot: keychain, tee and plush." },
  {
    id: "monkey-quest",
    label: "Monkey Quest",
    description: "Toei Animation × Hypergalactic Monkey Quest.",
  },
  { id: "blank", label: "Blank", description: "One theme, sample merch and a short tour." },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]["id"];
export const templateUrl = (id: string) => `/activated-retail/templates/${id}.json`;

/** "EVADE × Walmart Q4" → "evade-walmart-q4" (fits slugSchema, or "" when nothing is left). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}
export const isValidSlug = (s: string) => slugSchema.safeParse(s).success;
/** Lowercase, dashes for anything else; trailing dashes allowed while typing. */
export const cleanSlugInput = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "")
    .slice(0, 48);

type ProductSeed = Pick<
  Project["zones"][ZoneId]["product"],
  "label" | "category" | "price" | "description" | "trigger" | "canActivate" | "sizes"
> & { unlock: string; unlockSub: string };

const SIZES = ["S", "M", "L", "XL"];
const SEEDS: Record<ZoneId, ProductSeed> = {
  cap: {
    label: "Logo cap",
    category: "Activated Apparel®",
    price: 29.99,
    description: "Structured cap with an NFC tag in the brim. One tap unlocks the in-game version.",
    trigger: "NFC tag in the brim",
    canActivate: false,
    unlock: "Matching in-game cap",
    unlockSub: "Added to your avatar",
  },
  plush: {
    label: "Collector plush",
    category: "Activated Merchandise®",
    price: 24.99,
    description: "Soft plush with an NFC tag sewn into the care label.",
    trigger: "NFC care label",
    canActivate: true,
    unlock: "Plush companion pet",
    unlockSub: "Follows you in game",
  },
  keychain: {
    label: "Activated keychain",
    category: "Activated Merchandise®",
    price: 12.99,
    description: "Chunky vinyl charm with an embedded NFC chip and an exclusive mini-game.",
    trigger: "NFC chip in the charm",
    canActivate: true,
    unlock: "Exclusive mini-game",
    unlockSub: "Plus an in-game charm",
  },
  mousepad: {
    label: "Desk mat",
    category: "Activated Print®",
    price: 24.99,
    description: "Extra-large desk mat. The QR code in the corner opens the experience.",
    trigger: "QR code on the mat",
    canActivate: false,
    unlock: "Wallpaper pack",
    unlockSub: "Desktop and phone sizes",
  },
  figure: {
    label: "Boxed collectible",
    category: "Activated Merchandise®",
    price: 19.99,
    description: "Blind-box collectible. Scan the box to reveal a matching digital item.",
    trigger: "QR code on the box",
    canActivate: false,
    unlock: "Collectible in-game item",
    unlockSub: "One of six to find",
  },
  tee: {
    label: "Graphic tee",
    category: "Activated Apparel®",
    price: 24.99,
    sizes: SIZES,
    description: "Cotton tee with an NFC tag in the care label.",
    trigger: "NFC care label",
    canActivate: false,
    unlock: "Matching avatar shirt",
    unlockSub: "Wear it in game today",
  },
  hoodie: {
    label: "Hoodie",
    category: "Activated Apparel®",
    price: 54.99,
    sizes: SIZES,
    description: "Heavyweight hoodie with an NFC tag in the care label.",
    trigger: "NFC care label",
    canActivate: false,
    unlock: "Matching avatar hoodie",
    unlockSub: "Wear it in game today",
  },
};

/** A default product for a zone (also used when a zone is reset in the builder). */
export function defaultZone(id: ZoneId): Project["zones"][ZoneId] {
  const s = SEEDS[id];
  return {
    enabled: true,
    model: { source: "default", yaw: 0, scale: 1 },
    product: {
      label: s.label,
      category: s.category,
      sku: `AR01-${id.slice(0, 3).toUpperCase()}-01`,
      price: s.price,
      ...(s.sizes ? { sizes: [...s.sizes] } : {}),
      description: s.description,
      unlock: { title: s.unlock, sub: s.unlockSub },
      trigger: s.trigger,
      channel: "Walmart",
      canActivate: s.canActivate,
    },
  };
}

/** A new theme; ids must be unique within a project. */
export function newTheme(name: string, taken: string[] = []): Project["themes"][number] {
  const base = slugify(name) || "theme";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base.slice(0, 44)}-${i}`;
  return { id, name, led: "#3aa8ff", led2: "#ff3d9a", graphics: { mode: "keyart" } };
}

/** A valid, minimal project: one theme, the fixture's sample merch and a short tour. */
export function blankProject(slug: string, name: string): Project {
  return {
    version: PROJECT_VERSION,
    slug,
    name: name.slice(0, 80) || "Untitled endcap",
    brand: {
      lockup: "MEDIALIFE®",
      sub: "Walmart endcap · AR-01",
      splashTitle: "Activated Retail",
      splashSub: "An interactive Walmart endcap",
      retailer: "Walmart",
    },
    access: {},
    themes: [newTheme("Main")],
    defaultTheme: "main",
    zones: Object.fromEntries(ZONE_IDS.map((id) => [id, defaultZone(id)])) as Project["zones"],
    activation: { type: "game", buttonLabel: "Play the drop", rewardPrefix: "AR01" },
    tour: [
      {
        title: "Stop them in the aisle",
        body: "A Walmart endcap built from lightbox towers, a header and a video wall. Every surface either sells or activates.",
        view: "aisle",
      },
      {
        title: "Merch that unlocks",
        body: "Every product carries an NFC tag or a QR code. Tap a glowing marker to take one off the shelf.",
        view: "shelf",
      },
      {
        title: "One tap to play",
        body: "A shopper taps the product and lands straight in the experience, with a reward to redeem in game.",
        view: "qr",
      },
    ],
    cta: { label: "Book a call", mode: "lead" },
    ar: {},
  };
}

/**
 * Make a template (or any project JSON) into a new project: fresh slug, name and
 * client; no password and no AR files carried over from the source. Sections or
 * zones the source lacks (an older template) come from blankProject().
 */
export function fromTemplate(
  source: unknown,
  opts: { slug: string; name: string; client?: string },
): unknown {
  if (!source || typeof source !== "object") return source;
  const blank = blankProject(opts.slug, opts.name) as unknown as Record<string, unknown>;
  const p = { ...blank, ...(source as Record<string, unknown>) };
  const zones = (source as { zones?: unknown }).zones;
  p.zones = { ...(blank.zones as object), ...(zones && typeof zones === "object" ? zones : {}) };
  p.version = PROJECT_VERSION;
  p.slug = opts.slug;
  p.name = opts.name;
  if (opts.client) p.client = opts.client;
  else delete p.client;
  p.access = {};
  p.ar = {};
  return p;
}

// ---------------------------------------------------------------------------
// Drafts: stored when they are structurally sound, even when a field fails a
// rule (an empty name while typing, a half-typed URL). Publishing needs the
// strict schema. `relax` drops string/number/array rules but keeps every type.
// ---------------------------------------------------------------------------

function relax(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodString) return z.string().max(20000);
  if (schema instanceof z.ZodNumber) return z.number();
  if (schema instanceof z.ZodArray) return z.array(relax(schema.element)).max(50);
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return z.object(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, relax(v)])));
  }
  if (schema instanceof z.ZodOptional) return relax(schema.unwrap()).optional();
  if (schema instanceof z.ZodNullable) return relax(schema.unwrap()).nullable();
  if (schema instanceof z.ZodDefault) {
    return relax(schema.removeDefault()).default(schema._def.defaultValue());
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as z.ZodTypeAny[];
    return z.union(options.map(relax) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  if (schema instanceof z.ZodEffects) return relax(schema.innerType());
  // literals, enums, booleans keep their exact rules
  return schema;
}

export const draftSchema = relax(projectSchema) as unknown as z.ZodType<Project>;

export type Path = (string | number)[];
export interface Issue {
  path: Path;
  message: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  client: "Client",
  slug: "Link name",
  lockup: "Lockup",
  sub: "Subtitle",
  splashTitle: "Splash title",
  splashSub: "Splash subtitle",
  retailer: "Retailer",
  password: "Password",
  led: "LED colour",
  led2: "Second LED colour",
  bay: "Bay tint",
  spill: "Floor spill",
  product: "Product marker",
  activation: "Activation marker",
  keyArt: "Key art",
  towerL: "Left tower",
  towerR: "Right tower",
  totem: "Totem",
  wall: "Video wall",
  screen: "Hero screen",
  header: "Header",
  site: "Site label",
  game: "Game name",
  label: "Name",
  category: "Category",
  sku: "SKU",
  price: "Price",
  sizes: "Sizes",
  description: "Description",
  title: "Title",
  image: "Image",
  trigger: "Trigger",
  channel: "Sold through",
  hotspot: "Hotspot label",
  asset: "3D model",
  tint: "Tint",
  print: "Print",
  yaw: "Turn",
  scale: "Size",
  url: "Link",
  buttonLabel: "Button label",
  splash: "Splash image",
  rewardPrefix: "Reward code prefix",
  qrUrl: "QR code link",
  body: "Text",
  view: "View",
  theme: "Theme",
  defaultTheme: "Default theme",
  themes: "Themes",
  tour: "Tour",
};

export type SectionId =
  "overview" | "themes" | "shelves" | "activation" | "tour" | "cta" | "access" | "ar";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "themes", label: "Themes" },
  { id: "shelves", label: "Shelves" },
  { id: "activation", label: "Activation" },
  { id: "tour", label: "Tour" },
  { id: "cta", label: "Call to action" },
  { id: "access", label: "Access" },
  { id: "ar", label: "AR" },
];

export function sectionForPath(path: Path): SectionId {
  const head = path[0];
  if (head === "themes" || head === "defaultTheme") return "themes";
  if (head === "zones") return "shelves";
  if (head === "activation") return "activation";
  if (head === "tour") return "tour";
  if (head === "cta") return "cta";
  if (head === "access") return "access";
  if (head === "ar") return "ar";
  return "overview";
}

/** DOM id for the input editing `path` (the publish check jumps to it). */
export const fieldId = (path: Path) => `f-${path.join("-")}`;

/** "Shelves › Top shelf · left › Price" */
export function describePath(path: Path, project?: Partial<Project> | null): string {
  const section = SECTIONS.find((s) => s.id === sectionForPath(path))?.label ?? "";
  const parts = [section];
  if (path[0] === "zones" && typeof path[1] === "string") {
    parts.push(ZONES[path[1] as ZoneId]?.label ?? path[1]);
    if (path[2] === "product" && path[3] === "unlock") parts.push("Unlock");
  }
  if (path[0] === "themes" && typeof path[1] === "number") {
    parts.push(project?.themes?.[path[1]]?.name || `Theme ${path[1] + 1}`);
  }
  if (path[0] === "tour" && typeof path[1] === "number") parts.push(`Step ${path[1] + 1}`);
  const last = [...path].reverse().find((p) => typeof p === "string") as string | undefined;
  if (last && FIELD_LABELS[last] && FIELD_LABELS[last] !== parts[parts.length - 1]) {
    parts.push(FIELD_LABELS[last]);
  }
  return parts.join(" › ");
}

function humanize(issue: z.ZodIssue): string {
  const last = issue.path[issue.path.length - 1];
  switch (issue.code) {
    case "too_small":
      if (issue.type === "string") return issue.minimum === 1 ? "Required" : "Too short";
      if (issue.type === "array") return `Add at least ${issue.minimum}`;
      return `At least ${issue.minimum}`;
    case "too_big":
      if (issue.type === "string") return `Keep it to ${issue.maximum} characters`;
      if (issue.type === "array") return `At most ${issue.maximum}`;
      return `At most ${issue.maximum}`;
    case "invalid_string":
      if (issue.validation === "url") return "Enter a full link, starting with https://";
      if (last === "rewardPrefix") return "2–6 capital letters or digits";
      if (["led", "led2", "bay", "spill", "tint", "product", "activation"].includes(String(last)))
        return "Use a hex colour like #3AA8FF";
      return issue.message === "Invalid" ? "Not valid" : issue.message;
    case "invalid_type":
      return issue.received === "undefined" ? "Required" : "Not valid";
    case "invalid_enum_value":
      return "Pick one of the options";
    default:
      return issue.message;
  }
}

/** Rules the schema can't express but the engine relies on. */
function semanticIssues(p: Project): Issue[] {
  const out: Issue[] = [];
  const ids = p.themes.map((t) => t.id);
  ids.forEach((id, i) => {
    if (ids.indexOf(id) !== i)
      out.push({ path: ["themes", i, "name"], message: "Duplicate theme" });
  });
  if (!ids.includes(p.defaultTheme))
    out.push({ path: ["defaultTheme"], message: "Pick the theme visitors see first" });
  p.tour.forEach((s, i) => {
    if (s.theme && !ids.includes(s.theme))
      out.push({ path: ["tour", i, "theme"], message: "That theme no longer exists" });
  });
  if (p.activation.type === "link" && !p.activation.url)
    out.push({ path: ["activation", "url"], message: "Add the link the activation opens" });
  if (p.cta.mode === "url" && !p.cta.url)
    out.push({ path: ["cta", "url"], message: "Add the link the button opens" });
  for (const id of ZONE_IDS) {
    const zone = p.zones[id];
    if (!zone.enabled) continue;
    if (zone.model.source === "asset" && !zone.model.asset)
      out.push({ path: ["zones", id, "model", "asset"], message: "Choose a 3D model" });
    if (zone.model.source === "image" && !zone.model.image)
      out.push({ path: ["zones", id, "model", "image"], message: "Choose a cut-out image" });
  }
  return out;
}

/** Everything that would stop a publish, with paths into the project. */
export function projectIssues(input: unknown): Issue[] {
  const strict = projectSchema.safeParse(input);
  if (!strict.success) {
    const issues = strict.error.issues.map((i) => ({ path: i.path, message: humanize(i) }));
    // semantic rules still apply to whatever parses leniently
    const loose = draftSchema.safeParse(input);
    if (loose.success) {
      const seen = new Set(issues.map((i) => i.path.join(".")));
      for (const s of semanticIssues(loose.data)) {
        if (!seen.has(s.path.join("."))) issues.push(s);
      }
    }
    return issues;
  }
  return semanticIssues(strict.data);
}

export type DraftParse =
  { ok: true; draft: Project; issues: Issue[] } | { ok: false; issues: Issue[] };

/** Parse a draft for storage: strict when possible, lenient otherwise; garbage is refused. */
export function parseDraft(input: unknown): DraftParse {
  const strict = projectSchema.safeParse(input);
  if (strict.success) return { ok: true, draft: strict.data, issues: semanticIssues(strict.data) };
  const loose = draftSchema.safeParse(input);
  if (!loose.success) {
    return {
      ok: false,
      issues: loose.error.issues.map((i) => ({ path: i.path, message: humanize(i) })),
    };
  }
  return { ok: true, draft: loose.data, issues: projectIssues(input) };
}

/** Deep equality on JSON data, ignoring key order. */
export function sameJSON(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export type ProjectStatus = "draft" | "published" | "changed";

/** A row in the builder's project list (no full drafts). */
export interface ProjectSummary {
  slug: string;
  name: string;
  client: string | null;
  thumb: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  hasUnpublishedChanges: boolean;
  status: ProjectStatus;
}

export { VIEWS, ZONES, ZONE_IDS };
