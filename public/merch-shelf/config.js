/**
 * Config resolution for the Creator Merch Shelf.
 *
 * The contract is ShelfConfig in src/lib/shelf/config.ts. This page is plain JS
 * with no build step, so it cannot import that file: it reads the generated
 * mirror (/merch-shelf/default.json) and re-checks every field it uses, falling
 * back field-by-field to the default rather than failing the whole shelf.
 *
 * Order:
 *   1. window.__SHELF            a published shelf, injected by the server
 *   2. /merch-shelf/default.json + quick-link URL params
 *   (?preview=1 additionally listens for shelf:config messages; see main.js)
 */

export const PRODUCT_TYPES = [
  "tee",
  "hoodie",
  "longsleeve",
  "cap",
  "keychain",
  "sticker",
  "plush",
  "deskmat",
];
export const ACTIVATION_KINDS = ["ar", "model", "video", "game", "unlock"];
export const SHELF_FINISHES = ["walnut", "black", "white", "maple"];
export const BACKDROPS = ["midnight", "sunset", "arcade", "snow"];

/** Per-type facts the page needs that the config does not carry. */
export const PRODUCT_META = {
  tee: {
    label: "Tee",
    apparel: true,
    tintable: true,
    sizes: ["S", "M", "L", "XL", "2XL"],
    fallback: "ml_reward_tee.webp",
  },
  hoodie: {
    label: "Hoodie",
    apparel: true,
    tintable: true,
    sizes: ["S", "M", "L", "XL", "2XL"],
    fallback: "ml_reward_hoodie.webp",
  },
  longsleeve: {
    label: "Long-sleeve",
    apparel: true,
    tintable: true,
    sizes: ["S", "M", "L", "XL", "2XL"],
    fallback: "ml_reward_tee.webp",
  },
  cap: {
    label: "Cap",
    apparel: false,
    tintable: true,
    finish: "Embroidered · one size",
    fallback: "ml_reward_figure.webp",
  },
  keychain: {
    label: "Charm set",
    apparel: false,
    tintable: false,
    finish: "Clear acrylic · silver clasp",
    fallback: "ml_reward_keychain.webp",
  },
  sticker: {
    label: "Sticker pack",
    apparel: false,
    tintable: false,
    finish: "Holographic vinyl · 3-pack",
    fallback: "ml_reward_sticker.webp",
  },
  plush: { label: "Plush", apparel: false, tintable: true, fallback: "ml_reward_figure.webp" },
  deskmat: { label: "Desk mat", apparel: false, tintable: true, fallback: "ml_reward_mat.webp" },
};

/** The lineup's vintage-washed colourways, offered in the product sheet (the configured one stays selected). */
export const SWATCHES = [
  { hex: "#1c1c1f", name: "Washed black" },
  { hex: "#1d2433", name: "Washed navy" },
  { hex: "#2e2f33", name: "Charcoal" },
  { hex: "#6b6d70", name: "Vintage grey" },
  { hex: "#e9e4d8", name: "Bone" },
  { hex: "#5a1416", name: "Deep red" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]{1,40}$/;
const INVITE = /^([a-z0-9-]{2,40})?$/;

const str = (v, max, fb) => (typeof v === "string" ? v.trim().slice(0, max) : fb);
const hex = (v, fb) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fb);
const oneOf = (v, list, fb) => (list.includes(v) ? v : fb);
const imageRef = (v) =>
  typeof v === "string" &&
  v.length <= 1000 &&
  (v.startsWith("/") || v.startsWith("https://")) &&
  !v.startsWith("//")
    ? v
    : null;
const int = (v, min, max, fb) =>
  Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fb;

/** Coerce anything into a usable ShelfConfig, field by field, against `base`. */
export function sanitize(input, base) {
  const c = input && typeof input === "object" ? input : {};
  const creator = c.creator || {};
  const theme = c.theme || {};
  const pitch = c.pitch || {};
  const name = str(creator.name, 28, base.creator.name) || base.creator.name;
  const products = Array.isArray(c.products) ? c.products : base.products;
  const seen = new Set();
  const out = [];
  for (const p of products.slice(0, 12)) {
    if (!p || typeof p !== "object" || !PRODUCT_TYPES.includes(p.type)) continue;
    const fb = base.products.find((b) => b.type === p.type) || base.products[0];
    let id = typeof p.id === "string" && ID.test(p.id) ? p.id : p.type;
    while (seen.has(id)) id = `${id}-${out.length}`.slice(0, 40);
    seen.add(id);
    const a = p.activation || {};
    out.push({
      id,
      type: p.type,
      enabled: p.enabled !== false,
      name: str(p.name, 60, fb.name) || fb.name,
      price: int(p.price, 0, 100000, fb.price),
      color: hex(p.color, fb.color),
      print: imageRef(p.print),
      backPrint: imageRef(p.backPrint),
      blurb: str(p.blurb, 240, fb.blurb),
      activation: {
        kind: oneOf(a.kind, ACTIVATION_KINDS, fb.activation.kind),
        title: str(a.title, 60, fb.activation.title),
        description: str(a.description, 240, fb.activation.description),
        reward: str(a.reward, 120, fb.activation.reward),
      },
    });
  }
  if (!out.length) out.push(...structuredClone(base.products));
  const invite = str(pitch.inviteCode, 40, "").toLowerCase();
  return {
    version: 1,
    creator: {
      name,
      handle: str(creator.handle, 40, base.creator.handle),
      logo: imageRef(creator.logo),
    },
    theme: {
      neon: hex(theme.neon, base.theme.neon),
      accent: hex(theme.accent, base.theme.accent),
      shelf: oneOf(theme.shelf, SHELF_FINISHES, base.theme.shelf),
      backdrop: oneOf(theme.backdrop, BACKDROPS, base.theme.backdrop),
    },
    products: out,
    pitch: {
      preparedFor: str(pitch.preparedFor, 60, ""),
      presentedBy: str(pitch.presentedBy, 60, ""),
      inviteCode: INVITE.test(invite) ? invite : "",
      audience: int(pitch.audience, 0, 1e9, base.pitch.audience),
      showEstimator: pitch.showEstimator !== false,
    },
  };
}

/** The defaults compiled into the page, used only if default.json cannot be fetched. */
const EMBEDDED_DEFAULT = {
  version: 1,
  creator: { name: "YOUR NAME", handle: "@yourchannel", logo: null },
  theme: { neon: "#ff37ae", accent: "#19affe", shelf: "walnut", backdrop: "midnight" },
  products: PRODUCT_TYPES.slice(0, 6).map((type) => ({
    id: type,
    type,
    enabled: true,
    name: PRODUCT_META[type].label,
    price: 3000,
    color: "#1c1c1f",
    print: null,
    backPrint: null,
    blurb: "",
    activation: {
      kind: "unlock",
      title: "Unlock a reward",
      description: "Every scan unlocks a reward.",
      reward: "A reward",
    },
  })),
  pitch: {
    preparedFor: "",
    presentedBy: "",
    inviteCode: "",
    audience: 250000,
    showEstimator: true,
  },
};

let defaultsPromise = null;
export function loadDefaults() {
  if (!defaultsPromise) {
    defaultsPromise = fetch("/merch-shelf/default.json", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`default.json ${r.status}`))))
      .then((j) => sanitize(j, EMBEDDED_DEFAULT))
      .catch(() => structuredClone(EMBEDDED_DEFAULT));
  }
  return defaultsPromise;
}

/** The lineup a quick link shows when it names no products. */
const DEFAULT_ENABLED = ["tee", "hoodie", "longsleeve", "cap", "keychain", "sticker"];

const hexParam = (v) =>
  v && /^#?[0-9a-fA-F]{6}$/.test(v) ? `#${v.replace("#", "").toLowerCase()}` : null;

/** Apply quick-link params (?name=…&neon=…) on top of a config. */
export function applyQuickLink(config, params) {
  const c = structuredClone(config);
  const get = (k) => {
    const v = params.get(k);
    return v == null ? null : v.trim();
  };
  const name = get("name");
  if (name) {
    c.creator.name = name.slice(0, 28);
    // The default handle belongs to the placeholder name, not to this creator.
    if (!params.has("handle")) c.creator.handle = "";
  }
  if (params.has("handle")) {
    let h = (get("handle") || "").slice(0, 40);
    if (h && !h.startsWith("@") && !/\s/.test(h) && !h.includes(".")) h = `@${h}`;
    c.creator.handle = h;
  }
  const neon = hexParam(get("neon"));
  if (neon) c.theme.neon = neon;
  const accent = hexParam(get("accent"));
  if (accent) c.theme.accent = accent;
  const shelf = get("shelf");
  if (SHELF_FINISHES.includes(shelf)) c.theme.shelf = shelf;
  const backdrop = get("backdrop");
  if (BACKDROPS.includes(backdrop)) c.theme.backdrop = backdrop;
  const logo = imageRef(get("logo"));
  if (logo) c.creator.logo = logo;
  if (params.has("for")) c.pitch.preparedFor = (get("for") || "").slice(0, 60);
  if (params.has("by")) c.pitch.presentedBy = (get("by") || "").slice(0, 60);
  const invite = (get("invite") || "").toLowerCase();
  if (invite && INVITE.test(invite)) c.pitch.inviteCode = invite;
  const audience = Number(get("audience"));
  if (params.has("audience") && Number.isFinite(audience) && audience >= 0)
    c.pitch.audience = Math.round(Math.min(1e9, audience));
  const list = get("products");
  if (list) {
    const types = list
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((t) => PRODUCT_TYPES.includes(t));
    if (types.length) {
      const pool = [...c.products];
      const picked = [];
      for (const t of types) {
        const i = pool.findIndex((p) => p.type === t);
        if (i < 0) continue;
        picked.push({ ...pool[i], enabled: true });
        pool.splice(i, 1);
      }
      if (picked.length) c.products = picked;
    }
  }
  return c;
}

/** The quick link that reproduces a config (everything except a local logo). */
export function buildQuickLink(config, { includeLogo = true } = {}) {
  const base = location.pathname.startsWith("/shelf") ? "/shelf" : location.pathname;
  const u = new URL(base, location.origin);
  const p = u.searchParams;
  p.set("name", config.creator.name);
  if (config.creator.handle) p.set("handle", config.creator.handle);
  p.set("neon", config.theme.neon.slice(1));
  p.set("accent", config.theme.accent.slice(1));
  p.set("shelf", config.theme.shelf);
  p.set("backdrop", config.theme.backdrop);
  if (includeLogo && config.creator.logo && !config.creator.logo.startsWith("blob:"))
    p.set("logo", config.creator.logo);
  if (config.pitch.preparedFor) p.set("for", config.pitch.preparedFor);
  if (config.pitch.presentedBy) p.set("by", config.pitch.presentedBy);
  if (config.pitch.inviteCode) p.set("invite", config.pitch.inviteCode);
  if (config.pitch.audience) p.set("audience", String(config.pitch.audience));
  const enabled = config.products.filter((x) => x.enabled).map((x) => x.type);
  if (enabled.join(",") !== DEFAULT_ENABLED.join(",")) p.set("products", enabled.join(","));
  return u.toString();
}

/**
 * Resolve the config the page starts with.
 * @returns {Promise<{config:object, source:'published'|'quick'|'default', slug:string|null}>}
 */
export async function resolveConfig() {
  const defaults = await loadDefaults();
  if (window.__SHELF && typeof window.__SHELF === "object") {
    return {
      config: sanitize(window.__SHELF, defaults),
      source: "published",
      slug: typeof window.__SHELF_SLUG === "string" ? window.__SHELF_SLUG : null,
    };
  }
  const params = new URLSearchParams(location.search);
  const quick = [
    "name",
    "handle",
    "neon",
    "accent",
    "shelf",
    "backdrop",
    "logo",
    "for",
    "by",
    "invite",
    "audience",
    "products",
  ].some((k) => params.has(k));
  return {
    config: quick ? applyQuickLink(defaults, params) : defaults,
    source: quick ? "quick" : "default",
    slug: null,
  };
}

/* ---- formatting ---------------------------------------------------------- */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
/** Cents → "$39" (whole dollars) or "$39.50". */
export function money(cents) {
  const v = (cents || 0) / 100;
  return Number.isInteger(v) ? usd0.format(v) : usd.format(v);
}
export const moneyExact = (cents) => usd.format((cents || 0) / 100);

export function compact(n) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: n < 1e4 ? 1 : 0,
  }).format(n);
}

/** Join URL for the Creator Hub application, relative, invite carried when set. */
export function joinUrl(config) {
  const code = config.pitch.inviteCode;
  return code ? `/creator-hub/join?invite=${encodeURIComponent(code)}` : "/creator-hub/join";
}

/** Relative luminance of a hex colour, 0..1. */
export function luminance(hexColor) {
  const n = parseInt(hexColor.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
