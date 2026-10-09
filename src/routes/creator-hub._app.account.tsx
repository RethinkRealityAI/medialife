import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
  BadgeCheck,
  ChevronDown,
  LogOut,
  MailWarning,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  ChannelEditor,
  fromDrafts,
  toDrafts,
  type ChannelDraft,
} from "@/components/hub/app/channel-editor";
import { Page, PageHeader, Panel, Pill } from "@/components/hub/app/ui";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { changePassword, resendVerification, signOut } from "@/lib/hub/auth.functions";
import { getAccount, getMyCreator, saveProfile } from "@/lib/hub/creator.functions";
import { CONTENT_CATEGORIES, CREATOR_STATUS, HUB, type Creator } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/account")({
  validateSearch: z.object({
    discord: z.string().max(40).optional().catch(undefined),
    error: z.string().max(40).optional().catch(undefined),
  }),
  loader: async () => {
    const [me, account] = await Promise.all([getMyCreator(), getAccount()]);
    return { creator: me.creator, account };
  },
  head: () => ({ meta: [{ title: "Account · Creator Hub | MEDIALIFE" }] }),
  component: Account,
});

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "channels", label: "Channels" },
  { id: "contact", label: "Contact" },
  { id: "shipping", label: "Shipping" },
  { id: "payout", label: "Payout" },
  { id: "security", label: "Security" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DISCORD_RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Discord connected — your ID is saved" },
  "discord-taken": {
    ok: false,
    text: "That Discord account is linked to another Creator Hub account",
  },
  "discord-denied": { ok: false, text: "Discord connection cancelled" },
  "discord-failed": { ok: false, text: "Couldn't connect Discord. Try again." },
};

/** Runs a save with a pending flag, a toast and a loader refresh. */
function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await router.invalidate();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg && !msg.startsWith("[") && msg.length < 160
          ? msg
          : "Couldn't save. Check the fields and try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Card({
  id,
  title,
  description,
  children,
  onSubmit,
  busy,
  saveLabel = "Save",
  footer,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  busy?: boolean;
  saveLabel?: string;
  footer?: ReactNode;
}) {
  const body = (
    <>
      <div className="p-5 sm:p-6">
        <h2 id={`${id}-title`} className="text-lg font-medium tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-5">{children}</div>
      </div>
      {onSubmit || footer ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3 sm:px-6">
          {footer}
          {onSubmit ? (
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : saveLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <Panel>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate>
            {body}
          </form>
        ) : (
          body
        )}
      </Panel>
    </section>
  );
}

function Account() {
  const { creator, account } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Back from "Connect Discord": say how it went, then drop the params.
  useEffect(() => {
    const key = search.discord === "connected" ? "connected" : search.error;
    if (!key) return;
    const r = DISCORD_RESULT[key];
    if (r) (r.ok ? toast.success : toast.error)(r.text);
    void navigate({ search: {}, replace: true, resetScroll: false });
  }, [search.discord, search.error, navigate]);

  const status = CREATOR_STATUS[creator.status];

  return (
    <Page>
      <PageHeader
        title="Account"
        description="Your profile, how we reach you, where we send samples and how you get paid."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            {creator.agency ? <Pill tone="muted">Via {creator.agency.name}</Pill> : null}
          </div>
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-8 @5xl/inset:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Account sections"
          className="@5xl/inset:sticky @5xl/inset:top-24 @5xl/inset:self-start"
        >
          <ul className="-mx-3 flex flex-wrap gap-x-1 @5xl/inset:mx-0 @5xl/inset:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <ProfileCard creator={creator} />
          <ChannelsCard creator={creator} />
          <ContactCard creator={creator} account={account} />
          <ShippingCard creator={creator} />
          <PayoutCard creator={creator} />
          <SecurityCard account={account} />
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="text-sm">
              <div className="font-medium">Sign out</div>
              <p className="text-muted-foreground">Signs you out on this device.</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                window.location.assign("/creator-hub/sign-in");
              }}
            >
              <LogOut aria-hidden /> Sign out
            </Button>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Sections
   --------------------------------------------------------------------------- */

function ProfileCard({ creator }: { creator: Creator }) {
  const { busy, run } = useSave();
  const [p, setP] = useState(creator.profile);
  const [tzs, setTzs] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTzs(Intl.supportedValuesOf("timeZone"));
    } catch {
      /* older browsers: free text only */
    }
  }, []);
  const set = (patch: Partial<Creator["profile"]>) => setP((x) => ({ ...x, ...patch }));

  return (
    <Card
      id="profile"
      title="Profile"
      description="How you appear to the team."
      busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (!p.displayName.trim()) return setErr("Add the name your fans know you by.");
        setErr(null);
        void run(
          () =>
            saveProfile({
              data: {
                profile: {
                  displayName: p.displayName,
                  legalName: p.legalName,
                  country: p.country,
                  timezone: p.timezone,
                  categories: p.categories,
                  bio: p.bio,
                },
              },
            }),
          "Profile saved",
        );
      }}
    >
      <div className="grid grid-cols-1 gap-4 @2xl/inset:grid-cols-2">
        <Field id="displayName" label="Creator name" error={err}>
          <Input
            id="displayName"
            value={p.displayName}
            maxLength={80}
            onChange={(e) => set({ displayName: e.target.value })}
            aria-invalid={!!err}
            aria-describedby={err ? "displayName-error" : undefined}
            autoComplete="nickname"
          />
        </Field>
        <Field
          id="legalName"
          label="Legal name"
          hint="For your agreement and payouts. Never shown publicly."
        >
          <Input
            id="legalName"
            value={p.legalName}
            maxLength={120}
            onChange={(e) => set({ legalName: e.target.value })}
            autoComplete="name"
            aria-describedby="legalName-hint"
          />
        </Field>
        <Field id="country" label="Country">
          <Input
            id="country"
            value={p.country}
            maxLength={60}
            onChange={(e) => set({ country: e.target.value })}
            autoComplete="country-name"
          />
        </Field>
        <Field id="timezone" label="Time zone" hint="So we book calls at sensible times.">
          <Input
            id="timezone"
            list="tz-list"
            value={p.timezone}
            maxLength={60}
            onChange={(e) => set({ timezone: e.target.value })}
            placeholder="e.g. America/Toronto"
            aria-describedby="timezone-hint"
          />
          <datalist id="tz-list">
            {tzs.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>
      <fieldset className="mt-5">
        <legend className="text-sm font-medium">What you make</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONTENT_CATEGORIES.map((c) => {
            const on = p.categories.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set({
                    categories: on ? p.categories.filter((x) => x !== c) : [...p.categories, c],
                  })
                }
                className={cn(
                  "h-8 rounded-full border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on
                    ? "border-primary/50 bg-primary/12 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {on ? <span aria-hidden>✓ </span> : null}
                {c}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Field id="bio" label="About you" hint={`${p.bio.length} / 600`} className="mt-5">
        <Textarea
          id="bio"
          value={p.bio}
          maxLength={600}
          rows={4}
          onChange={(e) => set({ bio: e.target.value })}
          aria-describedby="bio-hint"
        />
      </Field>
    </Card>
  );
}

function ChannelsCard({ creator }: { creator: Creator }) {
  const { busy, run } = useSave();
  const [rows, setRows] = useState<ChannelDraft[]>(() => toDrafts(creator.channels));
  return (
    <Card
      id="channels"
      title="Channels"
      description="Where you publish. Your main channel is the one we lead with."
      busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveProfile({ data: { channels: fromDrafts(rows) } }), "Channels saved");
      }}
    >
      <ChannelEditor value={rows} onChange={setRows} />
    </Card>
  );
}

function ContactCard({
  creator,
  account,
}: {
  creator: Creator;
  account: Awaited<ReturnType<typeof getAccount>>;
}) {
  const { busy, run } = useSave();
  const [c, setC] = useState(creator.contact);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Creator["contact"]>) => setC((x) => ({ ...x, ...patch }));

  return (
    <Card
      id="contact"
      title="Contact"
      description="How the team reaches you day to day."
      busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (c.discordId.trim() && !/^\d{15,22}$/.test(c.discordId.trim()))
          next.discordId = "A Discord user ID is 17–20 digits.";
        if (c.businessEmail.trim() && !EMAIL.test(c.businessEmail.trim()))
          next.businessEmail = "Enter a valid email.";
        if (c.managerEmail.trim() && !EMAIL.test(c.managerEmail.trim()))
          next.managerEmail = "Enter a valid email.";
        setErrors(next);
        if (Object.keys(next).length) return;
        void run(() => saveProfile({ data: { contact: c } }), "Contact details saved");
      }}
    >
      {account.discord ? (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-emerald-400/35 bg-emerald-400/[0.06] p-3 text-sm">
          {account.discord.avatar ? (
            <img src={account.discord.avatar} alt="" className="size-8 rounded-full" />
          ) : (
            <MessageCircle className="size-5 text-emerald-300" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="font-medium">Discord connected</div>
            <div className="truncate text-muted-foreground">
              {account.discord.username} · ID {account.discord.id}
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 @2xl/inset:grid-cols-2">
        <Field id="discordUsername" label="Discord username">
          <Input
            id="discordUsername"
            value={c.discordUsername}
            maxLength={40}
            onChange={(e) => set({ discordUsername: e.target.value })}
            placeholder="yourname"
          />
        </Field>
        <Field id="discordId" label="Discord user ID" error={errors.discordId}>
          <Input
            id="discordId"
            inputMode="numeric"
            value={c.discordId}
            maxLength={22}
            onChange={(e) => set({ discordId: e.target.value.trim() })}
            aria-invalid={!!errors.discordId}
            aria-describedby={errors.discordId ? "discordId-error" : undefined}
            placeholder="17–20 digits"
          />
        </Field>
      </div>
      <Collapsible className="mt-2">
        <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          How to find your Discord ID
          <ChevronDown
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>In Discord, open User Settings → Advanced and turn on Developer Mode.</li>
            <li>Click your avatar (or long-press it on mobile) and choose “Copy User ID”.</li>
            <li>Paste it here. It's a long number, not your username.</li>
          </ol>
          {account.discordEnabled && !account.discord ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Or connect Discord under Security and we'll fill it in for you.
            </p>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      <div className="mt-5 grid grid-cols-1 gap-4 @2xl/inset:grid-cols-2">
        <Field
          id="businessEmail"
          label="Business email"
          error={errors.businessEmail}
          hint="Optional, if it's different from your sign-in email."
        >
          <Input
            id="businessEmail"
            type="email"
            value={c.businessEmail}
            onChange={(e) => set({ businessEmail: e.target.value })}
            aria-invalid={!!errors.businessEmail}
            aria-describedby={errors.businessEmail ? "businessEmail-error" : "businessEmail-hint"}
            autoComplete="email"
          />
        </Field>
        <Field id="phone" label="Phone" hint="Optional.">
          <Input
            id="phone"
            type="tel"
            value={c.phone}
            maxLength={40}
            onChange={(e) => set({ phone: e.target.value })}
            autoComplete="tel"
            aria-describedby="phone-hint"
          />
        </Field>
        <Field
          id="managerName"
          label="Your manager or agency contact"
          hint="If someone handles deals for you."
        >
          <Input
            id="managerName"
            value={c.managerName}
            maxLength={80}
            onChange={(e) => set({ managerName: e.target.value })}
            aria-describedby="managerName-hint"
          />
        </Field>
        <Field id="managerEmail" label="Their email" error={errors.managerEmail}>
          <Input
            id="managerEmail"
            type="email"
            value={c.managerEmail}
            onChange={(e) => set({ managerEmail: e.target.value })}
            aria-invalid={!!errors.managerEmail}
            aria-describedby={errors.managerEmail ? "managerEmail-error" : undefined}
          />
        </Field>
      </div>
    </Card>
  );
}

const EMPTY_ADDRESS = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

function ShippingCard({ creator }: { creator: Creator }) {
  const { busy, run } = useSave();
  const [a, setA] = useState(creator.shipping ?? EMPTY_ADDRESS);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<typeof a>) => setA((x) => ({ ...x, ...patch }));
  const fields: Array<[keyof typeof a, string, string, string?]> = [
    ["name", "Full name", "name"],
    ["line1", "Address", "address-line1"],
    ["line2", "Apartment, suite (optional)", "address-line2"],
    ["city", "City", "address-level2"],
    ["region", "State / province", "address-level1"],
    ["postalCode", "Postal code", "postal-code"],
    ["country", "Country", "country-name"],
  ];
  return (
    <Card
      id="shipping"
      title="Shipping address"
      description="Where we send your product samples. Only the production team sees it."
      busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        const filled = Object.values(a).some((v) => v.trim());
        if (filled && (!a.name.trim() || !a.line1.trim() || !a.city.trim() || !a.country.trim())) {
          return setErr("Add at least a name, address, city and country.");
        }
        setErr(null);
        void run(
          () => saveProfile({ data: { shipping: filled ? a : null } }),
          "Shipping address saved",
        );
      }}
    >
      <div className="grid grid-cols-1 gap-4 @2xl/inset:grid-cols-2">
        {fields.map(([k, label, auto]) => (
          <Field
            key={k}
            id={`ship-${k}`}
            label={label}
            className={k === "line1" || k === "line2" ? "@2xl/inset:col-span-2" : undefined}
          >
            <Input
              id={`ship-${k}`}
              value={a[k]}
              maxLength={k === "postalCode" ? 20 : 200}
              onChange={(e) => set({ [k]: e.target.value })}
              autoComplete={`shipping ${auto}`}
            />
          </Field>
        ))}
      </div>
      {err ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {err}
        </p>
      ) : null}
    </Card>
  );
}

function PayoutCard({ creator }: { creator: Creator }) {
  const { busy, run } = useSave();
  const [p, setP] = useState(creator.payout ?? { method: "paypal" as const, email: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const methods = [
    { id: "paypal", label: "PayPal" },
    { id: "wise", label: "Wise" },
    { id: "other", label: "Other" },
  ] as const;
  return (
    <Card
      id="payout"
      title="Payout"
      description="How you get paid. We pay monthly once your available balance is ready."
      busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (!EMAIL.test(p.email.trim()))
          return setErr("Enter the email of your PayPal or Wise account.");
        setErr(null);
        void run(
          () =>
            saveProfile({
              data: { payout: { method: p.method, email: p.email.trim(), note: p.note } },
            }),
          "Payout details saved",
        );
      }}
    >
      <div className="mb-5 flex gap-3 rounded-lg border border-border bg-white/[0.03] p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">We never ask for bank passwords;</span>{" "}
          payouts are sent to this address.
        </p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Method</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-sm">
          {methods.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                p.method === m.id
                  ? "border-primary/60 bg-primary/12 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="payout-method"
                value={m.id}
                checked={p.method === m.id}
                onChange={() => setP((x) => ({ ...x, method: m.id }))}
                className="sr-only"
              />
              {p.method === m.id ? (
                <BadgeCheck className="size-4 text-primary" aria-hidden />
              ) : null}
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 grid grid-cols-1 gap-4 @2xl/inset:grid-cols-2">
        <Field
          id="payout-email"
          label={
            p.method === "other"
              ? "Payment email"
              : `${p.method === "paypal" ? "PayPal" : "Wise"} email`
          }
          error={err}
        >
          <Input
            id="payout-email"
            type="email"
            value={p.email}
            onChange={(e) => setP((x) => ({ ...x, email: e.target.value }))}
            aria-invalid={!!err}
            aria-describedby={err ? "payout-email-error" : undefined}
            autoComplete="email"
          />
        </Field>
        <Field
          id="payout-note"
          label="Note for our finance team"
          hint="Optional, e.g. the currency you'd like."
        >
          <Input
            id="payout-note"
            value={p.note}
            maxLength={300}
            onChange={(e) => setP((x) => ({ ...x, note: e.target.value }))}
            aria-describedby="payout-note-hint"
          />
        </Field>
      </div>
    </Card>
  );
}

function SecurityCard({ account }: { account: Awaited<ReturnType<typeof getAccount>> }) {
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  async function resend() {
    setSending(true);
    try {
      const r = await resendVerification();
      if (!r.ok) toast.error(r.error);
      else if (r.already) toast.success("Your email is already confirmed.");
      else {
        toast.success("Sent. Check your inbox (and spam) for the link.");
        if (r.devLink) toast.message("Dev: verification link", { description: r.devLink });
      }
    } catch {
      toast.error("Couldn't send the email. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (account.hasPassword && !current) errs.current = "Enter your current password.";
    if (next.length < 10) errs.next = "Use at least 10 characters.";
    if (next !== confirm) errs.confirm = "The passwords don't match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await changePassword({
        data: { current: account.hasPassword ? current : undefined, next },
      });
      if (!r.ok) {
        setErrors(r.field === "current" ? { current: r.error } : { next: r.error });
        return;
      }
      toast.success(
        account.hasPassword ? "Password changed. Other devices were signed out." : "Password set",
      );
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      toast.error("Couldn't change your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="security"
      title="Security"
      description="Your sign-in email, password and connected accounts."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="text-muted-foreground">Sign-in email</div>
            <div className="truncate font-medium">{account.email}</div>
          </div>
          {account.emailVerified ? (
            <Pill tone="live" icon={BadgeCheck}>
              Confirmed
            </Pill>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="watch" icon={MailWarning}>
                Not confirmed
              </Pill>
              <Button variant="outline" size="sm" onClick={resend} disabled={sending}>
                {sending ? "Sending…" : "Resend link"}
              </Button>
            </div>
          )}
        </div>

        <form onSubmit={submit} noValidate className="border-t border-border pt-5">
          <h3 className="text-sm font-medium">
            {account.hasPassword ? "Change password" : "Set a password"}
          </h3>
          {!account.hasPassword ? (
            <p className="mt-1 text-sm text-muted-foreground">
              You sign in with Discord. Add a password to sign in with your email too.
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-4 @2xl/inset:grid-cols-3">
            {account.hasPassword ? (
              <Field id="pw-current" label="Current password" error={errors.current}>
                <Input
                  id="pw-current"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  aria-invalid={!!errors.current}
                  aria-describedby={errors.current ? "pw-current-error" : undefined}
                />
              </Field>
            ) : null}
            <Field
              id="pw-next"
              label="New password"
              error={errors.next}
              hint="At least 10 characters."
            >
              <Input
                id="pw-next"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                aria-invalid={!!errors.next}
                aria-describedby={errors.next ? "pw-next-error" : "pw-next-hint"}
              />
            </Field>
            <Field id="pw-confirm" label="Repeat new password" error={errors.confirm}>
              <Input
                id="pw-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                aria-describedby={errors.confirm ? "pw-confirm-error" : undefined}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? "Saving…" : account.hasPassword ? "Change password" : "Set password"}
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div className="text-sm">
            <div className="font-medium">Discord</div>
            <p className="text-muted-foreground">
              {account.discord
                ? `Connected as ${account.discord.username}. You can sign in with Discord.`
                : account.discordEnabled
                  ? "Connect to sign in with Discord and share your ID with the team in one step."
                  : "Discord sign-in isn't available yet. Add your username and ID under Contact."}
            </p>
          </div>
          {account.discord ? (
            <Pill tone="live" icon={BadgeCheck}>
              Connected
            </Pill>
          ) : account.discordEnabled ? (
            <Button asChild variant="outline">
              <a href="/api/hub/auth/discord?mode=link&next=/creator-hub/account">
                <MessageCircle aria-hidden /> Connect Discord
              </a>
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Something wrong with your account? Write to{" "}
          <a
            href={`mailto:${HUB.supportEmail}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {HUB.supportEmail}
          </a>
          .
        </p>
      </div>
    </Card>
  );
}
