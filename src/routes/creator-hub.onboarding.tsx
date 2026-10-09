import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudCheck,
  CloudOff,
  Loader2,
  LogOut,
  MailWarning,
  PartyPopper,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { DevLinkNotice, FormError, LINK } from "@/components/hub/auth/fields";
import {
  StepAbout,
  StepChannels,
  StepContact,
  StepProducts,
  StepReview,
} from "@/components/hub/auth/intake/steps";
import {
  LAST_STEP,
  STEPS,
  fid,
  fromCreator,
  guessCountry,
  payloadFor,
  validateStep,
  type Errors,
  type IntakeForm,
} from "@/components/hub/auth/intake/model";
import {
  DISCORD_ERRORS,
  HUB_PATHS,
  clearStashedDevLink,
  discordLinkHref,
  readStashedDevLink,
  takeWelcome,
} from "@/components/hub/auth/session";
import { EYEBROW, HubChrome } from "@/components/hub/auth/shell";
import { getHubSession, resendVerification, signOut } from "@/lib/hub/auth.functions";
import { getMyCreator, saveProfile, submitApplication } from "@/lib/hub/creator.functions";
import { HUB } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/onboarding")({
  // After "Connect Discord" the OAuth route comes back with ?discord=connected or ?error=…
  validateSearch: z.object({
    discord: z.string().max(40).optional().catch(undefined),
    error: z.string().max(60).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: `Your application · ${HUB.name} | MEDIALIFE` }] }),
  beforeLoad: async () => {
    const session = await getHubSession();
    if (!session.signedIn) throw redirect({ href: HUB_PATHS.join });
    if (!session.creator || session.creator.status !== "draft") {
      throw redirect({ href: HUB_PATHS.dashboard });
    }
    return { session };
  },
  loader: () => getMyCreator(),
  // The form owns its state once loaded; don't refetch underneath it.
  staleTime: Infinity,
  component: Onboarding,
});

const STEP_INTRO = [
  "The basics. Only your creator name and country are required.",
  "Add the channels you'd promote your merch on. Your main one is enough to start.",
  "We run the program over Discord — it's the quickest way to reach you.",
  "Choose what you'd like to make first. Nothing is made until you approve a design.",
  "Make sure everything looks right. You can edit any section.",
];

type SaveState = { state: "idle" | "saving" | "saved" | "error"; at?: number };

const clampStep = (n: number) => Math.min(LAST_STEP, Math.max(0, Math.floor(n || 0)));

function Onboarding() {
  const data = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/creator-hub/onboarding" });
  const router = useRouter();

  const [creator, setCreator] = useState(data.creator);
  const [form, setForm] = useState<IntakeForm>(() => fromCreator(data.creator));
  const [step, setStep] = useState(() => clampStep(data.creator.intakeStep));
  const [reached, setReached] = useState(() => clampStep(data.creator.intakeStep));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<string[]>(data.gaps);
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(false);
  const [terms, setTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const discordAccount = data.account.discord ? { username: data.account.discord.username } : null;
  const ctx = { discordConnected: !!discordAccount };
  const needsTerms = !creator.consent.termsAt;

  /* ---- one-off things on arrival ---- */
  useEffect(() => {
    // Friendly defaults the server can't know.
    setForm((f) => ({
      ...f,
      timezone: f.timezone || safeTimeZone(),
      country: f.country || guessCountry(),
    }));
    if (takeWelcome()) {
      toast.success(`Welcome, ${data.creator.profile.displayName || "creator"}!`, {
        description: "Your account is ready. Five quick steps and you're done.",
      });
    }
  }, [data.creator.profile.displayName]);

  useEffect(() => {
    if (!search.discord && !search.error) return;
    if (search.discord === "connected") {
      toast.success("Discord connected", {
        description: discordAccount ? `Signed in as @${discordAccount.username}.` : undefined,
      });
    } else if (search.error) {
      toast.error(DISCORD_ERRORS[search.error] ?? "Discord didn't connect. Please try again.");
    }
    void navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.discord, search.error]);

  /* ---- focus: a field with an error, else the new step's heading ---- */
  useEffect(() => {
    if (focusKey) {
      const el = document.getElementById(fid(focusKey));
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFocusKey(null);
    }
  }, [focusKey, step]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (focusKey) return;
    headingRef.current?.focus({ preventScroll: true });
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, submitted]);

  const set = useCallback((patch: Partial<IntakeForm>, clear?: string[]) => {
    setForm((f) => ({ ...f, ...patch }));
    if (clear?.length) {
      setErrors((e) => {
        if (!clear.some((k) => k in e)) return e;
        const next = { ...e };
        for (const k of clear) delete next[k];
        return next;
      });
    }
  }, []);

  function showErrors(e: Errors) {
    setErrors(e);
    setFormError(null);
    setFocusKey(Object.keys(e)[0] ?? null);
  }

  async function persist(fromStep: number, nextStep: number, extra?: { acceptTerms?: true }) {
    setSave({ state: "saving" });
    try {
      const r = await saveProfile({
        data: { ...payloadFor(fromStep, form), intakeStep: nextStep, ...extra },
      });
      setCreator(r.creator);
      setGaps(r.gaps);
      setSave({ state: "saved", at: Date.now() });
      return true;
    } catch {
      setSave({ state: "error" });
      setFormError("We couldn't save just now. Check your connection and try again.");
      return false;
    }
  }

  async function goTo(target: number) {
    if (busy || target === step) return;
    const forward = target > step;
    const e = step < LAST_STEP ? validateStep(step, form, ctx) : {};
    const valid = Object.keys(e).length === 0;
    if (forward && !valid) return showErrors(e);
    setErrors({});
    setFormError(null);
    setLater(false);
    setBusy(true);
    // Going back with half-finished answers is fine: they stay on screen, unsaved.
    const ok = valid ? await persist(step, target) : true;
    setBusy(false);
    if (!ok && forward) return;
    setStep(target);
    setReached((r) => Math.max(r, target));
  }

  async function saveForLater() {
    if (busy) return;
    const e = step < LAST_STEP ? validateStep(step, form, ctx) : {};
    if (Object.keys(e).length) return showErrors(e);
    setErrors({});
    setFormError(null);
    setBusy(true);
    const ok = await persist(step, step);
    setBusy(false);
    if (ok) setLater(true);
  }

  async function submit() {
    if (busy) return;
    for (let s = 0; s < LAST_STEP; s++) {
      const e = validateStep(s, form, ctx);
      if (Object.keys(e).length) {
        setStep(s);
        return showErrors(e);
      }
    }
    if (needsTerms && !terms) {
      return showErrors({ terms: "Please agree to the program terms to send your application." });
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    const saved = await persist(
      LAST_STEP,
      LAST_STEP,
      needsTerms ? { acceptTerms: true } : undefined,
    );
    if (!saved) return setBusy(false);
    try {
      const r = await submitApplication();
      if (!r.ok) {
        setGaps(r.gaps ?? []);
        setFormError("A few things are still missing — they're listed above.");
        setBusy(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setFormError(
        "We couldn't send your application just now. Your answers are saved — try again.",
      );
    }
    setBusy(false);
  }

  async function doSignOut() {
    try {
      await signOut();
    } finally {
      await router.invalidate();
      await router.navigate({ href: HUB_PATHS.signIn });
    }
  }

  const name = creator.profile.displayName || form.displayName;

  const header = (
    <>
      {name ? (
        <span className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline">
          {name}
        </span>
      ) : null}
      <button
        type="button"
        onClick={doSignOut}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <LogOut className="size-3.5" aria-hidden />
        Sign out
      </button>
    </>
  );

  if (submitted) {
    return (
      <HubChrome headerRight={header}>
        <Submitted name={name} headingRef={headingRef} />
      </HubChrome>
    );
  }

  const stepProps = { form, set, errors };
  // Derived, so it shrinks (and disappears) as fields are fixed.
  const errorCount = Object.keys(errors).length;
  const errorSummary = errorCount
    ? errorCount === 1
      ? "One thing to fix before you carry on."
      : `${errorCount} things to fix before you carry on.`
    : null;

  return (
    <HubChrome headerRight={header}>
      <div
        ref={topRef}
        className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 pt-2 pb-12 sm:px-8 sm:pt-6"
      >
        {!data.account.emailVerified ? <EmailBanner email={data.account.email} /> : null}

        <div className="mb-6">
          <div className={EYEBROW}>
            {HUB.program}
            {creator.agency ? <> · via {creator.agency.name}</> : null}
          </div>
          <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
            {name ? <>Hi {name.split(" ")[0]} — let's get you set up</> : "Let's get you set up"}
          </h1>
        </div>

        <Progress step={step} reached={reached} save={save} onJump={goTo} busy={busy} />

        <div className="mt-6 rounded-2xl border border-border bg-card/70 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-sm">
          <div className="border-b border-border px-5 py-5 sm:px-8 sm:py-6">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-medium tracking-tight outline-none sm:text-2xl"
            >
              {STEPS[step].title}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{STEP_INTRO[step]}</p>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step === LAST_STEP) void submit();
              else void goTo(step + 1);
            }}
          >
            <div className="px-5 py-6 sm:px-8 sm:py-8">
              <FormError className="mb-6 empty:mb-0">{formError ?? errorSummary}</FormError>

              {step === 0 ? <StepAbout {...stepProps} /> : null}
              {step === 1 ? <StepChannels {...stepProps} /> : null}
              {step === 2 ? (
                <StepContact
                  {...stepProps}
                  discordEnabled={session.discordEnabled}
                  discordAccount={discordAccount}
                  discordLinkHref={discordLinkHref(HUB_PATHS.onboarding)}
                  agency={creator.agency}
                />
              ) : null}
              {step === 3 ? <StepProducts {...stepProps} /> : null}
              {step === 4 ? (
                <StepReview
                  form={form}
                  email={data.account.email}
                  discordAccount={discordAccount}
                  onEdit={(s) => void goTo(s)}
                  gaps={gaps}
                  needsTerms={needsTerms}
                  terms={terms}
                  setTerms={(v) => {
                    setTerms(v);
                    if (v) setErrors((e) => (e.terms ? {} : e));
                  }}
                  termsError={errors.terms}
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-8 sm:py-5">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => void goTo(step - 1)}
                  disabled={busy}
                  className="btn-pill btn-ember-outline mono inline-flex h-12 items-center gap-2 px-5 text-[11px] tracking-[0.16em] uppercase disabled:opacity-60"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy}
                className="btn-pill btn-ember mono inline-flex h-12 items-center gap-2 px-6 text-[11px] font-medium tracking-[0.16em] uppercase disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {step === LAST_STEP ? (
                  <>Send application {!busy ? <Send className="size-4" aria-hidden /> : null}</>
                ) : (
                  <>
                    Next<span className="hidden sm:inline"> · {STEPS[step + 1].label}</span>
                    {!busy ? <ArrowRight className="size-4" aria-hidden /> : null}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground" aria-live="polite">
          {later ? (
            <div className="mx-auto max-w-md rounded-xl border border-emerald-400/35 bg-emerald-400/[0.07] px-4 py-3 text-foreground">
              <p className="flex items-center justify-center gap-2 font-medium">
                <Check className="size-4 text-emerald-300" strokeWidth={3} aria-hidden />
                Saved.
              </p>
              <p className="mt-1 text-muted-foreground">
                You can close this page and come back any time — we'll pick up right here.{" "}
                <button type="button" onClick={doSignOut} className={LINK}>
                  Sign out
                </button>
              </p>
            </div>
          ) : (
            <button type="button" onClick={saveForLater} disabled={busy} className={LINK}>
              Save and finish later
            </button>
          )}
        </div>
      </div>
    </HubChrome>
  );
}

function safeTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------------------------
   Progress header
   --------------------------------------------------------------------------- */

function Progress({
  step,
  reached,
  save,
  onJump,
  busy,
}: {
  step: number;
  reached: number;
  save: SaveState;
  onJump: (s: number) => void;
  busy: boolean;
}) {
  const pct = ((step + 1) / STEPS.length) * 100;
  return (
    <nav aria-label="Application steps">
      <div className="flex items-center justify-between gap-3">
        <p className="mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          Step <span className="text-foreground tabular-nums">{step + 1}</span> of{" "}
          <span className="tabular-nums">{STEPS.length}</span>
          <span className="sm:hidden"> · {STEPS[step].label}</span>
        </p>
        <SaveStatus save={save} />
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Application progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: "var(--gradient-ember)" }}
        />
      </div>
      <ol className="mt-4 hidden grid-cols-5 gap-2 sm:grid">
        {STEPS.map((s, i) => {
          const done = i < step || (i <= reached && i !== step);
          const here = i === step;
          const can = !here && i <= reached && !busy;
          const inner = (
            <>
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums transition-colors",
                  here
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {done && !here ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  here
                    ? "text-foreground"
                    : done
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60",
                )}
              >
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.id} className="min-w-0">
              {can ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {inner}
                  <span className="sr-only">{done ? " (done)" : ""} — go to this step</span>
                </button>
              ) : (
                <span
                  className="flex min-w-0 items-center gap-2 py-1"
                  aria-current={here ? "step" : undefined}
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SaveStatus({ save }: { save: SaveState }) {
  const time =
    save.at != null
      ? new Date(save.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
  return (
    <span
      role="status"
      className="mono inline-flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
    >
      {save.state === "saving" ? (
        <>
          <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
        </>
      ) : save.state === "saved" ? (
        <>
          <CloudCheck className="size-3.5 text-emerald-300" aria-hidden /> Saved {time}
        </>
      ) : save.state === "error" ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CloudOff className="size-3.5" aria-hidden /> Not saved
        </span>
      ) : (
        <>
          <CloudCheck className="size-3.5" aria-hidden /> Autosaves each step
        </>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Email not confirmed yet
   --------------------------------------------------------------------------- */

function EmailBanner({ email }: { email: string }) {
  const [devLink, setDevLink] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDevLink(readStashedDevLink()), []);

  async function resend() {
    setState("busy");
    setMessage(null);
    try {
      const r = await resendVerification();
      if (!r.ok) {
        setState("error");
        setMessage(r.error);
        return;
      }
      if (r.already) {
        setState("sent");
        setMessage("Your email is already confirmed.");
        clearStashedDevLink();
        return;
      }
      setState("sent");
      setMessage("Sent. Check your inbox (and spam).");
      if (r.devLink) setDevLink(r.devLink);
    } catch {
      setState("error");
      setMessage("We couldn't send that just now. Try again in a minute.");
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-400/[0.07] px-4 py-3.5 text-sm">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
        <p className="min-w-0 flex-1 leading-relaxed">
          <strong className="font-medium">Confirm your email</strong>{" "}
          <span className="text-muted-foreground">
            — we sent a link to <span className="break-all text-foreground">{email}</span>.
          </span>
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={state === "busy"}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 px-3 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-400/10 disabled:opacity-60"
        >
          {state === "busy" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          Resend
        </button>
      </div>
      <p
        aria-live="polite"
        className={cn(
          "pl-8 text-xs",
          message ? "mt-1.5" : "",
          state === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {message}
      </p>
      {devLink ? (
        <DevLinkNotice className="mt-3" href={devLink} label="Open the confirmation link" />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Sent
   --------------------------------------------------------------------------- */

const NEXT_STEPS = [
  { title: "We review your application", body: "Within 2 business days." },
  { title: "Kick-off call with your manager", body: "We agree products, look and timing." },
  {
    title: "Design & approvals in the hub",
    body: "You approve every proof before anything is made.",
  },
  { title: "Production, launch & live earnings", body: "Watch orders and payouts as they land." },
];

function Submitted({
  name,
  headingRef,
}: {
  name: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [headingRef]);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-8 sm:pt-12">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-6 text-center shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-[28rem] max-w-full rounded-full opacity-60 blur-3xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative">
          <span
            aria-hidden
            className="mx-auto grid size-16 place-items-center rounded-full text-white shadow-[0_0_50px_-8px_var(--glow)]"
            style={{ background: "var(--gradient-ember-btn)" }}
          >
            <PartyPopper className="size-7" />
          </span>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-6 text-3xl font-medium tracking-tight text-balance outline-none sm:text-4xl"
          >
            Application sent{name ? <>, {name.split(" ")[0]}</> : null}.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Thanks — it's with the team now. We'll be in touch on Discord and by email.
          </p>
        </div>

        <div className="relative mt-10 text-left">
          <h2 className={EYEBROW}>What happens next</h2>
          <ol className="mt-4 space-y-0">
            {NEXT_STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                {i < NEXT_STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-8 bottom-0 left-[0.9rem] w-px bg-border"
                  />
                ) : null}
                <span
                  className={cn(
                    "mono relative grid size-7 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums",
                    i === 0
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <a
          href={HUB_PATHS.dashboard}
          className="btn-pill btn-ember mono relative mt-10 inline-flex h-12 items-center justify-center gap-2 px-7 text-xs font-medium tracking-[0.18em] uppercase"
        >
          Go to your Creator Hub <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
