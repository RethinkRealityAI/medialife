import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import process from "node:process";
import { z } from "zod";

import {
  HUB_COOKIE,
  authConfigured,
  burnPasswordCheck,
  claimEmail,
  clearRateLimit,
  consumeToken,
  endAllSessions,
  endSession,
  findUserByEmail,
  getUser,
  hashPassword,
  issueToken,
  normalizeEmail,
  passwordProblem,
  publicOrigin,
  rateLimit,
  saveUser,
  verifyPassword,
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
import { sendResetEmail, sendVerifyEmail } from "./mail.server";
import { HUB } from "./model";
import { clearSessionCookie, currentUser, startSession } from "./session.server";
import { hubNs, newId } from "./store.server";

// Account flows for the Creator Hub: sign up, sign in, sign out, verify email,
// forgot / reset password, change password. The pages under /creator-hub call
// these; route guards call getHubSession.

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(254);
const inviteSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,40}$/)
  .optional()
  .nullable();

const MINUTE = 60_000;

/** Who is signed in, and where their account is up to. Safe to call when signed out. */
export const getHubSession = createServerFn({ method: "GET" }).handler(async () => {
  const s = await currentUser();
  const discordEnabled = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  if (!s) return { signedIn: false as const, discordEnabled, configured: authConfigured(hubNs()) };
  const creator = await getCreator(s.ns, s.user.creatorId);
  return {
    signedIn: true as const,
    discordEnabled,
    configured: true,
    user: {
      id: s.user.id,
      email: s.user.email,
      emailVerified: s.user.emailVerified,
      hasPassword: !!s.user.passwordHash,
      discord: s.user.discord
        ? {
            username: s.user.discord.username,
            avatar: s.user.discord.avatar,
            id: s.user.discord.id,
          }
        : null,
    },
    creator: creator
      ? {
          id: creator.id,
          status: creator.status,
          displayName: creator.profile.displayName,
          intakeStep: creator.intakeStep,
          agency: creator.agency?.name ?? null,
        }
      : null,
  };
});

/** Public: the agency an invite code belongs to, for "Invited by …" on the sign-up page. */
export const lookupInvite = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().max(60) }))
  .handler(async ({ data }) => {
    const inv = await getInvite(hubNs(), data.code.trim().toLowerCase());
    return inv ? { code: inv.code, agencyName: inv.agencyName, rep: inv.rep } : null;
  });

async function emailVerification(user: HubUser, name: string) {
  const ns = hubNs();
  const token = await issueToken(ns, "verify", user);
  const url = `${publicOrigin(getRequest(), ns)}${HUB.base}/verify-email?token=${token}`;
  return sendVerifyEmail(ns, user.email, name, url);
}

export const signUp = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1, "Add your creator name").max(80),
      email: emailSchema,
      password: z.string().max(200),
      invite: inviteSchema,
      terms: z.literal(true, {
        errorMap: () => ({ message: "Please accept the terms to continue" }),
      }),
      marketing: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = hubNs();
    if (!authConfigured(ns))
      return { ok: false as const, error: "Sign-up is not available yet. Please try again later." };

    const problem = passwordProblem(data.password, data.email);
    if (problem) return { ok: false as const, error: problem, field: "password" as const };

    const ip = getRequest().headers.get("x-nf-client-connection-ip") ?? "unknown";
    if (!(await rateLimit(ns, "signup-ip", ip, 20, 60 * MINUTE))) {
      return {
        ok: false as const,
        error: "Too many sign-ups from this network. Try again in an hour.",
      };
    }

    const userId = newId();
    if (!(await claimEmail(ns, data.email, userId))) {
      return {
        ok: false as const,
        error: "There's already an account with this email. Sign in, or reset your password.",
        field: "email" as const,
      };
    }

    const now = Date.now();
    const creator = await createCreator(ns, userId, data.email);
    creator.profile.displayName = data.name;
    creator.consent = { termsAt: now, marketing: !!data.marketing };
    if (data.invite) {
      const inv = await getInvite(ns, data.invite);
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
      email: normalizeEmail(data.email),
      emailVerified: false,
      passwordHash: await hashPassword(data.password),
      discord: null,
      creatorId: creator.id,
      createdAt: now,
      lastLoginAt: now,
      disabled: false,
    };
    await saveUser(ns, user);
    await logActivity(ns, creator.id, {
      kind: "account",
      title: "Account created",
      body: creator.agency ? `Invited by ${creator.agency.name}.` : "Welcome to the Creator Hub.",
    });
    await startSession(ns, userId);
    const mail = await emailVerification(user, data.name);
    return {
      ok: true as const,
      emailSent: mail.sent,
      devLink: mail.sent ? undefined : mail.devLink,
    };
  });

export const signIn = createServerFn({ method: "POST" })
  .validator(z.object({ email: emailSchema, password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    if (!authConfigured(ns))
      return { ok: false as const, error: "Sign-in is not available yet. Please try again later." };
    if (!(await rateLimit(ns, "signin", data.email, 8, 15 * MINUTE))) {
      return {
        ok: false as const,
        error: "Too many attempts. Wait 15 minutes, or reset your password.",
      };
    }
    const user = await findUserByEmail(ns, data.email);
    if (!user || !user.passwordHash) {
      await burnPasswordCheck(data.password);
      return {
        ok: false as const,
        error: user?.discord
          ? "This account signs in with Discord. Use “Continue with Discord”, or reset your password to add one."
          : "That email and password don't match.",
      };
    }
    if (user.disabled || !(await verifyPassword(data.password, user.passwordHash))) {
      return { ok: false as const, error: "That email and password don't match." };
    }
    await clearRateLimit(ns, "signin", data.email);
    await saveUser(ns, { ...user, lastLoginAt: Date.now() });
    await startSession(ns, user.id);
    return { ok: true as const };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession(hubNs(), getCookie(HUB_COOKIE));
  clearSessionCookie();
  return { ok: true };
});

export const resendVerification = createServerFn({ method: "POST" }).handler(async () => {
  const s = await currentUser();
  if (!s) return { ok: false as const, error: "Sign in first." };
  if (s.user.emailVerified) return { ok: true as const, already: true, emailSent: false };
  if (!(await rateLimit(s.ns, "verify-mail", s.user.id, 4, 60 * MINUTE))) {
    return {
      ok: false as const,
      error: "We've sent a few already. Check your spam folder, or try again in an hour.",
    };
  }
  const creator = await getCreator(s.ns, s.user.creatorId);
  const mail = await emailVerification(s.user, creator?.profile.displayName ?? "");
  return {
    ok: true as const,
    already: false,
    emailSent: mail.sent,
    devLink: mail.sent ? undefined : mail.devLink,
  };
});

export const verifyEmail = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().max(100) }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    const user = await consumeToken(ns, "verify", data.token);
    if (!user) return { ok: false as const };
    if (!user.emailVerified) {
      await saveUser(ns, { ...user, emailVerified: true });
      await logActivity(ns, user.creatorId, {
        kind: "account",
        title: "Email confirmed",
        body: user.email,
      });
    }
    return { ok: true as const };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ email: emailSchema }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    // The answer is the same whether or not the account exists.
    const generic = {
      ok: true as const,
      emailSent: true,
      devLink: undefined as string | undefined,
    };
    if (!(await rateLimit(ns, "reset-mail", data.email, 3, 60 * MINUTE))) return generic;
    const user = await findUserByEmail(ns, data.email);
    if (!user || user.disabled) return generic;
    const token = await issueToken(ns, "reset", user);
    const url = `${publicOrigin(getRequest(), ns)}${HUB.base}/reset-password?token=${token}`;
    const mail = await sendResetEmail(ns, user.email, url);
    if (!mail.sent && ns === "prod") {
      return {
        ok: false as const,
        error: `We couldn't send the email. Write to ${HUB.supportEmail} and we'll help.`,
      };
    }
    return { ...generic, devLink: mail.sent ? undefined : mail.devLink };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().max(100), password: z.string().max(200) }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    // Check the rules that don't need the account first, so a password that's
    // too short doesn't use up the single-use link.
    const early = passwordProblem(data.password);
    if (early) return { ok: false as const, error: early };
    const user = await consumeToken(ns, "reset", data.token);
    if (!user)
      return {
        ok: false as const,
        error: "This link has expired or was already used. Ask for a new one.",
      };
    const problem = passwordProblem(data.password, user.email);
    if (problem) {
      // the link is spent by now: say so, with the rule up front
      return { ok: false as const, error: `${problem} Request a new link and try again.` };
    }
    // Reaching the inbox proves the address, so a reset also verifies it.
    await saveUser(ns, {
      ...user,
      passwordHash: await hashPassword(data.password),
      emailVerified: true,
      lastLoginAt: Date.now(),
    });
    await endAllSessions(ns, user.id);
    await clearRateLimit(ns, "signin", user.email);
    await logActivity(ns, user.creatorId, { kind: "account", title: "Password changed" });
    await startSession(ns, user.id);
    return { ok: true as const };
  });

export const changePassword = createServerFn({ method: "POST" })
  .validator(z.object({ current: z.string().max(200).optional(), next: z.string().max(200) }))
  .handler(async ({ data }) => {
    const s = await currentUser();
    if (!s) return { ok: false as const, error: "Sign in again to change your password." };
    if (s.user.passwordHash && !(await verifyPassword(data.current ?? "", s.user.passwordHash))) {
      return {
        ok: false as const,
        error: "Your current password isn't right.",
        field: "current" as const,
      };
    }
    const problem = passwordProblem(data.next, s.user.email);
    if (problem) return { ok: false as const, error: problem, field: "next" as const };
    const user = (await getUser(s.ns, s.user.id))!;
    await saveUser(s.ns, { ...user, passwordHash: await hashPassword(data.next) });
    await endAllSessions(s.ns, user.id);
    await startSession(s.ns, user.id);
    await logActivity(s.ns, user.creatorId, { kind: "account", title: "Password changed" });
    return { ok: true as const };
  });
