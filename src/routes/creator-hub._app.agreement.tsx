import { useState, type ReactNode } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  BadgeCheck,
  CheckCircle2,
  FileSignature,
  FileText,
  Loader2,
  PenLine,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { ART, Tile, accentEdge } from "@/components/hub/app/look";
import { EmptyState, Page, PageHeader, Panel } from "@/components/hub/app/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getAgreements, getSignedCopy, signAgreement } from "@/lib/hub/agreement.functions";
import { nameMatches, type AgreementSection } from "@/lib/hub/agreements";
import { shortDate } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/agreement")({
  loader: () => getAgreements(),
  head: () => ({ meta: [{ title: "Agreement · Creator Hub | MEDIALIFE" }] }),
  component: Agreement,
});

/**
 * The agreement text in a contained panel: section chips to jump, and the text
 * scrolling inside, so the page stays short. Printing shows all of it.
 */
function Document({
  title,
  version,
  sections,
  footer,
}: {
  title: string;
  version: string;
  sections: AgreementSection[];
  footer?: ReactNode;
}) {
  return (
    <Panel className="mt-4 overflow-hidden print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4 sm:px-6 print:hidden">
        <h2 className="flex min-w-0 items-center gap-3 text-base font-semibold tracking-tight">
          <Tile icon={FileText} tone="blue" size="sm" />
          <span className="truncate">{title}</span>
        </h2>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
          Version {version}
        </span>
      </div>
      <nav
        aria-label="Agreement sections"
        className="flex gap-1.5 overflow-x-auto border-b border-white/[0.06] px-4 py-2.5 [scrollbar-width:none] sm:px-6 print:hidden [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((x) => (
          <a
            key={x.id}
            href={`#ag-${x.id}`}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:border-[var(--partner)]/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {x.title}
          </a>
        ))}
      </nav>
      <div
        tabIndex={0}
        role="region"
        aria-label={`${title}, full text`}
        className="max-h-[60vh] space-y-6 overflow-y-auto scroll-smooth p-5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:p-6 print:max-h-none print:overflow-visible"
      >
        {sections.map((x) => (
          <section
            key={x.id}
            id={`ag-${x.id}`}
            aria-labelledby={`ag-${x.id}-t`}
            className="scroll-mt-4"
          >
            <h3 id={`ag-${x.id}-t`} className="font-semibold">
              {x.title}
            </h3>
            {x.paragraphs.map((para, i) => (
              <p
                key={i}
                className="mt-2 text-sm leading-relaxed text-muted-foreground print:text-black"
              >
                {para}
              </p>
            ))}
          </section>
        ))}
        {footer}
      </div>
    </Panel>
  );
}

function Agreement() {
  const d = Route.useLoaderData();
  const router = useRouter();
  const [legalName, setLegalName] = useState(d.terms.legalName);
  const [signedName, setSignedName] = useState("");
  const [agree, setAgree] = useState(false);
  const [minor, setMinor] = useState(false);
  const [guardian, setGuardian] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof getSignedCopy>>>(null);

  if (!d.eligible) {
    return (
      <Page>
        <PageHeader
          image={ART.stickerCard}
          imageClassName="object-[50%_35%]"
          eyebrow="Agreement"
          title="Your program agreement"
        />
        <EmptyState
          icon={FileSignature}
          title="Opens once you're approved"
          className="mt-4"
          image={ART.box}
        >
          When your application is approved, your agreement appears here to read and sign. Nothing
          to do until then.
        </EmptyState>
      </Page>
    );
  }

  async function openCopy(id: string) {
    const c = await getSignedCopy({ data: { id } });
    setCopy(c);
    setTimeout(() => window.print(), 300);
  }

  if (d.signedCurrent) {
    const sig = d.signatures[0];
    return (
      <Page>
        <PageHeader
          className="print:hidden"
          image={ART.stickerCard}
          imageClassName="object-[50%_35%]"
          eyebrow="Agreement"
          title="Signed and on file"
          description="A copy lives here. Print it or save it as a PDF any time."
          actions={
            sig ? (
              <Button
                variant="outline"
                className="rounded-full bg-black/30 backdrop-blur"
                onClick={() => void openCopy(sig.id)}
              >
                <Printer aria-hidden /> Print or save a copy
              </Button>
            ) : null
          }
        />
        <Panel
          className={cn(
            "mt-4 flex flex-wrap items-center gap-4 p-4 sm:p-5 print:hidden",
            accentEdge,
          )}
        >
          <Tile icon={BadgeCheck} tone="mint" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{d.template.title}</div>
            <div className="text-sm text-muted-foreground">
              Version {sig?.version} · signed by {sig?.signedName} on{" "}
              {sig ? shortDate(sig.signedAt) : ""}
            </div>
          </div>
        </Panel>
        <Document
          title={d.template.title}
          version={sig?.version ?? d.template.version}
          sections={copy?.sections ?? d.template.sections}
          footer={
            sig ? (
              <p className="border-t border-white/10 pt-4 text-sm">
                Signed electronically by <span className="font-medium">{sig.signedName}</span> on{" "}
                {new Date(sig.signedAt).toLocaleString()}. Record {sig.textHash.slice(0, 16)}.
              </p>
            ) : null
          }
        />
      </Page>
    );
  }

  const nameOk = legalName.trim().length >= 2 && nameMatches(signedName, legalName);
  const ready = nameOk && agree && (!minor || guardian.trim().length >= 2);

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await signAgreement({
        data: {
          version: d.template.version,
          legalName: legalName.trim(),
          signedName: signedName.trim(),
          agree: true,
          guardian: minor ? guardian.trim() : undefined,
        },
      });
      if (!r.ok) {
        setError(r.error);
        setBusy(false);
        return;
      }
      toast.success("Signed. Welcome to the program!");
      await router.invalidate();
    } catch {
      setError("We couldn't save your signature just now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        className="print:hidden"
        image={ART.stickerCard}
        imageClassName="object-[50%_35%]"
        eyebrow={d.signedOlder ? "Updated agreement" : "Step 2 · Agreement"}
        title={d.signedOlder ? "Your agreement has been updated" : "Your program agreement"}
        description="Read it, then sign at the bottom by typing your name. Questions first? Message your manager."
        actions={
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="rounded-full bg-black/30 backdrop-blur"
          >
            <Printer aria-hidden /> Print
          </Button>
        }
      />

      <section aria-labelledby="short-title" className="mt-4 print:hidden">
        <h2 id="short-title" className="mb-3 flex items-center gap-2.5 text-lg font-semibold">
          <ShieldCheck className="size-5 text-[var(--partner)]" aria-hidden /> In short
        </h2>
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {d.template.summary.map((x) => (
            <li key={x}>
              <Panel className="flex h-full items-start gap-3 p-3.5 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                {x}
              </Panel>
            </li>
          ))}
        </ul>
      </section>

      <Document
        title={d.template.title}
        version={d.template.version}
        sections={d.template.sections}
      />

      <form onSubmit={sign} className="mt-4 print:hidden" aria-labelledby="sign-title">
        <Panel className={cn("p-5 sm:p-6", accentEdge)}>
          <h2 id="sign-title" className="flex items-center gap-3 text-lg font-semibold">
            <Tile icon={PenLine} tone="pink" />
            Sign
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Your full legal name</span>
              <Input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                required
              />
              <span className="text-xs text-muted-foreground">
                As on your ID. The agreement is made out to this name.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Type your name to sign</span>
              <Input
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                maxLength={120}
                required
                aria-invalid={signedName.length > 1 && !nameOk ? true : undefined}
                className="font-serif text-lg italic"
              />
              <span
                className={
                  signedName.length > 1 && !nameOk
                    ? "text-xs text-amber-300"
                    : "text-xs text-muted-foreground"
                }
              >
                {signedName.length > 1 && !nameOk
                  ? "It should match your legal name exactly."
                  : "Your typed name is your signature."}
              </span>
            </label>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <Checkbox
              checked={minor}
              onCheckedChange={(v) => setMinor(v === true)}
              className="mt-0.5"
            />
            I'm under 18, and a parent or guardian is signing with me.
          </label>
          {minor ? (
            <label className="mt-3 grid max-w-md gap-1.5 text-sm">
              <span className="font-medium">Parent or guardian's full name</span>
              <Input
                value={guardian}
                onChange={(e) => setGuardian(e.target.value)}
                maxLength={120}
              />
            </label>
          ) : null}
          <label className="mt-4 flex items-start gap-3 text-sm">
            <Checkbox
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
              className="mt-0.5"
            />
            <span>
              I've read the agreement and agree to it. I understand that signing electronically is
              as binding as signing on paper.
            </span>
          </label>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!ready || busy} className="rounded-full px-6">
              {busy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <FileSignature aria-hidden />
              )}
              Sign the agreement
            </Button>
            <span className="text-xs text-muted-foreground">
              We keep a record of what you signed, when, and from where. A copy stays here.
            </span>
          </div>
        </Panel>
      </form>
    </Page>
  );
}
