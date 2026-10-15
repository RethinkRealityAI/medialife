import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2, Mail, Send, UserMinus, X } from "lucide-react";
import { toast } from "sonner";

import { CopyButton, Monogram, Page, Pill, Section } from "@/components/hub/app/ui";
import { PartnerBanner, Surface } from "@/components/partner/ui";
import { usePartnerWorkspace } from "@/components/partner/workspace";
import { kitFor, kitHero } from "@/lib/hub/collateral";
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
import { changePassword } from "@/lib/hub/auth.functions";
import { shortDate } from "@/lib/hub/model";
import {
  getPartnerTeam,
  invitePartnerMember,
  removeMember,
  revokeTeamInvite,
  setMemberRole,
  updatePartnerProfile,
} from "@/lib/hub/partner.functions";
import { PARTNER_ROLES, type PartnerRole } from "@/lib/hub/partners";

export const Route = createFileRoute("/partner-hub/_app/team")({
  loader: () => getPartnerTeam(),
  head: () => ({ meta: [{ title: "Team · Partner Hub | MEDIALIFE" }] }),
  component: Team,
});

const errorOf = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";

function Team() {
  const ws = usePartnerWorkspace();
  const team = Route.useLoaderData();
  const router = useRouter();
  const isAdmin = ws.me.role === "admin";
  const [removing, setRemoving] = useState<{ userId: string; name: string; self: boolean } | null>(
    null,
  );

  return (
    <Page className="lg:pt-8">
      <PartnerBanner
        image={
          kitFor(ws.partner.kit).find((i) => i.id === "aurora-banner")?.href ??
          kitHero(ws.partner.kit)
        }
        imageClassName="object-left"
        eyebrow={ws.partner.name}
        title="Team"
        description={`Everyone with access to the Partner Hub. ${isAdmin ? "Invite teammates by email; they choose a password when they accept." : "Ask an admin to invite teammates."}`}
      />

      <Section title={`Members (${team.members.length})`}>
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.05),rgb(255_255_255/0.015))] shadow-[0_20px_40px_-24px_rgb(0_0_0/0.9)]">
          {team.members.map((m) => {
            const me = m.userId === ws.me.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 p-4">
                <Monogram name={m.name || m.email} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.name || m.email}{" "}
                    {me ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.email} · joined {shortDate(m.joinedAt)}
                  </span>
                </span>
                {isAdmin && !me ? (
                  <select
                    aria-label={`Role for ${m.name || m.email}`}
                    value={m.role}
                    onChange={async (e) => {
                      const r = await setMemberRole({
                        data: { userId: m.userId, role: e.target.value as PartnerRole },
                      });
                      if (!r.ok) return toast.error(r.error);
                      toast.success("Role updated");
                      await router.invalidate();
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {(Object.keys(PARTNER_ROLES) as PartnerRole[]).map((r) => (
                      <option key={r} value={r}>
                        {PARTNER_ROLES[r].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Pill tone={m.role === "admin" ? "primary" : "muted"}>
                    {PARTNER_ROLES[m.role].label}
                  </Pill>
                )}
                {isAdmin || me ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={me ? "Leave the team" : `Remove ${m.name || m.email}`}
                    onClick={() =>
                      setRemoving({ userId: m.userId, name: m.name || m.email, self: me })
                    }
                  >
                    <UserMinus aria-hidden />
                    <span className="sr-only @xl/inset:not-sr-only">{me ? "Leave" : "Remove"}</span>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {PARTNER_ROLES.admin.label}: {PARTNER_ROLES.admin.blurb} {PARTNER_ROLES.member.label}:{" "}
          {PARTNER_ROLES.member.blurb}
        </p>
      </Section>

      {isAdmin ? <InviteForm pending={team.invites} /> : null}

      <Section title="Your account">
        <AccountForms />
      </Section>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.self ? "Leave the team?" : `Remove ${removing?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.self
                ? "You'll lose access to the Partner Hub. An admin can invite you back."
                : "They lose access to the Partner Hub straight away. Creators they brought in stay with your team."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const r0 = removing;
                setRemoving(null);
                if (!r0) return;
                try {
                  const r = await removeMember({ data: { userId: r0.userId } });
                  if (!r.ok) return toast.error(r.error);
                  if (r.self) {
                    window.location.assign("/creator-hub/sign-in");
                    return;
                  }
                  toast.success(`${r0.name} removed`);
                  await router.invalidate();
                } catch (e) {
                  toast.error(errorOf(e));
                }
              }}
            >
              {removing?.self ? "Leave" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function InviteForm({
  pending,
}: {
  pending: Array<{
    id: string;
    email: string;
    name: string;
    role: PartnerRole;
    createdAt: number;
    expiresAt: number;
  }>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<PartnerRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const r = await invitePartnerMember({ data: { email, name, role } });
      if (!r.ok) return setError(r.error);
      if (r.emailSent) toast.success(`Invitation sent to ${email}`);
      else if (r.link) setLink({ email, url: r.link });
      setEmail("");
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Invite a teammate"
      description="They get an email with a link that works for 14 days."
    >
      <Surface className="p-4 sm:p-5">
        <form
          onSubmit={submit}
          className="grid gap-3 @3xl/inset:grid-cols-[1.3fr_1fr_9rem_auto] @3xl/inset:items-end"
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Email</span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              aria-invalid={!!error}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PartnerRole)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {(Object.keys(PARTNER_ROLES) as PartnerRole[]).map((r) => (
                <option key={r} value={r}>
                  {PARTNER_ROLES[r].label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Send invite
          </Button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {link ? (
          <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            Email isn't set up here, so send {link.email} this link yourself:
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{link.url}</span>
              <CopyButton value={link.url} label="Copy" size="sm" />
            </div>
          </div>
        ) : null}
      </Surface>
      {pending.length ? (
        <ul className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.05),rgb(255_255_255/0.015))] shadow-[0_20px_40px_-24px_rgb(0_0_0/0.9)]">
          {pending.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3 text-sm">
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {i.name ? `${i.name} · ` : ""}
                {i.email}{" "}
                <span className="text-muted-foreground">
                  · {PARTNER_ROLES[i.role].label} · invited {shortDate(i.createdAt)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Cancel the invitation to ${i.email}`}
                onClick={async () => {
                  await revokeTeamInvite({ data: { id: i.id } });
                  toast.success("Invitation cancelled");
                  await router.invalidate();
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function AccountForms() {
  const ws = usePartnerWorkspace();
  const router = useRouter();
  const [name, setName] = useState(ws.me.name);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"name" | "password" | null>(null);

  return (
    <div className="grid gap-3 @3xl/inset:grid-cols-2">
      <Surface className="p-4 sm:p-5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("name");
            try {
              await updatePartnerProfile({ data: { name } });
              toast.success("Saved");
              await router.invalidate();
            } catch (err) {
              toast.error(errorOf(err));
            } finally {
              setBusy(null);
            }
          }}
          className="grid gap-3"
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Your name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <p className="text-xs text-muted-foreground">Signed in as {ws.me.email}</p>
          <Button
            type="submit"
            variant="outline"
            disabled={busy === "name"}
            className="justify-self-start"
          >
            Save
          </Button>
        </form>
      </Surface>
      <Surface className="p-4 sm:p-5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("password");
            try {
              const r = await changePassword({ data: { current, next } });
              if (!r.ok) return toast.error(r.error);
              toast.success("Password changed");
              setCurrent("");
              setNext("");
            } catch (err) {
              toast.error(errorOf(err));
            } finally {
              setBusy(null);
            }
          }}
          className="grid gap-3"
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Current password</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">New password</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={10}
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={busy === "password"}
            className="justify-self-start"
          >
            Change password
          </Button>
        </form>
      </Surface>
    </div>
  );
}
