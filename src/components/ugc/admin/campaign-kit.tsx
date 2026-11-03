import { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  AtSign,
  CalendarClock,
  Check,
  Circle,
  Clapperboard,
  Hash,
  Megaphone,
  Package,
  Plus,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { daysLeft, type UgcAspect, type UgcAssetView } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { fromDateInput } from "./ui";

// The brief builder's editors (lists, the shot list) and the creator-eye preview.

export type ShotDraft = { key: string; id?: string; label: string; required: boolean; tip: string };

export type BriefDraft = {
  title: string;
  drop: string;
  summary: string;
  deadline: string;
  preferredAspect: UgcAspect;
  items: string[];
  keyMessages: string[];
  dos: string[];
  donts: string[];
  hashtags: string[];
  mentions: string[];
  shots: ShotDraft[];
  howTo: { title: string; steps: string[]; exampleAssetId: string | null } | null;
  disclosure: string;
};

let seq = 0;
export const shotKey = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A list of one-line entries: type, Enter for the next, × to remove. */
export function ListEditor({
  id,
  value,
  onChange,
  placeholder,
  addLabel = "Add",
  max = 30,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  max?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const focus = (i: number) =>
    requestAnimationFrame(() => box.current?.querySelectorAll("input")[i]?.focus());
  const rows = value.length ? value : [""];
  return (
    <div ref={box} className="space-y-1.5">
      {rows.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            id={i === 0 ? id : undefined}
            aria-label={i === 0 ? undefined : `${placeholder ?? "Item"} ${i + 1}`}
            value={v}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...rows];
              next[i] = e.target.value;
              onChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (rows.length < max && v.trim()) {
                  const next = [...rows];
                  next.splice(i + 1, 0, "");
                  onChange(next);
                  focus(i + 1);
                }
              } else if (e.key === "Backspace" && !v && rows.length > 1) {
                e.preventDefault();
                onChange(rows.filter((_, k) => k !== i));
                focus(Math.max(0, i - 1));
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            aria-label={`Remove ${v || "row"}`}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
            disabled={rows.length === 1 && !v}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      {rows.length < max ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-sky-300 hover:bg-white/[0.06] hover:text-sky-200"
          onClick={() => {
            onChange([...rows, ""]);
            focus(rows.length);
          }}
        >
          <Plus aria-hidden />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** The shot list: label, tip, required, reorder. */
export function ShotsEditor({
  value,
  onChange,
}: {
  value: ShotDraft[];
  onChange: (v: ShotDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<ShotDraft>) =>
    onChange(value.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2.5">
      {value.length ? (
        <ol className="space-y-2.5">
          {value.map((s, i) => (
            <li
              key={s.key}
              className="rounded-xl border border-white/[0.07] bg-black/25 p-3"
              data-testid="shot-row"
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] font-semibold text-white/70 tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    aria-label={`Shot ${i + 1}`}
                    value={s.label}
                    onChange={(e) => set(i, { label: e.target.value })}
                    placeholder="The scan reveal"
                    className="font-medium"
                  />
                  <Input
                    aria-label={`Tip for shot ${i + 1}`}
                    value={s.tip}
                    onChange={(e) => set(i, { tip: e.target.value })}
                    placeholder="Tip (optional): phone in frame, keychain in the other hand"
                    className="h-8 text-xs"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`shot-req-${s.key}`}
                        checked={s.required}
                        onCheckedChange={(v) => set(i, { required: v })}
                      />
                      <Label htmlFor={`shot-req-${s.key}`} className="text-xs font-normal">
                        {s.required ? "Required" : "Optional"}
                      </Label>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:bg-white/[0.06]"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move shot ${i + 1} up`}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:bg-white/[0.06]"
                        onClick={() => move(i, 1)}
                        disabled={i === value.length - 1}
                        aria-label={`Move shot ${i + 1} down`}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:bg-red-400/10 hover:text-red-200"
                        onClick={() => onChange(value.filter((_, k) => k !== i))}
                        aria-label={`Remove shot ${i + 1}`}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          No shots yet. Creators tick these off as they film, and say which ones each upload covers.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="bg-transparent hover:bg-white/[0.06]"
        onClick={() =>
          onChange([...value, { key: shotKey(), label: "", required: value.length === 0, tip: "" }])
        }
        disabled={value.length >= 40}
      >
        <Plus aria-hidden />
        Add shot
      </Button>
    </div>
  );
}

/* ── Preview ──────────────────────────────────────────────────────────────── */

const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

/** Roughly how the brief reads on a creator's phone (/ugc-hub/brief). */
export function BriefPreview({
  draft,
  cover,
  example,
  version,
}: {
  draft: BriefDraft;
  cover: UgcAssetView | null;
  example: UgcAssetView | null;
  version: number;
}) {
  const left = daysLeft(fromDateInput(draft.deadline));
  const messages = clean(draft.keyMessages);
  const dos = clean(draft.dos);
  const donts = clean(draft.donts);
  const tags = [...clean(draft.hashtags), ...clean(draft.mentions)];
  const shots = draft.shots.filter((s) => s.label.trim());
  const items = clean(draft.items);
  const steps = clean(draft.howTo?.steps ?? []);
  return (
    <div
      className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-white/[0.12] bg-[oklch(0.09_0.008_280)] shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)]"
      data-testid="brief-preview"
    >
      <div className="relative aspect-[16/10] bg-[linear-gradient(135deg,oklch(0.35_0.15_330),oklch(0.25_0.12_250))]">
        {cover?.isImage ? (
          <img src={cover.url} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,oklch(0.09_0.008_280))]" />
        <div className="absolute inset-x-4 bottom-3">
          {draft.drop.trim() ? (
            <div className="text-[10px] font-semibold tracking-[0.16em] text-amber-300 uppercase">
              {draft.drop}
            </div>
          ) : null}
          <h3 className="text-xl leading-tight font-semibold tracking-tight text-balance">
            {draft.title.trim() || "Untitled campaign"}
          </h3>
        </div>
      </div>
      <div className="space-y-5 px-4 pt-2 pb-6 text-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          {left != null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-100 ring-1 ring-amber-400/30">
              <CalendarClock className="size-3.5" aria-hidden />
              {left > 1
                ? `${left} days left`
                : left === 1
                  ? "Due tomorrow"
                  : left === 0
                    ? "Due today"
                    : "Deadline passed"}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-white/75 ring-1 ring-white/[0.1]">
            Film {draft.preferredAspect === "other" ? "any shape" : draft.preferredAspect}
          </span>
          {version ? (
            <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2.5 py-1 text-white/60 ring-1 ring-white/[0.1]">
              v{version}
            </span>
          ) : null}
        </div>
        {draft.summary.trim() ? (
          <p className="leading-relaxed text-white/80">{draft.summary}</p>
        ) : null}

        {messages.length ? (
          <PreviewSection icon={Megaphone} title="Key messages">
            <ol className="space-y-2">
              {messages.map((m, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--partner)_25%,transparent)] text-[10px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="leading-snug">{m}</span>
                </li>
              ))}
            </ol>
          </PreviewSection>
        ) : null}

        {dos.length || donts.length ? (
          <div className="grid gap-2.5">
            {dos.length ? (
              <div className="rounded-2xl bg-emerald-400/[0.07] p-3 ring-1 ring-emerald-400/20">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <ThumbsUp className="size-3.5" aria-hidden /> Do
                </div>
                <ul className="space-y-1 text-[13px] leading-snug text-white/85">
                  {dos.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {donts.length ? (
              <div className="rounded-2xl bg-red-400/[0.07] p-3 ring-1 ring-red-400/20">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-200">
                  <ThumbsDown className="size-3.5" aria-hidden /> Don't
                </div>
                <ul className="space-y-1 text-[13px] leading-snug text-white/85">
                  {donts.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {tags.length ? (
          <PreviewSection icon={Hash} title="Tag these (tap to copy)">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-1 text-xs ring-1 ring-white/[0.1]"
                >
                  {t.startsWith("@") ? <AtSign className="size-3" aria-hidden /> : null}
                  {t.replace(/^@/, "")}
                </span>
              ))}
            </div>
          </PreviewSection>
        ) : null}

        {shots.length ? (
          <PreviewSection icon={Clapperboard} title="Shot list">
            <ul className="space-y-2">
              {shots.map((s) => (
                <li
                  key={s.key}
                  className="flex gap-2.5 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]"
                >
                  <Circle className="mt-0.5 size-4 shrink-0 text-white/40" aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium">{s.label}</span>
                    {s.required ? (
                      <span className="ml-1.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
                        Required
                      </span>
                    ) : null}
                    {s.tip.trim() ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{s.tip}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </PreviewSection>
        ) : null}

        {draft.howTo && (draft.howTo.title.trim() || steps.length) ? (
          <div className="rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--partner)_16%,transparent),color-mix(in_oklab,var(--partner-2)_12%,transparent))] p-3.5 ring-1 ring-[color-mix(in_oklab,var(--partner)_30%,transparent)]">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--partner)] uppercase">
              Pinned
            </div>
            <div className="mt-0.5 font-semibold">{draft.howTo.title || "How to film it"}</div>
            {steps.length ? (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[13px] text-white/85">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            ) : null}
            {example?.isVideo ? (
              <video
                src={example.url}
                controls
                playsInline
                preload="metadata"
                className="mt-3 aspect-[9/16] max-h-72 w-full rounded-xl bg-black object-contain"
              />
            ) : null}
          </div>
        ) : null}

        {items.length ? (
          <PreviewSection icon={Package} title="In your package">
            <ul className="space-y-1">
              {items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" aria-hidden />
                  {it}
                </li>
              ))}
            </ul>
          </PreviewSection>
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-3 text-[13px] leading-relaxed">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-100">
            <ShieldCheck className="size-3.5" aria-hidden /> Disclosure
          </div>
          {draft.disclosure}
        </div>
      </div>
    </div>
  );
}

function PreviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Megaphone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4
        className={cn(
          "mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-white/60 uppercase",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h4>
      {children}
    </section>
  );
}
