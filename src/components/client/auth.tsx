/**
 * The Client Hub's sign-in and invitation pages: a centred card on a flat dark
 * page, the client's name with MEDIALIFE, and a help line.
 */
import type { ReactNode } from "react";

import { Logo } from "@/components/site/Logo";
import { Toaster } from "@/components/ui/sonner";

export function ClientAuthFrame({
  clientName,
  accent = "#3d8bff",
  children,
}: {
  clientName?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-[#07090e] text-foreground"
      style={{ "--client": accent, "--primary": accent, "--ring": accent } as React.CSSProperties}
    >
      <header className="flex items-center gap-3 px-4 py-5 sm:px-8">
        <a href="/client-hub" className="inline-flex items-center gap-3" aria-label="Client Hub">
          <Logo className="[&_img]:h-3 sm:[&_img]:h-3.5" />
          <span aria-hidden className="h-4 w-px bg-border" />
          <span className="mono text-[10px] tracking-[0.22em] whitespace-nowrap text-muted-foreground uppercase">
            {clientName ? `${clientName} Hub` : "Client Hub"}
          </span>
        </a>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1017] p-6 sm:p-8">
          {children}
        </div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground sm:px-8">
        Need a hand?{" "}
        <a
          href="mailto:hello@medialife.ai"
          className="text-foreground underline decoration-border underline-offset-4"
        >
          hello@medialife.ai
        </a>
      </footer>
      <Toaster theme="dark" position="top-center" closeButton />
    </div>
  );
}

export function AuthTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      {eyebrow ? (
        <div className="mono text-[10px] tracking-[0.22em] text-[var(--client)] uppercase">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {children ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
    </div>
  );
}
