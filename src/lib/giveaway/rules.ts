import {
  COUNTRY_LABELS,
  GIVEAWAY,
  formatMoney,
  prizeCount,
  regionLabel,
  totalPrizeValue,
  type GiveawayCampaign,
} from "./model";

// The official rules. The team pastes their own (reviewed) rules into the
// campaign in admin; until then the rules page shows this generated version,
// built from the campaign's own settings so the facts always match. Admin can
// also drop this text into the editor as a starting point.

const fmtDate = (ms: number | null, tz: string) =>
  ms
    ? `${new Date(ms).toLocaleString("en-CA", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Toronto",
      })}${tz ? ` ${tz}` : ""}`
    : "[date to be set]";

export function generatedRules(c: GiveawayCampaign): string {
  const countries = c.countries.map((x) => COUNTRY_LABELS[x] ?? x).join(", ") || "[countries]";
  const excluded = c.excludedRegions.map(regionLabel);
  const prizes = c.prizes.length
    ? c.prizes
        .map(
          (p) =>
            `- ${p.quantity} × ${p.title}${p.description ? ` (${p.description})` : ""}, approximate retail value ${formatMoney(p.retailValue, c.currency)} each.`,
        )
        .join("\n")
    : "- [prizes to be set]";
  const tasks = c.tasks
    .filter((t) => t.enabled)
    .map((t) => `- ${t.title || "[task]"}: ${t.points} point${t.points === 1 ? "" : "s"}`)
    .join("\n");
  const sponsor = c.sponsor || "[Sponsor name]";

  return [
    `## ${c.title || "Giveaway"}: Official Rules`,
    "NO PURCHASE NECESSARY TO ENTER OR WIN. A purchase will not increase your chances of winning. Void where prohibited.",
    "## 1. Sponsor",
    `This giveaway is run by ${sponsor}${c.sponsorAddress ? `, ${c.sponsorAddress}` : ""} (the "Sponsor"). It is not sponsored, endorsed or administered by, or associated with, Instagram, Meta, TikTok, YouTube, Google, X, Discord or Roblox.`,
    "## 2. Dates",
    `The giveaway starts ${fmtDate(c.startsAt, c.timeZoneLabel)} and ends ${fmtDate(c.endsAt, c.timeZoneLabel)} (the "Giveaway Period"). The Sponsor's clock is the official timekeeper.`,
    "## 3. Who can enter",
    `Open to legal residents of ${countries}${excluded.length ? `, excluding ${excluded.join(", ")}` : ""}, who are at least ${c.minAge} years old when they enter. Entrants under the age of majority where they live must have a parent's or guardian's permission to enter, and a parent or guardian must accept any prize on their behalf. Employees of the Sponsor and their immediate families are not eligible.`,
    "## 4. How to enter and earn points",
    `Enter your email address on the giveaway page and confirm it using the link we email you. A confirmed entry earns ${c.entryPoints} point${c.entryPoints === 1 ? "" : "s"}. You can earn more points by completing these optional tasks during the Giveaway Period:`,
    tasks || "- [tasks to be set]",
    c.referralPoints > 0
      ? `- Refer a friend: ${c.referralPoints} points for each friend who enters with your link and confirms their email, up to ${c.referralCap} friends.`
      : "",
    c.honourCap > 0
      ? `Points from follow, subscribe and visit tasks are capped at ${c.honourCap} points in total.`
      : "",
    `Free method of entry: any task that needs a code (for example one found on a product) can also be completed for free by emailing ${GIVEAWAY.supportEmail} with your name and the email you entered with during the Giveaway Period; we'll reply with a code. Limit one entry per person and per email address. Entries made with multiple, fake or disposable email addresses, scripts or bots are void.`,
    "## 5. Prizes",
    prizes,
    `Total approximate retail value of all prizes: ${formatMoney(totalPrizeValue(c), c.currency)} (${prizeCount(c)} prize${prizeCount(c) === 1 ? "" : "s"}). Prizes must be accepted as awarded, are not transferable and have no cash alternative, except that the Sponsor may substitute a prize of equal or greater value.`,
    "## 6. How winners are chosen",
    `On or about ${fmtDate(c.drawAt ?? c.endsAt, c.timeZoneLabel)}, the Sponsor will draw winners at random from all eligible confirmed entries. Each point is one ticket in the draw, so the odds of winning depend on the number of eligible entries and points earned. Before a prize is awarded, the Sponsor will check that the winner completed the tasks they claimed points for; points for tasks that can't be confirmed will be removed and the draw re-run among the remaining tickets if needed.`,
    "## 7. Claiming a prize",
    `Winners are contacted by email and must reply within ${GIVEAWAY.claimDays} days. To be declared a winner, a selected entrant must first correctly answer, unaided, a time-limited mathematical skill-testing question, and may be asked to sign a declaration of eligibility and release. If a winner can't be reached, doesn't answer correctly or doesn't meet these rules, the prize is forfeited and an alternate winner may be drawn.`,
    "## 8. Release and publicity",
    "By accepting a prize, the winner (or, for a minor, their parent or guardian) releases the Sponsor and its partners from any liability for loss or injury arising from the prize or this giveaway. With the winner's consent (and a parent's or guardian's consent for a minor), the Sponsor may share the winner's first name, city and province or state when announcing results. Nobody will be shown without that consent.",
    "## 9. Winners list",
    `To ask for the first names of the winners, email ${GIVEAWAY.supportEmail} within 60 days after the giveaway ends.`,
    "## 10. Privacy",
    "We use your information to run this giveaway and contact winners. We'll only send you marketing emails if you tick the box to join a mailing list, and you can unsubscribe at any time.",
    "## 11. General",
    "The Sponsor may disqualify anyone who tampers with the giveaway or breaks these rules, and may cancel or change the giveaway if it can't run as planned. These rules are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** "How it works" text the sample campaign starts with (no dates or numbers, so it can't go stale). */
export const SAMPLE_HOW_IT_WORKS = [
  "## How it works",
  [
    "- Enter your name and email, then tap the link in the email we send you to confirm. That's your first point.",
    "- Complete as many tasks as you like. Each one shows how many points it's worth, and every point is one more ticket in the draw.",
    "- Share your personal link with friends. You earn bonus points for each friend who enters and confirms their email.",
    "- When the giveaway ends, winners are drawn at random and contacted by email, so keep an eye on your inbox (and spam folder).",
  ].join("\n"),
  "## Good to know",
  [
    "- One entry per person. Extra or fake email addresses are removed.",
    "- We check winners' follows and subscriptions before awarding a prize, so only claim the ones you've done.",
    "- No purchase necessary. Don't have a keychain? Email us and we'll send you a free code (see the official rules).",
    "- Canadian winners answer a quick skill-testing question before they can claim.",
  ].join("\n"),
].join("\n\n");

/** The "How it works" box on the campaign page when the team hasn't written one. */
export function generatedHowItWorks(c: GiveawayCampaign): string {
  const ends = c.endsAt ? fmtDate(c.endsAt, c.timeZoneLabel) : "when the giveaway ends";
  const steps = [
    `- Enter your email and tap the confirm link we send you. That's your first ${c.entryPoints === 1 ? "point" : `${c.entryPoints} points`}.`,
    "- Complete tasks to earn more points. Every point is one more ticket in the draw.",
    c.referralPoints > 0
      ? `- Share your personal link: ${c.referralPoints} points for each friend who enters and confirms (up to ${c.referralCap}).`
      : "",
    `- Entries close ${ends}. Winners are drawn at random and contacted by email.`,
  ].filter(Boolean);
  return `## How it works\n\n${steps.join("\n")}`;
}

/** Plain text → blocks: "## " lines are headings, "- " runs are lists, the rest paragraphs. */
export type RuleBlock =
  { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function parseRules(text: string): RuleBlock[] {
  const out: RuleBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (lines.length === 1 && lines[0].startsWith("## ")) {
      out.push({ kind: "h", text: lines[0].slice(3) });
    } else if (lines.every((l) => l.startsWith("- "))) {
      out.push({ kind: "ul", items: lines.map((l) => l.slice(2)) });
    } else {
      out.push({ kind: "p", text: lines.join(" ") });
    }
  }
  return out;
}
