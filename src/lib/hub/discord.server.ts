import process from "node:process";

import {
  HUB_COOKIE,
  claimDiscord,
  claimEmail,
  createSession,
  findUserByDiscord,
  findUserByEmail,
  publicOrigin,
  resolveSession,
  saveUser,
  type HubUser,
} from "./auth.server";
import {
  countInviteUse,
  createCreator,
  getCreator,
  getInvite,
  logActivity,
  saveCreator,
} from "./data.server";
import { HUB } from "./model";
import { newId, type HubNamespace } from "./store.server";

// "Continue with Discord" for the Creator Hub (OAuth 2 authorization code flow,
// scopes identify + email). Needs DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET,
// and the redirect URL <origin>/api/hub/auth/discord/callback registered on the
// Discord application (one per environment you sign in on).
//
// Three outcomes:
//   link    — a signed-in creator connects Discord: we store their Discord ID
//             and username on their profile, so they never have to find it.
//   sign in — a Discord account already linked to a hub account.
//   sign up — a new Discord account with a verified email: we create the hub
//             account and send them to the application. An existing hub account
//             with the same verified email is linked rather than duplicated.

const OAUTH_COOKIE = "hub_oauth";
const STATE_TTL_S = 600;

export function discordConfigured() {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

const callbackUrl = (request: Request, ns: HubNamespace) =>
  `${publicOrigin(request, ns)}/api/hub/auth/discord/callback`;

/** Only send people back inside the hub. */
const safeNext = (next: string | null, fallback: string) =>
  next && next.startsWith(`${HUB.base}/`) && !next.startsWith("//") && !next.includes("\\")
    ? next
    : fallback;

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

const isSecure = (ns: HubNamespace) => ns !== "dev";

export function startDiscord(request: Request, ns: HubNamespace): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "link" ? "link" : "signin";
  if (!discordConfigured()) {
    return redirect(
      mode === "link"
        ? safeNext(url.searchParams.get("next"), `${HUB.base}/account`)
        : `${HUB.base}/sign-in?error=discord-failed`,
    );
  }
  const state = newId(24, false);
  const payload = JSON.stringify({
    state,
    mode,
    next: safeNext(
      url.searchParams.get("next"),
      mode === "link" ? `${HUB.base}/account` : `${HUB.base}/dashboard`,
    ),
    invite: (url.searchParams.get("invite") ?? "").toLowerCase().slice(0, 40),
  });
  const auth = new URL("https://discord.com/oauth2/authorize");
  auth.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID!);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", callbackUrl(request, ns));
  auth.searchParams.set("scope", "identify email");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "none");
  return redirect(auth.toString(), [cookie(OAUTH_COOKIE, payload, STATE_TTL_S, isSecure(ns))]);
}

type DiscordMe = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
  verified: boolean;
};

async function exchange(
  request: Request,
  ns: HubNamespace,
  code: string,
): Promise<DiscordMe | null> {
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
  if (!tokenRes.ok) {
    console.error(
      `[creator-hub] discord token ${tokenRes.status}: ${await tokenRes.text().catch(() => "")}`,
    );
    return null;
  }
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;
  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return null;
  return (await meRes.json()) as DiscordMe;
}

const avatarUrl = (me: DiscordMe) =>
  me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null;

async function attachDiscordToCreator(ns: HubNamespace, user: HubUser, me: DiscordMe) {
  const creator = await getCreator(ns, user.creatorId);
  if (!creator) return;
  creator.contact = { ...creator.contact, discordId: me.id, discordUsername: me.username };
  await saveCreator(ns, creator);
}

export async function finishDiscord(request: Request, ns: HubNamespace): Promise<Response> {
  const url = new URL(request.url);
  const clear = cookie(OAUTH_COOKIE, "", 0, isSecure(ns));
  let saved: { state: string; mode: "link" | "signin"; next: string; invite: string } | null = null;
  try {
    saved = JSON.parse(readCookie(request, OAUTH_COOKIE) ?? "null");
  } catch {
    saved = null;
  }
  const fail = (error: string) =>
    redirect(
      saved?.mode === "link"
        ? `${saved.next}${saved.next.includes("?") ? "&" : "?"}error=${error}`
        : `${HUB.base}/sign-in?error=${error}`,
      [clear],
    );

  if (!saved || !discordConfigured()) return fail("discord-failed");
  if (url.searchParams.get("error")) return fail("discord-denied");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== saved.state) return fail("discord-failed");

  let me: DiscordMe | null = null;
  try {
    me = await exchange(request, ns, code);
  } catch (err) {
    console.error("[creator-hub] discord exchange failed", err);
  }
  if (!me?.id) return fail("discord-failed");

  const discord = { id: me.id, username: me.username, avatar: avatarUrl(me) };
  const login = async (user: HubUser, next: string) => {
    const s = await createSession(ns, user.id, request.headers.get("user-agent") ?? "");
    return redirect(next, [clear, cookie(HUB_COOKIE, s.cookie, s.maxAge, isSecure(ns))]);
  };

  // Link to the signed-in account.
  if (saved.mode === "link") {
    const session = await resolveSession(ns, readCookie(request, HUB_COOKIE));
    if (!session)
      return redirect(`${HUB.base}/sign-in?next=${encodeURIComponent(saved.next)}`, [clear]);
    const owner = await findUserByDiscord(ns, me.id);
    if (owner && owner.id !== session.user.id) return fail("discord-taken");
    if (!owner && !(await claimDiscord(ns, me.id, session.user.id))) return fail("discord-taken");
    const user = { ...session.user, discord };
    await saveUser(ns, user);
    await attachDiscordToCreator(ns, user, me);
    await logActivity(ns, user.creatorId, {
      kind: "account",
      title: "Discord connected",
      body: `@${me.username}`,
    });
    return redirect(`${saved.next}${saved.next.includes("?") ? "&" : "?"}discord=connected`, [
      clear,
    ]);
  }

  // Sign in with an already-linked Discord account.
  const linked = await findUserByDiscord(ns, me.id);
  if (linked) {
    if (linked.disabled) return fail("discord-failed");
    const user = { ...linked, discord, lastLoginAt: Date.now() };
    await saveUser(ns, user);
    const creator = await getCreator(ns, user.creatorId);
    return login(user, creator?.status === "draft" ? `${HUB.base}/onboarding` : saved.next);
  }

  // From here on we need an email Discord has verified.
  if (!me.email || !me.verified) return fail("discord-unverified");

  // An existing account with the same verified email: link it.
  const byEmail = await findUserByEmail(ns, me.email);
  if (byEmail) {
    if (byEmail.disabled) return fail("discord-failed");
    if (byEmail.discord && byEmail.discord.id !== me.id) return fail("discord-taken");
    if (!(await claimDiscord(ns, me.id, byEmail.id))) return fail("discord-taken");
    const user = { ...byEmail, discord, emailVerified: true, lastLoginAt: Date.now() };
    await saveUser(ns, user);
    await attachDiscordToCreator(ns, user, me);
    const creator = await getCreator(ns, user.creatorId);
    return login(user, creator?.status === "draft" ? `${HUB.base}/onboarding` : saved.next);
  }

  // A new creator.
  const userId = newId();
  if (!(await claimEmail(ns, me.email, userId)) || !(await claimDiscord(ns, me.id, userId)))
    return fail("discord-taken");
  const now = Date.now();
  const creator = await createCreator(ns, userId, me.email.toLowerCase());
  creator.profile.displayName = me.global_name || me.username;
  creator.contact = { ...creator.contact, discordId: me.id, discordUsername: me.username };
  // Terms are accepted on the application's review step for Discord sign-ups.
  if (saved.invite) {
    const inv = await getInvite(ns, saved.invite);
    if (inv) {
      creator.inviteCode = inv.code;
      creator.agency = inv.agencyId
        ? { id: inv.agencyId, name: inv.agencyName ?? inv.agencyId, rep: inv.rep }
        : null;
      await countInviteUse(ns, inv.code);
    }
  }
  await saveCreator(ns, creator);
  const user: HubUser = {
    id: userId,
    email: me.email.toLowerCase(),
    emailVerified: true,
    passwordHash: null,
    discord,
    creatorId: creator.id,
    createdAt: now,
    lastLoginAt: now,
    disabled: false,
  };
  await saveUser(ns, user);
  await logActivity(ns, creator.id, {
    kind: "account",
    title: "Account created with Discord",
    body: creator.agency ? `Invited by ${creator.agency.name}.` : "Welcome to the Creator Hub.",
  });
  return login(user, `${HUB.base}/onboarding`);
}
