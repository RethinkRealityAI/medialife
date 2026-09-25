import process from "node:process";

// Published endcaps (/x/<slug>) are cached on Netlify's CDN for a minute, tagged
// "x-<slug>" (see src/routes/x.$slug.ts). Purging the tag on publish / unpublish makes
// the change visible at once instead of after the cache expires. Netlify injects
// NETLIFY_PURGE_API_TOKEN and SITE_ID into functions; locally both are missing and
// this does nothing. Best effort: a failed purge only means the old version lingers
// for up to a minute, so it never fails the publish.
export async function purgeEndcapCache(slug: string): Promise<void> {
  const token = process.env.NETLIFY_PURGE_API_TOKEN;
  const siteId = process.env.SITE_ID;
  if (!token || !siteId) return;
  try {
    const res = await fetch("https://api.netlify.com/api/v1/purge", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ site_id: siteId, cache_tags: [`x-${slug}`] }),
    });
    if (!res.ok) console.warn(`CDN purge for x-${slug} failed: ${res.status}`);
  } catch (err) {
    console.warn(`CDN purge for x-${slug} failed`, err);
  }
}
