import { useEffect, useId, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Plus, QrCode as QrIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminArchiveInvite, adminCreateInvite } from "@/lib/hub/admin.functions";
import { HUB } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { formatDate, formatDateTime } from "../format";
import { CopyButton, Panel, PanelTitle } from "../kit";
import { UrlText } from "../links/url-text";
import { randomSuffix, slugify, useOrigin } from "../links/util";
import { QrCode } from "../qr";
import { QrDialog, UrlPill } from "./qr-dialog";
import type { InviteRow } from "./types";
import { Field, ghostBtn, useRun } from "./ui";

const CODE_RE = /^[a-z0-9-]{2,40}$/;

export const inviteUrl = (origin: string, code: string) =>
  `${origin}${HUB.base}/join?invite=${encodeURIComponent(code)}`;

export function InvitesPanel({ invites }: { invites: InviteRow[] }) {
  const origin = useOrigin();
  const { pending, run } = useRun();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [qrFor, setQrFor] = useState<InviteRow | null>(null);
  const active = invites.filter((i) => !i.archived);
  const archived = invites.filter((i) => i.archived);
  const shown = showArchived ? archived : active;

  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        title="Invite links"
        sub="For agency partners. Creators who join with this link are tagged with the agency."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New invite link
          </Button>
        }
      />
      {!shown.length ? (
        <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {showArchived ? "Nothing archived." : "No invite links yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {shown.map((inv) => {
            const url = inviteUrl(origin, inv.code);
            return (
              <li
                key={inv.code}
                className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{inv.agencyName || "No agency"}</span>
                    {inv.rep ? (
                      <span className="text-xs text-muted-foreground">via {inv.rep}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1">
                    <UrlText url={url} className="min-w-0" />
                    <CopyButton
                      text={url}
                      label="Copy invite link"
                      toastText="Invite link copied"
                      className="size-7"
                    />
                  </div>
                  {inv.note ? (
                    <p
                      className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80"
                      title={inv.note}
                    >
                      {inv.note}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs whitespace-nowrap">
                  <div>
                    <span className="font-medium tabular-nums">{inv.uses}</span>{" "}
                    <span className="text-muted-foreground">
                      sign-up{inv.uses === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div
                    className="text-muted-foreground"
                    suppressHydrationWarning
                    title={formatDateTime(inv.createdAt)}
                  >
                    Created {formatDate(inv.createdAt)}
                  </div>
                </div>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("size-8 text-muted-foreground", ghostBtn)}
                    onClick={() => setQrFor(inv)}
                    aria-label={`QR code for ${inv.code}`}
                    title="QR code"
                  >
                    <QrIcon aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("size-8 text-muted-foreground", ghostBtn)}
                    disabled={pending === inv.code}
                    onClick={() =>
                      void run(
                        inv.code,
                        () =>
                          adminArchiveInvite({ data: { code: inv.code, archived: !inv.archived } }),
                        inv.archived
                          ? "Invite link restored"
                          : "Invite link archived. It no longer works.",
                      )
                    }
                    aria-label={inv.archived ? `Restore ${inv.code}` : `Archive ${inv.code}`}
                    title={inv.archived ? "Restore" : "Archive"}
                  >
                    {pending === inv.code ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : inv.archived ? (
                      <ArchiveRestore aria-hidden />
                    ) : (
                      <Archive aria-hidden />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {archived.length ? (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showArchived
              ? `Back to active links (${active.length})`
              : `Show archived (${archived.length})`}
          </button>
        </div>
      ) : null}

      <CreateInviteDialog open={creating} onOpenChange={setCreating} />
      <QrDialog
        open={!!qrFor}
        onOpenChange={(o) => !o && setQrFor(null)}
        url={qrFor ? inviteUrl(origin, qrFor.code) : ""}
        title={`Invite link: ${qrFor?.agencyName || qrFor?.code || ""}`}
        description="Scans to the Creator Hub sign-up, tagged with this agency."
        file={`creator-hub-invite-${qrFor?.code ?? ""}`}
      />
    </Panel>
  );
}

function CreateInviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const { pending, run } = useRun();
  const [agency, setAgency] = useState("");
  const [rep, setRep] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [note, setNote] = useState("");
  const [suffix, setSuffix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; code: string; agency: string } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setAgency("");
    setRep("");
    setCode("");
    setCodeEdited(false);
    setNote("");
    setError(null);
    setCreated(null);
    setSuffix(randomSuffix(3));
  }, [open]);

  const suggested =
    [slugify(agency), slugify(rep)].filter(Boolean).join("-").slice(0, 32) || "invite";
  const effectiveCode = codeEdited ? code : `${suggested}-${suffix}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = effectiveCode.trim().toLowerCase();
    if (!CODE_RE.test(c)) return setError("2–40 lowercase letters, numbers or dashes");
    setError(null);
    const r = await run("create", () =>
      adminCreateInvite({
        data: { code: c, agencyName: agency.trim(), rep: rep.trim(), note: note.trim() },
      }),
    );
    if (r && r.ok)
      setCreated({ url: r.url, code: r.invite.code, agency: r.invite.agencyName ?? "" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md [&>*]:min-w-0">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite link ready</DialogTitle>
              <DialogDescription>
                Send this to {created.agency || "the partner"}. Creators who join with it are tagged
                with the agency.
              </DialogDescription>
            </DialogHeader>
            <QrCode value={created.url} className="mx-auto w-full max-w-48 rounded-lg" />
            <UrlPill url={created.url} />
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button variant="ghost" className={ghostBtn} onClick={() => setCreated(null)}>
                Create another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New invite link</DialogTitle>
              <DialogDescription>
                Creators who join with this link are tagged with the agency, so the team knows who
                referred them.
              </DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Agency" htmlFor={`${uid}-agency`} optional>
                  <Input
                    id={`${uid}-agency`}
                    value={agency}
                    maxLength={80}
                    placeholder="Snowday Media"
                    onChange={(e) => setAgency(e.target.value)}
                  />
                </Field>
                <Field label="Rep" htmlFor={`${uid}-rep`} optional>
                  <Input
                    id={`${uid}-rep`}
                    value={rep}
                    maxLength={80}
                    placeholder="Who is sending it"
                    onChange={(e) => setRep(e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Code"
                htmlFor={`${uid}-code`}
                error={error}
                hint={
                  <>
                    The link ends in <span className="mono">?invite={effectiveCode || "…"}</span>
                  </>
                }
              >
                <Input
                  id={`${uid}-code`}
                  value={effectiveCode}
                  maxLength={40}
                  className="mono"
                  onChange={(e) => {
                    setCodeEdited(true);
                    setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }}
                />
              </Field>
              <Field label="Note" htmlFor={`${uid}-note`} optional hint="Only the team sees this.">
                <Textarea
                  id={`${uid}-note`}
                  rows={2}
                  className="min-h-0"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="ghost"
                  className={ghostBtn}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!!pending}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Create link
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
