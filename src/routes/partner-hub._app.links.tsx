import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Archive,
  Box,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Plus,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { QrDialog } from "@/components/hub/app/qr-download";
import { CopyButton, Monogram, Page } from "@/components/hub/app/ui";
import { IconTile, PartnerBanner, Surface, Tag } from "@/components/partner/ui";
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
import { kitFor, kitHero } from "@/lib/hub/collateral";
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
  const kit = kitFor(ws.partner.kit);
  const programPreview = kit.find((i) => i.id === "program-page")?.preview;
  const banner = kit.find((i) => i.id === "tap-charm")?.href ?? kitHero(ws.partner.kit);

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
      <PartnerBanner
        image={banner}
        imageClassName="object-[50%_40%]"
        eyebrow="Links & demos"
        title="Show, don't tell"
        description="Everything here carries your invite code, so every creator who signs up is credited to you."
      />

      <div className="mt-5 grid gap-4 @4xl/inset:grid-cols-2">
        <Surface accent as="section" className="flex flex-col overflow-hidden">
          <DemoPreview
            image="/partner-kit/medialife/shelf-preview.webp"
            label="3D shop"
            icon={Box}
            href={shelf}
          />
          <div className="flex flex-1 flex-col p-5">
            <h2 id="shelf" className="text-lg font-semibold tracking-tight">
              A 3D shop for one creator
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Their name in neon over activated merch with their name on it. The best opener there
              is.
            </p>
            <div className="mt-4 grid gap-3 @xl/inset:grid-cols-2">
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
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <CopyButton
                value={shelf}
                label="Copy link"
                variant="default"
                size="default"
                toastText="3D shop link copied"
              />
              <Button asChild variant="outline">
                <a href={shelf} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden /> Open
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="QR code for the 3D shop"
                onClick={() =>
                  setQr({ url: shelf, name: creator ? `${creator} 3D shop` : "3D shop" })
                }
              >
                <QrCode aria-hidden />
              </Button>
            </div>
          </div>
        </Surface>

        <Surface accent as="section" className="flex flex-col overflow-hidden">
          <DemoPreview
            image={programPreview ?? "/partner-kit/medialife/roblox-program.webp"}
            label="Program page"
            icon={Globe}
            href={program}
          />
          <div className="flex flex-1 flex-col p-5">
            <h2 className="text-lg font-semibold tracking-tight">Your program page</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Co-branded. Explains activated merch, shows the five steps and demos, and ends at the
              application.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5">
              <Link2 className="size-4 shrink-0 text-[var(--partner)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {program.replace(/^https?:\/\//, "")}
              </span>
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <CopyButton
                value={program}
                label="Copy link"
                variant="default"
                size="default"
                toastText="Program link copied"
              />
              <Button asChild variant="outline">
                <a href={program} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden /> Open
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="QR code for the program page"
                onClick={() => setQr({ url: program, name: `${ws.partner.name} program page` })}
              >
                <QrCode aria-hidden />
              </Button>
            </div>
          </div>
        </Surface>
      </div>

      <Surface as="section" className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] p-5">
          <IconTile icon={Link2} tone="blue" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Invite links</h2>
            <p className="text-sm text-muted-foreground">
              One per teammate or campaign, so you can see who brought each creator in.
            </p>
          </div>
        </div>
        {ws.links.length ? (
          <ul className="divide-y divide-white/[0.06]">
            {ws.links.map((l) => {
              const url = programUrl(ws, l.code);
              const joined = ws.creators.filter((c) => c.rep === l.rep && l.rep).length;
              return (
                <li key={l.code} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                  <Monogram name={l.rep || ws.partner.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {l.rep || `${ws.partner.name} (team link)`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{l.code}</span> · since {shortDate(l.createdAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <Tag tone="ice">
                      {l.uses} sign-up{l.uses === 1 ? "" : "s"}
                    </Tag>
                    {joined ? (
                      <Tag tone="mint">
                        {joined} creator{joined === 1 ? "" : "s"}
                      </Tag>
                    ) : null}
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
          className="grid gap-3 border-t border-white/[0.06] bg-white/[0.02] p-5 @2xl/inset:grid-cols-[1fr_1fr_auto] @2xl/inset:items-end"
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
      </Surface>

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

/** A screenshot of the page, opening it in a new tab. */
function DemoPreview({
  image,
  label,
  icon: Icon,
  href,
}: {
  image: string;
  label: string;
  icon: LucideIcon;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="group relative block aspect-[16/9] overflow-hidden bg-[var(--partner-ink)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none focus-visible:ring-inset"
      aria-label={`Open the ${label.toLowerCase()} in a new tab`}
    >
      <img
        src={image}
        alt=""
        className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium backdrop-blur">
        <Icon className="size-3.5 text-[var(--partner)]" aria-hidden /> {label}
      </span>
      <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-[var(--partner)] px-2.5 py-1 text-xs font-semibold text-[var(--partner-ink)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        Open <ExternalLink className="size-3" aria-hidden />
      </span>
    </a>
  );
}
