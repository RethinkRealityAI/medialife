import process from "node:process";

// Public responses that change when the team publishes are cached on Netlify's CDN
// for a minute, with a cache tag: "x-<slug>" for builder endcaps (src/routes/x.$slug.ts)
// and "demo-<demo>" for the live demos' tour copy (api.ar.demo-content.$demo.ts).
// Purging the tag on publish makes the change visible at once instead of after the
// cache expires. Netlify injects NETLIFY_PURGE_API_TOKEN and SITE_ID into functions;
// locally both are missing and this does nothing. Best effort: a failed purge only
// means the old version lingers for up to a minute, so it never fails the publish.
export async function purgeCacheTags(tags: string[]): Promise<void> {
  const token = process.env.NETLIFY_PURGE_API_TOKEN;
  const siteId = process.env.SITE_ID;
  if (!token || !siteId || !tags.length) return;
  try {
    const res = await fetch("https://api.netlify.com/api/v1/purge", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ site_id: siteId, cache_tags: tags }),
    });
    if (!res.ok) console.warn(`CDN purge for ${tags.join(", ")} failed: ${res.status}`);
  } catch (err) {
    console.warn(`CDN purge for ${tags.join(", ")} failed`, err);
  }
}

/** A builder endcap's page, /x/<slug>. */
export const purgeEndcapCache = (slug: string) => purgeCacheTags([`x-${slug}`]);

/** A live demo's tour copy, /api/ar/demo-content/<demo>. */
export const purgeDemoContentCache = (demo: string) => purgeCacheTags([`demo-${demo}`]);
