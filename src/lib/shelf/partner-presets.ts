import { DEFAULT_SHELF, type ShelfConfig } from "./config";

// The shelf a partner starts with in the Partner Hub (/partner-hub/shelves):
// their own name in neon, their colours, and merch printed with their art, so
// the first thing they see is a finished shelf they can send or customise.
// Artwork lives in public/partner-kit/<kit>/shelf/ (scripts/build-partner-shelf-art.mjs).

export type ShelfPartner = {
  id: string;
  name: string;
  kit: string;
  brand: { primary: string; accent: string; ink: string };
};

type ProductTweak = Partial<
  Pick<ShelfConfig["products"][number], "name" | "color" | "print" | "backPrint" | "blurb">
> & { activation?: Partial<ShelfConfig["products"][number]["activation"]> };

/** Per-kit artwork and copy. Kits without an entry get a branded default. */
const KIT_SHELVES: Record<
  string,
  {
    handle: string;
    logo: string;
    /** A picture of the finished shelf, for cards that link to the builder. */
    preview: string;
    theme: ShelfConfig["theme"];
    products: Record<string, ProductTweak>;
  }
> = {
  snowday: {
    handle: "@snowdaymedia",
    logo: "/partner-kit/snowday/brand/wordmark.webp",
    preview: "/partner-kit/snowday/shelf/shelf-preview.webp",
    theme: { neon: "#5ab4ff", accent: "#a78bff", shelf: "black", backdrop: "snow" },
    products: {
      tee: {
        name: "Aurora Heavyweight Tee",
        color: "#21254a",
        print: "/partner-kit/snowday/shelf/chest-flake.webp",
        backPrint: "/partner-kit/snowday/shelf/back-aurora.webp",
        blurb:
          "Boxy heavyweight cotton in midnight navy. Snowflake on the chest, the aurora across the back.",
        activation: {
          title: "The aurora comes alive",
          description:
            "Scan the back print and the northern lights roll across the room in an immersive experience.",
        },
      },
      hoodie: {
        name: "Frost Signal Hoodie",
        color: "#141a33",
        print: "/partner-kit/snowday/shelf/chest-flake.webp",
        backPrint: "/partner-kit/snowday/shelf/back-frost.webp",
        blurb: "Heavyweight hoodie with the Snowday snowflake broadcasting across the back.",
      },
      longsleeve: {
        name: "Snow Day Long-Sleeve",
        color: "#405d96",
        print: "/partner-kit/snowday/shelf/chest-flake.webp",
        backPrint: "/partner-kit/snowday/shelf/back-snowday.webp",
        blurb: "12oz long-sleeve in periwinkle, with SNOW DAY set big across the back.",
      },
      cap: {
        name: "Snowflake Cap",
        color: "#141a33",
        print: "/partner-kit/snowday/shelf/chest-flake.webp",
      },
      keychain: {
        name: "Snowflake Charm Set",
        print: "/partner-kit/snowday/brand/snowflake-lg.webp",
        activation: { title: "Catch the snowflakes" },
      },
      sticker: { name: "Holo Snowflake 3-Pack", print: "/partner-kit/snowday/shelf/sticker.webp" },
    },
  },
};

/** The partner's shelf as a picture (MEDIALIFE's demo shelf for kits without one). */
export const kitShelfPreview = (kit: string) =>
  KIT_SHELVES[kit]?.preview ?? "/partner-kit/medialife/shelf-preview.webp";

const hexOk = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);

/**
 * The partner's own starting shelf: their name in neon and merch printed with
 * their artwork. With `creator`, a shelf for a creator they're pitching
 * instead: the partner's colours with the creator's name (and, once added,
 * logo) on the merch, so the kit's artwork stays off. `classic` keeps
 * MEDIALIFE's original look; the partner's invite and "presented by" stay.
 */
export function partnerShelfConfig(
  p: ShelfPartner,
  opts: { creator?: string; classic?: boolean } = {},
): ShelfConfig {
  const cfg = structuredClone(DEFAULT_SHELF);
  const kit = opts.classic ? undefined : KIT_SHELVES[p.kit];
  const creator = opts.creator?.trim();
  cfg.creator = creator
    ? { name: creator.slice(0, 28), handle: "", logo: null }
    : { name: p.name.slice(0, 28), handle: kit?.handle ?? "", logo: kit?.logo ?? null };
  if (!opts.classic) {
    cfg.theme = kit?.theme ?? {
      ...cfg.theme,
      neon: hexOk(p.brand.accent) ? p.brand.accent.toLowerCase() : cfg.theme.neon,
      accent: hexOk(p.brand.primary) ? p.brand.primary.toLowerCase() : cfg.theme.accent,
    };
  }
  cfg.pitch = {
    ...cfg.pitch,
    preparedFor: creator ?? "",
    presentedBy: `${p.name} × MEDIALIFE`.slice(0, 60),
    inviteCode: p.id,
  };
  if (kit) {
    cfg.products = cfg.products.map((prod) => {
      const t = kit.products[prod.id];
      if (!t) return prod;
      if (creator) return t.color ? { ...prod, color: t.color } : prod;
      const { activation, ...rest } = t;
      return { ...prod, ...rest, activation: { ...prod.activation, ...activation } };
    });
  }
  return cfg;
}
