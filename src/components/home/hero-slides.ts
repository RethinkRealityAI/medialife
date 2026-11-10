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
 * - "bobo": Bobo and the cola cans pop out of the EVADE charms. The joystick on
 *   the phone steers Bobo; three cans, then a "Digital reward unlocked" card.
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
};

export type HeroSlide = {
  key: string;
  /** Tab label */
  tab: string;
  /** What to point at, for hints and the Scan button */
  aim: string;
  /** Hologram and highlight colour, alternating blue / magenta */
  accent: "blue" | "magenta";
  /** One sentence for screen readers when the slide changes */
  describe: string;
  /** The piece: a 3D model, or printed cards (one per spot) */
  target: { kind: "glb"; src: string; rotY?: number } | { kind: "cards" };
  spots: HeroSpot[];
  /** Something that pops out of the piece into the room */
  pop?:
    { kind: "bobo"; bobo: string; anims: string; can: string } | { kind: "display"; src: string };
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    key: "apparel",
    tab: "Apparel",
    aim: "the tee",
    accent: "blue",
    describe: "An activated tee: point a phone at the print and the artwork animates.",
    target: { kind: "glb", src: "/activated-merch/models/trainwreck-tee.glb", rotY: Math.PI },
    spots: [
      {
        aim: "the tee",
        cta: {
          sub: "Trainwreck AR Tee · $75",
          label: "Buy now",
          href: "https://shop.medialife.ai/products/unisex-classic-tee",
          external: true,
          theme: "trainwreck",
        },
        video: {
          src: "/activated-merch/media/ar/trainwreck.mp4",
          still: "/activated-merch/media/ar/trainwreck.webp",
          cloth: {
            rect: [
              [0.3987, 0.7898],
              [-0.3744, 0.7895],
              [-0.3744, 0.2428],
              [0.3987, 0.2431],
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
    aim: "the charms",
    accent: "blue",
    describe:
      "The EVADE Bobo charms: point the phone at them and Bobo pops out. Collect three cans to unlock a digital reward.",
    target: { kind: "glb", src: "/activated-merch/models/evade-charms.glb" },
    spots: [
      {
        aim: "the charms",
        cta: { sub: "EVADE × Bobo", label: "Claim", href: "/evade/", theme: "evade" },
      },
    ],
    pop: {
      kind: "bobo",
      bobo: "/roblox/activated-retail/models/catbobo.glb",
      anims: "/roblox/activated-retail/models/catrun.glb",
      can: "/roblox/activated-retail/models/cola.glb",
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
