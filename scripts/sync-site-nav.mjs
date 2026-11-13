// Copies the main navigation list (src/lib/site-nav.json) into the static
// pages' header script (public/site-nav/site-nav.js), so the React header and
// the static pages always show the same items. Runs before every build.
import { readFileSync, writeFileSync } from "node:fs";

const json = JSON.parse(readFileSync(new URL("../src/lib/site-nav.json", import.meta.url), "utf8"));
const data = JSON.stringify({ items: json.items, cta: json.cta });
const file = new URL("../public/site-nav/site-nav.js", import.meta.url);
const src = readFileSync(file, "utf8");
const re = /(\/\* SITE_NAV:START[^\n]*\n)[\s\S]*?(\n\s*\/\* SITE_NAV:END \*\/)/;
if (!re.test(src)) throw new Error("site-nav.js: SITE_NAV markers missing");
const out = src.replace(re, (_, a, b) => `${a}  var NAV = ${data};${b}`);
if (out !== src) {
  writeFileSync(file, out);
  console.log("site-nav: updated public/site-nav/site-nav.js from src/lib/site-nav.json");
}
