import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Printer, X } from "lucide-react";

import { CopyButton, Page, PageHeader, Panel } from "@/components/hub/app/ui";
import {
  inviteFor,
  programUrl,
  shelfUrl,
  usePartnerWorkspace,
} from "@/components/partner/workspace";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOURNEY } from "@/lib/hub/partners";
import {
  DISCORD_SETUP,
  DONTS,
  DOORS,
  DOS,
  FAQ,
  FIT,
  PITCH,
  TEMPLATES,
  TIMELINE,
  fillCopy,
} from "@/lib/hub/playbook";

export const Route = createFileRoute("/partner-hub/_app/playbook")({
  head: () => ({ meta: [{ title: "Playbook · Partner Hub | MEDIALIFE" }] }),
  component: Playbook,
});

const TOC = [
  ["pitch", "The pitch"],
  ["steps", "The five steps"],
  ["fit", "Who's a fit"],
  ["doors", "Three doors, one link"],
  ["discord", "Your Discord"],
  ["templates", "Message templates"],
  ["timeline", "Timeline"],
  ["faq", "Questions creators ask"],
  ["rules", "Do's and don'ts"],
] as const;

function Playbook() {
  const ws = usePartnerWorkspace();
  const [rep, setRep] = useState(ws.me.name);
  const [creator, setCreator] = useState("");
  const invite = inviteFor(ws, rep);
  const vars = {
    partner: ws.partner.name,
    link: programUrl(ws, invite),
    shelf: shelfUrl(ws, invite, creator.trim()),
    rep: rep.trim(),
    name: creator.trim(),
  };

  return (
    <Page className="lg:pt-8 print:pt-0">
      <PageHeader
        title="Playbook"
        description={`How ${ws.partner.name} brings creators into activated merch: what to say, who to talk to, where, and what happens next. Timelines are typical and may change; each creator's real dates are in Creators.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer aria-hidden /> Print or save as PDF
          </Button>
        }
      />

      <nav aria-label="On this page" className="mt-5 -mx-4 overflow-x-auto px-4 print:hidden">
        <ol className="flex w-max gap-1.5">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Block id="pitch" title="The pitch">
        <Panel className="p-5">
          <p className="text-lg font-medium text-balance">“{PITCH.oneLine}”</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{PITCH.thirty}</p>
          <div className="mt-3 print:hidden">
            <CopyButton value={PITCH.thirty} label="Copy the 30-second version" size="sm" />
          </div>
        </Panel>
        <ul className="mt-4 grid gap-2 @2xl/inset:grid-cols-2">
          {PITCH.why.map((w) => (
            <li key={w} className="flex gap-2 rounded-xl border border-border p-3 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--partner)]" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      </Block>

      <Block id="steps" title="The five steps, as you'd explain them">
        <ol className="grid gap-2 @3xl/inset:grid-cols-5">
          {JOURNEY.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-white/[0.02] p-4">
              <span className="grid size-7 place-items-center rounded-full bg-[var(--partner)] text-sm font-semibold text-background">
                {s.n}
              </span>
              <h3 className="mt-3 font-medium">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <p className="mt-2 text-xs text-[var(--partner)]">{s.time}</p>
            </li>
          ))}
        </ol>
      </Block>

      <Block
        id="fit"
        title="Who's a fit"
        lede="Most creators with a community that shows up are a fit. Look for:"
      >
        <ul className="grid gap-2 @2xl/inset:grid-cols-2">
          {FIT.map((f) => (
            <li key={f} className="flex gap-2 rounded-xl border border-border p-3 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--partner)]" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </Block>

      <Block
        id="doors"
        title="Three doors, one link"
        lede="However a creator hears about it, they end up at the same place: your program page, then the Creator Hub application. One process, one standard of review, and every sign-up credited to you."
      >
        <ol className="grid gap-3 @3xl/inset:grid-cols-3">
          {DOORS.map((d, i) => (
            <li key={d.id} className="rounded-xl border border-border bg-white/[0.02] p-4">
              <div className="text-xs font-medium tracking-wide text-[var(--partner)] uppercase">
                Door {i + 1} · {d.channel}
              </div>
              <h3 className="mt-1 font-medium">{d.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-xl bg-gradient-to-r from-[var(--partner)]/25 to-transparent p-4 text-sm">
          Every door ends at{" "}
          <span className="font-mono">{vars.link.replace(/^https?:\/\//, "")}</span>
        </div>
      </Block>

      <Block
        id="discord"
        title="Your Discord"
        lede="Where your creators already talk. A small, tidy set of channels does most of the explaining for you. The banner and graphics are in Collateral."
      >
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {DISCORD_SETUP.map((c) => (
            <li key={c.name} className="grid gap-1 p-3 text-sm @xl/inset:grid-cols-[10rem_1fr]">
              <span className="font-mono text-[var(--partner)]">{c.name}</span>
              <span className="text-muted-foreground">{c.purpose}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        id="templates"
        title="Message templates"
        lede="Filled in with your links. Add your name and the creator's, then copy. Rewrite freely: they work best in your own voice."
      >
        <div className="grid gap-3 @xl/inset:grid-cols-2 print:hidden">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Your name</span>
            <Input value={rep} onChange={(e) => setRep(e.target.value)} maxLength={80} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Creator's name</span>
            <Input
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              placeholder="Puts their name on the 3D shop too"
              maxLength={28}
            />
          </label>
        </div>
        <ul className="mt-4 grid gap-3 @3xl/inset:grid-cols-2">
          {TEMPLATES.map((t) => {
            const body = fillCopy(t.body, vars);
            return (
              <li key={t.id}>
                <Panel className="flex h-full flex-col p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-medium">{t.label}</h3>
                    <span className="text-xs text-muted-foreground">{t.channel}</span>
                  </div>
                  <pre className="mt-3 flex-1 font-sans text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {body}
                  </pre>
                  <div className="mt-3 print:hidden">
                    <CopyButton value={body} label="Copy" size="sm" />
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      </Block>

      <Block
        id="timeline"
        title="Timeline"
        lede="Typical, from the day a creator applies. It moves faster or slower with the products; the hub always shows each creator's real dates."
      >
        <ol className="relative space-y-3 border-l border-border pl-5">
          {TIMELINE.map((t) => (
            <li key={t.title} className="relative">
              <span
                className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-[var(--partner)]"
                aria-hidden
              />
              <div className="text-xs font-medium text-[var(--partner)]">{t.when}</div>
              <div className="font-medium">{t.title}</div>
              <p className="text-sm text-muted-foreground">{t.body}</p>
            </li>
          ))}
        </ol>
      </Block>

      <Block id="faq" title="Questions creators ask">
        <Accordion type="multiple" className="rounded-xl border border-border px-4">
          {FAQ.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Block>

      <Block id="rules" title="Do's and don'ts">
        <div className="grid gap-3 @2xl/inset:grid-cols-2">
          <Panel className="p-4">
            <h3 className="font-medium text-emerald-300">Do</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {DOS.map((d) => (
                <li key={d} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="p-4">
            <h3 className="font-medium text-red-300">Don't</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {DONTS.map((d) => (
                <li key={d} className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Block>
    </Page>
  );
}

function Block({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mt-10 scroll-mt-20 break-inside-avoid"
    >
      <h2 id={`${id}-title`} className="text-lg font-medium tracking-tight">
        {title}
      </h2>
      {lede ? (
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{lede}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
