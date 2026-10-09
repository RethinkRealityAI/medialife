import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FileText } from "lucide-react";

import { LINK } from "@/components/hub/auth/fields";
import { EYEBROW, HubChrome } from "@/components/hub/auth/shell";
import { HUB } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/terms")({
  head: () => ({
    meta: [
      { title: `Program terms (summary) · ${HUB.name} | MEDIALIFE` },
      {
        name: "description",
        content: "The Activated Merchandise Program terms in plain language.",
      },
    ],
  }),
  component: Terms,
});

const SECTIONS: Array<{ id: string; title: string; body: ReactNode }> = [
  {
    id: "we-do",
    title: "What MEDIALIFE does",
    body: (
      <ul>
        <li>Designs the products with you, from your artwork or your references.</li>
        <li>Produces them, and programs every QR code and NFC tag.</li>
        <li>
          Builds and hosts the experience fans unlock: an AR moment, a 3D model, a video, a game or
          a reward.
        </li>
        <li>Sells, packs and ships orders, and handles customer service and returns.</li>
        <li>Shows you every stage, order and payout in the Creator Hub.</li>
      </ul>
    ),
  },
  {
    id: "you-do",
    title: "What you do",
    body: (
      <ul>
        <li>Send us your artwork, or the references we design from.</li>
        <li>Review and approve designs and samples — or tell us what to change.</li>
        <li>Promote your launches to your audience, in your own voice.</li>
      </ul>
    ),
  },
  {
    id: "approvals",
    title: "Approvals",
    body: (
      <p>
        Nothing is produced without your approval. You see a proof of every design and sign it off
        in the hub before anything is made.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Your IP stays yours",
    body: (
      <p>
        You keep ownership of your name, likeness, characters and artwork. You give MEDIALIFE a
        licence to use them to produce, sell and promote the products during the agreement — and
        only for that.
      </p>
    ),
  },
  {
    id: "revenue",
    title: "Revenue share",
    body: (
      <>
        <p>
          You earn a share of net merchandise revenue: what fans pay for the products, after
          discounts and refunds, and not counting taxes or shipping. Your share is agreed with you
          before production starts.
        </p>
        <p>
          Every order and what you earned from it shows up in the hub as it happens. Earnings are
          paid out after a {HUB.holdDays}-day returns window.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Your data and your fans' privacy",
    body: (
      <p>
        We store your profile and contact details to run the program. Buyers' personal details are
        never shown in the hub — you see orders, products, countries and totals, not names or
        addresses.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Ending the agreement",
    body: (
      <p>
        Either side can end the agreement, with the notice set out in the full agreement. Orders
        already placed are still fulfilled and the earnings from them are still paid. After that, we
        stop producing and selling your products.
      </p>
    ),
  },
];

function Terms() {
  return (
    <HubChrome
      headerRight={
        <Link to="/creator-hub/join" className={`${LINK} text-sm`}>
          Apply to join
        </Link>
      }
    >
      <article className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-8 sm:pt-10">
        <div className={EYEBROW}>{HUB.program}</div>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Program terms <span className="text-muted-foreground">(summary)</span>
        </h1>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/[0.08] px-4 py-3.5 text-sm leading-relaxed">
          <FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <strong className="font-medium">This is a summary.</strong> The full agreement is shared
            with you before anything goes into production.
          </p>
        </div>

        <nav aria-label="On this page" className="mt-8">
          <ol className="flex flex-wrap gap-2">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="mono inline-flex rounded-full border border-border px-3 py-1.5 text-[10px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {String(i + 1).padStart(2, "0")} · {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6" aria-labelledby={`${s.id}-h`}>
              <div className="flex items-baseline gap-3">
                <span className="mono text-[11px] text-primary tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 id={`${s.id}-h`} className="text-xl font-medium tracking-tight">
                  {s.title}
                </h2>
              </div>
              <div className="mt-3 space-y-3 pl-8 text-[15px] leading-relaxed text-muted-foreground [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:top-[0.7em] [&_li]:before:left-0 [&_li]:before:size-1 [&_li]:before:rounded-full [&_li]:before:bg-primary/70 [&_li]:before:content-[''] [&_ul]:space-y-2">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-border bg-white/[0.02] p-5 text-sm leading-relaxed text-muted-foreground">
          Questions about any of this? Write to{" "}
          <a href={`mailto:${HUB.supportEmail}`} className={LINK}>
            {HUB.supportEmail}
          </a>{" "}
          — a real person answers.
        </div>
      </article>
    </HubChrome>
  );
}
