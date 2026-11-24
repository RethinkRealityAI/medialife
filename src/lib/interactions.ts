// The interaction library: the newer experiences we can put on any IP, shown on
// /technology (in depth, with a Try it QR + the picture to point at) and as a
// compact rail on the homepage. Real screens and phone recordings only.
//
// Media: each card starts with the clip bundled in the repo (or just its still).
// When the team uploads a video to Admin > Media Library that is PUBLIC and has
// the tag "Showcase" plus the experience's name as a tag or collection (e.g.
// tag "Bobo Booth"), /api/showcase.json returns it and the card plays that
// instead, newest first. See src/lib/media/showcase.server.ts.

export type InteractionTech =
  | "Image tracking"
  | "Face tracking"
  | "AI voice + hand tracking"
  | "Touchscreen + phones"
  | "Live map";

export type Interaction = {
  slug: string;
  /** What the fan does, as the card title */
  verb: string;
  /** The experience it comes from */
  name: string;
  client: "EVADE" | "MEDIALIFE";
  tech: InteractionTech;
  /** One sentence: what happens */
  line: string;
  /** The longer "how it works" for /technology */
  how: string;
  /** What a brand gets out of it */
  value: string;
  /** Still from the real page (16:9) */
  still: string;
  /** Bundled phone recording (vertical), until a Showcase upload replaces it */
  clip?: { src: string; poster: string };
  /** Where the fan opens it; null = not open to the public (demo on request) */
  url: string | null;
  /** The picture to point the phone at, when it tracks a print */
  target?: { src: string; alt: string; page?: string };
  /** Shown instead of a target picture when the trigger is not a print */
  targetNote?: string;
  /** Media Library names that count as this experience (tag or collection, any case) */
  aliases: string[];
  /** Labs experiment, not a live campaign yet */
  lab?: boolean;
};

const KC = "/evade/keychain-ar/image-targets/";

export const INTERACTIONS: Interaction[] = [
  {
    slug: "off-the-chain",
    verb: "Bring it to life",
    name: "Bobo Off the Chain",
    client: "EVADE",
    tech: "Image tracking",
    line: "Point the phone at the keychain and Bobo jumps off the charm to eat, play and power up.",
    how: "The charm's own art is the image target. A 3D Bobo lands on it at true size, follows it as the fan turns it, and every clip a fan records lands on the live globe.",
    value: "The merch becomes the controller: scans, replays and shares counted per unit.",
    still: "/labs/img/off-the-chain.webp",
    clip: { src: "/evade/video/otc-bobo.mp4", poster: "/evade/video/otc-bobo.webp" },
    url: "/evade/keychain-ar/",
    target: {
      src: `${KC}kc-bobo.jpg`,
      alt: "The Bobo charm art",
      page: "/evade/keychain-ar/target/",
    },
    aliases: ["off the chain", "bobo off the chain", "off-the-chain", "keychain ar"],
  },
  {
    slug: "spray-bobo",
    verb: "Paint it with your phone",
    name: "Spray Bobo",
    client: "EVADE",
    tech: "Image tracking",
    line: "The phone becomes a spray can. Paint the charm or a tee, and the painting sticks to it in 3D.",
    how: "Tracks the print, maps a canvas exactly onto it, and turns the phone's movement into spray. Decals, colours and a share link come with it.",
    value: "Every fan makes a one-off version of the product, and shares it.",
    still: "/labs/img/spray-bobo.webp",
    clip: { src: "/evade/video/spray-bobo.mp4", poster: "/evade/video/spray-bobo.webp" },
    url: "/evade/spray-bobo/",
    target: {
      src: `${KC}kc-bobo.jpg`,
      alt: "The Bobo charm art",
      page: "/evade/keychain-ar/target/",
    },
    aliases: ["spray bobo", "spray-bobo"],
  },
  {
    slug: "xray-bobo",
    verb: "See inside it",
    name: "Bobo X-Ray",
    client: "EVADE",
    tech: "Image tracking",
    line: "The charm breaks apart into a depth box, and the can opens into itself, full of balls to swipe.",
    how: "Masks the print so the 3D scene sits inside it, not on top. The art breaks away in tiles and a paw-swipe game plays inside.",
    value: "A product that looks like it has a world inside it: the reveal people film.",
    still: "/labs/img/xray-bobo.webp",
    clip: { src: "/evade/video/xray-bobo.mp4", poster: "/evade/video/xray-bobo.webp" },
    url: "/evade/xray-bobo/",
    target: {
      src: `${KC}kc-bobo.jpg`,
      alt: "The Bobo charm art",
      page: "/evade/keychain-ar/target/",
    },
    aliases: ["x-ray", "xray", "bobo x-ray", "xray bobo", "xray-bobo"],
  },
  {
    slug: "photo-beam",
    verb: "Beam your photo onto it",
    name: "Photo Beam",
    client: "EVADE",
    tech: "Image tracking",
    line: "Take a selfie, aim, and beam it onto Bobo's visor, the can's label or a printed tee.",
    how: "Each print has mapped photo slots. The fan's picture is styled (screen print, halftone, mono) and wraps onto the slot in AR. The photo stays on their phone.",
    value: "Personalised merch without printing anything new.",
    still: "/labs/img/photo-beam.webp",
    url: "/evade/photo-beam/",
    target: {
      src: `${KC}kc-bobo.jpg`,
      alt: "The Bobo charm art",
      page: "/evade/keychain-ar/target/",
    },
    aliases: ["photo beam", "photo-beam"],
  },
  {
    slug: "bobo-booth",
    verb: "Wear it",
    name: "Bobo Booth",
    client: "EVADE",
    tech: "Face tracking",
    line: "A selfie booth with the cat hat, Bobo shades and can earrings. Open your mouth for fizz, raise your brows to switch looks.",
    how: "Face tracking on the front camera, up to three faces at once, with face paint on the live mesh. Snap a photo, a clip or a 4-shot strip, then beam it onto the merch.",
    value: "The brand on the fan's face, in every photo they post.",
    still: "/labs/img/bobo-booth.webp",
    url: "/evade/bobo-booth/",
    targetNote: "No picture needed: your face is the target.",
    aliases: ["bobo booth", "bobo-booth", "photo booth"],
  },
  {
    slug: "eclipse-night",
    verb: "Take over the sky",
    name: "Eclipse Night",
    client: "EVADE",
    tech: "Sky segmentation + image tracking",
    line: "Charge the can charm, point at the sky, and only the real sky turns to EVADE's night: a giant Eclipse can covers the moon and Bobo walks out of his stars.",
    how: "An on-device sky model finds the real sky, so buildings, trees and people stay in front. Trace Bobo's constellation star by star to set him free.",
    value: "The brand on the biggest screen there is: a moment fans share at games and events.",
    still: "/labs/img/eclipse-night.webp",
    url: "/evade/eclipse-night/",
    target: {
      src: `${KC}kc-can.jpg`,
      alt: "The Eclipse can charm art",
      page: "/evade/keychain-ar/target/",
    },
    aliases: ["eclipse night", "eclipse-night", "sky"],
    lab: true,
  },
  {
    slug: "wake-the-print",
    verb: "Talk to it",
    name: "Wake the Print",
    client: "MEDIALIFE",
    tech: "AI voice + hand tracking",
    line: "A character steps out of the print, talks back by voice, sees your hand and hops onto your palm.",
    how: "Image tracking for the print, hand tracking for the palm perch, and a real-time voice agent with memory tied to the item, so it remembers the owner next time.",
    value: "A product that knows its owner: a reason to come back, and a direct line to fans.",
    still: "/labs/img/wake-the-print.webp",
    url: "/labs/wake-the-print/",
    target: {
      src: "/labs/medialife-spray/targets/tee-sukeban.jpg",
      alt: "The Sukeban tee print",
      page: "/labs/wake-the-print/target/",
    },
    aliases: ["wake the print", "wake-the-print", "spark"],
    lab: true,
  },
  {
    slug: "spray-studio",
    verb: "Design it at the stand",
    name: "Spray Studio",
    client: "EVADE",
    tech: "Touchscreen + phones",
    line: "A big-screen studio for pop-ups: fans paint the merch, using their own phones as spray cans, then scan to take it home.",
    how: "Runs on a touchscreen or a laptop with no camera. Each creation gets a share link and QR that opens it in AR on the real product.",
    value: "Turns a retail stand into a crowd, and every visitor into a lead.",
    still: "/labs/img/spray-studio.webp",
    url: null,
    targetNote: "Runs on a touchscreen at events. Ask us for a live demo.",
    aliases: ["spray studio", "spray-studio"],
  },
  {
    slug: "where-is-bobo",
    verb: "Follow it around the world",
    name: "Where is Bobo?",
    client: "EVADE",
    tech: "Live map",
    line: "Every clip fans record lands on a live 3D globe, so the community can see where the character has been.",
    how: "AR captures are uploaded with their city, checked, and pinned to the globe as they happen. Landmarks and events become stops on the trip.",
    value: "Proof of reach that fans can see, and a reason to scan in new places.",
    still: "/labs/img/where-is-bobo.webp",
    url: "/evade/where-is-bobo/",
    targetNote: "Opens anywhere: no picture needed.",
    aliases: ["where is bobo", "where is bobo?", "where-is-bobo", "globe"],
  },
];

export const SITE_ORIGIN = "https://medialife.ai";

/** Absolute URL for QR codes (always production, so a QR shown on a preview still works). */
export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : SITE_ORIGIN + path);

/** One library video picked for a card by /api/showcase.json */
export type ShowcaseClip = { src: string; poster: string | null; title: string };
export type ShowcaseMap = Record<string, ShowcaseClip>;
