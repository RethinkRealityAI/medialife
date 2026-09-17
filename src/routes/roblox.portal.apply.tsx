import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink } from "lucide-react";

import { PageHeader, Panel, Pill, Section } from "@/components/portal/kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roblox/portal/apply")({
  component: Apply,
});

type Field = {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  /** One line under the label, for a field whose reason is not obvious. */
  hint?: string;
  /** Renders as a chip group rather than an input. */
  options?: readonly string[];
  textarea?: boolean;
};

type Step = { id: string; label: string; title: string; hint: string; fields: Field[] };

/**
 * The intake, and the only way into the program.
 *
 * It covers the proposal's documented questions plus the three the onboarding
 * flow needs — artwork readiness, where the art lives, and how the creator sells
 * today — because those three set the timeline. Three steps so a creator is
 * never looking at more than a handful of fields, but it is one form and one
 * standard, which is what makes review consistent and reporting possible.
 */
const STEPS: Step[] = [
  {
    id: "property",
    label: "Property",
    title: "Tell us about your experience.",
    hint: "Enough to see whether it is a fit. We look at audience scale, IP clarity and which product categories suit the world.",
    fields: [
      {
        name: "experience",
        label: "Game / experience name",
        required: true,
        placeholder: "The name players know it by",
      },
      {
        name: "url",
        label: "Roblox experience link",
        required: true,
        type: "url",
        placeholder: "https://www.roblox.com/games/…",
      },
      {
        name: "studio",
        label: "Creator / studio name",
        required: true,
        placeholder: "Who owns it",
      },
      {
        name: "genre",
        label: "Genre",
        placeholder: "Horror, simulator, roleplay…",
        options: [
          "Simulator",
          "Roleplay",
          "Obby",
          "Tycoon",
          "Horror / survival",
          "Fighting",
          "Racing",
          "Other",
        ],
      },
      {
        name: "othergames",
        label: "Other games you would want this for",
        textarea: true,
        placeholder: "Names or links, one per line. Leave blank if it is just this one.",
      },
    ],
  },
  {
    id: "audience",
    label: "Audience",
    title: "Who plays it?",
    hint: "Scale tells us how much inventory to commit. Who they are decides the assortment — a 9-to-12 audience and an 18-plus audience do not buy the same product, and they are not in the same countries.",
    fields: [
      { name: "visits", label: "Total visits", placeholder: "Lifetime. Approximate is fine." },
      { name: "dau", label: "Daily active users", placeholder: "Approximate is fine" },
      { name: "ccu", label: "Average concurrent players", placeholder: "Approximate is fine" },
      { name: "ccupeak", label: "Peak concurrent players", placeholder: "Your best day" },
      {
        name: "agerange",
        label: "Age range",
        hint: "Sets which product categories are appropriate, and which are not.",
        options: ["Under 9", "9–12", "13–16", "17–20", "21+", "Mixed / not sure"],
      },
      {
        name: "regions",
        label: "Top regions",
        hint: "Drives where we manufacture and which retail conversations are worth having.",
        placeholder: "U.S., U.K., Brazil…",
      },
      {
        name: "gender",
        label: "Gender split, if you know it",
        options: ["Mostly male", "Mostly female", "Roughly even", "Not sure"],
      },
      {
        name: "brandwork",
        label: "Have you done brand work before?",
        hint: "No is a perfectly good answer. It only changes how much we walk you through.",
        options: ["No", "Yes", "In talks with someone now"],
      },
    ],
  },
  {
    id: "rights",
    label: "IP & assets",
    title: "Who owns it, and what do you have?",
    hint: "The two things that set the timeline. Nothing here disqualifies you — it tells us how much of the creative we build with you.",
    fields: [
      {
        name: "ownership",
        label: "IP ownership",
        required: true,
        options: [
          "I own it outright",
          "My studio owns it",
          "Shared with collaborators",
          "Licensed from someone else",
        ],
      },
      {
        name: "assets",
        label: "Artwork readiness",
        options: [
          "Print-ready files",
          "Logo and key art only",
          "In-game assets only",
          "Nothing yet",
        ],
      },
      {
        name: "artlinks",
        label: "Key art and character references",
        type: "url",
        placeholder: "Drive, Dropbox, Figma or a public folder…",
      },
      {
        name: "merch",
        label: "Existing merchandise",
        options: [
          "None yet",
          "Sold in the past",
          "Selling now, small run",
          "Selling now, at scale",
        ],
      },
      {
        name: "commerce",
        label: "How you sell today",
        options: [
          "Roblox only",
          "Roblox + my own store",
          "Third-party merch platform",
          "Not selling anything yet",
        ],
      },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    title: "How do we reach you?",
    hint: "A named specialist picks this up within 48 hours and replies either way.",
    fields: [
      { name: "name", label: "Your name", required: true, placeholder: "" },
      { name: "email", label: "Email", required: true, type: "email", placeholder: "" },
      { name: "roblox", label: "Roblox username", placeholder: "" },
      { name: "discord", label: "Discord", placeholder: "" },
      {
        name: "notes",
        label: "Anything we should know?",
        textarea: true,
        placeholder:
          "Characters you want on product, a moment you want to hit, existing licensing…",
      },
    ],
  },
];

function Apply() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const current = STEPS[step];

  if (done) {
    return (
      <>
        <PageHeader eyebrow="Program / Apply" title="Application received." />
        <Section>
          <Panel className="max-w-2xl p-6" glow>
            <Pill tone="clear">
              <Check className="size-3" aria-hidden />
              Submitted
            </Pill>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              In the live program this routes into intake and a named specialist acknowledges it
              within 48 hours, with qualification inside two days and a scoping call by day five. In
              this demo nothing was sent — the portal is populated with mock data.
            </p>
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setStep(0);
              }}
              className="mono mt-5 inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
            >
              Run it again <ArrowRight className="size-3" aria-hidden />
            </button>
          </Panel>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Program / Apply"
        title="One intake form. Every channel."
        lede="However a creator found the program, this is the way in — which is what makes review consistent and reporting possible. Four steps, about four minutes, and nothing here is a test."
        actions={
          <a
            href="/roblox/creators/"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary"
          >
            What the program is <ExternalLink className="size-3.5" aria-hidden />
          </a>
        }
      />

      <Section>
        <Panel className="max-w-3xl overflow-hidden">
          {/* Step rail */}
          <ol className="flex border-b border-border">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex-1">
                <div
                  className={cn(
                    "border-b-2 px-4 py-3",
                    i === step
                      ? "border-primary"
                      : i < step
                        ? "border-emerald-400/60"
                        : "border-transparent",
                  )}
                >
                  <div className="mono flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase">
                    {i < step ? (
                      <Check className="size-3 text-emerald-400" aria-hidden />
                    ) : (
                      <span className={i === step ? "text-primary" : "text-muted-foreground"}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    )}
                    <span className={i === step ? "text-foreground" : "text-muted-foreground"}>
                      {s.label}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <form
            className="p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (step < STEPS.length - 1) setStep(step + 1);
              else setDone(true);
            }}
          >
            <h2 className="text-lg font-medium tracking-tight">{current.title}</h2>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{current.hint}</p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {current.fields.map((f) => {
                const id = `${current.id}-${f.name}`;
                const wide = f.textarea || f.options || f.type === "url";
                return (
                  <div key={f.name} className={cn("min-w-0", wide && "sm:col-span-2")}>
                    <Label htmlFor={id} className="mb-1 block text-xs">
                      {f.label}
                      {f.required ? <span className="ml-1 text-accent">*</span> : null}
                    </Label>
                    {f.hint ? (
                      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                        {f.hint}
                      </p>
                    ) : (
                      <div className="mb-2" />
                    )}

                    {f.options ? (
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={id}>
                        <span id={id} className="sr-only">
                          {f.label}
                        </span>
                        {f.options.map((o) => (
                          <Chip key={o} name={f.name} label={o} />
                        ))}
                      </div>
                    ) : f.textarea ? (
                      <Textarea id={id} name={f.name} rows={4} placeholder={f.placeholder} />
                    ) : (
                      <Input
                        id={id}
                        name={f.name}
                        type={f.type ?? "text"}
                        required={f.required ?? false}
                        placeholder={f.placeholder}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => setStep(Math.max(0, step - 1))}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-primary",
                  step === 0 && "invisible",
                )}
              >
                <ArrowLeft className="size-4" aria-hidden /> Back
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
                style={{ background: "var(--gradient-ember-btn)" }}
              >
                {step === STEPS.length - 1 ? "Submit application" : "Continue"}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </form>
        </Panel>
      </Section>
    </>
  );
}

/** A single-select chip. Local state only — this form does not post anywhere. */
function Chip({ name, label }: { name: string; label: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      name={name}
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs transition-colors",
        on
          ? "border-primary/55 bg-primary/12 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
