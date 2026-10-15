/**
 * The partner playbook: how to bring creators into the Activated Merchandise
 * Program. Adapted from MEDIALIFE's creator-acquisition plan (three doors, one
 * intake, a known timeline) for a talent partner whose creators live on
 * Discord, Twitch, YouTube and TikTok.
 *
 * Copy blocks take {partner}, {link}, {shelf} and {rep} placeholders, filled
 * in the Partner Hub with the reader's own links, so what they copy is ready
 * to send. Timelines are typical, not promises: the hub shows the real ones.
 */
import { HUB } from "./model";

export type TemplateStage = "reach" | "follow" | "onboard" | "announce";
export type TemplateChannel = "Discord" | "Email";
export type CopyBlock = {
  id: string;
  label: string;
  /** One line on when to send it. */
  when: string;
  stage: TemplateStage;
  channels: TemplateChannel[];
  body: string;
};

export const STAGES: Record<TemplateStage, string> = {
  reach: "First touch",
  follow: "Follow-up",
  onboard: "After they apply",
  announce: "Your server",
};

export const PITCH = {
  oneLine: "Merch your fans can experience. Tap it with a phone and something unlocks.",
  thirty: `MEDIALIFE makes premium merch with an NFC tag and QR code inside. When a fan taps it with their phone, an experience opens in the browser (no app): a hidden scene, a reward, a message from you. You approve every design; MEDIALIFE designs it, makes it, runs the store, ships it and handles returns. You earn a share of every sale, and you can watch it all live in the Creator Hub.`,
  why: [
    { id: "keeps", title: "It keeps working", body: "Every tap brings a fan back to the creator." },
    { id: "free", title: "Zero cost", body: "No upfront cost, inventory or shipping." },
    {
      id: "theirs",
      title: "Their call",
      body: "Nothing is made without their approval. IP stays theirs.",
    },
    {
      id: "visible",
      title: "All in one place",
      body: "Designs, stages, orders and payouts, live.",
    },
  ],
};

/** Three doors, one intake: every route ends at the same link. */
export const DOORS = [
  {
    id: "direct",
    title: "Direct outreach",
    channel: "DMs and email",
    body: "Creators you already know. Send a short DM with their own 3D shop.",
  },
  {
    id: "discord",
    title: "Your Discord",
    channel: "Your server",
    body: "Give the program a channel. Creators who see others join will ask.",
  },
  {
    id: "creators",
    title: "Creators' launches",
    channel: "Their communities",
    body: "Every launch is a pitch: other creators see it in the wild.",
  },
];

/** The Discord channel set we suggest. */
export const DISCORD_SETUP = [
  { name: "start-here", purpose: "Pin the one-pager and the five steps." },
  { name: "how-it-works", purpose: "The steps graphic, a 3D shop link and the FAQ." },
  { name: "showcase", purpose: "Launches and fans with their merch." },
  { name: "apply", purpose: "Your program link and “DM me with questions”." },
];

/** Typical timing. The Creator Hub shows each creator's real dates. */
export const TIMELINE = [
  { when: "Day 0", title: "Apply" },
  { when: "≤ 2 days", title: "Reviewed" },
  { when: "Days 3–5", title: "Signed" },
  { when: "Weeks 1–4", title: "Designs" },
  { when: "Weeks 4–10", title: "Production" },
  { when: "Launch", title: "Live" },
  { when: `+${HUB.holdDays} days`, title: "Paid" },
];

export const FIT = [
  {
    id: "community",
    title: "A community that shows up",
    body: "Chat, Discord, comments. Engagement beats follower count.",
  },
  {
    id: "recognisable",
    title: "Something recognisable",
    body: "A character, avatar, catchphrase, art style or logo.",
  },
  { id: "reason", title: "A reason to tap", body: "Lore, inside jokes, rewards, streams, events." },
  { id: "ready", title: "Ready to launch", body: "Happy to approve designs and announce a drop." },
];

export const TEMPLATES: CopyBlock[] = [
  {
    id: "dm-first",
    label: "First message",
    when: "Your opener. Pair it with their 3D shop.",
    stage: "reach",
    channels: ["Discord"],
    body: `Hey! {rep} from {partner} here. We've partnered with MEDIALIFE on something I think you'd love: merch your fans can actually experience. They tap it with their phone and something unlocks (a hidden scene, a reward, a message from you).

They design it with you, make it, sell it and ship it. You approve everything and earn on every sale. No upfront cost.

I made you a quick 3D preview with your name on it: {shelf}

Worth a look? Everything's here when you're ready: {link}`,
  },
  {
    id: "email-first",
    label: "First email",
    when: "For creators you reach by email or through management.",
    stage: "reach",
    channels: ["Email"],
    body: `Subject: Merch your fans can experience

Hi {name},

I'm {rep} at {partner}. We've partnered with MEDIALIFE on activated merch: premium hoodies, tees, caps, charms and stickers with an NFC tag inside. When a fan taps it with their phone, an experience opens: a secret scene, a reward, a moment with you.

You'd approve every design, and MEDIALIFE handles the rest: production, the store, shipping and returns. You earn a share of every sale, and you can follow everything live in their Creator Hub. There's no cost to you.

Here's a 3D preview of what yours could look like: {shelf}
And how it works, in two minutes: {link}

Happy to jump on a quick call if it's easier.

{rep}
{partner}`,
  },
  {
    id: "follow-up",
    label: "Follow-up",
    when: "Four days after no reply. Only once.",
    stage: "follow",
    channels: ["Discord", "Email"],
    body: `Hey {name}, just bumping this in case it got buried. Here's your 3D preview again: {shelf}

If now's not the right time, no worries at all. If you're curious, applying takes about ten minutes and you approve everything before anything is made: {link}`,
  },
  {
    id: "after-apply",
    label: "After they apply",
    when: "When they show up in Creators as applied.",
    stage: "onboard",
    channels: ["Discord"],
    body: `Saw your application come through, amazing! MEDIALIFE reviews within two business days. Once you're approved, your agreement shows up in the Creator Hub to read and sign. Shout if you have any questions along the way; I can see where things are at.`,
  },
  {
    id: "server-announce",
    label: "Server announcement",
    when: "Launching the program in your server.",
    stage: "announce",
    channels: ["Discord"],
    body: `❄️ **Activated merch is here** ❄️

We've teamed up with MEDIALIFE to bring you merch your fans can *experience*. Tap it with a phone and something unlocks: a secret scene, a reward, a moment with you.

✅ You approve every design
✅ They make it, sell it, ship it
✅ You earn on every sale, no upfront cost

See how it works and apply: {link}
Questions? DM me or ask in #how-it-works.`,
  },
  {
    id: "pinned",
    label: "Pinned message",
    when: "Pinned in #start-here.",
    stage: "announce",
    channels: ["Discord"],
    body: `**What's activated merch?**
Premium merch with an NFC tag and QR code inside. Fans tap it with their phone and an experience opens in the browser, no app needed.

**How it works**
1. Sign up and onboard (10 minutes)
2. Sign the agreement in the hub
3. Approve the designs and launch plan
4. MEDIALIFE makes it, sells it and ships it
5. Get paid on every sale

**Start here:** {link}`,
  },
];

export const FAQ = [
  {
    q: "Does it cost the creator anything?",
    a: "No. MEDIALIFE covers design, production, the experience, the store, shipping and returns. Creators earn a share of every sale.",
  },
  {
    q: "What's the revenue share?",
    a: "Set per creator and written into their agreement before they sign. Don't quote a number: it's in the agreement they review in the Creator Hub.",
  },
  {
    q: "Who owns the designs and the IP?",
    a: "The creator keeps their name, likeness, characters and art. MEDIALIFE only uses them to make and sell the products the creator approves.",
  },
  {
    q: "What happens when a fan taps the merch?",
    a: "An immersive experience opens in their phone's browser, no app needed. It's designed with the creator and can change after launch without reprinting anything.",
  },
  {
    q: "What if a fan's phone doesn't do NFC?",
    a: "Every product also has a QR code that opens the same experience with any phone camera.",
  },
  {
    q: "How long until it's on sale?",
    a: "Typically six to ten weeks from approval, depending on the products. Each creator sees their dates in the Creator Hub.",
  },
  {
    q: "Can they activate merch they already sell?",
    a: "Sometimes. They mention it in their application and MEDIALIFE looks at it on review.",
  },
  {
    q: "Where is it sold?",
    a: "In MEDIALIFE's store, through a link the creator shares, and on approved channels.",
  },
];

export function fillCopy(
  body: string,
  v: { partner: string; link: string; shelf: string; rep: string; name?: string },
) {
  return body
    .replaceAll("{partner}", v.partner)
    .replaceAll("{link}", v.link)
    .replaceAll("{shelf}", v.shelf)
    .replaceAll("{rep}", v.rep || "[your name]")
    .replaceAll("{name}", v.name || "there");
}
