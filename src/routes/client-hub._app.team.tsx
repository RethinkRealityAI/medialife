import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2, Mail, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/hub/app/ui";
import {
  ClientHeader,
  ClientPage,
  ClientSection,
  Chip,
  Initials,
  btnGhost,
  btnPrimary,
  card,
  day,
} from "@/components/client/ui";
import { useClientWorkspace } from "@/components/client/workspace";
import { Input } from "@/components/ui/input";
import {
  getClientTeam,
  inviteClientMember,
  removeClientMember,
  revokeClientInvite,
  setClientMemberRole,
  updateClientProfile,
} from "@/lib/client/hub.functions";
import { CLIENT_ROLES, type ClientRole } from "@/lib/client/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/team")({
  head: () => ({ meta: [{ title: "Team · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientTeam(),
  component: Team,
});

const INPUT = "h-11 border-white/10 bg-black/30";

function Team() {
  const ws = useClientWorkspace();
  const data = Route.useLoaderData();
  const router = useRouter();
  const isAdmin = ws.me.role === "admin";

  return (
    <ClientPage>
      <ClientHeader
        eyebrow={`${ws.client.name} team`}
        title="Team and account"
        description="Everyone here has their own sign-in. Invite teammates by email; they choose their own password."
      />

      {isAdmin ? <InviteForm onDone={() => router.invalidate()} /> : null}

      <ClientSection title="People" className="mt-8">
        <ul className={cn(card, "divide-y divide-white/[0.06]")}>
          {data.members.length ? (
            data.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 p-4">
                <Initials name={m.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.name}
                    {m.userId === data.myUserId ? (
                      <span className="text-muted-foreground"> (you)</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.email} · joined {day(m.joinedAt)}
                  </span>
                </span>
                {isAdmin && m.userId !== data.myUserId ? (
                  <MemberActions userId={m.userId} role={m.role} name={m.name} />
                ) : (
                  <Chip tone={m.role === "admin" ? "accent" : "muted"}>
                    {CLIENT_ROLES[m.role].label}
                  </Chip>
                )}
              </li>
            ))
          ) : (
            <li className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <Users className="size-5" aria-hidden /> No one has joined yet.
            </li>
          )}
        </ul>
      </ClientSection>

      {isAdmin && data.invites.length ? (
        <ClientSection title="Waiting to join">
          <ul className={cn(card, "divide-y divide-white/[0.06]")}>
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid size-8 place-items-center rounded-full bg-white/[0.06]">
                  <Mail className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.name || i.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.email} · {CLIENT_ROLES[i.role].label} · expires {day(i.expiresAt)}
                  </span>
                </span>
                <button
                  type="button"
                  className={cn(btnGhost, "h-9")}
                  onClick={async () => {
                    await revokeClientInvite({ data: { id: i.id } });
                    toast.success("Invitation cancelled.");
                    await router.invalidate();
                  }}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </ClientSection>
      ) : null}

      {!ws.me.medialife ? <Profile name={ws.me.name} /> : null}
    </ClientPage>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ClientRole>("member");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; emailed: boolean; email: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await inviteClientMember({ data: { email, name, role } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLink({ url: r.link, emailed: r.emailSent, email });
      toast.success(r.emailSent ? `Invitation emailed to ${email}.` : "Invitation ready to send.");
      setEmail("");
      setName("");
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error && /email/i.test(err.message)
          ? "Enter a valid email."
          : "Couldn't send the invitation. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn(card, "mt-6 p-5 sm:p-6")}>
      <h2 className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-[var(--client)]" aria-hidden /> Invite a teammate
      </h2>
      <form
        onSubmit={submit}
        className="mt-4 grid gap-3 md:grid-cols-[1.3fr_1fr_auto_auto] md:items-end"
      >
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Email
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className={INPUT}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Name (optional)
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={INPUT}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ClientRole)}
            className="h-11 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-foreground"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={busy || !email} className={cn(btnPrimary, "h-11")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Send invite
        </button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{CLIENT_ROLES[role].blurb}</p>
      {link ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-sm">
            {link.emailed
              ? `We emailed ${link.email}. You can also send them this link yourself:`
              : `Send this link to ${link.email}. It works once, for 14 days, and only for that email:`}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2 py-1.5 text-xs">
              {link.url}
            </code>
            <CopyButton value={link.url} label="Copy link" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MemberActions({ userId, role, name }: { userId: string; role: ClientRole; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <select
        aria-label={`Role for ${name}`}
        value={role}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          const r = await setClientMemberRole({
            data: { userId, role: e.target.value as ClientRole },
          });
          if (!r.ok) toast.error(r.error);
          await router.invalidate();
          setBusy(false);
        }}
        className="h-9 rounded-md border border-white/10 bg-black/30 px-2 text-sm"
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Remove ${name} from the team? They lose access straight away.`))
            return;
          setBusy(true);
          const r = await removeClientMember({ data: { userId } });
          if (!r.ok) toast.error(r.error);
          else toast.success(`${name} was removed.`);
          await router.invalidate();
          setBusy(false);
        }}
        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </span>
  );
}

function Profile({ name: initial }: { name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <ClientSection title="Your account">
      <form
        className={cn(card, "flex flex-wrap items-end gap-3 p-5")}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await updateClientProfile({ data: { name } });
          if (!r.ok) toast.error(r.error);
          else toast.success("Saved.");
          await router.invalidate();
          setBusy(false);
        }}
      >
        <label className="grid min-w-[220px] flex-1 gap-1.5 text-xs font-medium text-muted-foreground">
          Your name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={INPUT}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || name === initial}
          className={cn(btnPrimary, "h-11")}
        >
          Save
        </button>
        <a href="/creator-hub/forgot-password" className={cn(btnGhost, "h-11")}>
          Change password
        </a>
      </form>
    </ClientSection>
  );
}
