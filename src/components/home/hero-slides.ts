/**
 * The hero carousel: one real MEDIALIFE piece at a time, scanned by the phone.
 *
 * - "video": the design's own AR animation plays over it on the phone, exactly
 *   as it does in the live experience (image-target AR).
 * - "bobo": Bobo and a cola can pop out of the EVADE charms into the room, and
 *   the visitor can steer Bobo to collect cans (a tiny Cola Run).
 * - "display": a mini EVADE retail fixture pops out of the sign.
 *
 * EVADE assets are used as delivered (no AI image tools run on them).
 */
export type HeroSlide = {
  key: string;
  /** Tab label */
  tab: string;
  /** Shown on the phone's button */
  cta: string;
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
    href: "/evade/",
    accent: "blue",
    describe:
      "The EVADE Bobo charms: scanned, Bobo and a cola can pop out and you can steer Bobo to collect cans.",
    target: { kind: "glb", src: "/activated-merch/models/evade-charms.glb" },
    ar: {
      kind: "bobo",
      bobo: "/roblox/activated-retail/models/catbobo.glb",
      anims: "/roblox/activated-retail/models/catrun.glb",
      can: "/roblox/activated-retail/models/cola.glb",
    },
  },
  {
    key: "retail",
    tab: "Retail",
    cta: "Activated retail",
    href: "/activated-retail",
    accent: "magenta",
    describe: "An EVADE in-store sign: scanned, a mini EVADE retail display pops out.",
    target: { kind: "card", src: "/home/ar/evade-sign.webp", aspect: 480 / 1059 },
    ar: { kind: "display", src: "/home/ar/evade-display.glb" },
  },
];
