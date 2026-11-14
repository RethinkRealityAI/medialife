import process from "node:process";

// Cloudflare Turnstile (free bot check, no puzzles for real people) on the entry
// form. Needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY on Netlify. Without
// them the form works with no bot check (fine for previews; set them before launch).

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null;

export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch (err) {
    console.error("[giveaway] turnstile check failed", err);
    return false;
  }
}
