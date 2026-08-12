/**
 * Case studies.
 *
 * Every figure and quote is drawn from MEDIALIFE's own Live AR Media deck
 * (medialife-live-ar-media--04pmr63.gamma.site) or from the official 2025
 * Pinnacle Awards winners page. Do not add retailers, rounds, dates or
 * platform relationships that are not in those two sources.
 */

export type Metric = { v: string; l: string };
export type Quote = { text: string; who: string };
export type Shot = { src: string; large?: string; alt: string };

export type CaseStudy = {
  slug: string;
  client: string;
  title: string;
  kicker: string;
  award?: { tier: string; name: string; category: string; href: string };
  intro: string[];
  /** Grouped so each band can carry its own label, as in the source deck. */
  metricGroups: { label: string; items: Metric[] }[];
  retail?: { name: string; city: string; v: string }[];
  quotes: Quote[];
  hero?: Shot;
  gallery: Shot[];
  formats: string[];
};

const g = (name: string, alt: string): Shot => ({
  src: `/work/${name}.webp`,
  large: `/work/${name}-large.webp`,
  alt,
});

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "sakamoto-days",
    client: "Netflix / Sakamoto Days",
    title: "Mr. Sakamoto's transformation, as live app-free AR.",
    kicker: "Activated print · Retail · Live events",
    award: {
      tier: "Platinum",
      name: "Pinnacle Award",
      category: "Experiential Marketing & Communications",
      href: "https://www.pinnacle-award.com/winners-marketing-communications-2025",
    },
    intro: [
      "MEDIALIFE turned Mr. Sakamoto's climactic transformation into a live, app-free augmented reality experience.",
      "We distributed AR-activated magazines, stickers, and posters across 150+ comic and manga retailers, then brought the programme out of the living room and directly into fans' lives at Anime Expo, San Diego Comic-Con and Anime NYC — turning the transformation into a live, participatory experience.",
    ],
    metricGroups: [
      {
        label: "Engagement duration",
        items: [
          { v: "3m 22s", l: "avg engagement · NFC-activated unit" },
          { v: "2m 37s", l: "avg engagement · QR-activated unit" },
        ],
      },
      {
        label: "Repeat engagement",
        items: [{ v: "5.46×", l: "interactions per NFC sticker" }],
      },
      {
        label: "Live event engagement",
        items: [{ v: "1.7", l: "attendees engaging per minute at Anime NYC" }],
      },
      {
        label: "Long-tail impact",
        items: [{ v: "+11%", l: "engagement growth 2+ weeks post distribution" }],
      },
    ],
    retail: [
      { name: "Toy Tokyo", city: "New York City, USA", v: "683" },
      { name: "Forbidden Planet", city: "New York City, USA", v: "490" },
      { name: "Golden Age Collectibles", city: "Vancouver, Canada", v: "356" },
    ],
    quotes: [
      {
        text: "This was a very unique activation. Our patrons loved it. The only issue is that it drove demand for the manga… which we ran out of pretty quickly. Can you get us more of the manga?",
        who: "Store Manager, Austin Books and Comics",
      },
      {
        text: "Mr. Sakamoto is the first thing our customers see when they walk in! Many folks interact with him. We rarely jump in and tell them to use their phones. People are taking the stickers, and we've sold quite a few mangas since he's been up.",
        who: "Store Manager, Pulp Fiction Long Beach",
      },
      {
        text: "We would love to do more activations like this. It's really something different. Please let us know when the next one is, we would really love to be a part of it.",
        who: "CMO, Midtown Comics, Inc",
      },
      {
        text: "The standee has been a really fun attraction for our shoppers and we love it.",
        who: "Shop Owner, Cabrillo Beach Curiosities",
      },
      {
        text: "We love having Mr. Sakamoto here! How long can we keep him up?",
        who: "Store Manager, Manga Spot Chicago",
      },
    ],
    hero: {
      src: "/work/sakamoto-header.webp",
      large: "/work/sakamoto-header-large.webp",
      alt: "Sakamoto Days on Netflix — MEDIALIFE activated character standee artwork and the Platinum Pinnacle Award badge",
    },
    gallery: [
      g(
        "sakamoto-cosplay-standee",
        "Cosplayers posing with the Sakamoto Days activated standee at a convention",
      ),
      g(
        "sakamoto-escalator",
        "Fans holding the Den of Geek Sakamoto Days activated poster at Anime NYC",
      ),
      g(
        "sakamoto-standee-pikachu",
        "The Sakamoto Days standee on the convention floor at the Javits Center",
      ),
      g(
        "sakamoto-convention-hall",
        "Cosplayers gathered around the activated standee in the convention hall",
      ),
      g("sakamoto-cosplay-group", "Cosplay group posing with the Sakamoto Days standee"),
      g("sakamoto-fans-two", "Two fans holding the activated Sakamoto Days poster"),
      g("sakamoto-retail-street", "Sakamoto Days retail activation on the street outside a store"),
      g("sakamoto-fans-poster", "Fans outside the convention with the activated poster"),
      g("sakamoto-street-crowd", "Crowd on the street with activated Sakamoto Days posters"),
    ],
    formats: [
      "Activated magazines",
      "Activated stickers",
      "Activated posters",
      "Life-sized standees",
    ],
  },
  {
    slug: "convention-fandom",
    client: "Anime conventions",
    title: "Amplifying fandom immersion at anime conventions.",
    kicker: "Activated Apparel™ · NFC · Live events",
    intro: [
      "Convention exhibitors struggle to create memorable fan experiences that extend beyond the physical event.",
      "QR activations frequently face barriers such as user hesitation, camera issues, and limited durability. NFC creates a seamless touchpoint and achieves superior engagement — a tap rather than a scan, embedded in something the fan takes home.",
    ],
    metricGroups: [
      {
        label: "NFC vs QR",
        items: [
          { v: "3m 22s", l: "avg engagement · NFC-activated unit" },
          { v: "2m 37s", l: "avg engagement · QR-activated unit" },
          { v: "5.46×", l: "interactions per NFC sticker" },
        ],
      },
    ],
    quotes: [],
    hero: {
      src: "/work/sukeban-sticker.webp",
      alt: "Sukeban activated sticker artwork — activated apparel and fandom merchandise for convention audiences",
    },
    gallery: [],
    formats: [
      "Activated Apparel™",
      "NFC stickers",
      "Fandom merchandise",
      "Convention distribution",
    ],
  },
];

export const getCaseStudy = (slug: string) => CASE_STUDIES.find((c) => c.slug === slug);
