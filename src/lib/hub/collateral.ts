/**
 * The curated collateral in the Partner Hub: every piece, what it is, and
 * when to use it, grouped by the job it does. A partner gets the MEDIALIFE
 * base set plus its own co-branded set (Partner.kit). Anything the team
 * uploads later lands in the partner's library, shown under these.
 *
 * Files live in public/partner-kit/<kit>/ (built by scripts/build-partner-kit.mjs
 * from Higgsfield photography). They're unlisted and noindexed: made to be
 * shared with creators, so nothing confidential belongs there.
 */

export type KitGroup = "explain" | "show" | "post" | "photos";

export const KIT_GROUPS: Record<KitGroup, { title: string; blurb: string }> = {
  explain: {
    title: "Explain it",
    blurb: "What activated merch is and how it works, in a minute or less.",
  },
  show: {
    title: "Show it live",
    blurb: "Links creators can open right now: the program page and a 3D shop made for them.",
  },
  post: {
    title: "Post it",
    blurb: "Ready-made graphics for Discord, X, Instagram and TikTok. Words already on them.",
  },
  photos: {
    title: "Photography",
    blurb: "Clean imagery with no text, for your own posts, decks and thumbnails.",
  },
};

export type KitItem = {
  id: string;
  group: KitGroup;
  title: string;
  /** What it is. */
  what: string;
  /** When to use it. */
  when: string;
  kind: "image" | "pdf" | "link";
  /** The file or page. Links may carry {invite} and {partner} placeholders. */
  href: string;
  preview?: string;
  /** e.g. "PNG · 1920×1080". */
  format: string;
  /** Where it fits best: shown as chips. */
  channels?: string[];
};

const MEDIALIFE_BASE: KitItem[] = [
  {
    id: "activated-experiences",
    group: "explain",
    title: "Activated Experiences deck",
    what: "MEDIALIFE's work: Netflix's Sakamoto Days (Pinnacle Award 2025), One Piece, DC, the Evade × Roblox proof of concept. Every page has a live QR code.",
    when: "When a creator asks “has this been done before?” Send it after a first call, or screen-share it and let them scan the pages.",
    kind: "pdf",
    href: "/partner-kit/medialife/medialife-activated-experiences.pdf",
    preview: "/partner-kit/medialife/activated-experiences-preview.webp",
    format: "PDF · 7 pages",
    channels: ["Email", "Discord DM", "Calls"],
  },
  {
    id: "program-page",
    group: "show",
    title: "Your co-branded program page",
    what: "A page for creators that explains activated merch, shows the five steps and live demos, and ends at the application. Opened with your link, every sign-up is credited to you.",
    when: "The link to send. It answers the first questions before you have to.",
    kind: "link",
    href: "/with/{partner}?invite={invite}",
    format: "Web page",
    channels: ["Discord", "DM", "Email", "Bio link"],
  },
  {
    id: "merch-shelf",
    group: "show",
    title: "3D merch shelf, personalised",
    what: "A 3D shop with the creator's name in neon and the activated lineup printed with their name. Tap a product to see the tap-to-unlock walkthrough.",
    when: "The “wow” moment in outreach. Make one per creator below, with their name on it.",
    kind: "link",
    href: "/shelf?name={name}&invite={invite}",
    format: "Web page · 3D",
    channels: ["DM", "Email", "Calls"],
  },
  {
    id: "roblox-program",
    group: "show",
    title: "Roblox creator program page",
    what: "The program page for Roblox developers: activated merch that sends players back into their game with a reward.",
    when: "Only for creators who run a Roblox experience.",
    kind: "link",
    href: "/roblox/creators/",
    format: "Web page",
    channels: ["Roblox creators"],
  },
];

const SNOWDAY: KitItem[] = [
  {
    id: "one-pager",
    group: "explain",
    title: "One-pager",
    what: "Activated merch on one page: what it is, the five steps, who does what, and QR codes to the program page and a 3D shop.",
    when: "Attach it to a first email, or drop it in a DM after the intro. Prints well too.",
    kind: "pdf",
    href: "/partner-kit/snowday/one-pager.pdf",
    preview: "/partner-kit/snowday/one-pager-preview.webp",
    format: "PDF · US Letter",
    channels: ["Email", "Discord DM", "Print"],
  },
  {
    id: "journey-wide",
    group: "explain",
    title: "The five steps (wide)",
    what: "Sign up, sign, approve, production, get paid: the whole process on one slide.",
    when: "Screen-share on calls, add to decks, or pin in a Discord channel.",
    kind: "image",
    href: "/partner-kit/snowday/journey-16x9.png",
    format: "PNG · 1920×1080",
    channels: ["Calls", "Decks", "Discord"],
  },
  {
    id: "journey-tall",
    group: "explain",
    title: "The five steps (tall)",
    what: "The same five steps, stacked for phones.",
    when: "Discord posts, Instagram and X, or a DM reply to “how does it work?”",
    kind: "image",
    href: "/partner-kit/snowday/journey-4x5.png",
    format: "PNG · 1080×1350",
    channels: ["Discord", "Instagram", "X"],
  },
  {
    id: "announce",
    group: "post",
    title: "“Your merch, activated.” announcement",
    what: "The launch graphic: a phone tapping a hoodie, the one-line pitch and a call to ask you about it.",
    when: "Announcing the program in your Discord, on X or LinkedIn.",
    kind: "image",
    href: "/partner-kit/snowday/announce-16x9.png",
    format: "PNG · 1920×1080",
    channels: ["Discord", "X", "LinkedIn"],
  },
  {
    id: "discord-banner",
    group: "post",
    title: "Discord channel banner",
    what: "A banner sized for a Discord server or channel header.",
    when: "The header of your #activated-merch channel or server.",
    kind: "image",
    href: "/partner-kit/snowday/discord-banner-960x540.png",
    format: "PNG · 960×540",
    channels: ["Discord"],
  },
  {
    id: "story",
    group: "post",
    title: "Story",
    what: "A fan unlocking the moment, with the pitch and “DM us”.",
    when: "Instagram and TikTok stories; a creator can share it to tease their own drop.",
    kind: "image",
    href: "/partner-kit/snowday/story-9x16.png",
    format: "PNG · 1080×1920",
    channels: ["Instagram", "TikTok"],
  },
  {
    id: "post-square",
    group: "post",
    title: "“Merch that does something.” post",
    what: "The activated lineup with a short line underneath.",
    when: "A feed post, or a reply when someone asks what the products are.",
    kind: "image",
    href: "/partner-kit/snowday/post-1x1.png",
    format: "PNG · 1080×1080",
    channels: ["Instagram", "X", "Discord"],
  },
  ...(
    [
      [
        "hero-tap-hoodie",
        "Tap to unlock, hoodie",
        "16:9",
        "A phone tapping a hoodie in a streamer's room at night.",
      ],
      [
        "tap-charm",
        "Tap to unlock, charm",
        "4:5",
        "A phone and an acrylic charm, sparkles as it unlocks.",
      ],
      ["merch-flatlay", "The lineup", "1:1", "Hoodie, tee, cap, charm and stickers on snow."],
      [
        "fan-unlock-story",
        "A fan's moment",
        "9:16",
        "A fan smiling at what just opened on their phone.",
      ],
      [
        "stream-diorama",
        "Stream setup, illustrated",
        "16:9",
        "A stylised streaming setup with a phone portal.",
      ],
      [
        "aurora-banner",
        "Aurora, wide",
        "21:9",
        "A snowy night and aurora with room for your words.",
      ],
    ] as const
  ).map(([id, title, ratio, what]): KitItem => ({
    id,
    group: "photos",
    title,
    what,
    when: "Your own designs. No text or logos in them, so add your own.",
    kind: "image",
    href: `/partner-kit/snowday/${id}.webp`,
    format: `WebP · ${ratio}`,
  })),
];

export const PARTNER_KITS: Record<string, { label: string; hero: string; items: KitItem[] }> = {
  snowday: {
    label: "Snowday Media × MEDIALIFE",
    hero: "/partner-kit/snowday/hero-tap-hoodie.webp",
    items: SNOWDAY,
  },
  base: { label: "MEDIALIFE", hero: "/merch/keychain-hand.webp", items: [] },
};

export const kitHero = (kit: string) => (PARTNER_KITS[kit] ?? PARTNER_KITS.base).hero;

/** Everything curated for a partner: their own set first, then MEDIALIFE's. */
export function kitFor(kit: string): KitItem[] {
  return [...(PARTNER_KITS[kit]?.items ?? []), ...MEDIALIFE_BASE];
}

export function fillHref(
  href: string,
  v: { partner: string; invite: string; name?: string },
): string {
  return href
    .replace("{partner}", encodeURIComponent(v.partner))
    .replace("{invite}", encodeURIComponent(v.invite))
    .replace("{name}", encodeURIComponent(v.name ?? "Your Name"));
}
