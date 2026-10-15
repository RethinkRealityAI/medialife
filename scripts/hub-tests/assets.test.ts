// The asset library model: sorting suggestions, tags, legacy files, patches,
// the brand kit, and that the upload accept list matches what the server takes.
// Run with `npm run test:hub`.
import assert from "node:assert/strict";

import {
  applyAssetPatch,
  brandKit,
  cleanTag,
  inLibrary,
  keepExtension,
  mediaTypeOf,
  normaliseTags,
  sectionOf,
  suggestFor,
  tagsOf,
} from "@/lib/hub/assets";
import { ACCEPT, resolveMime } from "@/lib/hub/files.server";
import type { AssetFolder, HubFile } from "@/lib/hub/model";
import { UPLOAD_ACCEPT } from "@/lib/hub/upload-client";

const base: HubFile = {
  id: "f1",
  creatorId: "c1",
  name: "file.png",
  mime: "image/png",
  size: 10,
  kind: "artwork",
  category: "asset",
  productId: null,
  note: "",
  uploadedBy: "creator",
  createdAt: 1,
  chunks: 1,
  complete: true,
};
const f = (p: Partial<HubFile>): HubFile => ({ ...base, ...p });

// Suggestions from name and type
assert.deepEqual(suggestFor("PixelPine_Logo_final.svg", "image/svg+xml"), {
  section: "branding",
  tags: ["Logo", "Final"],
});
assert.deepEqual(suggestFor("logo-white.png", "image/png"), {
  section: "branding",
  tags: ["Logo", "Transparent"],
});
assert.equal(suggestFor("Brand Guidelines v2.pdf", "application/pdf").section, "branding");
assert.deepEqual(suggestFor("Brand Guidelines v2.pdf", "application/pdf").tags, [
  "Brand guidelines",
]);
assert.equal(suggestFor("yt-thumbnail-ep4.jpg", "image/jpeg").section, "social");
assert.equal(suggestFor("intro.mp4", "video/mp4").section, "video");
assert.deepEqual(suggestFor("intro.mp4", "video/mp4").tags, ["Intro"]);
assert.equal(suggestFor("character_turnaround.glb", "").section, "3d"); // the type wins
assert.equal(suggestFor("Inter-Bold.otf", "").section, "branding");
assert.equal(suggestFor("stinger.wav", "audio/wav").section, "audio");
assert.equal(suggestFor("notes.docx", "").section, "documents");
assert.equal(suggestFor("IMG_2041.HEIC", "").section, "art");
assert.equal(suggestFor("random.zip", "application/zip").section, "other");

// Media types
assert.equal(mediaTypeOf({ name: "a.GLB" }), "3d");
assert.equal(mediaTypeOf({ name: "a.ai" }), "vector");
assert.equal(mediaTypeOf({ name: "a.procreate" }), "design");
assert.equal(mediaTypeOf({ name: "noext" }), "other");

// Tags: cleaned, deduped case-insensitively, preset spelling preferred, capped
assert.equal(cleanTag("  #brand,  kit \u0007 "), "brand kit");
assert.equal(cleanTag("x".repeat(80)).length, 32);
assert.deepEqual(normaliseTags(["logo", "LOGO", " Logo ", "", "my tag", "My Tag"]), [
  "Logo",
  "my tag",
]);
assert.equal(normaliseTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 20);

// Files from before the library derive a section and tags
assert.equal(sectionOf(f({ category: "logo" })), "branding");
assert.deepEqual(tagsOf(f({ category: "guidelines" })), ["Brand guidelines"]);
assert.equal(
  sectionOf(f({ kind: "collateral", category: "social", uploadedBy: "medialife" })),
  "social",
);
assert.equal(sectionOf(f({ kind: "mockup", category: "mockup" })), "art");
assert.equal(sectionOf(f({ name: "x.mp4", mime: "video/mp4", category: "other" })), "video");
assert.equal(sectionOf(f({ section: "bogus" })), "art"); // an unknown section falls back
assert.equal(inLibrary(f({ kind: "proof" })), false);
assert.equal(inLibrary(f({ complete: false })), false);

// Patches
const folder: AssetFolder = {
  id: "fo1",
  creatorId: "c1",
  name: "Logos",
  section: "branding",
  createdAt: 1,
  createdBy: "creator",
};
const legacy = f({ category: "character" });
let p = applyAssetPatch(legacy, { folderId: "fo1" }, folder);
assert.equal(p.section, "branding");
assert.equal(p.folderId, "fo1");
p = applyAssetPatch(p, { section: "social" }, null);
assert.equal(p.section, "social");
assert.equal(p.folderId, null, "a new section leaves the folder");
p = applyAssetPatch(p, { addTags: ["thumbnail"] }, null);
assert.deepEqual(p.tags, ["Character", "Thumbnail"], "adds to the derived tags");
p = applyAssetPatch(p, { removeTags: ["CHARACTER"] }, null);
assert.deepEqual(p.tags, ["Thumbnail"]);
p = applyAssetPatch(p, { starred: true, note: "  hi  " }, null);
assert.equal(p.starred, true);
assert.equal(p.note, "hi");
assert.equal(applyAssetPatch(legacy, {}, null).section, "art", "pins the derived section");
assert.equal(legacy.section, undefined, "never mutates the input");

// Renames keep the extension
assert.equal(keepExtension("logo.svg", "Main logo"), "Main logo.svg");
assert.equal(keepExtension("logo.svg", "Main logo.SVG"), "Main logo.svg");
assert.equal(keepExtension("logo.svg", "../evil/name"), "..evilname.svg");
assert.equal(keepExtension("logo.svg", "   "), "file.svg");

// Brand kit
const kit = brandKit([
  f({ name: "logo.svg", mime: "image/svg+xml", tags: ["Logo"] }),
  f({ name: "font.otf", mime: "font/otf", tags: [] }),
]);
assert.deepEqual(
  kit.map((k) => [k.id, k.have]),
  [
    ["logo-vector", true],
    ["logo-png", false],
    ["guidelines", false],
    ["fonts", true],
    ["character", false],
  ],
);

// The browser's accept list and the server's ALLOWED map agree
const sort = (s: string) => s.split(",").sort().join(",");
assert.equal(sort(UPLOAD_ACCEPT), sort([...new Set(ACCEPT.split(","))].join(",")));
assert.equal(resolveMime("model.glb", ""), "model/gltf-binary");
assert.equal(resolveMime("song.wav", "audio/x-wav"), "audio/wav");
assert.equal(resolveMime("clip.m4v", ""), "video/mp4");
assert.equal(resolveMime("page.html", "text/html"), null);
assert.equal(resolveMime("evil.svg.html", "image/svg+xml"), null);

console.log("assets: ok");
