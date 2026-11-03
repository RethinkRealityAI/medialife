/**
 * The frame for the creator sign-in pages (sign-in, check your email, the
 * emailed-link landing): EVADE's dark teal stage with the grid floor, the
 * lockup, and on desktop an art panel with what the hub is for.
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { UGC_ART, card } from "@/components/ugc/shared/look";
import { UGC } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { HubTag, Lockup } from "./brand";
import { UgcTheme } from "./kit";

const POINTS = [
  {
    title: "Your brief and assets",
    body: "Shot list, hashtags, logos and Cola Run clips in one place.",
  },
  { title: "Track your package", body: "From packed to on your doorstep, with the tracking link." },
  {
    title: "Upload, get feedback, unlock perks",
    body: "HD uploads that resume, notes from the team, codes when you go live.",
  },
];

export function UgcAuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-[#05080a] text-foreground">
      <UgcTheme />
      <Stage />
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-[#f6c344] px-4 py-2.5 font-semibold text-black focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
        <a
          href="/evade/creators/"
          className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3fe6e0]"
          aria-label="MEDIALIFE × EVADE creator crew"
        >
          <Lockup />
        </a>
        <HubTag />
      </header>

      <main id="main" className="relative z-10 flex flex-1 items-start sm:items-center">
        <div
          className={cn(
            "mx-auto grid w-full max-w-6xl gap-10 px-4 pt-2 pb-10 sm:px-8 sm:pt-6 lg:items-center",
            !wide && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16",
          )}
        >
          <div className={cn("mx-auto w-full", wide ? "max-w-xl" : "max-w-md")}>{children}</div>
          {!wide ? <ArtPanel /> : null}
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-8">
        <span>
          Need a hand?{" "}
          <a
            href={`mailto:${UGC.supportEmail}`}
            className="text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-[#3fe6e0]"
          >
            {UGC.supportEmail}
          </a>
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
          MEDIALIFE™ × EVADE · Creator crew
        </span>
      </footer>
      <Toaster theme="dark" position="top-center" closeButton />
    </div>
  );
}

/** The landing page's backdrop: teal haze and a grid floor fading out. */
function Stage() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_72%_38%,rgb(63_230_224/0.14),transparent_70%),radial-gradient(50%_40%_at_12%_8%,rgb(25_175_254/0.1),transparent_70%),linear-gradient(180deg,#0a1216_0%,#071014_55%,#05080a_100%)]" />
      <div className="absolute -right-1/2 bottom-[-8%] -left-1/2 h-[55%] origin-top [transform:perspective(520px)_rotateX(64deg)] bg-[linear-gradient(rgb(63_230_224/0.32)_1.5px,transparent_1.5px),linear-gradient(90deg,rgb(63_230_224/0.32)_1.5px,transparent_1.5px)] bg-[length:64px_64px] opacity-50 [mask-image:linear-gradient(180deg,transparent_0%,#000_35%,#000_70%,transparent_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent to-[#05080a]" />
    </div>
  );
}

function ArtPanel() {
  return (
    <aside
      aria-label="What the UGC Hub is for"
      className={cn(card, "relative isolate hidden overflow-hidden p-8 lg:block xl:p-10")}
    >
      <img
        src={UGC_ART.splash}
        alt=""
        className="absolute inset-0 -z-20 size-full object-cover object-[center_58%] opacity-35"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(5_8_10/0.55),rgb(5_8_10/0.94)_62%)]" />
      <div className="relative">
        <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.2em] text-[#3fe6e0] uppercase">
          <span className="size-1.5 rounded-full bg-[#3fe6e0] shadow-[0_0_0_4px_rgb(63_230_224/0.15)]" />
          Bobo + Eclipse can keychain drop
        </div>
        <p className="mt-4 text-[40px] leading-[0.98] font-bold tracking-[-0.045em] text-balance">
          Film it. Scan it.{" "}
          <span className="bg-[linear-gradient(180deg,#ffe48a_0%,#f6c344_45%,#e0a21a_100%)] bg-clip-text text-transparent">
            Go live.
          </span>
        </p>
        <div className="relative mt-6 flex h-40 items-end justify-center gap-4">
          <img
            src={UGC_ART.bobo}
            alt=""
            className="h-36 w-auto -rotate-6 drop-shadow-[0_24px_30px_rgb(0_0_0/0.6)]"
          />
          <img
            src={UGC_ART.can}
            alt=""
            className="h-32 w-auto rotate-12 drop-shadow-[0_0_18px_rgb(63_230_224/0.45)]"
          />
        </div>
        <ul className="mt-6 space-y-4">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[#3fe6e0]/50 bg-[#3fe6e0]/10 text-[#3fe6e0]"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="block text-sm leading-relaxed text-[#c9d1d8]">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** The card a sign-in form sits in. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        card,
        "bg-[linear-gradient(180deg,rgb(14_22_28/0.85),rgb(11_19_24/0.75))] p-6 backdrop-blur-md sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
