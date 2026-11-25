// Bobo's Hideout unlocks: which machines in Bobo's Arcade a fan can play, and how they open the rest.
// Shared by the server (stores the team's rules, serves them at /api/collector/unlocks.json), the admin page
// (/admin/collector, "Hideout unlocks") and the EVADE Hub app (evade-hub/, imports this file directly), so the
// rules, the challenge list and the wording live in one place. Safe for the browser: no server imports.
//
// The model (one rule per machine, keyed by the machine id in public/evade/arcade/games.json):
//   open      anyone can play (Cola Run, Bobo Off the Chain at launch)
//   locked    opens when the fan has ANY ONE of its "ways":
//               merch      they unlocked that product with its code (QR / NFC / printed card → Collector Hub claim)
//               challenge  they did something in another experience (a local flag the experience sets)
//   soon      shown, can't be played yet
//   hidden    not shown to fans at all
// Rules live in Netlify Blobs (collector-<ns>, key unlocks/<room>); until the team saves any, DEFAULT_UNLOCKS apply.
// The team hub (/labs/evade-hub/) ignores every rule and opens everything.

export type UnlockMode = "open" | "locked" | "soon" | "hidden";

export type UnlockWay = { kind: "merch"; product: string } | { kind: "challenge"; id: string };

export type UnlockRule = {
  mode: UnlockMode;
  /** Any one of these opens a locked machine. */
  ways?: UnlockWay[];
  /** Optional line the team writes instead of the generated one, e.g. "Comes with the winter hoodie". */
  note?: string;
};

export type UnlockConfig = {
  v: 1;
  room: string;
  /** Opens every machine for every fan (launch-day override / a free weekend). */
  openAll: boolean;
  rules: Record<string, UnlockRule>;
  updatedAt?: string;
};

/* ── Challenges ──────────────────────────────────────────────────────────── */
// Each challenge is done when its localStorage flag is set on this phone (the experiences set them: see `setBy`).
// "count" challenges are done when that many of the other challenges are done.

export type Challenge = {
  id: string;
  /** What to do, as an instruction (shown on locked cards and the Missions list). */
  task: string;
  /** Short, for chips: "Win Cola Run". */
  short: string;
  /** Machine id to send the fan to, so the card can offer "Play Cola Run". */
  play?: string;
  /** localStorage key the experience sets ("1") when it's done. */
  flag?: string;
  /** Done when at least this many OTHER flag challenges are done. */
  count?: number;
  /** Where the flag is set, for the team (admin page + docs). */
  setBy: string;
};

export const CHALLENGES: Challenge[] = [
  {
    id: "find-bobo",
    task: "Find Bobo on your keychain in Bobo Off the Chain",
    short: "Play Off the Chain",
    play: "off-the-chain",
    flag: "evade-done-off-the-chain",
    setBy: "public/evade/keychain-ar/main.js (first time the keychain is tracked)",
  },
  {
    id: "win-cola-run",
    task: "Win a round of Cola Run",
    short: "Win Cola Run",
    play: "cola-run",
    flag: "ohg-reward-earned",
    setBy: "mattercraft/cola-run/OrbHuntGame.ts (a won round)",
  },
  {
    id: "booth-photo",
    task: "Take a photo in Bobo Booth",
    short: "Snap in Bobo Booth",
    play: "bobo-booth",
    flag: "evade-done-bobo-booth",
    setBy: "public/evade/bobo-booth/main.js (shutter)",
  },
  {
    id: "hoops-ten",
    task: "Finish a round of Bobo Hoops",
    short: "Finish Bobo Hoops",
    play: "bobo-hoops",
    flag: "evade-done-bobo-hoops",
    setBy: "public/evade/bobo-hoops/main.js (all 10 balls thrown)",
  },
  {
    id: "spray-piece",
    task: "Make a sticker in Spray Bobo",
    short: "Make a Spray Bobo sticker",
    play: "spray-bobo",
    flag: "evade-done-spray-bobo",
    setBy: "public/evade/spray-bobo/main.js (a painting turned into a sticker)",
  },
  {
    id: "portal-walk",
    task: "Walk through Bobo's Portal",
    short: "Walk through the Portal",
    play: "bobo-portal",
    flag: "evade-done-bobo-portal",
    setBy: "public/labs/portal-kit/app.js (doneFlag, after walking through the door)",
  },
  {
    id: "three-missions",
    task: "Complete any 3 missions",
    short: "Any 3 missions",
    count: 3,
    setBy: "counted from the other missions",
  },
];

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id) ?? null;

/* ── Defaults (Dapo, 2026-11-25: everything but Bobo Off the Chain and Cola Run starts locked) ── */
// The ladder: the keychain's code opens the first tier straight away, missions open the rest one by one, and each
// new product opens its own machine (or skips the missions for it). Places: the globe is free, the Digital
// Collection needs any merch code (it shows what you own).

export const DEFAULT_RULES: Record<string, UnlockRule> = {
  "cola-run": { mode: "open" },
  "off-the-chain": { mode: "open" },
  "where-is-bobo": { mode: "open" },
  "bobo-hoops": {
    mode: "locked",
    ways: [
      { kind: "merch", product: "keychain" },
      { kind: "challenge", id: "win-cola-run" },
    ],
  },
  "bobo-booth": {
    mode: "locked",
    ways: [
      { kind: "challenge", id: "find-bobo" },
      { kind: "merch", product: "keychain" },
    ],
  },
  "spray-bobo": {
    mode: "locked",
    ways: [
      { kind: "merch", product: "keychain" },
      { kind: "challenge", id: "hoops-ten" },
    ],
  },
  "photo-beam": {
    mode: "locked",
    ways: [{ kind: "challenge", id: "booth-photo" }],
  },
  "xray-bobo": {
    mode: "locked",
    ways: [
      { kind: "merch", product: "tee" },
      { kind: "challenge", id: "three-missions" },
    ],
  },
  "bobo-portal": {
    mode: "locked",
    ways: [
      { kind: "merch", product: "hoodie" },
      { kind: "challenge", id: "spray-piece" },
    ],
  },
  "eclipse-night": { mode: "soon" },
  vault: {
    mode: "locked",
    ways: [
      { kind: "merch", product: "keychain" },
      { kind: "merch", product: "hoodie" },
      { kind: "merch", product: "tee" },
      { kind: "merch", product: "deskmat" },
    ],
    note: "Unlock any EVADE merch with its code",
  },
};

export const defaultUnlocks = (room = "evade"): UnlockConfig => ({
  v: 1,
  room,
  openAll: false,
  rules: structuredClone(DEFAULT_RULES),
});

/** Machines the config knows nothing about: locked behind any merch, so a new game never ships open by accident. */
export const FALLBACK_RULE: UnlockRule = {
  mode: "locked",
  ways: [{ kind: "merch", product: "keychain" }],
};

export const ruleFor = (cfg: UnlockConfig | null, id: string): UnlockRule =>
  cfg?.rules[id] ?? DEFAULT_RULES[id] ?? FALLBACK_RULE;

/* ── Validation (server side on save, client side on load) ───────────────── */

const MODES: UnlockMode[] = ["open", "locked", "soon", "hidden"];
const ID_RE = /^[a-z0-9-]{1,40}$/;

export function cleanUnlocks(input: unknown, products: string[], room = "evade"): UnlockConfig {
  const out = defaultUnlocks(room);
  if (!input || typeof input !== "object") return out;
  const src = input as Partial<UnlockConfig>;
  out.openAll = src.openAll === true;
  if (typeof src.updatedAt === "string") out.updatedAt = src.updatedAt.slice(0, 40);
  if (src.rules && typeof src.rules === "object") {
    for (const [id, r] of Object.entries(src.rules)) {
      if (!ID_RE.test(id) || !r || typeof r !== "object") continue;
      const mode = MODES.includes((r as UnlockRule).mode) ? (r as UnlockRule).mode : "locked";
      const ways: UnlockWay[] = [];
      for (const w of Array.isArray((r as UnlockRule).ways) ? (r as UnlockRule).ways! : []) {
        if (w?.kind === "merch" && products.includes(w.product))
          ways.push({ kind: "merch", product: w.product });
        else if (w?.kind === "challenge" && challengeById(w.id))
          ways.push({ kind: "challenge", id: w.id });
        if (ways.length >= 6) break;
      }
      const note =
        typeof (r as UnlockRule).note === "string"
          ? (r as UnlockRule).note!.trim().slice(0, 90)
          : "";
      // a locked machine with no way in would be a dead end: treat it as "soon"
      out.rules[id] = {
        mode: mode === "locked" && !ways.length ? "soon" : mode,
        ...(ways.length ? { ways } : {}),
        ...(note ? { note } : {}),
      };
    }
  }
  return out;
}
