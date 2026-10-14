import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Archive, Box, ExternalLink, Globe, Link2, Loader2, Plus, QrCode } from "lucide-react";
import { toast } from "sonner";

import { QrDialog } from "@/components/hub/app/qr-download";
import { CopyButton, Page, PageHeader, Panel, Section } from "@/components/hub/app/ui";
import {
  inviteFor,
  programUrl,
  shelfUrl,
  usePartnerWorkspace,
} from "@/components/partner/workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortDate } from "@/lib/hub/model";
import { archivePartnerLink, createPartnerLink } from "@/lib/hub/partner.functions";

export const Route = createFileRoute("/partner-hub/_app/links")({
  head: () => ({ meta: [{ title: "Links & demos · Partner Hub | MEDIALIFE" }] }),
  component: Links,
});

function Links() {
  const ws = usePartnerWorkspace();
  const router = useRouter();
  const [qr, setQr] = useState<{ url: string; name: string } | null>(null);
  const [rep, setRep] = useState(ws.me.name);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [creator, setCreator] = useState("");
  const [shelfInvite, setShelfInvite] = useState(inviteFor(ws, ws.me.name));

  const shelf = shelfUrl(ws, shelfInvite, creator.trim());
  const program = programUrl(ws, inviteFor(ws, ws.me.name));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!rep.trim()) return toast.error("Add whose link this is.");
    setBusy(true);
    try {
      const r = await createPartnerLink({ data: { rep: rep.trim(), note: note.trim() } });
      if (!r.ok) return toast.error(r.error);
      toast.success("Link created");
      setNote("");
      setShelfInvite(r.code);
      await router.invalidate();
    } catch {
      toast.error("Couldn't create the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Links & demos"
        description="Everything you send creators, carrying your invite code: whoever signs up through these is credited to you and shows up in Creators."
      />

      <Section
        id="shelf"
        title="A 3D shop for one creator"
        description="Their name in neon on a 3D shelf of activated merch printed with their name. Tap a product to see the tap-to-unlock walkthrough. The best opener there is."
      >
        <Panel className="grid gap-4 p-4 sm:p-5 @3xl/inset:grid-cols-[1fr_auto] @3xl/inset:items-end">
          <div className="grid gap-3 @xl/inset:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Creator's name</span>
              <Input
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                placeholder="e.g. augusttheduck"
                maxLength={28}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Credited to</span>
              <select
                value={shelfInvite}
                onChange={(e) => setShelfInvite(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {ws.links.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.rep || ws.partner.name} ({l.code})
                  </option>
                ))}
                {!ws.links.length ? <option value={shelfInvite}>{ws.partner.name}</option> : null}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton
              value={shelf}
              label="Copy link"
              variant="default"
              toastText="3D shop link copied"
            />
            <Button asChild variant="outline">
              <a href={shelf} target="_blank" rel="noopener">
                <Box aria-hidden /> Open
              </a>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="QR code"
              onClick={() =>
                setQr({ url: shelf, name: creator ? `${creator} 3D shop` : "3D shop" })
              }
            >
              <QrCode aria-hidden />
            </Button>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground @3xl/inset:col-span-2">
            {shelf.replace(/^https?:\/\//, "")}
          </p>
        </Panel>
      </Section>

      <Section
        title="Your program page"
        description="A co-branded page that explains activated merch, shows the steps and demos, and ends at the application."
      >
        <Panel className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <Globe className="size-5 shrink-0 text-[var(--partner)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {program.replace(/^https?:\/\//, "")}
          </span>
          <CopyButton value={program} label="Copy" size="sm" variant="default" />
          <Button asChild size="sm" variant="outline">
            <a href={program} target="_blank" rel="noopener">
              <ExternalLink aria-hidden /> Open
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="QR code"
            onClick={() => setQr({ url: program, name: `${ws.partner.name} program page` })}
          >
            <QrCode aria-hidden />
          </Button>
        </Panel>
      </Section>

      <Section
        title="Invite links"
        description="One per person on your team (or per campaign), so you can see who brought each creator in. Each link works for the program page, the 3D shop and the Creator Hub sign-up."
      >
        {ws.links.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {ws.links.map((l) => {
              const url = programUrl(ws, l.code);
              const joined = ws.creators.filter((c) => c.rep === l.rep && l.rep).length;
              return (
                <li key={l.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <Link2 className="size-4 shrink-0 text-[var(--partner)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {l.rep || `${ws.partner.name} (team link)`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{l.code}</span> · {l.uses} sign-up
                      {l.uses === 1 ? "" : "s"}
                      {joined ? ` · ${joined} creator${joined === 1 ? "" : "s"}` : ""} · since{" "}
                      {shortDate(l.createdAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </span>
                  </span>
                  <div className="flex gap-1.5">
                    <CopyButton value={url} label="Copy" size="sm" variant="outline" />
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`QR code for ${l.code}`}
                      onClick={() => setQr({ url, name: l.rep || ws.partner.name })}
                    >
                      <QrCode aria-hidden />
                    </Button>
                    {l.code !== ws.partner.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Archive ${l.code}`}
                        onClick={() => setArchiving(l.code)}
                      >
                        <Archive aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <form
          onSubmit={create}
          className="mt-4 grid gap-3 rounded-xl border border-dashed border-border p-4 @2xl/inset:grid-cols-[1fr_1fr_auto] @2xl/inset:items-end"
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Whose link?</span>
            <Input value={rep} onChange={(e) => setRep(e.target.value)} maxLength={80} required />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. VTuber outreach, spring"
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            New link
          </Button>
        </form>
      </Section>

      {qr ? (
        <QrDialog open onOpenChange={(o) => !o && setQr(null)} url={qr.url} name={qr.name} />
      ) : null}

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this link?</AlertDialogTitle>
            <AlertDialogDescription>
              New sign-ups through it won't be credited to you any more. Creators who already joined
              stay with your team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const code = archiving;
                setArchiving(null);
                if (!code) return;
                const r = await archivePartnerLink({ data: { code } });
                if (!r.ok) return toast.error(r.error);
                toast.success("Link archived");
                await router.invalidate();
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
