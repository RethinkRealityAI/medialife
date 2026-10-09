/**
 * Small, client-safe helpers the Creator Hub account pages share: where a
 * signed-in creator belongs, which `next` values are safe to follow, and the
 * Discord OAuth links.
 */
import { HUB, type CreatorStatus } from "@/lib/hub/model";

export const HUB_PATHS = {
  landing: HUB.base,
  join: `${HUB.base}/join`,
  signIn: `${HUB.base}/sign-in`,
  forgot: `${HUB.base}/forgot-password`,
  onboarding: `${HUB.base}/onboarding`,
  dashboard: `${HUB.base}/dashboard`,
  terms: `${HUB.base}/terms`,
} as const;

type SessionLike = {
  signedIn: boolean;
  creator?: { status: CreatorStatus } | null;
};

/**
 * Where a signed-in creator belongs: the application while it's a draft, the
 * dashboard once it's been sent.
 */
export function homeFor(s: SessionLike): string {
  if (s.creator?.status === "draft") return HUB_PATHS.onboarding;
  return HUB_PATHS.dashboard;
}

/**
 * Only follow `next` when it's a path inside the hub. Rejects protocol-relative
 * (`//evil.com`), backslash tricks and anything outside /creator-hub/.
 */
export function safeNext(next: string | undefined | null): string | null {
  if (!next) return null;
  if (!next.startsWith(`${HUB.base}/`)) return null;
  if (next.startsWith("//") || next.includes("\\") || /[\r\n\t]/.test(next)) return null;
  // The account pages themselves are never a useful destination.
  if (/^\/creator-hub\/(sign-in|join|forgot-password|reset-password)(\/|\?|#|$)/.test(next)) {
    return null;
  }
  return next;
}

/** Discord OAuth: sign in or sign up. */
export function discordSignInHref(next: string, invite?: string | null) {
  const q = new URLSearchParams({ next });
  if (invite) q.set("invite", invite);
  return `/api/hub/auth/discord?${q.toString()}`;
}

/** Discord OAuth: connect Discord to the signed-in account. */
export function discordLinkHref(next: string) {
  return `/api/hub/auth/discord?${new URLSearchParams({ mode: "link", next }).toString()}`;
}

/** Friendly copy for the `?error=` codes the Discord route sends back. */
export const DISCORD_ERRORS: Record<string, string> = {
  "discord-denied": "Discord sign-in was cancelled. No problem — try again, or use your email.",
  "discord-failed": "We couldn't reach Discord just now. Try again in a minute, or use your email.",
  "discord-taken":
    "That Discord account is already linked to another Creator Hub account. Sign in with that one, or use a different Discord.",
  "discord-unverified":
    "Your Discord email isn't verified, so we can't create an account from it. Verify it in Discord, or join with your email.",
};

export const discordError = (code: string | undefined) =>
  code ? (DISCORD_ERRORS[code] ?? "Something went wrong signing in. Please try again.") : null;

/**
 * The verification link the server hands back when email isn't configured
 * (localhost, deploy previews). Kept for the tab so the onboarding banner can
 * show it after sign-up navigates away.
 */
const DEV_LINK_KEY = "creator-hub:verify-dev-link";
const WELCOME_KEY = "creator-hub:welcome";

export function stashAfterSignUp(devLink: string | undefined) {
  try {
    if (devLink) sessionStorage.setItem(DEV_LINK_KEY, devLink);
    sessionStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* storage blocked: the banner's resend still works */
  }
}

export function readStashedDevLink(): string | null {
  try {
    return sessionStorage.getItem(DEV_LINK_KEY);
  } catch {
    return null;
  }
}

export function clearStashedDevLink() {
  try {
    sessionStorage.removeItem(DEV_LINK_KEY);
  } catch {
    /* ignore */
  }
}

/** True once, right after sign-up. */
export function takeWelcome(): boolean {
  try {
    const v = sessionStorage.getItem(WELCOME_KEY);
    sessionStorage.removeItem(WELCOME_KEY);
    return v === "1";
  } catch {
    return false;
  }
}
