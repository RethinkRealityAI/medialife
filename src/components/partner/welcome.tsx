/**
 * The Partner Hub welcome: three steps that show a new team member what's
 * already theirs (a live merch shelf, co-branded collateral, an invite link).
 * It opens on a member's first visit to any Partner Hub page and stays closed
 * once they close it, on every device (welcomedAt on their team record).
 * "Take the tour" in the account menu opens it again.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, FolderOpen, Link2, Store, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/hub/app/ui";
import { IconTile, Tag, type TileTone } from "@/components/partner/ui";
import { WelcomeContext, useWelcome } from "@/components/partner/welcome-context";
import { inviteFor, programUrl, usePartnerWorkspace } from "@/components/partner/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { kitFor, kitHero, kitLogo } from "@/lib/hub/collateral";
import { dismissPartnerWelcomeFn } from "@/lib/hub/partner.functions";
import { kitShelfPreview } from "@/lib/shelf/partner-presets";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Open state, shared by the layout (first visit) and the account menu (reopen)
   --------------------------------------------------------------------------- */

export function WelcomeProvider({
  welcomed,
  children,
}: {
  /** The member has closed the welcome before. */
  welcomed: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!welcomed);
  const show = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ open, setOpen, show }), [open, show]);
  return <WelcomeContext.Provider value={value}>{children}</WelcomeContext.Provider>;
}

/* ---------------------------------------------------------------------------
   The dialog
   --------------------------------------------------------------------------- */

type Step = {
  label: string;
  icon: LucideIcon;
  tone: TileTone;
  image: string;
  /** How the picture is cropped, phone first (stacked) then desktop (left column). */
  crop: string;
};

export function PartnerWelcome() {
  const ws = usePartnerWorkspace();
  const welcome = useWelcome();
  const [step, setStep] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);
  // Saved once per visit: after that, closing it again doesn't need the server.
  const saved = useRef(ws.me.welcomed);

  const open = welcome?.open ?? false;
  // Every opening starts at the first step.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }

  const kit = ws.partner.kit;
  const steps = useMemo<Step[]>(() => {
    const preview = (id: string) => kitFor(kit).find((i) => i.id === id)?.preview;
    const onePager = preview("one-pager");
    const programPage = preview("program-page");
    return [
      {
        label: "Your merch shelf",
        icon: Store,
        tone: "ice",
        image: kitShelfPreview(kit),
        crop: "object-[50%_8%] sm:object-center",
      },
      {
        label: "Your collateral",
        icon: FolderOpen,
        tone: "violet",
        image: onePager ?? kitHero(kit),
        crop: onePager ? "object-top" : "object-center",
      },
      {
        label: "Your invite link",
        icon: Link2,
        tone: "mint",
        image: programPage ?? kitHero(kit),
        crop: programPage ? "object-top sm:object-[18%_50%]" : "object-center",
      },
    ];
  }, [kit]);

  if (!welcome) return null;

  const close = () => {
    welcome.setOpen(false);
    if (saved.current) return;
    saved.current = true;
    dismissPartnerWelcomeFn()
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
      })
      .catch(() => {
        saved.current = false;
        toast.error("Couldn't save that, so the welcome may open again next time.");
      });
  };

  const first = (ws.me.name || ws.me.email).split(/[\s@(]/)[0] || "there";
  const logo = kitLogo(kit);
  const invite = programUrl(ws, inviteFor(ws, ws.me.name));
  const last = step === steps.length - 1;
  const current = steps[step];

  const go = (to: "/partner-hub/shelves" | "/partner-hub/collateral", label: string) => (
    <Button asChild variant="outline" className="bg-white/5 shadow-none hover:bg-white/10">
      <Link to={to} onClick={close}>
        {label}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
  const copy: { title: ReactNode; text: string; action: ReactNode }[] = [
    {
      title: (
        <>
          Welcome, {first}.
          <span className="block text-[var(--partner)]">Your shelf is already live.</span>
        </>
      ),
      text: "Send its link to a creator you're pitching. Make one for each creator with New shelf.",
      action: go("/partner-hub/shelves", "Open your shelf"),
    },
    {
      title: "Your collateral is ready.",
      text: "A one-pager, posts, videos and email GIFs, all co-branded and ready to send.",
      action: go("/partner-hub/collateral", "Browse collateral"),
    },
    {
      title: "Share your invite link.",
      text: `Every creator who applies through it is credited to ${ws.partner.name}. It's on Home whenever you need it.`,
      action: (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 py-1.5 pr-1.5 pl-3">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-white/80 select-all"
            title={invite}
          >
            {invite.replace(/^https?:\/\//, "")}
          </span>
          <CopyButton
            value={invite}
            toastText="Invite link copied"
            ariaLabel="Copy your invite link"
            className="shrink-0 shadow-none"
          />
        </div>
      ),
    },
  ];

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    // The Back button goes away on the first step: keep focus in the flow.
    if (step === 1) requestAnimationFrame(() => primary.current?.focus());
  };

  return (
    <Dialog open={welcome.open} onOpenChange={(o) => (o ? welcome.show() : close())}>
      <DialogContent
        className="glass-strong max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl gap-0 overflow-y-auto rounded-[28px] p-0 motion-reduce:animate-none! sm:w-full sm:rounded-[28px] [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primary.current?.focus();
        }}
      >
        <div className="grid sm:min-h-[400px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* The picture: stacked on phones, the left column on wider screens. */}
          <div className="relative h-44 overflow-hidden bg-[var(--partner-ink)] sm:h-auto">
            {steps.map((s, i) => (
              <img
                key={s.label}
                src={s.image}
                alt=""
                decoding="async"
                className={cn(
                  "absolute inset-0 size-full object-cover transition-opacity duration-500 motion-reduce:transition-none",
                  s.crop,
                  i === step ? "opacity-100" : "opacity-0",
                )}
              />
            ))}
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgb(8_10_24/0.55))] sm:bg-[linear-gradient(90deg,transparent_70%,rgb(8_10_24/0.45))]"
            />
          </div>

          <div className="relative flex min-w-0 flex-col p-5 sm:p-6">
            <div
              aria-hidden
              className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent opacity-60"
            />
            <div className="flex items-center gap-2.5 pr-10">
              {logo ? (
                <img src={logo.wordmark} alt={ws.partner.name} className="h-6 w-auto" />
              ) : (
                <span className="truncate text-sm font-semibold">{ws.partner.name}</span>
              )}
              <span aria-hidden className="text-[var(--partner)]">
                ×
              </span>
              <img src="/brand/medialife-wordmark.webp" alt="MEDIALIFE" className="h-3 w-auto" />
            </div>

            {/* Every step sits in the same cell, so the dialog keeps the tallest
                one's height and doesn't jump between steps. */}
            <div className="mt-6 grid flex-1 sm:mt-7">
              {steps.map((s, i) => {
                const active = i === step;
                const title =
                  "mt-4 text-2xl leading-tight font-semibold tracking-tight text-balance";
                const text = "mt-2 text-[15px] leading-relaxed text-pretty text-muted-foreground";
                return (
                  <div
                    key={s.label}
                    aria-hidden={active ? undefined : true}
                    className={cn(
                      "flex min-w-0 flex-col [grid-area:1/1]",
                      active
                        ? "duration-300 animate-in fade-in-0 slide-in-from-right-2 motion-reduce:animate-none"
                        : "invisible",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconTile icon={s.icon} tone={s.tone} size="sm" />
                      <Tag tone={s.tone}>{s.label}</Tag>
                    </div>
                    {active ? (
                      <DialogTitle className={title}>{copy[i].title}</DialogTitle>
                    ) : (
                      <h2 className={title}>{copy[i].title}</h2>
                    )}
                    {active ? (
                      <DialogDescription className={text}>{copy[i].text}</DialogDescription>
                    ) : (
                      <p className={text}>{copy[i].text}</p>
                    )}
                    <div className="mt-5">{copy[i].action}</div>
                  </div>
                );
              })}
            </div>

            <p className="sr-only" aria-live="polite">
              Step {step + 1} of {steps.length}: {current.label}
            </p>

            <div className="mt-6 flex items-center gap-1.5 border-t border-white/10 pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-muted-foreground shadow-none hover:bg-white/5"
                onClick={close}
              >
                Skip
              </Button>
              <ol className="flex flex-1 items-center justify-center" aria-label="Steps">
                {steps.map((s, i) => (
                  <li key={s.label}>
                    <button
                      type="button"
                      onClick={() => setStep(i)}
                      aria-label={`Step ${i + 1} of ${steps.length}: ${s.label}`}
                      aria-current={i === step ? "step" : undefined}
                      className="grid size-6 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "h-1.5 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
                          i === step ? "w-4 bg-[var(--partner)]" : "w-1.5 bg-white/30",
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ol>
              {step > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shadow-none hover:bg-white/5"
                  onClick={back}
                  aria-label="Back"
                >
                  <ArrowLeft aria-hidden />
                  <span className="max-sm:hidden">Back</span>
                </Button>
              ) : null}
              <Button
                ref={primary}
                size="sm"
                className="h-9 px-4 shadow-none"
                onClick={() => (last ? close() : setStep(step + 1))}
              >
                {last ? (
                  <>
                    <Check aria-hidden /> Done
                  </>
                ) : (
                  <>
                    Next <ArrowRight aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogClose
          className="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-full bg-black/40 text-white/80 ring-1 ring-white/15 backdrop-blur hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
