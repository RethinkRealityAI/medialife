// Validates the endcap engine's templates (public/activated-retail/templates/*.json) against the
// project schema the builder uses (src/lib/ar/project.ts), and checks that every file they point
// at exists under public/.
//
//   node scripts/validate-templates.mjs
//
// Node 22.18+ runs the TypeScript schema directly (type stripping), so there is no build step.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectSchema, ZONE_IDS } from "../src/lib/ar/project.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public/activated-retail/templates");
let failed = 0;

// every "/…" string in the document that looks like a file on the site
function sitePaths(value, out = []) {
  if (typeof value === "string") {
    if (/^\/[^\s]+\.[a-z0-9]{2,5}$/i.test(value)) out.push(value);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) sitePaths(v, out);
  }
  return out;
}

for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const name = file.replace(/\.json$/, "");
  const problems = [];
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (e) {
    problems.push(`not valid JSON: ${e.message}`);
  }
  if (doc) {
    const parsed = projectSchema.safeParse(doc);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        problems.push(`${issue.path.join(".")}: ${issue.message}`);
    } else {
      const p = parsed.data;
      if (p.slug !== `${name}-template`) problems.push(`slug should be "${name}-template"`);
      if (p.access.password || p.access.passwordHash)
        problems.push("templates must not have a password");
      for (const id of ZONE_IDS) if (!doc.zones?.[id]) problems.push(`zones.${id} is missing`);
      if (!p.themes.some((t) => t.id === p.defaultTheme))
        problems.push("defaultTheme is not one of the themes");
      for (const step of p.tour)
        if (step.theme && !p.themes.some((t) => t.id === step.theme))
          problems.push(`tour step "${step.title}" uses an unknown theme`);
    }
    for (const path of new Set(sitePaths(doc)))
      if (!existsSync(join(root, "public", path))) problems.push(`file not found: ${path}`);
  }
  if (problems.length) {
    failed++;
    console.log(`✗ ${file}`);
    for (const p of problems) console.log(`    ${p}`);
  } else console.log(`✓ ${file}`);
}
process.exit(failed ? 1 : 0);
