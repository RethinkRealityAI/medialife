import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CheckCircle2, FileSignature, Loader2, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Page, PageHeader, Panel } from "@/components/hub/app/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getAgreements, getSignedCopy, signAgreement } from "@/lib/hub/agreement.functions";
import { nameMatches, type AgreementSection } from "@/lib/hub/agreements";
import { shortDate } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/_app/agreement")({
  loader: () => getAgreements(),
  head: () => ({ meta: [{ title: "Agreement · Creator Hub | MEDIALIFE" }] }),
  component: Agreement,
});

function Sections({ sections }: { sections: AgreementSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`ag-${s.id}`}>
          <h3 id={`ag-${s.id}`} className="font-medium">
            {s.title}
          </h3>
          {s.paragraphs.map((p, i) => (
            <p
              key={i}
              className="mt-2 text-sm leading-relaxed text-muted-foreground print:text-black"
            >
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
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
      <Page className="lg:pt-8">
        <PageHeader title="Agreement" />
        <EmptyState
          icon={FileSignature}
          title="Your agreement opens once you're approved"
          className="mt-6"
        >
          When your application is approved, your program agreement appears here to read and sign.
          Nothing to do until then.
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
      <Page className="lg:pt-8">
        <PageHeader
          title="Agreement"
          description="Signed. A copy is kept here; you can print it or save it as a PDF any time."
        />
        <Panel className="mt-6 flex flex-wrap items-center gap-4 p-5 print:hidden">
          <CheckCircle2 className="size-8 shrink-0 text-emerald-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{d.template.title}</div>
            <div className="text-sm text-muted-foreground">
              Version {sig?.version} · signed by {sig?.signedName} on{" "}
              {sig ? shortDate(sig.signedAt) : ""}
            </div>
          </div>
          {sig ? (
            <Button variant="outline" onClick={() => void openCopy(sig.id)}>
              <Printer aria-hidden /> Print or save a copy
            </Button>
          ) : null}
        </Panel>
        <Panel className="mt-4 p-5 sm:p-6">
          <Sections sections={copy?.sections ?? d.template.sections} />
          {sig ? (
            <p className="mt-8 border-t border-border pt-4 text-sm">
              Signed electronically by <span className="font-medium">{sig.signedName}</span> on{" "}
              {new Date(sig.signedAt).toLocaleString()}. Record {sig.textHash.slice(0, 16)}.
            </p>
          ) : null}
        </Panel>
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
    <Page className="lg:pt-8">
      <PageHeader
        title={d.signedOlder ? "Your agreement has been updated" : "Your program agreement"}
        description="Read it, then sign at the bottom by typing your name. Questions first? Message your manager; nothing is final until you sign."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer aria-hidden /> Print
          </Button>
        }
      />

      <Panel className="mt-6 p-5 print:hidden">
        <h2 className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-5 text-primary" aria-hidden /> In short
        </h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {d.template.summary.map((s) => (
            <li key={s} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="mt-4 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">{d.template.title}</h2>
          <span className="text-xs text-muted-foreground">Version {d.template.version}</span>
        </div>
        <Sections sections={d.template.sections} />
      </Panel>

      <form onSubmit={sign} className="mt-4 print:hidden" aria-labelledby="sign-title">
        <Panel className="p-5 sm:p-6">
          <h2 id="sign-title" className="text-lg font-medium">
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
            <Button type="submit" disabled={!ready || busy}>
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
