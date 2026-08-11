import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Deploy AR with MediaLife.AI" },
      {
        name: "description",
        content:
          "Start an AR deployment. Live events, merchandise, print, direct mail. Global rollouts in weeks.",
      },
      { property: "og:title", content: "Contact — MediaLife.AI" },
      {
        property: "og:description",
        content: "Tell us about your IP. We'll scope an AR deployment.",
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
    <section className="relative min-h-[80vh] overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
      <div className="relative mx-auto max-w-[1400px] px-6 py-24 grid md:grid-cols-12 gap-12">
        <div className="md:col-span-5">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            / Contact
          </div>
          <h1 className="mt-6 text-5xl md:text-6xl font-medium tracking-tight text-balance leading-[0.95]">
            Are you ready for <span className="ember-text">augmented reality?</span>
          </h1>
          <p className="mt-8 text-muted-foreground max-w-md">
            Live Events · Merchandise · Print Media · Direct Mail. Tell us about your IP — we'll
            scope a deployment in 48 hours.
          </p>

          <div className="mt-12 space-y-4 mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <div className="flex justify-between border-b border-border pb-3">
              <span>Region · NA</span>
              <span className="text-accent">● Available</span>
            </div>
            <div className="flex justify-between border-b border-border pb-3">
              <span>Region · EU</span>
              <span className="text-accent">● Available</span>
            </div>
            <div className="flex justify-between border-b border-border pb-3">
              <span>Region · APAC</span>
              <span className="text-accent">● Available</span>
            </div>
            <div className="flex justify-between border-b border-border pb-3">
              <span>Region · LATAM</span>
              <span className="text-primary">○ Q2 2026</span>
            </div>
          </div>
        </div>

        <div className="md:col-span-7">
          <form
            name={FORM_NAME}
            method="POST"
            data-netlify="true"
            netlify-honeypot="bot-field"
            onSubmit={handleSubmit}
            className="border border-border bg-background/60 backdrop-blur p-8 md:p-10 space-y-6"
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
                <div className="mono text-[10px] uppercase tracking-[0.25em] text-accent">
                  / Transmission received
                </div>
                <h2 className="mt-4 text-3xl font-medium">We'll be in touch within 48 hours.</h2>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="mt-8 mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground underline underline-offset-4 hover:text-primary transition"
                >
                  Send another
                </button>
              </div>
            ) : (
              <>
                <Field label="Company" name="company" autoComplete="organization" />
                <Field label="Contact Email" name="email" type="email" autoComplete="email" />
                <div className="grid md:grid-cols-2 gap-6">
                  <Select
                    label="Deployment Region"
                    name="region"
                    opts={["Asia", "Europe", "North America", "South America"]}
                  />
                  <Select
                    label="Deployment Duration"
                    name="duration"
                    opts={["Less than a month", "1–3 months", "More than 3 months"]}
                  />
                </div>
                <Field label="IP / Brand" name="brand" />
                <TextArea label="Tell us about the activation" name="msg" />

                {status === "error" && (
                  <div
                    role="alert"
                    className="border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
                  className="btn-pill btn-ember w-full justify-center py-4 mono text-xs uppercase tracking-[0.25em] font-medium disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:transform-none"
                >
                  {status === "submitting" ? "Transmitting…" : "Initiate Deployment →"}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

const labelCls = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2 block";
const controlCls =
  "w-full bg-input border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition";

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
