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

export type CopyBlock = { id: string; label: string; channel: string; body: string };

export const PITCH = {
  oneLine:
    "Merch your fans can experience: tap it with a phone and something happens, a secret scene, a reward, a moment with you.",
  thirty: `MEDIALIFE makes premium merch with an NFC tag and QR code inside. When a fan taps it with their phone, an experience opens in the browser (no app): a hidden scene, a reward, a message from you. You approve every design; MEDIALIFE designs it, makes it, runs the store, ships it and handles returns. You earn a share of every sale, and you can watch it all live in the Creator Hub.`,
  why: [
    "The merch keeps working after it's bought: every tap brings a fan back to the creator.",
    "No upfront cost, no inventory, no shipping. MEDIALIFE handles all of it.",
    "Nothing is made without the creator's approval, and their IP stays theirs.",
    "Everything is visible in one place: stages, designs, orders, payouts.",
  ],
};

/** Three doors, one intake: every route ends at the same link. */
export const DOORS = [
  {
    id: "direct",
    title: "Direct outreach",
    channel: "Discord DM, email",
    body: "Start with creators you already manage or know. A short, personal DM with their own 3D shop link converts best. Follow up once, after four days.",
  },
  {
    id: "discord",
    title: "Your Discord",
    channel: "Your community server",
    body: "Give the program a home: an #activated-merch channel with the banner, the five-step graphic pinned, a showcase thread, and your program link. Creators who see others join ask on their own.",
  },
  {
    id: "creators",
    title: "Creators' communities",
    channel: "Their Discord, streams, socials",
    body: "When a creator launches, their announcement is your next pitch: other creators see the tap-to-unlock moment in the wild. Share their launch in your server too.",
  },
];

/** The Discord channel set we suggest. */
export const DISCORD_SETUP = [
  {
    name: "#start-here",
    purpose: "What activated merch is in two minutes: pin the one-pager and the five steps.",
  },
  { name: "#how-it-works", purpose: "The five-step graphic, the 3D shop link, and the FAQ below." },
  { name: "#showcase", purpose: "Launches and photos of activated merch in fans' hands." },
  { name: "#apply", purpose: "Your program link, and a line inviting questions in DMs." },
];

/** Typical timing. The Creator Hub shows each creator's real dates. */
export const TIMELINE = [
  {
    when: "Day 0",
    title: "They apply",
    body: "Through your link. About ten minutes in the Creator Hub.",
  },
  {
    when: "Within 2 business days",
    title: "MEDIALIFE reviews",
    body: "Fit, audience and product ideas. Every creator gets an answer, not silence.",
  },
  {
    when: "Days 3–5",
    title: "Approved and signed",
    body: "The agreement opens in the hub; they read it and sign there.",
  },
  {
    when: "Weeks 1–4",
    title: "Campaign and designs",
    body: "Products, the experience and the launch plan, each approved by the creator.",
  },
  {
    when: "Weeks 4–10",
    title: "Production",
    body: "Samples, production, tag programming, the store.",
  },
  {
    when: "Launch",
    title: "Live and selling",
    body: "Fans buy and tap. Sales and the creator's share show up live.",
  },
  {
    when: `${HUB.holdDays} days after each order`,
    title: "Paid",
    body: "Earnings are paid out once the returns window has passed.",
  },
];

export const FIT = [
  "An engaged community that shows up: chat, Discord, comments. Engagement matters more than follower count.",
  "Something fans recognise: a character, a model or avatar, a catchphrase, an art style, a logo.",
  "A reason for fans to tap: lore, inside jokes, rewards, streams, events.",
  "Ready to approve designs and announce a launch to their audience.",
];

export const TEMPLATES: CopyBlock[] = [
  {
    id: "dm-first",
    label: "First message",
    channel: "Discord DM",
    body: `Hey! {rep} from {partner} here. We've partnered with MEDIALIFE on something I think you'd love: merch your fans can actually experience. They tap it with their phone and something unlocks (a hidden scene, a reward, a message from you).

They design it with you, make it, sell it and ship it. You approve everything and earn on every sale. No upfront cost.

I made you a quick 3D preview with your name on it: {shelf}

Worth a look? Everything's here when you're ready: {link}`,
  },
  {
    id: "email-first",
    label: "First email",
    channel: "Email",
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
    label: "Follow-up (after 4 days)",
    channel: "Discord DM or email",
    body: `Hey {name}, just bumping this in case it got buried. Here's your 3D preview again: {shelf}

If now's not the right time, no worries at all. If you're curious, applying takes about ten minutes and you approve everything before anything is made: {link}`,
  },
  {
    id: "after-apply",
    label: "After they apply",
    channel: "Discord DM",
    body: `Saw your application come through, amazing! MEDIALIFE reviews within two business days. Once you're approved, your agreement shows up in the Creator Hub to read and sign. Shout if you have any questions along the way; I can see where things are at.`,
  },
  {
    id: "server-announce",
    label: "Server announcement",
    channel: "Discord announcement",
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
    label: "#start-here pinned message",
    channel: "Discord pin",
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
    a: "It's set per creator by MEDIALIFE and written into their agreement before they sign. Don't quote a number; say it's shown in the agreement they review in the Creator Hub.",
  },
  {
    q: "Who owns the designs and the IP?",
    a: "The creator keeps their name, likeness, characters and art. MEDIALIFE only uses them to make and sell the products the creator approves.",
  },
  {
    q: "What happens when a fan taps the merch?",
    a: "An experience opens in their phone's browser: an AR moment, a 3D scene, a video, a mini-game or a reward. No app. It's designed with the creator, and it can change after launch without reprinting anything.",
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
    a: "Sometimes. Point them to the application and mention it in their notes; MEDIALIFE will look at it on the review.",
  },
  {
    q: "Where is it sold?",
    a: "In MEDIALIFE's store, with a link creators share with their audience, and on approved channels.",
  },
];

export const DOS = [
  "Always use your own program or shelf link, so creators are credited to you.",
  "Send a personalised 3D shop: it does more than any paragraph.",
  "Follow along in Creators: you'll see when someone applies, signs and launches.",
];

export const DONTS = [
  "Don't quote revenue share, prices, dates or product promises. The agreement and the hub do that.",
  "Don't share creators' private details or earnings outside your team.",
  "Don't promise approval: MEDIALIFE reviews every application.",
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
