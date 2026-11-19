import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Reveal } from "@/components/home/Reveal";
import { CARD, Eyebrow, H1, SECTION, TEXT } from "@/components/site/kit";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact | MEDIALIFE" },
      {
        name: "description",
        content:
          "Activate your IP with MEDIALIFE: activated merch, AR experiences and retail fixtures. We reply within 48 hours.",
      },
      { property: "og:title", content: "Activate Your IP | MEDIALIFE" },
      {
        property: "og:description",
        content: "Tell us about your IP. We reply within 48 hours.",
      },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/contact" }],
  }),
  component: Contact,
});

const FORM_NAME = "deployment-inquiry";

type Status = "idle" | "submitting" | "sent" | "error";

function Contact() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");

    const form = e.currentTarget;
    const data = new FormData(form);
    data.set("form-name", FORM_NAME);

    try {
      // POST to the static form declaration, not "/". On an SSR site "/" is
      // handled by the server function and never reaches Netlify's form handler.
      const res = await fetch("/__forms.html", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data as unknown as Record<string, string>).toString(),
      });
      if (!res.ok) throw new Error(`Submission failed: ${res.status}`);
      setStatus("sent");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] max-w-[160vw] -translate-x-1/2 rounded-full bg-primary opacity-30 blur-[120px]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-25" />
      <div className={`${SECTION} grid gap-12 pb-24 pt-16 sm:pt-20 lg:grid-cols-12 lg:gap-16`}>
        <Reveal className="lg:col-span-5">
          <Eyebrow hue="blue">Contact</Eyebrow>
          <h1 className={`mt-6 ${H1}`}>
            Let's activate <span className={TEXT.blue}>your IP.</span>
          </h1>
          <p className="mt-6 max-w-md text-muted-foreground lg:text-lg">
            Tell us about the IP and where fans will meet it. We reply within 48 hours.
          </p>

          <ol className="mt-10 grid gap-3" aria-label="What happens next">
            {NEXT.map((n, i) => (
              <li key={n} className={`${CARD} flex items-center gap-4 px-5 py-4`}>
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 mono text-[11px] ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-white/85">{n}</span>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-sm text-muted-foreground">
            Prefer email?{" "}
            <a
              href="mailto:hello@medialife.ai"
              className="text-white underline underline-offset-4 hover:text-primary"
            >
              hello@medialife.ai
            </a>
          </p>
        </Reveal>

        <Reveal delay={120} className="lg:col-span-7">
          <form
            name={FORM_NAME}
            method="POST"
            data-netlify="true"
            netlify-honeypot="bot-field"
            onSubmit={handleSubmit}
            className={`${CARD} space-y-6 p-6 sm:p-8 md:p-10`}
          >
            <input type="hidden" name="form-name" value={FORM_NAME} />
            {/* Honeypot: hidden from humans, irresistible to bots. */}
            <p className="hidden" aria-hidden="true">
              <label>
                Leave this field empty
                <input name="bot-field" tabIndex={-1} autoComplete="off" />
              </label>
            </p>

            {status === "sent" ? (
              <div className="py-16 text-center" role="status" aria-live="polite">
                <Eyebrow hue="magenta">Got it</Eyebrow>
                <h2 className="mt-5 display text-[clamp(26px,2.6vw,38px)]">
                  We'll be in touch within 48 hours.
                </h2>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="btn-pill btn-glass mt-8 px-6 py-3 text-sm font-medium"
                >
                  Send another
                </button>
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className={labelCls}>What are you thinking about?</legend>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((o, i) => (
                      <label key={o} className="cursor-pointer">
                        <input
                          type="radio"
                          name="interest"
                          value={o}
                          defaultChecked={i === 0}
                          className="peer sr-only"
                        />
                        <span className="inline-block rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition peer-checked:border-primary peer-checked:bg-primary/15 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60 hover:border-white/30">
                          {o}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-6 md:grid-cols-2">
                  <Field label="Company" name="company" autoComplete="organization" />
                  <Field label="Email" name="email" type="email" autoComplete="email" />
                </div>
                <Field label="IP or brand" name="brand" />
                <div className="grid gap-6 md:grid-cols-2">
                  <Select
                    label="Where"
                    name="region"
                    opts={["North America", "Europe", "Asia", "South America"]}
                  />
                  <Select
                    label="How long"
                    name="duration"
                    opts={["Less than a month", "1 to 3 months", "More than 3 months"]}
                  />
                </div>
                <TextArea label="Tell us about it" name="msg" />

                {status === "error" && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    That didn't send. Please try again, or email{" "}
                    <a href="mailto:hello@medialife.ai" className="underline underline-offset-4">
                      hello@medialife.ai
                    </a>{" "}
                    directly.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="group btn-pill btn-solid w-full justify-center py-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "submitting" ? "Sending…" : "Send"}
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </button>
              </>
            )}
          </form>
        </Reveal>
      </div>
    </section>
  );
}

const NEXT = [
  "We read it and reply within 48 hours.",
  "A short call to shape the idea with you.",
  "A plan: the products, the experience and the launch.",
];
const INTERESTS = ["Activated merch", "An AR experience", "A retail fixture", "Something else"];

const labelCls = "mb-2 block mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground";
const controlCls =
  "w-full rounded-2xl border border-white/12 bg-black/40 px-4 py-3 text-sm text-white transition focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Field({
  label,
  name,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className={controlCls}
      />
    </div>
  );
}

function TextArea({ label, name }: { label: string; name: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <textarea id={id} name={name} rows={4} className={controlCls} />
    </div>
  );
}

function Select({ label, name, opts }: { label: string; name: string; opts: string[] }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <select id={id} name={name} required defaultValue="" className={controlCls}>
        <option value="" disabled>
          Select…
        </option>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
