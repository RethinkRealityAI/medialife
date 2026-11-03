/**
 * The public giveaway page (/giveaway/<slug>): prize up top, a short entry form,
 * then the task list with points once the email is confirmed. Mobile first: one
 * column on phones, form/tasks beside the prize on desktop.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Gift,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { UgcTheme } from "@/components/ugc/creator/kit";
import { btnGhost, btnGold, btnTeal, card, eyebrow, field } from "@/components/ugc/shared/look";
import {
  claimGiveawayTask,
  enterGiveaway,
  openGiveawayTask,
  resendGiveawayLink,
} from "@/lib/giveaway/public.functions";
import {
  CA_PROVINCES,
  COUNTRY_LABELS,
  GIVEAWAY_ROUTES,
  PLATFORM_LABELS,
  eligibilityProblem,
  formatMoney,
  type PublicTask,
} from "@/lib/giveaway/model";
import type { EntrantView, PublicCampaign } from "@/lib/giveaway/giveaway.server";
import { cn } from "@/lib/utils";

export type GiveawayData = {
  preview: boolean;
  campaign: PublicCampaign;
  entrant: EntrantView | null;
  signedInEmail: string | null;
  turnstileSiteKey: string | null;
  discordReady: boolean;
  emailReady: boolean;
};

const DISCORD_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  done: { ok: true, text: "Discord checked: you're in the server. Points added!" },
  "not-member": {
    ok: false,
    text: "We couldn't find you in the server yet. Join it first, then check again.",
  },
  taken: { ok: false, text: "That Discord account is already linked to another entry." },
  denied: {
    ok: false,
    text: "Discord wasn't connected, so we couldn't check. Try again when you're ready.",
  },
  "signed-out": {
    ok: false,
    text: "Your entry session ended. Open the link in your email, then try again.",
  },
  closed: { ok: false, text: "This giveaway has ended, so points can't be added." },
  unavailable: { ok: false, text: "The Discord check isn't switched on yet. Try again later." },
  failed: { ok: false, text: "Something went wrong talking to Discord. Please try again." },
  error: { ok: false, text: "Something went wrong talking to Discord. Please try again." },
};

function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return null;
  const left = endsAt - now;
  if (left <= 0) return "Ended";
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"} ${h}h left`;
  const m = Math.max(1, Math.floor((left % 3_600_000) / 60_000));
  return `${h}h ${m}m left`;
}

const longDate = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "";

export function GiveawayPage({
  data,
  discord,
  refCode,
}: {
  data: GiveawayData;
  discord?: string;
  refCode?: string;
}) {
  const { campaign: c, entrant } = data;
  const countdown = useCountdown(c.endsAt);
  const shown = useRef(false);

  useEffect(() => {
    if (!discord || shown.current) return;
    shown.current = true;
    const m = DISCORD_MESSAGES[discord];
    if (m) (m.ok ? toast.success : toast.error)(m.text);
    const url = new URL(window.location.href);
    url.searchParams.delete("discord");
    window.history.replaceState(null, "", url.toString());
  }, [discord]);

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-[#05080a] text-foreground">
      <UgcTheme />
      <Toaster position="top-center" />
      <Backdrop />
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-[#f6c344] px-4 py-2.5 font-semibold text-black focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {data.preview ? (
        <div className="relative z-20 bg-amber-400/15 px-4 py-2 text-center text-sm text-amber-100 ring-1 ring-amber-400/30">
          Preview: this campaign is a draft, so only the team can see it. Entries open when it goes
          live.
        </div>
      ) : null}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
        <span className="flex min-h-11 items-center gap-2.5">
          <img src="/card/mark.svg" alt="" width={24} height={24} className="size-6" />
          <b className="text-[13px] font-bold tracking-[0.06em]">{c.brandLine || "MEDIALIFE"}</b>
        </span>
        <Link
          to="/giveaway/$slug/rules"
          params={{ slug: c.slug }}
          className={cn(btnGhost, "min-h-10 px-3.5 text-[13px]")}
        >
          Official rules
        </Link>
      </header>

      <main
        id="main"
        className="relative z-10 mx-auto grid max-w-6xl gap-8 px-4 pt-2 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:pt-6"
      >
        <section aria-labelledby="gw-title" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={eyebrow}>Giveaway</span>
            {c.phase === "open" && countdown ? (
              <span className="inline-flex h-6 items-center rounded-full bg-[#3fe6e0]/10 px-2.5 font-mono text-[11px] text-[#bff7f4] ring-1 ring-[#3fe6e0]/30 ring-inset">
                {countdown}
              </span>
            ) : null}
          </div>
          <h1
            id="gw-title"
            className="mt-3 text-[clamp(2.1rem,6vw,3.6rem)] leading-[0.98] font-bold tracking-[-0.045em] text-balance"
          >
            {c.title}
          </h1>
          {c.tagline ? (
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-[#c9d1d8]">{c.tagline}</p>
          ) : null}

          {c.heroImage ? (
            <div className="mt-6 overflow-hidden rounded-[22px] border border-white/[0.08]">
              <img src={c.heroImage} alt="" className="aspect-[16/10] w-full object-cover" />
            </div>
          ) : null}

          {c.prizes.length ? (
            <div className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#ffe48a]">
                <Gift className="size-4" aria-hidden />{" "}
                {c.prizeCount === 1 ? "The prize" : `${c.prizeCount} prizes`}
              </h2>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {c.prizes.map((p) => (
                  <li key={p.id} className={cn(card, "rounded-2xl p-4")}>
                    <div className="font-semibold">
                      {p.quantity > 1 ? `${p.quantity} × ` : ""}
                      {p.title}
                    </div>
                    {p.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                    ) : null}
                    <p className="mt-2 font-mono text-[11px] tracking-wide text-[#8c9aa3]">
                      Approx. value {formatMoney(p.retailValue, c.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-label="Your entry" className="min-w-0 lg:pt-10">
          {c.phase === "upcoming" ? (
            <StateCard icon={Sparkles} title="Opening soon">
              Entries open {longDate(c.startsAt)}. Come back then to enter and start earning points.
            </StateCard>
          ) : c.phase === "ended" ? (
            <StateCard icon={Gift} title="This giveaway has ended">
              Thanks to everyone who entered. Winners are drawn at random and contacted by email.
              {entrant
                ? ` You finished with ${entrant.points} point${entrant.points === 1 ? "" : "s"}.`
                : ""}
            </StateCard>
          ) : entrant?.status === "confirmed" ? (
            <EntrantPanel data={data} entrant={entrant} />
          ) : c.phase === "draft" ? (
            <StateCard icon={Sparkles} title="Not live yet">
              The entry form and tasks appear here once the campaign goes live.
            </StateCard>
          ) : (
            <EntryForm data={data} refCode={refCode} />
          )}
        </section>
      </main>

      <footer className="relative z-10 mx-auto max-w-6xl px-4 pb-10 text-[13px] leading-relaxed text-[#7d8a93] sm:px-8">
        <p>
          No purchase necessary. Open to residents of{" "}
          {c.countries.map((x) => COUNTRY_LABELS[x] ?? x).join(", ")}
          {c.excludedRegions.length
            ? ` (excluding ${c.excludedRegions.map((r) => CA_PROVINCES[r.split("-")[1]] ?? r).join(", ")})`
            : ""}
          , {c.minAge}+.
          {c.endsAt ? ` Ends ${longDate(c.endsAt)}.` : ""} Each point is one ticket in a random
          draw; odds depend on the number of entries and points. Canadian winners must answer a
          skill-testing question. Not sponsored, endorsed or run by Instagram, Meta, TikTok,
          YouTube, X, Discord or Roblox.{" "}
          <Link
            to="/giveaway/$slug/rules"
            params={{ slug: c.slug }}
            className="underline underline-offset-2 hover:text-white"
          >
            Official rules
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(60%_60%_at_80%_0%,rgb(25_175_254/0.18),transparent_70%),radial-gradient(50%_50%_at_10%_20%,rgb(255_55_174/0.12),transparent_70%)]" />
    </div>
  );
}

function StateCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Gift;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(card, "p-6 sm:p-7")}>
      <span className="inline-grid size-12 place-items-center rounded-2xl bg-[#3fe6e0]/10 text-[#3fe6e0] ring-1 ring-[#3fe6e0]/30 ring-inset">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-2xl font-bold tracking-[-0.03em]">{title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[#c9d1d8]">{children}</p>
    </div>
  );
}

/* ── Entry form ──────────────────────────────────────────────────────────── */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | null = null;
    const render = () => {
      if (!ref.current || !window.turnstile || widget) return;
      widget = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [siteKey, onToken]);
  return <div ref={ref} className="min-h-[65px]" />;
}

function EntryForm({ data, refCode }: { data: GiveawayData; refCode?: string }) {
  const { campaign: c } = data;
  const uid = useId();
  const router = useRouter();
  const [email, setEmail] = useState(data.signedInEmail ?? "");
  const [name, setName] = useState("");
  const [country, setCountry] = useState(c.countries[0] ?? "");
  const [region, setRegion] = useState("");
  const [age, setAge] = useState(false);
  const [optIns, setOptIns] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; devLink: string | null } | null>(null);

  const needsRegion = country === "CA";
  const blocked =
    country && (!needsRegion || region) ? eligibilityProblem(c, country, region) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim()) return setError("Enter your email address.");
    if (needsRegion && !region) return setError("Pick your province or territory.");
    if (blocked) return setError(blocked);
    if (!age) return setError(`Confirm you're ${c.minAge} or older to enter.`);
    if (data.turnstileSiteKey && !token)
      return setError("Wait a second for the person check to finish, then try again.");
    setBusy(true);
    try {
      const r = await enterGiveaway({
        data: {
          slug: c.slug,
          email,
          name,
          country,
          region: needsRegion ? region : "",
          ageConfirmed: age,
          optIns,
          ref: refCode ?? null,
          turnstileToken: token,
        },
      });
      if (!r.ok) {
        setError(r.error);
        window.turnstile?.reset();
        return;
      }
      if (r.status === "confirmed") {
        toast.success("You're in! Start earning points below.");
        await router.invalidate();
        return;
      }
      setSent({ email: r.email, devLink: r.devLink });
    } catch {
      setError("We couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <CheckEmail
        slug={c.slug}
        email={sent.email}
        devLink={sent.devLink}
        onBack={() => setSent(null)}
      />
    );

  const label = "mb-1.5 block text-sm font-medium";
  return (
    <form
      onSubmit={submit}
      noValidate
      className={cn(card, "p-5 sm:p-7")}
      aria-describedby={error ? `${uid}-err` : undefined}
    >
      <h2 className="text-2xl font-bold tracking-[-0.03em]">Enter in 30 seconds</h2>
      <p className="mt-1.5 text-[15px] text-[#c9d1d8]">
        We'll email you a link to confirm. Then complete tasks for more points: every point is a
        ticket.
      </p>
      {c.tasks.length ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-[#bff7f4]">
          <Sparkles className="size-3.5" aria-hidden />
          {c.tasks.length} ways to earn up to{" "}
          {c.entryPoints + c.tasks.reduce((s, t) => s + t.points, 0)} points
          {c.referralPoints > 0 ? ", plus more for each friend you invite" : ""}
        </p>
      ) : null}
      {refCode ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f6c344]/10 px-3 py-1 text-[13px] text-[#ffe48a] ring-1 ring-[#f6c344]/30 ring-inset">
          <Users className="size-3.5" aria-hidden /> A friend invited you
        </p>
      ) : null}

      <div className="mt-5 grid gap-4">
        <div>
          <label htmlFor={`${uid}-email`} className={label}>
            Email
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-name`} className={label}>
            First name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id={`${uid}-name`}
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            maxLength={80}
          />
        </div>
        <div className={cn("grid gap-4", needsRegion && "sm:grid-cols-2")}>
          <div>
            <label htmlFor={`${uid}-country`} className={label}>
              Country
            </label>
            <select
              id={`${uid}-country`}
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setRegion("");
              }}
              className={field}
              autoComplete="country"
            >
              {c.countries.map((x) => (
                <option key={x} value={x}>
                  {COUNTRY_LABELS[x] ?? x}
                </option>
              ))}
            </select>
          </div>
          {needsRegion ? (
            <div>
              <label htmlFor={`${uid}-region`} className={label}>
                Province or territory
              </label>
              <select
                id={`${uid}-region`}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className={field}
                aria-invalid={!!blocked}
              >
                <option value="">Choose…</option>
                {Object.entries(CA_PROVINCES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        {blocked ? (
          <p className="text-sm text-amber-200" role="status">
            {blocked}
          </p>
        ) : null}

        <fieldset className="grid gap-3 pt-1">
          <legend className="sr-only">Confirmations</legend>
          <Check2 checked={age} onChange={setAge}>
            I'm {c.minAge} or older. If I'm under the age of majority where I live, I have a
            parent's or guardian's permission. I agree to the{" "}
            <Link
              to="/giveaway/$slug/rules"
              params={{ slug: c.slug }}
              target="_blank"
              className="underline underline-offset-2"
            >
              official rules
            </Link>
            .
          </Check2>
          {c.optIns.map((o) => (
            <Check2
              key={o.id}
              checked={optIns.includes(o.id)}
              onChange={(v) =>
                setOptIns((cur) => (v ? [...cur, o.id] : cur.filter((x) => x !== o.id)))
              }
            >
              {o.label}{" "}
              <span className="text-muted-foreground">(optional, unsubscribe any time)</span>
            </Check2>
          ))}
        </fieldset>

        {data.turnstileSiteKey ? (
          <Turnstile siteKey={data.turnstileSiteKey} onToken={setToken} />
        ) : null}

        {error ? (
          <p
            id={`${uid}-err`}
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3.5 py-3 text-sm text-red-200 ring-1 ring-red-400/30 ring-inset"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className={cn(btnGold, "w-full")}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Ticket aria-hidden />}
          {busy ? "Entering…" : "Enter the giveaway"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          No purchase necessary. One entry per person.
        </p>
      </div>
    </form>
  );
}

function Check2({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-[#c9d1d8]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 accent-[#3fe6e0]"
      />
      <span>{children}</span>
    </label>
  );
}

function CheckEmail({
  slug,
  email,
  devLink,
  onBack,
}: {
  slug: string;
  email: string;
  devLink: string | null;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(devLink);
  async function resend() {
    setBusy(true);
    try {
      const r = await resendGiveawayLink({ data: { slug, email } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Sent again. Check your inbox and spam folder.");
        if (r.devLink) setLink(r.devLink);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cn(card, "p-6 sm:p-7")} role="status" aria-live="polite">
      <span className="inline-grid size-12 place-items-center rounded-2xl bg-[#f6c344]/10 text-[#ffe48a] ring-1 ring-[#f6c344]/35 ring-inset">
        <Mail className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-2xl font-bold tracking-[-0.03em]">Check your inbox</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[#c9d1d8]">
        We sent a link to <b className="text-white">{email}</b>. Tap it to confirm your entry and
        unlock the tasks. It can take a minute; check spam too.
      </p>
      {link ? (
        <a href={link} className={cn(btnTeal, "mt-5 w-full")}>
          Open the link (test mode: no email service yet) <ArrowRight aria-hidden />
        </a>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={resend} disabled={busy} className={btnGhost}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Send it again
        </button>
        <button type="button" onClick={onBack} className={btnGhost}>
          Use a different email
        </button>
      </div>
    </div>
  );
}

/* ── Signed-in entrant ───────────────────────────────────────────────────── */

function EntrantPanel({ data, entrant }: { data: GiveawayData; entrant: EntrantView }) {
  const { campaign: c } = data;
  const done = c.tasks.filter((t) => entrant.tasks[t.id]?.done).length;
  return (
    <div className="grid gap-4">
      <div className={cn(card, "flex items-center justify-between gap-4 p-5 sm:p-6")}>
        <div>
          <div className={eyebrow}>{entrant.name ? `${entrant.name}'s entry` : "Your entry"}</div>
          <p
            className="mt-2 text-[44px] leading-none font-bold tracking-[-0.04em] tabular-nums"
            aria-live="polite"
          >
            {entrant.points}
            <span className="ml-2 text-base font-medium tracking-normal text-[#c9d1d8]">
              point{entrant.points === 1 ? "" : "s"} = {entrant.points} ticket
              {entrant.points === 1 ? "" : "s"}
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {done} of {c.tasks.length} tasks done
            {entrant.referrals
              ? ` · ${entrant.referrals} friend${entrant.referrals === 1 ? "" : "s"} joined`
              : ""}
          </p>
        </div>
        <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#19affe,#ff37ae)] text-white sm:grid">
          <Ticket className="size-7" aria-hidden />
        </span>
      </div>

      <div className={cn(card, "p-2 sm:p-3")}>
        <h2 className="px-3 pt-3 pb-1 text-lg font-bold tracking-[-0.02em]">Earn more points</h2>
        <ul className="divide-y divide-white/[0.06]">
          {c.tasks.map((t) => (
            <TaskRow
              key={t.id}
              slug={c.slug}
              task={t}
              state={entrant.tasks[t.id]}
              discordReady={data.discordReady}
              optInLabel={c.optIns.find((o) => o.id === t.listId)?.label}
            />
          ))}
        </ul>
      </div>

      {c.referralPoints > 0 ? <Referral c={c} entrant={entrant} /> : null}

      <p className="flex items-start gap-2 px-1 text-[13px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#3fe6e0]" aria-hidden />
        Follows can't be checked automatically, so we check the winners' accounts by hand before any
        prize goes out. Points for tasks that weren't really done are removed.
      </p>
    </div>
  );
}

function Referral({ c, entrant }: { c: PublicCampaign; entrant: EntrantView }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: c.title, url: entrant.refUrl });
        return;
      }
      await navigator.clipboard.writeText(entrant.refUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* cancelled */
    }
  }
  const left = Math.max(0, c.referralCap - entrant.referrals);
  return (
    <div className={cn(card, "p-5 sm:p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em]">Invite friends</h2>
          <p className="mt-1 text-sm text-[#c9d1d8]">
            +{c.referralPoints} points for each friend who enters with your link and confirms their
            email{left < c.referralCap ? ` (${left} more can count)` : ` (up to ${c.referralCap})`}.
          </p>
        </div>
        <span className="font-mono text-sm text-[#ffe48a] tabular-nums">
          {entrant.referrals}/{c.referralCap}
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <input
          readOnly
          value={entrant.refUrl}
          aria-label="Your invite link"
          className={cn(field, "font-mono text-[13px]")}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onClick={copy} className={cn(btnTeal, "shrink-0")}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Share"}
        </button>
      </div>
      {entrant.referralsHeld ? (
        <p className="mt-3 text-xs text-amber-200">
          {entrant.referralsHeld} invite{entrant.referralsHeld === 1 ? " is" : "s are"} on hold for
          a quick check (same network or device as you).
        </p>
      ) : null}
    </div>
  );
}

function TaskRow({
  slug,
  task: t,
  state,
  discordReady,
  optInLabel,
}: {
  slug: string;
  task: PublicTask;
  state: EntrantView["tasks"][string] | undefined;
  discordReady: boolean;
  optInLabel?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [opened, setOpened] = useState(false);
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = !!state?.done;

  async function claim(extra: { handle?: string; code?: string } = {}) {
    setBusy(true);
    setError(null);
    try {
      const r = await claimGiveawayTask({ data: { slug, taskId: t.id, ...extra } });
      if (!r.ok) return setError(r.error ?? "That didn't go through. Try again.");
      toast.success(
        r.awarded
          ? `+${r.awarded} point${r.awarded === 1 ? "" : "s"}`
          : "Saved. You've hit the points limit for follows, so this one is extra.",
      );
      await router.invalidate();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function open() {
    void openGiveawayTask({ data: { slug, taskId: t.id } }).catch(() => undefined);
    // let the server stamp the open before "I did it" shows
    setTimeout(() => setOpened(true), 1200);
  }

  const title = t.title || (t.platform ? `Follow on ${PLATFORM_LABELS[t.platform]}` : "Task");
  return (
    <li className="px-3 py-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums ring-1 ring-inset",
            done
              ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"
              : "bg-[#f6c344]/10 text-[#ffe48a] ring-[#f6c344]/30",
          )}
          aria-hidden
        >
          {done ? <Check className="size-4" /> : `+${t.points}`}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold">{title}</h3>
            <span className="sr-only">{done ? "Done." : `${t.points} points.`}</span>
            {t.verified ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#bff7f4]">
                <BadgeCheck className="size-3.5" aria-hidden /> Checked automatically
              </span>
            ) : null}
          </div>
          {t.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
          ) : null}
          {done ? (
            <p className="mt-1 text-sm text-emerald-200">
              Done{state?.handle ? ` as @${state.handle}` : ""}.
            </p>
          ) : (
            <div className="mt-3">
              {t.kind === "follow" || t.kind === "visit" ? (
                <div className="grid gap-2.5">
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={open}
                    className={cn(btnTeal, "w-full sm:w-auto")}
                  >
                    {t.kind === "follow"
                      ? `Open ${t.platform ? PLATFORM_LABELS[t.platform] : "profile"}`
                      : "Open link"}{" "}
                    <ExternalLink aria-hidden />
                  </a>
                  {opened ? (
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void claim(t.kind === "follow" ? { handle } : {});
                      }}
                    >
                      {t.kind === "follow" ? (
                        <>
                          <label htmlFor={`${uid}-h`} className="sr-only">
                            Your {t.platform ? PLATFORM_LABELS[t.platform] : ""} username
                          </label>
                          <input
                            id={`${uid}-h`}
                            value={handle}
                            onChange={(e) => setHandle(e.target.value)}
                            placeholder={`Your ${t.platform ? PLATFORM_LABELS[t.platform] : ""} username`}
                            className={field}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                          />
                        </>
                      ) : null}
                      <button
                        type="submit"
                        disabled={busy}
                        className={cn(btnGold, "min-h-12 shrink-0")}
                      >
                        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} I did it
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Open it, {t.kind === "follow" ? "follow" : "check it out"}, then come back
                      here.
                    </p>
                  )}
                </div>
              ) : t.kind === "newsletter" ? (
                <div className="grid gap-2">
                  <p className="text-sm text-[#c9d1d8]">
                    {optInLabel ?? "Join the mailing list"}. Unsubscribe any time.
                  </p>
                  <button
                    type="button"
                    onClick={() => claim()}
                    disabled={busy}
                    className={cn(btnGold, "w-full sm:w-auto")}
                  >
                    {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}{" "}
                    Yes, sign me up
                  </button>
                </div>
              ) : t.kind === "code" ? (
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void claim({ code });
                  }}
                >
                  {t.codeHint ? <p className="text-sm text-[#c9d1d8]">{t.codeHint}</p> : null}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor={`${uid}-c`} className="sr-only">
                      Code
                    </label>
                    <input
                      id={`${uid}-c`}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Enter code"
                      className={cn(field, "font-mono uppercase")}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      type="submit"
                      disabled={busy || !code.trim()}
                      className={cn(btnGold, "min-h-12 shrink-0")}
                    >
                      {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Submit code
                    </button>
                  </div>
                </form>
              ) : t.kind === "discord" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {t.url ? (
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(btnTeal, "sm:w-auto")}
                    >
                      1. Join the server <ExternalLink aria-hidden />
                    </a>
                  ) : null}
                  {discordReady ? (
                    <a
                      href={`/api/giveaway/discord?slug=${encodeURIComponent(slug)}&task=${encodeURIComponent(t.id)}`}
                      className={cn(btnGold, "sm:w-auto")}
                    >
                      2. Check with Discord
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      The Discord check switches on soon.
                    </p>
                  )}
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="mt-2 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
