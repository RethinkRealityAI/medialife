/**
 * Real captures from fans' phones, shared by the homepage strip and /fan-reactions.
 *
 * Approved partners only (Netflix, ONE PIECE, Sakamoto Days, Den of Geek, EVADE).
 * Clips that show partners not yet approved for public use (e.g. sports teams)
 * are left out on purpose. Each story says only what the clip shows.
 */

export type Where = "Conventions" | "Stores" | "Out in the world";

export type Capture = {
  src?: string;
  poster: string;
  alt: string;
  where: Where;
  tag: string;
  ratio: string;
  /** /fan-reactions detail: what happened, in a sentence or two */
  story: string;
  /** The format behind it, in the homepage's words */
  format: string;
  /** Where to go deeper */
  link: { label: string; href: string };
};

const F = "/fan-reactions";
const V = "/evade/creators/assets/video";
const GLOBE = { label: "Open the Where is Bobo? globe", href: "/evade/where-is-bobo/" };
const SAKAMOTO = {
  label: "Read the Sakamoto Days case study",
  href: "/case-studies#sakamoto-days",
};

export const CAPTURES: Capture[] = [
  {
    src: `${F}/anime-nyc-tee.mp4`,
    poster: `${F}/anime-nyc-tee.webp`,
    alt: "Logan Chitwood showing the Yujiro × Animebae activated tee at Anime NYC",
    where: "Conventions",
    tag: "Anime NYC",
    ratio: "480 / 822",
    story:
      "At Anime NYC, a phone pointed at the Yujiro × Animebae tee makes the printed artwork play.",
    format: "Activated apparel · Image-tracked AR",
    link: { label: "See activated merch", href: "/activated-merch/" },
  },
  {
    src: `${V}/bobo-golden-gate.mp4`,
    poster: `${V}/bobo-golden-gate.webp`,
    alt: "Bobo in AR at the Golden Gate Bridge",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
    story:
      "An EVADE fan drops Bobo in front of the Golden Gate Bridge. The clip is pinned on the live globe where it was filmed.",
    format: "World-tracked AR",
    link: GLOBE,
  },
  {
    src: `${F}/sakamoto-poster.mp4`,
    poster: `${F}/sakamoto-poster.webp`,
    alt: "The Sakamoto Days activated poster coming alive in a comic store",
    where: "Stores",
    tag: "Sakamoto Days",
    ratio: "480 / 822",
    story:
      "In a comic store, a fan scans the Sakamoto Days poster and the art starts to move, with the trailer one tap away.",
    format: "Activated print · Netflix program",
    link: SAKAMOTO,
  },
  {
    src: `${F}/sakamoto-facade.mp4`,
    poster: `${F}/sakamoto-facade.webp`,
    alt: "A Sakamoto Days tag painting itself across a storefront, seen through a phone",
    where: "Out in the world",
    tag: "Sakamoto Days",
    ratio: "480 / 936",
    story: "Seen through a phone, a Sakamoto Days tag paints itself across a whole storefront.",
    format: "Geospatial AR",
    link: SAKAMOTO,
  },
  {
    poster: `${F}/sakamoto-javits.webp`,
    alt: "Cosplayers with a life-sized AR Mr. Sakamoto at the Javits Center",
    where: "Conventions",
    tag: "Anime NYC",
    ratio: "600 / 1036",
    story:
      "Cosplayers line up for a photo with a life-sized Mr. Sakamoto in AR at the Javits Center.",
    format: "World-tracked AR",
    link: { label: "Read the conventions case study", href: "/case-studies#convention-fandom" },
  },
  {
    src: `${V}/bobo-meetup.mp4`,
    poster: `${V}/bobo-meetup.webp`,
    alt: "Bobo in AR meeting a mascot outside an event",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
    story: "Outside an event, Bobo in AR meets a costumed mascot.",
    format: "World-tracked AR",
    link: GLOBE,
  },
  {
    src: `${F}/figure-shelf.mp4`,
    poster: `${F}/figure-shelf.webp`,
    alt: "An AR figure placed on a collector's shelf next to real figures",
    where: "Stores",
    tag: "Activated collectible",
    ratio: "480 / 816",
    story: "A collector drags an AR figure onto the shelf, right next to the real ones.",
    format: "Activated collectible · World-tracked AR",
    link: { label: "See activated merch", href: "/activated-merch/" },
  },
  {
    src: `${F}/sakamoto-street.mp4`,
    poster: `${F}/sakamoto-street.webp`,
    alt: "A life-sized AR Mr. Sakamoto on the street outside a venue",
    where: "Out in the world",
    tag: "Sakamoto Days",
    ratio: "480 / 816",
    story: "A life-sized Mr. Sakamoto stands on the street outside the venue, in AR.",
    format: "World-tracked AR",
    link: SAKAMOTO,
  },
  {
    src: `${V}/bobo-exhibit.mp4`,
    poster: `${V}/bobo-exhibit.webp`,
    alt: "Bobo in AR running and flipping by an outdoor exhibit",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
    story: "Bobo runs and flips past an outdoor exhibit, filmed by a fan.",
    format: "World-tracked AR",
    link: GLOBE,
  },
  {
    src: `${V}/bobo-bridge.mp4`,
    poster: `${V}/bobo-bridge.webp`,
    alt: "Bobo in AR on the Golden Gate Bridge walkway",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
    story: "Bobo on the Golden Gate Bridge walkway, filmed by a fan.",
    format: "World-tracked AR",
    link: GLOBE,
  },
];
