import { useId, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Mail, Send, Unlink, X } from "lucide-react";

import { StatusPill, useRun, Field } from "@/components/admin/creators/ui";
import { CopyButton, PageHeader, Panel, PanelTitle } from "@/components/admin/kit";
import { PartnerForm } from "@/components/admin/partners/partner-form";
import { AssetLibrary, type LibraryNav } from "@/components/hub/assets/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminGetPartner,
  adminInvitePartnerMember,
  adminRemovePartnerMember,
  adminRevokePartnerInvite,
  adminSetCreatorPartner,
} from "@/lib/hub/admin-partners.functions";
import { shortDate } from "@/lib/hub/model";
import { PARTNER_ROLES, type PartnerRole } from "@/lib/hub/partners";

export const Route = createFileRoute("/admin/partners/$partnerId")({
  loader: async ({ params }) => {
    const d = await adminGetPartner({ data: { id: params.partnerId } });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.partner.name ?? "Partner"} · Partners | MEDIALIFE` }],
  }),
  component: PartnerDetail,
});

function PartnerDetail() {
  const d = Route.useLoaderData();
  const p = d.partner;
  const hub = `${d.origin}/partner-hub`;
  const program = `${d.origin}/with/${p.id}`;

  return (
    <>
      <PageHeader
        title={p.name}
        badge={
          p.status === "paused" ? <span className="text-xs text-amber-300">Paused</span> : null
        }
        actions={
          <>
            <Button asChild size="sm">
              <Link to="/admin/partners/collateral" search={{ scope: p.id }}>
                Collateral
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={program} target="_blank" rel="noopener">
                <ExternalLink aria-hidden /> Program page
              </a>
            </Button>
          </>
        }
      >
        <Link
          to="/admin/partners"
          className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Partners
        </Link>
      </PageHeader>
      <div className="p-4 sm:p-6 lg:p-8">
        <Tabs defaultValue={d.members.length ? "creators" : "team"}>
          <TabsList>
            <TabsTrigger value="team">Team ({d.members.length})</TabsTrigger>
            <TabsTrigger value="creators">Creators ({d.creators.length})</TabsTrigger>
            <TabsTrigger value="library">Library ({d.library.files.length})</TabsTrigger>
            <TabsTrigger value="links">Links ({d.links.length})</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-4 space-y-4">
            <Panel className="flex flex-wrap items-center gap-3 p-4">
              <span className="min-w-0 flex-1 text-sm">
                Partner Hub: <span className="font-mono">{hub}</span>
                <span className="block text-xs text-muted-foreground">
                  Teammates sign in at the Creator Hub sign-in page and land here.
                </span>
              </span>
              <CopyButton text={hub} showLabel size="sm" />
            </Panel>
            <TeamPanel data={d} />
          </TabsContent>

          <TabsContent value="creators" className="mt-4">
            <CreatorsPanel data={d} />
          </TabsContent>

          <TabsContent value="library" className="mt-4">
            <Panel className="p-4 sm:p-5">
              <PanelTitle
                title={`${p.name} library`}
                sub="Files only this partner sees, under “From the MEDIALIFE team” in their collateral. For files every partner should get, use the MEDIALIFE kit."
              />
              <div className="mt-4">
                <LibraryFor
                  owner={d.library.owner}
                  files={d.library.files}
                  folders={d.library.folders}
                />
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="links" className="mt-4">
            <Panel className="p-4 sm:p-5">
              <PanelTitle
                title="Invite links"
                sub="Made by the partner's team in the Partner Hub, plus their default link."
              />
              <ul className="mt-3 divide-y divide-border text-sm">
                {d.links.map((l) => (
                  <li key={l.code} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="font-mono">{l.code}</span>
                    <span className="text-muted-foreground">{l.rep || "Default"}</span>
                    <span className="text-muted-foreground">{l.uses} sign-ups</span>
                    {l.archived ? <span className="text-xs text-amber-300">Archived</span> : null}
                    <span className="ml-auto">
                      <CopyButton
                        text={`${program}?invite=${l.code}`}
                        size="sm"
                        showLabel
                        label="Copy program link"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Panel className="p-4 sm:p-5">
              <PartnerForm partner={p} />
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}

type Data = NonNullable<Awaited<ReturnType<typeof adminGetPartner>>>;

function TeamPanel({ data: d }: { data: Data }) {
  const uid = useId();
  const { run, busy } = useRun();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<PartnerRole>(d.members.length ? "member" : "admin");
  const [link, setLink] = useState<string | null>(null);

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title={d.members.length ? "Invite someone" : "Invite their first admin"}
          sub="They get an email; the link works for 14 days and only for that address. Admins can then invite the rest of their team themselves."
        />
        <form
          className="mt-4 grid gap-3 md:grid-cols-[1.3fr_1fr_9rem_auto] md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setLink(null);
            const r = await run(
              "invite",
              () =>
                adminInvitePartnerMember({ data: { partnerId: d.partner.id, email, name, role } }),
              (x) => (x.ok && x.emailSent ? `Invitation sent to ${email}` : "Invitation created"),
            );
            if (r && r.ok) {
              if (r.link) setLink(r.link);
              setEmail("");
              setName("");
            }
          }}
        >
          <Field label="Email" htmlFor={`${uid}-email`}>
            <Input
              id={`${uid}-email`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Name" htmlFor={`${uid}-name`} optional>
            <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor={`${uid}-role`}>
            <select
              id={`${uid}-role`}
              value={role}
              onChange={(e) => setRole(e.target.value as PartnerRole)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {(Object.keys(PARTNER_ROLES) as PartnerRole[]).map((r) => (
                <option key={r} value={r}>
                  {PARTNER_ROLES[r].label}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" disabled={busy}>
            <Send aria-hidden /> Invite
          </Button>
        </form>
        {link ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            <span className="min-w-0 flex-1">
              Email isn't configured here. Send this link yourself:
              <span className="block truncate font-mono text-xs">{link}</span>
            </span>
            <CopyButton text={link} />
          </div>
        ) : null}
      </Panel>

      {d.invites.length ? (
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Waiting to accept" />
          <ul className="mt-2 divide-y divide-border text-sm">
            {d.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {i.email} · {PARTNER_ROLES[i.role].label} ·{" "}
                  {i.expiresAt < Date.now() ? "expired" : `until ${shortDate(i.expiresAt)}`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Cancel the invitation to ${i.email}`}
                  onClick={() =>
                    void run(
                      "revoke",
                      () =>
                        adminRevokePartnerInvite({
                          data: { partnerId: d.partner.id, id: i.id },
                        }).then((r) => ({ ok: r.ok })),
                      "Invitation cancelled",
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Team" />
        {d.members.length ? (
          <ul className="mt-2 divide-y divide-border text-sm">
            {d.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.name || m.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.email} · {PARTNER_ROLES[m.role].label} · joined {shortDate(m.joinedAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(
                      `remove-${m.userId}`,
                      () =>
                        adminRemovePartnerMember({
                          data: { partnerId: d.partner.id, userId: m.userId },
                        }),
                      "Removed from the team",
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No one yet. Invite their first admin above.
          </p>
        )}
      </Panel>
    </>
  );
}

function CreatorsPanel({ data: d }: { data: Data }) {
  const { run, busy } = useRun();
  const [pick, setPick] = useState("");
  const [rep, setRep] = useState("");
  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title="Creators tied to this partner"
          sub="They see everything about these creators in the Partner Hub. Creators who sign up with the partner's links are tied automatically."
        />
        {d.creators.length ? (
          <ul className="mt-3 divide-y divide-border text-sm">
            {d.creators.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Link
                  to="/admin/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  {c.displayName}
                </Link>
                <StatusPill status={c.status} />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Untie ${c.displayName}`}
                  onClick={() =>
                    void run(
                      `untie-${c.id}`,
                      () => adminSetCreatorPartner({ data: { creatorId: c.id, partnerId: null } }),
                      "Untied",
                    )
                  }
                >
                  <Unlink aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
        )}
      </Panel>
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title="Tie a creator"
          sub="For a creator who signed up without the partner's link."
        />
        <form
          className="mt-3 grid gap-3 md:grid-cols-[1.5fr_1fr_auto] md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pick) return;
            const r = await run(
              "tie",
              () =>
                adminSetCreatorPartner({
                  data: { creatorId: pick, partnerId: d.partner.id, rep: rep.trim() || undefined },
                }),
              "Tied to the partner",
            );
            if (r) {
              setPick("");
              setRep("");
            }
          }}
        >
          <Field label="Creator">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Choose a creator…</option>
              {d.otherCreators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                  {c.agency ? ` (now: ${c.agency})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brought in by" optional>
            <Input
              value={rep}
              onChange={(e) => setRep(e.target.value)}
              placeholder="Their rep's name"
            />
          </Field>
          <Button type="submit" disabled={busy || !pick}>
            Tie creator
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function LibraryFor({
  owner,
  files,
  folders,
}: {
  owner: string;
  files: Data["library"]["files"];
  folders: Data["library"]["folders"];
}) {
  const [nav, setNav] = useState<LibraryNav>({});
  return (
    <AssetLibrary
      mode="admin"
      creatorId={owner}
      files={files}
      folders={folders}
      products={[]}
      nav={nav}
      onNav={setNav}
    />
  );
}
