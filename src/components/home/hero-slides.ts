/**
 * The hero: one real MEDIALIFE piece at a time, and a phone the visitor points
 * at it (on desktop the phone follows the mouse; on touch it is dragged). The
 * phone's screen is a window onto the same scene in colour, and a design only
 * comes alive in that window, while the phone is over it: exactly like
 * pointing a real phone at the product.
 *
 * A piece holds one or more "spots": a design that comes alive on its own,
 * with its own AR video and its own button on the phone. Print holds two (the
 * ONE PIECE poster and the Sakamoto Days sticker), so the phone can move
 * between them.
 *
 * - Video spots: the design's own AR animation plays on it.
 * - "bobo": the EVADE Bobo keychain shows an NFC hotspot; the phone over it
 *   starts EVADE Cola Run: Bobo and the cola cans pop out, with Bobo's Hideout
 *   (a lightweight copy of the Collector Hub room) behind. The joystick on the
 *   phone steers Bobo; three cans, then a "Digital reward unlocked" card.
 * - "display": a mini EVADE retail fixture pops out of the sign. Not in the hero
 *   for now: see RETAIL_SLIDE below and the README ("Homepage hero").
 *
 * EVADE assets are used as delivered (no AI image tools run on them).
 */
/** Cans to collect in the Bobo game before the reward unlocks */
export const CANS = 3;

/** The phone's button for a design, styled after its print (see .ar-cta in styles.css). */
export type HeroCta = {
  /** Small line: what it is */
  sub: string;
  /** Big line: the action */
  label: string;
  href: string;
  external?: boolean;
  theme: "trainwreck" | "onepiece" | "sakamoto" | "evade";
};

export type HeroVideo = {
  src: string;
  /** Shown instead of the video with reduced motion */
  still: string;
  /**
   * For garments: where the image target's corners sit on the cloth
   * (TL, TR, BR, BL) and where the video's corners sit in target units.
   * Same numbers as /activated-merch/.
   */
  cloth?: { rect: number[][]; quad: number[][] };
};

/** A printed design laid out in the piece (units: the piece's height is about 1). */
export type HeroCard = {
  src: string;
  aspect: number;
  x: number;
  y: number;
  h: number;
  /** Roll, radians */
  rot?: number;
  /** A die-cut sticker: white border, round corners, a little in front */
  sticker?: boolean;
};

export type HeroSpot = {
  /** What to point at, for the hint on the phone ("Move the phone over the tee") */
  aim: string;
  cta: HeroCta;
  video?: HeroVideo;
  card?: HeroCard;
  /**
   * An NFC hotspot on the piece: the phone has to be over it to start. u, v:
   * where on the piece (0..1 from its left / top).
   */
  hotspot?: { u: number; v: number; label: string; sub: string };
};

export type HeroSlide = {
  key: string;
  /** Tab label */
  tab: string;
  /** What to point at, for hints and the Scan button */
  aim: string;
  /** Hologram and highlight colour, alternating blue / magenta */
  accent: "blue" | "magenta";
  /** On phones, the title over the stage (what this kind of piece is) and one line on it */
  title: string;
  detail: string;
  /** The coloured edge lights on the piece (default 1; 0 = none, for dark garments) */
  rim?: number;
  /** Bigger or smaller than the default fit (1) */
  size?: number;
  /** A soft glow in the accent behind the piece (0..1), so it reads on the dark page */
  glow?: number;
  /** One sentence for screen readers when the slide changes */
  describe: string;
  /** The piece: a 3D model, or printed cards (one per spot) */
  target: { kind: "glb"; src: string; rotY?: number } | { kind: "cards" };
  spots: HeroSpot[];
  /** Something that pops out of the piece into the room */
  pop?:
    | {
        kind: "bobo";
        bobo: string;
        anims: string;
        can: string;
        /** Bobo's Hideout, behind the game (a lightweight copy of the Collector Hub room) */
        hub?: string;
      }
    | { kind: "display"; src: string };
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    key: "apparel",
    tab: "Apparel",
    aim: "the hoodie",
    accent: "blue",
    title: "Activated apparel",
    detail: "Point a phone at the print and the artwork plays.",
    size: 1.2,
    rim: 0,
    glow: 1,
    describe: "An activated hoodie: point a phone at the print and the artwork animates.",
    target: { kind: "glb", src: "/activated-merch/models/trainwreck-hoodie.glb", rotY: Math.PI },
    spots: [
      {
        aim: "the hoodie",
        cta: {
          sub: "Trainwreck AR Hoodie · $90",
          label: "Buy now",
          href: "https://shop.medialife.ai/products/unisex-hoodie",
          external: true,
          theme: "trainwreck",
        },
        video: {
          src: "/activated-merch/media/ar/trainwreck.mp4",
          still: "/activated-merch/media/ar/trainwreck.webp",
          cloth: {
            rect: [
              [0.364, 0.6545],
              [-0.3657, 0.6546],
              [-0.366, 0.2358],
              [0.3658, 0.2361],
            ],
            quad: [
              [0.0101, 0.0109],
              [0.9881, 0.0114],
              [0.9894, 0.9894],
              [0.0114, 0.9889],
            ],
          },
        },
      },
    ],
  },
  {
    key: "print",
    tab: "Print",
    aim: "a print",
    accent: "magenta",
    title: "Immersive marketing",
    detail: "Netflix posters and stickers that come alive when scanned.",
    glow: 0.45,
    describe:
      "Activated print for Netflix: the ONE PIECE Den of Geek poster and a Sakamoto Days sticker. Point the phone at either and it animates.",
    target: { kind: "cards" },
    spots: [
      {
        aim: "the poster",
        cta: {
          sub: "ONE PIECE × Netflix",
          label: "See the case",
          href: "/case-studies",
          theme: "onepiece",
        },
        card: { src: "/home/ar/one-piece.webp", aspect: 720 / 979, x: -0.2, y: 0.06, h: 1 },
        video: { src: "/home/ar/one-piece.mp4", still: "/home/ar/one-piece-alive.webp" },
      },
      {
        aim: "the sticker",
        cta: {
          sub: "Sakamoto Days × Netflix",
          label: "See the case",
          href: "/case-studies",
          theme: "sakamoto",
        },
        card: {
          src: "/home/ar/sakamoto.webp",
          aspect: 640 / 862,
          x: 0.42,
          y: -0.2,
          h: 0.58,
          rot: -0.07,
          sticker: true,
        },
        video: { src: "/home/ar/sakamoto.mp4", still: "/home/ar/sakamoto.webp" },
      },
    ],
  },
  {
    key: "game",
    tab: "Game",
    aim: "the NFC tag",
    accent: "blue",
    title: "Immersive merchandising",
    detail: "Tap the keychain to play Cola Run and unlock a reward.",
    glow: 0.55,
    describe:
      "The EVADE Bobo keychain: point the phone at its NFC tag and the EVADE Cola Run game pops out, with Bobo's Hideout behind it. Collect three cans to unlock a digital reward.",
    target: { kind: "glb", src: "/activated-merch/models/evade-charms.glb" },
    spots: [
      {
        aim: "the NFC tag",
        cta: { sub: "EVADE × Bobo", label: "Claim", href: "/evade/", theme: "evade" },
        hotspot: { u: 0.39, v: 0.8, label: "NFC enabled", sub: "Tap here to activate" },
      },
    ],
    pop: {
      kind: "bobo",
      bobo: "/roblox/activated-retail/models/catbobo.glb",
      anims: "/roblox/activated-retail/models/catrun.glb",
      can: "/roblox/activated-retail/models/cola.glb",
      hub: "/home/ar/hub-lite.glb",
    },
  },
];

/**
 * Parked (Dapo, 2026-11-10): the EVADE sign that pops out a mini EVADE retail
 * display. Taken out of the hero for now; everything it needs is kept
 * (public/home/ar/evade-sign.webp, public/home/ar/evade-display.glb, the
 * DisplayPop class in ar-stage.ts). To bring it back, add it to HERO_SLIDES.
 */
export const RETAIL_SLIDE: HeroSlide = {
  key: "retail",
  tab: "Retail",
  aim: "the sign",
  accent: "magenta",
  title: "Activated retail",
  detail: "Scan the sign and a mini EVADE display pops out.",
  describe: "An EVADE in-store sign: scanned, a mini EVADE retail display pops out.",
  target: { kind: "cards" },
  spots: [
    {
      aim: "the sign",
      cta: {
        sub: "EVADE in store",
        label: "Activated retail",
        href: "/activated-retail",
        theme: "evade",
      },
      card: { src: "/home/ar/evade-sign.webp", aspect: 480 / 1059, x: 0, y: 0, h: 1 },
    },
  ],
  pop: { kind: "display", src: "/home/ar/evade-display.glb" },
};
