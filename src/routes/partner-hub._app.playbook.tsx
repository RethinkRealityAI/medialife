import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowRight,
  Ban,
  BookOpenCheck,
  CircleHelp,
  Download,
  Eye,
  Gift,
  Hash,
  Heart,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MessagesSquare,
  Repeat,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { CopyButton, Page } from "@/components/hub/app/ui";
import { STEP_ICONS } from "@/components/partner/parts";
import {
  IconTile,
  PartnerBanner,
  PartnerTab,
  PartnerTabs,
  Surface,
  TabIntro,
  Tag,
  lift,
  surface,
  type TabDef,
  type TileTone,
} from "@/components/partner/ui";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { kitFor, kitHero, kitLogo } from "@/lib/hub/collateral";
import { JOURNEY } from "@/lib/hub/partners";
import {
  DISCORD_SETUP,
  DOORS,
  FAQ,
  FIT,
  PITCH,
  STAGES,
  TEMPLATES,
  TIMELINE,
  fillCopy,
  type CopyBlock,
  type TemplateStage,
} from "@/lib/hub/playbook";
import { cn } from "@/lib/utils";

const TAB_IDS = ["pitch", "steps", "find", "discord", "messages", "faq"] as const;
type TabId = (typeof TAB_IDS)[number];

export const Route = createFileRoute("/partner-hub/_app/playbook")({
  validateSearch: z.object({ tab: z.enum(TAB_IDS).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Playbook · Partner Hub | MEDIALIFE" }] }),
  component: Playbook,
});

const TABS: TabDef<TabId>[] = [
  { id: "pitch", label: "The pitch", icon: Sparkles },
  { id: "steps", label: "How it works", icon: BookOpenCheck },
  { id: "find", label: "Who to pitch", icon: Target },
  { id: "discord", label: "Discord", icon: Hash },
  { id: "messages", label: "Messages", icon: Send },
  { id: "faq", label: "FAQ", icon: CircleHelp },
];

const WHY_ICONS: Record<string, [LucideIcon, TileTone]> = {
  keeps: [Repeat, "ice"],
  free: [Wallet, "mint"],
  theirs: [ShieldCheck, "violet"],
  visible: [LayoutDashboard, "blue"],
};
const FIT_ICONS: Record<string, [LucideIcon, TileTone]> = {
  community: [Users, "ice"],
  recognisable: [Heart, "violet"],
  reason: [Gift, "amber"],
  ready: [Rocket, "mint"],
};
const DOOR_ICONS: Record<string, [LucideIcon, TileTone]> = {
  direct: [MessageCircle, "ice"],
  discord: [Hash, "blue"],
  creators: [Sparkles, "violet"],
};
const STAGE_TONE: Record<TemplateStage, TileTone> = {
  reach: "ice",
  follow: "amber",
  onboard: "mint",
  announce: "violet",
};

function Playbook() {
  const ws = usePartnerWorkspace();
  const { tab = "pitch" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const kit = kitFor(ws.partner.kit);
  const onePager = kit.find((i) => i.id === "one-pager");
  const photo = (id: string) => kit.find((i) => i.id === id)?.href ?? kitHero(ws.partner.kit);

  return (
    <Page className="lg:pt-8">
      <PartnerBanner
        image={photo("aurora-banner")}
        eyebrow="Playbook"
        title="Bring creators in"
        description="What to say, who to talk to and where. Timings are typical; each creator's real dates are in Creators."
        actions={
          onePager ? (
            <Button asChild variant="outline" className="bg-black/30 backdrop-blur">
              <a href={onePager.href} download>
                <Download aria-hidden /> One-pager
              </a>
            </Button>
          ) : null
        }
      />

      <PartnerTabs
        tabs={TABS}
        value={tab}
        label="Playbook sections"
        onChange={(t) =>
          void navigate({
            search: { tab: t === "pitch" ? undefined : t },
            replace: true,
            resetScroll: false,
          })
        }
      >
        <PartnerTab value="pitch">
          <Pitch image={photo("tap-charm")} />
        </PartnerTab>
        <PartnerTab value="steps">
          <Steps journeyImage={kit.find((i) => i.id === "journey-wide")?.href} />
        </PartnerTab>
        <PartnerTab value="find">
          <Find link={vars.link} />
        </PartnerTab>
        <PartnerTab value="discord">
          <Discord
            partner={ws.partner.name}
            mark={kitLogo(ws.partner.kit)?.mark}
            banner={kit.find((i) => i.id === "discord-banner")?.href}
            vars={vars}
          />
        </PartnerTab>
        <PartnerTab value="messages">
          <Messages
            vars={vars}
            rep={rep}
            setRep={setRep}
            creator={creator}
            setCreator={setCreator}
          />
        </PartnerTab>
        <PartnerTab value="faq">
          <Faq />
        </PartnerTab>
      </PartnerTabs>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   The pitch
   --------------------------------------------------------------------------- */

function Pitch({ image }: { image: string }) {
  return (
    <div className="grid gap-4 @4xl/inset:grid-cols-[1.25fr_1fr]">
      <Surface accent className="relative isolate overflow-hidden p-6 sm:p-8">
        <img
          src={image}
          alt=""
          className="absolute inset-y-0 right-0 -z-10 h-full w-2/3 object-cover opacity-35 [mask-image:linear-gradient(90deg,transparent,black_60%)]"
        />
        <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
          Say it in one line
        </div>
        <p className="mt-3 max-w-md text-2xl leading-snug font-semibold text-balance sm:text-3xl">
          <span className="bg-gradient-to-r from-white to-[var(--partner)] bg-clip-text text-transparent">
            {PITCH.oneLine}
          </span>
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <CopyButton value={PITCH.oneLine} label="Copy line" variant="default" />
          <CopyButton
            value={PITCH.thirty}
            label="Copy 30-second version"
            variant="outline"
            toastText="30-second pitch copied"
          />
        </div>
        <details className="group mt-5 max-w-xl">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-white/70 hover:text-white [&::-webkit-details-marker]:hidden">
            <ArrowRight
              className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden
            />
            Read the 30-second version
          </summary>
          <p className="mt-3 rounded-xl bg-black/35 p-4 text-sm leading-relaxed text-white/80 backdrop-blur">
            {PITCH.thirty}
          </p>
        </details>
      </Surface>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Why it lands</h2>
        <ul className="grid grid-cols-2 gap-3">
          {PITCH.why.map((w) => {
            const [Icon, tone] = WHY_ICONS[w.id];
            return (
              <li key={w.id} className={cn(surface, "p-4")}>
                <IconTile icon={Icon} tone={tone} />
                <div className="mt-3 font-medium">{w.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{w.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   How it works
   --------------------------------------------------------------------------- */

function Steps({ journeyImage }: { journeyImage?: string }) {
  return (
    <>
      <TabIntro
        actions={
          journeyImage ? (
            <Button asChild variant="outline" size="sm">
              <a href={journeyImage} download>
                <Download aria-hidden /> Steps graphic
              </a>
            </Button>
          ) : null
        }
      >
        Five steps from hello to paid. This is how to explain it.
      </TabIntro>
      <ol className="grid gap-3 @2xl/inset:grid-cols-2 @5xl/inset:grid-cols-5">
        {JOURNEY.map((s, i) => {
          const Icon = STEP_ICONS[s.id];
          return (
            <li key={s.id} className={cn(surface, "relative flex flex-col overflow-hidden p-4")}>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-3 -right-1 text-7xl font-bold text-white/[0.05] tabular-nums"
              >
                {s.n}
              </span>
              <IconTile
                icon={Icon}
                tone={(["ice", "blue", "violet", "mint", "amber"] as const)[i]}
              />
              <div className="mt-3 text-[11px] font-medium text-muted-foreground">Step {s.n}</div>
              <h3 className="font-medium">{s.title}</h3>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">{s.brief}</p>
              <span className="mt-auto inline-flex w-fit rounded-full bg-[var(--partner)]/12 px-2.5 py-0.5 text-xs font-medium text-[var(--partner)]">
                {s.time}
              </span>
            </li>
          );
        })}
      </ol>

      <Surface className="mt-4 p-4 sm:p-5">
        <h3 className="text-sm font-medium">Typical timeline</h3>
        <ol className="mt-4 flex gap-0 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {TIMELINE.map((t, i) => (
            <li key={t.title} className="relative min-w-24 flex-1 pr-2">
              <div className="flex items-center">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full bg-[var(--partner)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--partner)_20%,transparent)]"
                />
                {i < TIMELINE.length - 1 ? (
                  <span
                    aria-hidden
                    className="h-0.5 flex-1 bg-gradient-to-r from-[var(--partner)]/70 to-[var(--partner-2)]/50"
                  />
                ) : null}
              </div>
              <div className="mt-2.5 text-sm font-medium">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.when}</div>
            </li>
          ))}
        </ol>
      </Surface>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Who to pitch
   --------------------------------------------------------------------------- */

function Find({ link }: { link: string }) {
  return (
    <div className="grid gap-6 @4xl/inset:grid-cols-2">
      <section aria-labelledby="fit-title">
        <h2 id="fit-title" className="mb-3 text-sm font-medium text-muted-foreground">
          Who's a fit
        </h2>
        <ul className="grid gap-3 @xl/inset:grid-cols-2">
          {FIT.map((f) => {
            const [Icon, tone] = FIT_ICONS[f.id];
            return (
              <li key={f.id} className={cn(surface, "flex gap-3 p-4")}>
                <IconTile icon={Icon} tone={tone} />
                <span className="min-w-0">
                  <span className="block font-medium">{f.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{f.body}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="doors-title">
        <h2 id="doors-title" className="mb-3 text-sm font-medium text-muted-foreground">
          Where to find them: three doors, one link
        </h2>
        <ol className="grid gap-3">
          {DOORS.map((d, i) => {
            const [Icon, tone] = DOOR_ICONS[d.id];
            return (
              <li key={d.id} className={cn(surface, "flex items-center gap-3 p-4")}>
                <IconTile icon={Icon} tone={tone} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">
                      {i + 1}. {d.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{d.channel}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{d.body}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <Surface accent className="mt-3 flex flex-wrap items-center gap-3 p-4">
          <ArrowRight className="size-5 shrink-0 text-[var(--partner)]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">
              Every door ends at your link
            </span>
            <span className="block truncate font-mono text-sm">
              {link.replace(/^https?:\/\//, "")}
            </span>
          </span>
          <CopyButton value={link} label="Copy" size="sm" variant="default" />
        </Surface>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Discord
   --------------------------------------------------------------------------- */

type Vars = Parameters<typeof fillCopy>[1];

function Discord({
  partner,
  mark,
  banner,
  vars,
}: {
  partner: string;
  mark?: string;
  banner?: string;
  vars: Vars;
}) {
  const pinned = TEMPLATES.find((t) => t.id === "pinned");
  const announce = TEMPLATES.find((t) => t.id === "server-announce");
  return (
    <>
      <TabIntro>
        A small, tidy channel set does most of the explaining for you. Here's what to set up.
      </TabIntro>
      <div className="grid gap-4 @4xl/inset:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="grid h-fit gap-3">
          {/* A Discord-style sidebar, so the set-up is obvious at a glance. */}
          <div
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1e1f2b] shadow-[0_20px_40px_-24px_rgb(0_0_0/0.9)]"
            role="img"
            aria-label={`Suggested channels: ${DISCORD_SETUP.map((c) => c.name).join(", ")}`}
          >
            <div className="flex items-center gap-2.5 border-b border-black/40 bg-[#191a24] px-4 py-3 shadow-sm">
              {mark ? (
                <img src={mark} alt="" className="size-6 object-contain" />
              ) : (
                <MessagesSquare className="size-5 text-[var(--partner)]" aria-hidden />
              )}
              <span className="font-semibold">{partner}</span>
            </div>
            <div className="p-3">
              <div className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-white/45 uppercase">
                Activated merch
              </div>
              <ul className="space-y-1">
                {DISCORD_SETUP.map((c, i) => (
                  <li
                    key={c.name}
                    className={cn("rounded-md px-2 py-2", i === 0 && "bg-white/[0.07]")}
                  >
                    <div className="flex items-center gap-1.5 text-[15px] font-medium text-white/90">
                      <Hash className="size-4 text-white/45" aria-hidden />
                      {c.name}
                    </div>
                    <div className="mt-0.5 pl-[22px] text-xs leading-snug text-white/55">
                      {c.purpose}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {[pinned, announce].map((t) =>
            t ? (
              <Surface key={t.id} className="flex items-center gap-3 p-3.5">
                <IconTile
                  icon={t.id === "pinned" ? BookOpenCheck : Sparkles}
                  tone="violet"
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.when}</span>
                </span>
                <CopyButton
                  value={fillCopy(t.body, vars)}
                  label="Copy"
                  size="sm"
                  variant="outline"
                />
              </Surface>
            ) : null,
          )}
        </div>

        {banner ? (
          <Surface className="h-fit overflow-hidden">
            <img
              src={banner}
              alt="Discord channel banner"
              className="aspect-[16/9] w-full object-cover"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="min-w-0">
                <span className="block font-medium">Channel banner</span>
                <span className="block text-xs text-muted-foreground">
                  PNG · 960×540 · for #start-here or the server header
                </span>
              </span>
              <Button asChild size="sm">
                <a href={banner} download>
                  <Download aria-hidden /> Download
                </a>
              </Button>
            </div>
          </Surface>
        ) : null}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Messages
   --------------------------------------------------------------------------- */

function Personalise({
  rep,
  setRep,
  creator,
  setCreator,
  className,
}: {
  rep: string;
  setRep: (v: string) => void;
  creator: string;
  setCreator: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className ?? "@xl/inset:grid-cols-2")}>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Your name</span>
        <Input value={rep} onChange={(e) => setRep(e.target.value)} maxLength={80} />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Creator's name</span>
        <Input
          value={creator}
          onChange={(e) => setCreator(e.target.value)}
          placeholder="Also goes on their 3D shop"
          maxLength={28}
        />
      </label>
    </div>
  );
}

/** A card preview: the message as one paragraph, without the subject line or markdown. */
const preview = (body: string) =>
  body
    .replace(/^Subject:.*\n+/, "")
    .replace(/\*\*|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

function ChannelTags({ t }: { t: CopyBlock }) {
  return (
    <>
      <Tag tone={STAGE_TONE[t.stage]}>{STAGES[t.stage]}</Tag>
      {t.channels.map((c) => (
        <Tag key={c} tone="blue">
          {c === "Email" ? (
            <Mail className="size-3" aria-hidden />
          ) : (
            <Hash className="size-3" aria-hidden />
          )}
          {c}
        </Tag>
      ))}
    </>
  );
}

function Messages({
  vars,
  rep,
  setRep,
  creator,
  setCreator,
}: {
  vars: Vars;
  rep: string;
  setRep: (v: string) => void;
  creator: string;
  setCreator: (v: string) => void;
}) {
  const [stage, setStage] = useState<TemplateStage | "all">("all");
  const [open, setOpen] = useState<CopyBlock | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shown = TEMPLATES.filter((t) => stage === "all" || t.stage === stage);

  return (
    <>
      <Surface className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Every message is filled in with your links. Add names, open one, copy, send.
        </p>
        <Personalise rep={rep} setRep={setRep} creator={creator} setCreator={setCreator} />
      </Surface>

      <div role="group" aria-label="Filter messages" className="mt-4 flex flex-wrap gap-1.5">
        {(["all", ...(Object.keys(STAGES) as TemplateStage[])] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={stage === s}
            onClick={() => setStage(s)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
              stage === s
                ? "border-[var(--partner)]/60 bg-[var(--partner)]/15 text-foreground"
                : "border-white/[0.08] text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : STAGES[s]}
          </button>
        ))}
      </div>

      <ul className="mt-4 grid gap-3 @2xl/inset:grid-cols-2 @5xl/inset:grid-cols-3">
        {shown.map((t) => (
          <li key={t.id} className="relative">
            <button
              type="button"
              onClick={() => setOpen(t)}
              className={cn(surface, lift, "flex h-full w-full flex-col p-4 text-left")}
            >
              <span className="flex flex-wrap gap-1.5">
                <ChannelTags t={t} />
              </span>
              <span className="mt-3 block font-medium">{t.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t.when}</span>
              <span className="mt-3 block rounded-xl bg-black/25 p-3">
                <span className="line-clamp-3 text-[13px] leading-relaxed text-white/65">
                  {preview(fillCopy(t.body, vars))}
                </span>
              </span>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--partner)]">
                <Eye className="size-4" aria-hidden /> Open and copy
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          ref={dialogRef}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            // Land on the message, not in the name field with its text selected.
            e.preventDefault();
            dialogRef.current?.focus();
          }}
          className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl gap-0 overflow-y-auto p-0 outline-none"
        >
          {open ? (
            <>
              <div className="border-b border-white/[0.08] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_14%,transparent),transparent)] p-5 pr-12">
                <div className="flex flex-wrap gap-1.5">
                  <ChannelTags t={open} />
                </div>
                <DialogTitle className="mt-3 text-lg">{open.label}</DialogTitle>
                <DialogDescription>{open.when}</DialogDescription>
              </div>
              <div className="p-5">
                <Personalise
                  rep={rep}
                  setRep={setRep}
                  creator={creator}
                  setCreator={setCreator}
                  className="sm:grid-cols-2"
                />
                <pre className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
                  {fillCopy(open.body, vars)}
                </pre>
                <div className="mt-4 flex justify-end">
                  <CopyButton
                    value={fillCopy(open.body, vars)}
                    label="Copy message"
                    variant="default"
                    toastText="Message copied"
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------------------
   FAQ
   --------------------------------------------------------------------------- */

function Faq() {
  return (
    <div className="grid gap-4 @4xl/inset:grid-cols-[1fr_18rem]">
      <Accordion type="single" collapsible className="grid gap-2">
        {FAQ.map((f) => (
          <AccordionItem
            key={f.q}
            value={f.q}
            className={cn(surface, "border-b-0 px-4 data-[state=open]:border-[var(--partner)]/35")}
          >
            <AccordionTrigger className="text-left hover:no-underline">{f.q}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Surface accent className="h-fit p-4">
        <IconTile icon={Ban} tone="amber" />
        <h2 className="mt-3 font-medium">Leave these to the agreement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue share, prices, dates and approval. Every creator sees theirs in the Creator Hub.
        </p>
      </Surface>
    </div>
  );
}
