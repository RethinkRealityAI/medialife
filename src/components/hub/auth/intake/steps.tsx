/**
 * The five intake steps. Each is a pure view over the form state; the wizard
 * (src/routes/creator-hub.onboarding.tsx) owns saving, validation and focus.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleCheck, Pencil, Plus, Star, Trash2, Users } from "lucide-react";

import {
  DiscordButton,
  Field,
  FieldError,
  INPUT,
  LINK,
  Notice,
  SELECT,
  TEXTAREA,
  describedBy,
} from "@/components/hub/auth/fields";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTENT_CATEGORIES,
  PLATFORMS,
  PLATFORM_IDS,
  SKUS,
  SKU_IDS,
  compact,
  type Creator,
  type DesignSupport,
  type PlatformId,
  type SkuId,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import {
  COUNTRIES,
  DESIGN_SUPPORT,
  LIMITS,
  STEPS,
  TIMING,
  fid,
  formatAudience,
  newRowKey,
  parseAudience,
  type Errors,
  type IntakeForm,
} from "./model";
import { PlatformIcon } from "./platform-icon";

export type StepProps = {
  form: IntakeForm;
  set: (patch: Partial<IntakeForm>, clear?: string[]) => void;
  errors: Errors;
};

const LEGEND = "text-sm font-medium";
const TZ_HINT = "So we schedule calls at a sensible hour.";
const REGIONS_HINT = "Countries or regions, e.g. US, UK and Canada. Helps us plan shipping.";

/* ---------------------------------------------------------------------------
   Shared bits
   --------------------------------------------------------------------------- */

function Group({
  legend,
  hint,
  optional,
  error,
  errorId,
  children,
  className,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  error?: string;
  errorId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn("min-w-0", className)}
      aria-describedby={error && errorId ? `${errorId}-error` : undefined}
    >
      <legend className="mb-1 flex w-full items-baseline justify-between gap-3">
        <span className={LEGEND}>{legend}</span>
        {optional ? (
          <span className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Optional
          </span>
        ) : null}
      </legend>
      {hint ? <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {!hint ? <div className="mb-3" /> : null}
      {children}
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}

function CountedTextarea({
  id,
  label,
  value,
  onChange,
  max,
  optional,
  hint,
  error,
  placeholder,
  rows = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  rows?: number;
}) {
  const left = max - value.length;
  return (
    <Field
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      labelAside={
        <span
          className={cn(
            "mono text-[10px] tabular-nums",
            left < 40 ? "text-amber-300" : "text-muted-foreground",
          )}
          aria-live={left < 40 ? "polite" : "off"}
        >
          {value.length}/{max}
        </span>
      }
    >
      <Textarea
        value={value}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={TEXTAREA}
        {...describedBy(id, { hint, error })}
      />
    </Field>
  );
}

/** A large selectable card around a native checkbox or radio. */
function ChoiceCard({
  type,
  name,
  checked,
  onChange,
  children,
  className,
  describedById,
}: {
  type: "checkbox" | "radio";
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
  describedById?: string;
}) {
  return (
    <label
      className={cn(
        "group relative block cursor-pointer rounded-xl border bg-white/[0.02] transition-[border-color,background-color,box-shadow]",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked
          ? "border-primary/70 bg-primary/[0.07] shadow-[0_0_40px_-18px_var(--color-primary)]"
          : "border-border hover:border-white/25 hover:bg-white/[0.04]",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
        aria-describedby={describedById}
      />
      <span
        aria-hidden
        className={cn(
          "absolute top-3 right-3 z-10 grid size-6 place-items-center border transition-colors",
          type === "radio" ? "rounded-full" : "rounded-md",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/25 bg-background/60",
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      {children}
    </label>
  );
}

function Chip({
  type,
  name,
  checked,
  onChange,
  children,
}: {
  type: "checkbox" | "radio";
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors select-none",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked
          ? "border-primary/70 bg-primary/12 text-foreground"
          : "border-border text-muted-foreground hover:border-white/25 hover:text-foreground",
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      {checked ? <Check className="size-3.5 text-primary" strokeWidth={3} aria-hidden /> : null}
      {children}
    </label>
  );
}

/* ---------------------------------------------------------------------------
   1 · About you
   --------------------------------------------------------------------------- */

export function StepAbout({ form, set, errors }: StepProps) {
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    try {
      setZones(Intl.supportedValuesOf("timeZone"));
    } catch {
      /* older browsers: free text still works */
    }
  }, []);
  const toggle = (c: string) =>
    set({
      categories: form.categories.includes(c)
        ? form.categories.filter((x) => x !== c)
        : [...form.categories, c],
    });

  const nameHint = "Your channel or brand name — what fans call you.";
  const legalHint = "For contracts and payouts only. Never shown publicly.";

  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id={fid("displayName")}
          label="Creator name"
          hint={nameHint}
          error={errors.displayName}
        >
          <Input
            value={form.displayName}
            maxLength={LIMITS.displayName}
            autoComplete="nickname"
            onChange={(e) => set({ displayName: e.target.value }, ["displayName"])}
            className={INPUT}
            {...describedBy(fid("displayName"), { hint: nameHint, error: errors.displayName })}
          />
        </Field>
        <Field id={fid("legalName")} label="Legal name" optional hint={legalHint}>
          <Input
            value={form.legalName}
            maxLength={LIMITS.legalName}
            autoComplete="name"
            onChange={(e) => set({ legalName: e.target.value })}
            className={INPUT}
            {...describedBy(fid("legalName"), { hint: legalHint })}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={fid("country")} label="Country you're based in" error={errors.country}>
          <select
            value={form.country}
            onChange={(e) => set({ country: e.target.value }, ["country"])}
            className={SELECT}
            autoComplete="country-name"
            {...describedBy(fid("country"), { error: errors.country })}
          >
            <option value="">Choose a country</option>
            {form.country && !COUNTRIES.rest.some((c) => c.name === form.country) ? (
              <option value={form.country}>{form.country}</option>
            ) : null}
            <optgroup label="Common">
              {COUNTRIES.common.map((c) => (
                <option key={`c-${c.code}`} value={c.name}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="All countries">
              {COUNTRIES.rest.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field id={fid("timezone")} label="Time zone" optional hint={TZ_HINT}>
          <Input
            value={form.timezone}
            maxLength={60}
            list={`${fid("timezone")}-list`}
            placeholder="e.g. America/New_York"
            onChange={(e) => set({ timezone: e.target.value })}
            className={INPUT}
            {...describedBy(fid("timezone"), { hint: TZ_HINT })}
          />
          <datalist id={`${fid("timezone")}-list`}>
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
      </div>

      <Group legend="What do you make?" hint="Pick everything that fits." optional>
        <div className="flex flex-wrap gap-2">
          {CONTENT_CATEGORIES.map((c) => (
            <Chip
              key={c}
              type="checkbox"
              name="categories"
              checked={form.categories.includes(c)}
              onChange={() => toggle(c)}
            >
              {c}
            </Chip>
          ))}
        </div>
      </Group>

      <CountedTextarea
        id={fid("bio")}
        label="Short bio"
        optional
        value={form.bio}
        onChange={(v) => set({ bio: v }, ["bio"])}
        max={LIMITS.bio}
        error={errors.bio}
        placeholder="A couple of lines on you, your channel and your community."
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   2 · Channels
   --------------------------------------------------------------------------- */

export function StepChannels({ form, set, errors }: StepProps) {
  const rows = form.channels;
  const update = (key: string, patch: Partial<IntakeForm["channels"][number]>, clear?: string[]) =>
    set({ channels: rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }, clear);
  const add = () => {
    const used = new Set(rows.map((r) => r.platform));
    const next = (
      ["twitch", "tiktok", "x", "instagram", "kick", "discord", "other"] as PlatformId[]
    ).find((p) => !used.has(p));
    const key = newRowKey();
    set({ channels: [...rows, { key, platform: next ?? "other", handle: "", audience: "" }] });
    requestAnimationFrame(() => document.getElementById(fid(`channel.${key}.handle`))?.focus());
  };
  const remove = (key: string, index: number) => {
    const left = rows.filter((r) => r.key !== key);
    set(
      {
        channels: left,
        primaryKey: form.primaryKey === key ? (left[0]?.key ?? "") : form.primaryKey,
      },
      [`channel.${key}.handle`, `channel.${key}.audience`],
    );
    requestAnimationFrame(() => {
      const target = left[Math.max(0, index - 1)];
      document
        .getElementById(target ? fid(`channel.${target.key}.handle`) : "intake-add-channel")
        ?.focus();
    });
  };

  const total = rows.reduce((s, r) => {
    const a = parseAudience(r.audience);
    return s + (typeof a === "number" ? a : 0);
  }, 0);

  return (
    <div className="space-y-7">
      <ol className="space-y-4" aria-label="Your channels">
        {rows.map((row, i) => {
          const handleId = fid(`channel.${row.key}.handle`);
          const audId = fid(`channel.${row.key}.audience`);
          const platformId = fid(`channel.${row.key}.platform`);
          const handleErr = errors[`channel.${row.key}.handle`];
          const audErr = errors[`channel.${row.key}.audience`];
          const isPrimary = form.primaryKey === row.key;
          const p = PLATFORMS[row.platform];
          return (
            <li key={row.key}>
              <fieldset
                className={cn(
                  "rounded-xl border p-4 transition-colors sm:p-5",
                  isPrimary
                    ? "border-primary/45 bg-primary/[0.04]"
                    : "border-border bg-white/[0.02]",
                )}
              >
                <legend className="sr-only">
                  Channel {i + 1}
                  {isPrimary ? " (main channel)" : ""}
                </legend>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
                  <div>
                    <label htmlFor={platformId} className="mb-2 block text-sm font-medium">
                      Platform
                    </label>
                    <Select
                      value={row.platform}
                      onValueChange={(v) => update(row.key, { platform: v as PlatformId })}
                    >
                      <SelectTrigger id={platformId} className={cn(INPUT, "w-full")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATFORM_IDS.map((id) => (
                          <SelectItem key={id} value={id}>
                            <span className="flex items-center gap-2">
                              <PlatformIcon platform={id} />
                              {PLATFORMS[id].label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field id={handleId} label="Handle or link" error={handleErr}>
                    <Input
                      value={row.handle}
                      maxLength={LIMITS.handle}
                      placeholder={p.placeholder}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(e) =>
                        update(row.key, { handle: e.target.value }, [`channel.${row.key}.handle`])
                      }
                      className={INPUT}
                      {...describedBy(handleId, { error: handleErr })}
                    />
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-end">
                  <Field id={audId} label={p.audience} optional error={audErr}>
                    <Input
                      value={row.audience}
                      inputMode="numeric"
                      placeholder="e.g. 25k"
                      maxLength={20}
                      onChange={(e) =>
                        update(row.key, { audience: e.target.value }, [
                          `channel.${row.key}.audience`,
                        ])
                      }
                      onBlur={() => {
                        const n = parseAudience(row.audience);
                        if (typeof n === "number") update(row.key, { audience: formatAudience(n) });
                      }}
                      className={cn(INPUT, "tabular-nums")}
                      {...describedBy(audId, { error: audErr })}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center justify-between gap-3 sm:pb-1">
                    <label
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        isPrimary
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name="primary-channel"
                        checked={isPrimary}
                        onChange={() => set({ primaryKey: row.key })}
                        className="sr-only"
                      />
                      <Star
                        className={cn("size-3.5", isPrimary ? "fill-primary text-primary" : "")}
                        aria-hidden
                      />
                      Main channel
                    </label>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => remove(row.key, i)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Remove
                        <span className="sr-only">
                          {" "}
                          channel {i + 1} ({p.label})
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {rows.length < LIMITS.channels ? (
          <button
            id="intake-add-channel"
            type="button"
            onClick={add}
            className="btn-pill btn-ember-outline mono inline-flex h-11 items-center gap-2 px-5 text-[11px] tracking-[0.16em] uppercase"
          >
            <Plus className="size-4" aria-hidden />
            Add a channel
          </button>
        ) : (
          <span />
        )}
        {total > 0 ? (
          <span className="mono inline-flex items-center gap-2 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            <Users className="size-3.5" aria-hidden />
            Total reach ≈ <span className="text-foreground tabular-nums">{compact(total)}</span>
          </span>
        ) : null}
      </div>

      <Field
        id={fid("audienceRegions")}
        label="Where is most of your audience?"
        optional
        hint={REGIONS_HINT}
      >
        <Input
          value={form.audienceRegions}
          maxLength={LIMITS.audienceRegions}
          placeholder="e.g. US, UK, Canada"
          onChange={(e) => set({ audienceRegions: e.target.value })}
          className={INPUT}
          {...describedBy(fid("audienceRegions"), { hint: REGIONS_HINT })}
        />
      </Field>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   3 · Contact
   --------------------------------------------------------------------------- */

export function StepContact({
  form,
  set,
  errors,
  discordEnabled,
  discordAccount,
  discordLinkHref,
  agency,
}: StepProps & {
  discordEnabled: boolean;
  discordAccount: { username: string } | null;
  discordLinkHref: string;
  agency: Creator["agency"];
}) {
  const userHint = discordAccount
    ? "Filled in from your connected Discord."
    : "Your username, like pixelpete — not your server nickname.";
  return (
    <div className="space-y-8">
      <section aria-labelledby="discord-h" className="space-y-5">
        <div>
          <h3 id="discord-h" className="text-base font-medium">
            Discord
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your manager will message you here about designs, samples and launches.
          </p>
        </div>

        {discordAccount ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-400/35 bg-emerald-400/[0.07] px-4 py-3">
            <CircleCheck className="size-5 shrink-0 text-emerald-300" aria-hidden />
            <p className="min-w-0 text-sm">
              Discord connected as{" "}
              <strong className="font-medium break-all">@{discordAccount.username}</strong>
            </p>
          </div>
        ) : discordEnabled ? (
          <div className="rounded-xl border border-border bg-white/[0.02] p-4">
            <DiscordButton href={discordLinkHref} className="sm:w-auto">
              Connect Discord
            </DiscordButton>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Fastest: we fill in your username and ID for you. Or type them below.
            </p>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id={fid("discordUsername")}
            label="Discord username"
            optional={!!discordAccount}
            hint={userHint}
            error={errors.discordUsername}
          >
            <Input
              value={form.discordUsername}
              maxLength={LIMITS.discordUsername}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="yourname"
              onChange={(e) => set({ discordUsername: e.target.value }, ["discordUsername"])}
              className={INPUT}
              {...describedBy(fid("discordUsername"), {
                hint: userHint,
                error: errors.discordUsername,
              })}
            />
          </Field>
          <Field id={fid("discordId")} label="Discord user ID" optional error={errors.discordId}>
            <Input
              value={form.discordId}
              inputMode="numeric"
              maxLength={22}
              placeholder="e.g. 123456789012345678"
              onChange={(e) =>
                set({ discordId: e.target.value.replace(/[^\d]/g, "") }, ["discordId"])
              }
              className={cn(INPUT, "tabular-nums")}
              {...describedBy(fid("discordId"), { error: errors.discordId })}
            />
          </Field>
        </div>
        <details className="group rounded-lg border border-border bg-white/[0.02] text-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            How do I find my Discord user ID?
            <ChevronDown
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ol className="list-decimal space-y-1.5 px-4 pb-4 pl-9 leading-relaxed text-muted-foreground marker:text-primary">
            <li>
              In Discord, open{" "}
              <strong className="font-medium text-foreground">Settings → Advanced</strong>.
            </li>
            <li>
              Turn on <strong className="font-medium text-foreground">Developer Mode</strong>.
            </li>
            <li>
              Right-click your name (or long-press it on your phone) and choose{" "}
              <strong className="font-medium text-foreground">Copy User ID</strong>.
            </li>
            <li>Paste it here. It's a long number, 17–20 digits.</li>
          </ol>
        </details>
      </section>

      <section aria-labelledby="business-h" className="space-y-5">
        <h3 id="business-h" className="text-base font-medium">
          Business contact
        </h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id={fid("businessEmail")}
            label="Business email"
            optional
            error={errors.businessEmail}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.businessEmail}
              maxLength={254}
              placeholder="business@example.com"
              onChange={(e) => set({ businessEmail: e.target.value }, ["businessEmail"])}
              className={INPUT}
              {...describedBy(fid("businessEmail"), { error: errors.businessEmail })}
            />
          </Field>
          <Field id={fid("phone")} label="Phone" optional>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              maxLength={LIMITS.phone}
              placeholder="+1 555 123 4567"
              onChange={(e) => set({ phone: e.target.value })}
              className={INPUT}
              {...describedBy(fid("phone"), {})}
            />
          </Field>
        </div>
      </section>

      <section aria-labelledby="manager-h" className="space-y-5">
        <div>
          <h3 id="manager-h" className="text-base font-medium">
            Manager or agency
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            If someone else handles your deals, add them and we'll keep them in the loop.
          </p>
        </div>
        {agency ? (
          <Notice>
            Referred by <strong className="font-medium">{agency.name}</strong>
            {agency.rep ? <> ({agency.rep})</> : null}. They'll be kept in the loop either way.
          </Notice>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={fid("managerName")} label="Contact name" optional>
            <Input
              value={form.managerName}
              maxLength={LIMITS.managerName}
              autoComplete="off"
              onChange={(e) => set({ managerName: e.target.value })}
              className={INPUT}
              {...describedBy(fid("managerName"), {})}
            />
          </Field>
          <Field
            id={fid("managerEmail")}
            label="Contact email"
            optional
            error={errors.managerEmail}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={form.managerEmail}
              maxLength={254}
              onChange={(e) => set({ managerEmail: e.target.value }, ["managerEmail"])}
              className={INPUT}
              {...describedBy(fid("managerEmail"), { error: errors.managerEmail })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   4 · Products
   --------------------------------------------------------------------------- */

export function StepProducts({ form, set, errors }: StepProps) {
  const toggleSku = (id: SkuId) =>
    set({ skus: form.skus.includes(id) ? form.skus.filter((s) => s !== id) : [...form.skus, id] }, [
      "skus",
    ]);
  return (
    <div className="space-y-9">
      <Group
        legend="Products"
        hint="Pick one or more. Prices and timings are indicative — we confirm them with you."
        error={errors.skus}
        errorId={fid("skus")}
      >
        <div className="grid gap-3 sm:grid-cols-3" id={fid("skus")} tabIndex={-1}>
          {SKU_IDS.map((id) => {
            const s = SKUS[id];
            const on = form.skus.includes(id);
            return (
              <ChoiceCard
                key={id}
                type="checkbox"
                name="skus"
                checked={on}
                onChange={() => toggleSku(id)}
                className="overflow-hidden"
              >
                <span className="flex gap-4 p-3 sm:flex-col sm:gap-0 sm:p-0">
                  <span
                    className="relative grid aspect-square w-24 shrink-0 place-items-center overflow-hidden rounded-lg sm:w-full sm:rounded-none"
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 40%, oklch(0.3 0.12 260 / 55%), transparent 70%)",
                    }}
                  >
                    <img
                      src={s.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        "size-full object-cover transition-transform duration-300",
                        on ? "scale-[1.04]" : "group-hover:scale-[1.02]",
                      )}
                    />
                  </span>
                  <span className="block min-w-0 sm:p-4 sm:pt-3">
                    <span className="block pr-8 text-base font-medium sm:pr-0">{s.name}</span>
                    <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                      {s.pitch}
                    </span>
                    <span className="mono mt-3 block text-[10px] leading-relaxed tracking-[0.08em] text-muted-foreground uppercase">
                      {s.trigger}
                    </span>
                    <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="tabular-nums">
                        ${s.priceBand[0]}–{s.priceBand[1]}
                        <span className="text-muted-foreground"> · indicative</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.leadWeeks} weeks
                      </span>
                    </span>
                  </span>
                </span>
              </ChoiceCard>
            );
          })}
        </div>
      </Group>

      <Group legend="Design support" hint="How ready is your artwork?">
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(DESIGN_SUPPORT) as DesignSupport[]).map((k) => (
            <ChoiceCard
              key={k}
              type="radio"
              name="designSupport"
              checked={form.designSupport === k}
              onChange={() => set({ designSupport: k })}
            >
              <span className="block p-4 pr-11">
                <span className="block text-sm font-medium">{DESIGN_SUPPORT[k].label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {DESIGN_SUPPORT[k].blurb}
                </span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <Group legend="When would you like your first drop on sale?">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TIMING) as Array<keyof typeof TIMING>).map((k) => (
            <Chip
              key={k}
              type="radio"
              name="timing"
              checked={form.timing === k}
              onChange={() => set({ timing: k })}
            >
              {TIMING[k]}
            </Chip>
          ))}
        </div>
      </Group>

      <Group legend="Do you sell merch already?">
        <div className="flex flex-wrap gap-2">
          <Chip
            type="radio"
            name="hasMerch"
            checked={form.hasExistingMerch}
            onChange={() => set({ hasExistingMerch: true })}
          >
            Yes
          </Chip>
          <Chip
            type="radio"
            name="hasMerch"
            checked={!form.hasExistingMerch}
            onChange={() => set({ hasExistingMerch: false })}
          >
            Not yet
          </Chip>
        </div>
        {form.hasExistingMerch ? (
          <Field
            id={fid("existingMerchUrl")}
            label="Where can we see it?"
            optional
            className="mt-4"
          >
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={form.existingMerchUrl}
              maxLength={LIMITS.existingMerchUrl}
              placeholder="https://yourstore.com"
              onChange={(e) => set({ existingMerchUrl: e.target.value })}
              className={INPUT}
              {...describedBy(fid("existingMerchUrl"), {})}
            />
          </Field>
        ) : null}
      </Group>

      <CountedTextarea
        id={fid("experienceIdeas")}
        label="What should scanning unlock?"
        optional
        hint="A rough idea is plenty. We'll shape it with you."
        value={form.experienceIdeas}
        onChange={(v) => set({ experienceIdeas: v })}
        max={LIMITS.experienceIdeas}
        placeholder="e.g. Scan the tee to play a 60-second parkour run as my character — top scores get a shout-out on stream."
      />

      <CountedTextarea
        id={fid("notes")}
        label="Anything else we should know?"
        optional
        value={form.notes}
        onChange={(v) => set({ notes: v })}
        max={LIMITS.notes}
        rows={3}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   5 · Review
   --------------------------------------------------------------------------- */

function ReviewSection({
  title,
  step,
  onEdit,
  rows,
}: {
  title: string;
  step: number;
  onEdit: (step: number) => void;
  rows: Array<[string, ReactNode]>;
}) {
  return (
    <section
      aria-labelledby={`review-${step}`}
      className="rounded-xl border border-border bg-white/[0.02]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h3 id={`review-${step}`} className="flex items-center gap-2.5 text-sm font-medium">
          <span className="mono text-[10px] text-primary tabular-nums">0{step + 1}</span>
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Pencil className="size-3" aria-hidden />
          Edit<span className="sr-only"> {title}</span>
        </button>
      </div>
      <dl className="divide-y divide-border/70 px-4 sm:px-5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
            <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase sm:pt-0.5">
              {k}
            </dt>
            <dd className="min-w-0 text-sm break-words whitespace-pre-line">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const dash = <span className="text-muted-foreground">—</span>;
const orDash = (s: string) => (s.trim() ? s.trim() : dash);

export function StepReview({
  form,
  email,
  discordAccount,
  onEdit,
  gaps,
  needsTerms,
  terms,
  setTerms,
  termsError,
}: {
  form: IntakeForm;
  email: string;
  discordAccount: { username: string } | null;
  onEdit: (step: number) => void;
  gaps: string[];
  needsTerms: boolean;
  terms: boolean;
  setTerms: (v: boolean) => void;
  termsError?: string;
}) {
  const channels = form.channels.filter((r) => r.handle.trim());
  // Terms are handled by the checkbox below, so don't list them as a gap too.
  const shownGaps = gaps.filter((g) => !/terms/i.test(g));
  const termsId = fid("terms");

  return (
    <div className="space-y-4">
      {shownGaps.length ? (
        <Notice tone="warn">
          <p className="font-medium">A few things are still missing:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {shownGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <ReviewSection
        title={STEPS[0].label}
        step={0}
        onEdit={onEdit}
        rows={[
          ["Creator name", orDash(form.displayName)],
          ["Legal name", orDash(form.legalName)],
          ["Email", email],
          ["Based in", orDash([form.country, form.timezone].filter(Boolean).join(" · "))],
          ["Content", form.categories.length ? form.categories.join(", ") : dash],
          ["Bio", orDash(form.bio)],
        ]}
      />
      <ReviewSection
        title={STEPS[1].label}
        step={1}
        onEdit={onEdit}
        rows={[
          [
            "Channels",
            channels.length ? (
              <ul className="space-y-1.5">
                {channels.map((r) => {
                  const a = parseAudience(r.audience);
                  return (
                    <li key={r.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <PlatformIcon platform={r.platform} />
                      <span className="text-muted-foreground">{PLATFORMS[r.platform].label}</span>
                      <span className="break-all">{r.handle.trim()}</span>
                      {typeof a === "number" ? (
                        <span className="mono text-[11px] text-muted-foreground tabular-nums">
                          {compact(a)} {PLATFORMS[r.platform].audience.toLowerCase()}
                        </span>
                      ) : null}
                      {r.key === form.primaryKey ? (
                        <span className="mono rounded-full border border-primary/45 bg-primary/10 px-2 py-0.5 text-[9px] tracking-[0.12em] text-primary uppercase">
                          Main
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              dash
            ),
          ],
          ["Audience mostly in", orDash(form.audienceRegions)],
        ]}
      />
      <ReviewSection
        title={STEPS[2].label}
        step={2}
        onEdit={onEdit}
        rows={[
          [
            "Discord",
            discordAccount ? (
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck className="size-3.5 text-emerald-300" aria-hidden />@
                {discordAccount.username} <span className="text-muted-foreground">(connected)</span>
              </span>
            ) : (
              orDash(
                [
                  form.discordUsername.trim(),
                  form.discordId.trim() && `ID ${form.discordId.trim()}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )
            ),
          ],
          ["Business email", orDash(form.businessEmail)],
          ["Phone", orDash(form.phone)],
          [
            "Manager",
            orDash([form.managerName.trim(), form.managerEmail.trim()].filter(Boolean).join(" · ")),
          ],
        ]}
      />
      <ReviewSection
        title={STEPS[3].label}
        step={3}
        onEdit={onEdit}
        rows={[
          ["Products", form.skus.length ? form.skus.map((s) => SKUS[s].name).join(", ") : dash],
          ["Design support", DESIGN_SUPPORT[form.designSupport].label],
          ["Timing", TIMING[form.timing]],
          [
            "Existing merch",
            form.hasExistingMerch
              ? form.existingMerchUrl.trim()
                ? `Yes · ${form.existingMerchUrl.trim()}`
                : "Yes"
              : "Not yet",
          ],
          ["Scanning unlocks", orDash(form.experienceIdeas)],
          ["Anything else", orDash(form.notes)],
        ]}
      />

      {needsTerms ? (
        <div className="rounded-xl border border-border bg-white/[0.02] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={terms}
              onCheckedChange={(v) => setTerms(v === true)}
              className="mt-0.5 size-5 rounded-[5px]"
              {...describedBy(termsId, { error: termsError })}
            />
            <label htmlFor={termsId} className="text-sm leading-snug">
              I agree to the{" "}
              <a href="/creator-hub/terms" target="_blank" rel="noreferrer" className={LINK}>
                program terms
              </a>
            </label>
          </div>
          <div className="pl-8">
            <FieldError id={termsId}>{termsError}</FieldError>
          </div>
        </div>
      ) : null}
    </div>
  );
}
