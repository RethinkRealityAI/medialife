import type { LensItem } from "./lens-stage";

/**
 * What floats in the homepage hero: one real piece per kind of work, each
 * linking to where it lives on the site. EVADE art is shown as supplied (no
 * generative tools are run on it).
 */
export const LENS_ITEMS: LensItem[] = [
  {
    key: "tee",
    kind: "Activated apparel",
    name: "Syndicate AR tee",
    href: "/activated-merch/",
    src: "/activated-merch/models/hero/syndicate-tee.glb",
    shape: "glb",
    rotY: Math.PI,
    size: 1.15,
  },
  {
    key: "keychain",
    kind: "Activated collectibles",
    name: "EVADE × Bobo keychain",
    href: "/evade/",
    src: "/evade/keychain/evade-keychain.glb",
    shape: "glb",
    size: 1.1,
  },
  {
    key: "print",
    kind: "Activated print",
    name: "ONE PIECE · live now",
    href: "/live",
    src: "/live/one-piece-poster.webp",
    shape: "card",
    aspect: 662 / 900,
    size: 0.95,
  },
  {
    key: "game",
    kind: "Browser games",
    name: "Cola Run · scan and play",
    href: "/evade/",
    src: "/evade/creators/assets/img/cola-run-splash-sm.webp",
    shape: "phone",
    aspect: 540 / 967,
    size: 0.9,
  },
  {
    key: "retail",
    kind: "Activated retail",
    name: "The activated fixture",
    href: "/activated-retail",
    src: "/medialife/activated-retail/page/showcase-poster-sm.webp",
    shape: "card",
    aspect: 800 / 450,
    size: 1.05,
  },
  {
    key: "stickers",
    kind: "AR stickers",
    name: "Scan it, it moves",
    href: "/activated-merch/",
    src: "/activated-merch/models/ar-stickers.glb",
    shape: "glb",
    size: 0.7,
  },
];
