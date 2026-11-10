/**
 * The hero carousel: one real MEDIALIFE piece at a time. The visitor moves the
 * phone over it (or it glides over by itself when nobody touches it), and only
 * then does it come alive, exactly like pointing a real phone at the product.
 *
 * - "video": the design's own AR animation plays over it on the phone, exactly
 *   as it does in the live experience (image-target AR).
 * - "bobo": Bobo and the cola cans pop out of the EVADE charms. The joystick on
 *   the phone steers Bobo; three cans, then a "Digital reward unlocked" card.
 * - "display": a mini EVADE retail fixture pops out of the sign. Not in the hero
 *   for now: see RETAIL_SLIDE below and the README ("Homepage hero").
 *
 * EVADE assets are used as delivered (no AI image tools run on them).
 */
/** Cans to collect in the Bobo game before the reward unlocks */
export const CANS = 3;

export type HeroSlide = {
  key: string;
  /** Tab label */
  tab: string;
  /** Shown on the phone's button */
  cta: string;
  /** What to point at, for the hint on the phone ("Drag me over the tee") */
  aim: string;
  href: string;
  /** Hologram and highlight colour, alternating blue / magenta */
  accent: "blue" | "magenta";
  /** One sentence for screen readers when the slide changes */
  describe: string;
  target:
    { kind: "glb"; src: string; rotY?: number } | { kind: "card"; src: string; aspect: number };
  ar:
    | {
        kind: "video";
        src: string;
        /** Shown before the video plays, and instead of it with reduced motion */
        still: string;
        /**
         * For garments: where the image target's corners sit on the cloth
         * (TL, TR, BR, BL) and where the video's corners sit in target units.
         * Same numbers as /activated-merch/.
         */
        cloth?: { rect: number[][]; quad: number[][] };
      }
    | { kind: "bobo"; bobo: string; anims: string; can: string }
    | { kind: "display"; src: string };
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    key: "apparel",
    tab: "Apparel",
    cta: "Trainwreck AR tee",
    aim: "the tee",
    href: "/activated-merch/",
    accent: "blue",
    describe: "An activated tee: point a phone at the print and the artwork animates.",
    target: { kind: "glb", src: "/activated-merch/models/trainwreck-tee.glb", rotY: Math.PI },
    ar: {
      kind: "video",
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
  {
    key: "print",
    tab: "Print",
    cta: "ONE PIECE × Netflix",
    aim: "the poster",
    href: "/live",
    accent: "magenta",
    describe: "The ONE PIECE Den of Geek poster for Netflix: scanned, the cover animates.",
    target: { kind: "card", src: "/home/ar/one-piece.webp", aspect: 720 / 979 },
    ar: {
      kind: "video",
      src: "/home/ar/one-piece.mp4",
      still: "/home/ar/one-piece-alive.webp",
    },
  },
  {
    key: "game",
    tab: "Game",
    cta: "Play EVADE × Bobo",
    aim: "the charms",
    href: "/evade/",
    accent: "blue",
    describe:
      "The EVADE Bobo charms: point the phone at them and Bobo pops out. Collect three cans to unlock a digital reward.",
    target: { kind: "glb", src: "/activated-merch/models/evade-charms.glb" },
    ar: {
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
  cta: "Activated retail",
  aim: "the sign",
  href: "/activated-retail",
  accent: "magenta",
  describe: "An EVADE in-store sign: scanned, a mini EVADE retail display pops out.",
  target: { kind: "card", src: "/home/ar/evade-sign.webp", aspect: 480 / 1059 },
  ar: { kind: "display", src: "/home/ar/evade-display.glb" },
};
