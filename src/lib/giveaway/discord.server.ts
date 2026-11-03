import process from "node:process";

import { publicOrigin } from "@/lib/hub/auth.server";

import { GW_COOKIE, completeDiscordTask, findEntrant, getCampaignBySlug, resolveGwSession } from "./giveaway.server";
import { GIVEAWAY_ROUTES } from "./model";
import { newId, type GwNamespace } from "./store.server";

// "Join our Discord" task: the entrant signs in with Discord (scopes identify +
// guilds, read once, never stored) and we check the server is in their list.
// Uses the Creator Hub's Discord app (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET);
// register <origin>/api/giveaway/discord/callback as a redirect URL on it.

const OAUTH_COOKIE = "gw_oauth";

export const discordGiveawayConfigured = () =>
  !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

const callbackUrl = (request: Request, ns: GwNamespace) =>
  `${publicOrigin(request, ns)}/api/giveaway/discord/callback`;

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

const back = (slug: string, result: string) => `${GIVEAWAY_ROUTES.campaign(slug)}?discord=${result}`;

/** GET /api/giveaway/discord?slug=…&task=… */
export function startGiveawayDiscord(request: Request, ns: GwNamespace): Response {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 48);
  const task = (url.searchParams.get("task") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  if (!slug) return redirect("/");
  if (!discordGiveawayConfigured()) return redirect(back(slug, "unavailable"));
  const state = newId(24, false);
  const auth = new URL("https://discord.com/oauth2/authorize");
  auth.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID!);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", callbackUrl(request, ns));
  auth.searchParams.set("scope", "identify guilds");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "none");
  return redirect(auth.toString(), [
    cookie(OAUTH_COOKIE, JSON.stringify({ state, slug, task }), 600, ns !== "dev"),
  ]);
}

/** GET /api/giveaway/discord/callback */
export async function finishGiveawayDiscord(request: Request, ns: GwNamespace): Promise<Response> {
  const url = new URL(request.url);
  const clear = cookie(OAUTH_COOKIE, "", 0, ns !== "dev");
  let saved: { state: string; slug: string; task: string } | null = null;
  try {
    saved = JSON.parse(readCookie(request, OAUTH_COOKIE) ?? "null");
  } catch {
    saved = null;
  }
  if (!saved) return redirect("/", [clear]);
  const done = (r: string) => redirect(back(saved!.slug, r), [clear]);
  if (url.searchParams.get("error")) return done("denied");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== saved.state || !discordGiveawayConfigured())
    return done("failed");

  const c = await getCampaignBySlug(ns, saved.slug);
  const session = await resolveGwSession(ns, readCookie(request, GW_COOKIE));
  const entrant = c && session ? await findEntrant(ns, c.id, session.email) : null;
  if (!c || !entrant) return done("signed-out");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl(request, ns),
      }),
    });
    if (!tokenRes.ok) return done("failed");
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return done("failed");
    const auth = { headers: { authorization: `Bearer ${access_token}` } };
    const [meRes, guildsRes] = await Promise.all([
      fetch("https://discord.com/api/users/@me", auth),
      fetch("https://discord.com/api/users/@me/guilds", auth),
    ]);
    if (!meRes.ok || !guildsRes.ok) return done("failed");
    const me = (await meRes.json()) as { id: string; username: string };
    const guilds = (await guildsRes.json()) as { id: string }[];
    const r = await completeDiscordTask(ns, c, entrant.id, saved.task, {
      id: me.id,
      username: me.username,
      guildIds: guilds.map((g) => g.id),
    });
    return done(r);
  } catch (err) {
    console.error("[giveaway] discord check failed", err);
    return done("failed");
  }
}
