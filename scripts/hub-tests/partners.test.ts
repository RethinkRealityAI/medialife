// Partners and agreements: the journey, ids, link filling, signatures.
// Run with `npm run test:hub`.
import assert from "node:assert/strict";

import { CURRENT, agreementText, nameMatches, signatureStatus } from "@/lib/hub/agreements";
import {
  KIT_SCOPE,
  builtinPieces,
  fillHref,
  kitFor,
  scopeOwner,
  youtubeIdOf,
} from "@/lib/hub/collateral";
import {
  KIT_OWNER,
  isLibraryOwner,
  journeyStep,
  partnerIdOk,
  partnerOwner,
  slugifyPartner,
} from "@/lib/hub/partners";
import { fillCopy, TEMPLATES } from "@/lib/hub/playbook";
import { DEFAULT_SHELF, shelfConfigSchema } from "@/lib/shelf/config";
import { kitShelfPreview, partnerShelfConfig } from "@/lib/shelf/partner-presets";

// The five-step journey
const j = (status: string, signed: boolean, stages: string[], earned = 0) =>
  journeyStep({ status, signed, stages, earned });
assert.equal(j("draft", false, []), "apply");
assert.equal(j("submitted", false, []), "apply");
assert.equal(j("approved", false, ["live"], 500), "sign", "unsigned stays on step 2");
assert.equal(j("approved", true, []), "approve");
assert.equal(j("approved", true, ["artwork", "approval"]), "approve");
assert.equal(j("approved", true, ["production"]), "make");
assert.equal(j("approved", true, ["live"], 0), "make", "live without sales: not paid yet");
assert.equal(j("approved", true, ["live"], 100), "paid");

// Ids and library owners
assert.equal(slugifyPartner("Snowday Media!"), "snowday-media");
assert.ok(partnerIdOk("snowday-media"));
assert.ok(!partnerIdOk("-bad"));
assert.ok(!partnerIdOk("Bad Id"));
assert.equal(partnerOwner("snowday-media"), "partnersnowdaymedia");
assert.ok(
  /^[A-Za-z0-9]{6,60}$/.test(partnerOwner("snowday-media")),
  "fits the file route's id pattern",
);
assert.ok(isLibraryOwner(KIT_OWNER) && isLibraryOwner(partnerOwner("x1")));
assert.ok(!isLibraryOwner("mv8f8d1l2ULPBvygJHyRnMHx"), "a creator id is not a library");

// Links and copy carry the invite
assert.equal(
  fillHref("/with/{partner}?invite={invite}", { partner: "snowday-media", invite: "snowday alex" }),
  "/with/snowday-media?invite=snowday%20alex",
);
const dm = fillCopy(TEMPLATES[0].body, {
  partner: "Snowday Media",
  link: "https://x/with",
  shelf: "https://x/shelf",
  rep: "Alex",
});
assert.ok(
  dm.includes("Alex from Snowday Media") && dm.includes("https://x/shelf") && !dm.includes("{"),
);
assert.ok(kitFor("snowday").some((i) => i.id === "one-pager"));
assert.ok(
  kitFor("unknown").some((i) => i.id === "activated-experiences"),
  "base kit always there",
);

// Agreements
assert.ok(nameMatches("  sam   rivera ", "Sam Rivera"));
assert.ok(!nameMatches("Sam R", "Sam Rivera"));
const terms = {
  legalName: "Sam Rivera",
  displayName: "PixelPine",
  email: "s@x.test",
  revenueShare: 0.2,
  partnerName: "Snowday Media",
};
const text = agreementText(CURRENT, terms);
assert.ok(text.includes("20%") && text.includes("Snowday Media") && text.includes(CURRENT.version));
assert.ok(
  !agreementText(CURRENT, { ...terms, partnerName: null }).includes("introduced to the program"),
);
assert.notEqual(
  text,
  agreementText(CURRENT, { ...terms, revenueShare: 0.25 }),
  "terms change the text",
);
assert.deepEqual(signatureStatus([]), { signedCurrent: false, signedOlder: false });
assert.deepEqual(signatureStatus([{ agreementId: CURRENT.id, version: "old" }]), {
  signedCurrent: false,
  signedOlder: true,
});
assert.equal(
  signatureStatus([{ agreementId: CURRENT.id, version: CURRENT.version }]).signedCurrent,
  true,
);

// Managed collateral: scopes, YouTube links, built-in pieces.
assert.equal(scopeOwner(KIT_SCOPE), KIT_OWNER);
assert.equal(scopeOwner("snowday-media"), partnerOwner("snowday-media"));
for (const u of [
  "https://www.youtube.com/watch?v=C2176gcsBGg",
  "https://youtu.be/C2176gcsBGg",
  "https://youtube.com/shorts/C2176gcsBGg",
  "https://www.youtube-nocookie.com/embed/C2176gcsBGg?rel=0",
]) {
  assert.equal(youtubeIdOf(u), "C2176gcsBGg", u);
}
assert.equal(youtubeIdOf("https://portfolio.medialife.ai/"), null);
assert.equal(youtubeIdOf("not a url"), null);
const pieces = builtinPieces("snowday");
assert.ok(pieces.some((p) => p.id === "portfolio" && p.tab === "show"));
assert.ok(pieces.some((p) => p.tab === "videos") && pieces.some((p) => p.tab === "gifs"));
assert.equal(new Set(pieces.map((p) => p.id)).size, pieces.length, "built-in ids are unique");
assert.ok(
  pieces.every((p) => /^[a-z0-9-]{2,60}$/.test(p.id)),
  "ids fit the hide API",
);
// A kit without its own screenshots doesn't point at one.
assert.equal(kitFor("base").find((i) => i.id === "program-page")?.preview, undefined);
assert.ok(
  kitFor("snowday")
    .find((i) => i.id === "program-page")
    ?.preview?.includes("snowday"),
);

// Partner shelves: their own starts finished; a creator's carries no kit art.
{
  const snowday = {
    id: "snowday-media",
    name: "Snowday Media",
    kit: "snowday",
    brand: { primary: "#405d96", accent: "#96c8ec", ink: "#21254a" },
  };
  const own = partnerShelfConfig(snowday);
  assert.ok(shelfConfigSchema.safeParse(own).success, "the starting shelf is valid");
  assert.equal(own.creator.name, "Snowday Media");
  assert.equal(own.pitch.inviteCode, "snowday-media");
  assert.equal(own.pitch.preparedFor, "");
  assert.ok(own.products.find((x) => x.id === "tee")?.backPrint?.includes("/snowday/"));

  const forCreator = partnerShelfConfig(snowday, { creator: "PixelPine" });
  assert.ok(shelfConfigSchema.safeParse(forCreator).success);
  assert.equal(forCreator.creator.name, "PixelPine");
  assert.equal(forCreator.creator.handle, "");
  assert.equal(forCreator.creator.logo, null, "the partner's logo isn't the creator's");
  assert.equal(forCreator.pitch.preparedFor, "PixelPine");
  assert.deepEqual(forCreator.theme, own.theme, "the partner's look carries over");
  assert.ok(
    forCreator.products.every((x) => !x.print?.includes("/snowday/") && !x.backPrint),
    "no kit artwork on a creator's merch",
  );

  const classic = partnerShelfConfig(snowday, { creator: "PixelPine", classic: true });
  assert.deepEqual(classic.theme, DEFAULT_SHELF.theme);
  assert.equal(classic.pitch.inviteCode, "snowday-media", "still credited to the partner");

  // A kit without its own shelf art falls back to the brand colours.
  const other = partnerShelfConfig({ ...snowday, kit: "base" });
  assert.equal(other.theme.neon, "#96c8ec");
  assert.ok(shelfConfigSchema.safeParse(other).success);
  assert.ok(kitShelfPreview("snowday").includes("/snowday/"));
  assert.ok(kitShelfPreview("base").includes("/medialife/"));
}

console.log("partners: ok");
