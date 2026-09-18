import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Mail, MessageSquare, Phone } from "lucide-react";

import { PageHeader, Panel, Pill, Section } from "@/components/portal/kit";
import { ACTIVE } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/support")({
  component: Support,
});

/**
 * Every property gets a named specialist on the account, which is the whole
 * point of the support screen: a creator should never be writing to a queue.
 */
const CHANNELS = [
  {
    id: "specialist",
    icon: MessageSquare,
    title: "Your program specialist",
    body: "A named person on the account from the day it is acknowledged. First response inside one working day.",
    action: "Open a thread",
    href: "#",
  },
  {
    id: "email",
    icon: Mail,
    title: "Program email",
    body: "For anything that needs a paper trail — licensing, approvals, invoicing.",
    action: "creators@medialife.ai",
    href: "mailto:creators@medialife.ai",
  },
  {
    id: "call",
    icon: Phone,
    title: "Scoping and review calls",
    body: "Scheduled around the milestones: the scoping call in week one and the program review at day 90.",
    action: "Request a time",
    href: "#",
  },
];

const FAQ = [
  {
    q: "What does it cost me?",
    a: "Nothing up front. MEDIALIFE funds product development, sampling, production, inventory, the immersive build and fulfilment, and carries the inventory risk. You approve the creative and earn a royalty as it sells.",
  },
  {
    q: "I do not have print-ready artwork.",
    a: "Most creators do not. Our design team builds the assortment artwork with you from your characters, your logo and your in-game look. It affects the timeline, not whether you qualify.",
  },
  {
    q: "I already sell merch. Do I start over?",
    a: "No. The activation layer goes onto the products you already sell — the chip, the experience and the reward — without a redesign or new inventory. It works with your current manufacturer and store.",
  },
  {
    q: "Who owns the IP?",
    a: "You do, throughout. The program licenses the right to make and sell activated product for a defined scope and term, set in your program agreement. Every product and experience goes to you for written approval before production.",
  },
  {
    q: "What happens at the 90-day review?",
    a: "Roblox, you and MEDIALIFE read the commercial and engagement data together and decide what happens next: reorders, a wider assortment, or a move into retail. The gates are set before the window opens.",
  },
];

function Support() {
  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Support"
        actions={<Pill tone="active">{ACTIVE.property} · Active</Pill>}
      />

      <Section>
        <div className="grid gap-3 md:grid-cols-3">
          {CHANNELS.map((c) => (
            <Panel key={c.id} className="flex flex-col p-5">
              <span className="grid size-9 place-items-center rounded-md border border-border bg-surface text-primary">
                <c.icon className="size-4" aria-hidden />
              </span>
              <h2 className="mt-3.5 text-base font-medium tracking-tight">{c.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              <a
                href={c.href}
                className="mono mt-4 inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
              >
                {c.action}
                {c.href.startsWith("mailto:") ? (
                  <ExternalLink className="size-3" aria-hidden />
                ) : null}
              </a>
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="Common questions" className="border-t border-border">
        <div className="divide-y divide-border">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {f.q}
                <span
                  aria-hidden
                  className="mono shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
