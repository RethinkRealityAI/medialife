import { useId, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ExternalLink,
  FolderOpen,
  Library,
  Link2,
  Mail,
  Send,
  Settings,
  Unlink,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { z } from "zod";

import { StatusPill, useRun, Field } from "@/components/admin/creators/ui";
import {
  AdminTab,
  AdminTabs,
  Avatar,
  BackLink,
  CopyButton,
  EmptyState,
  Panel,
  PanelTitle,
  StatTile,
  TabCount,
  Tag,
  accentEdge,
  well,
} from "@/components/admin/kit";
import { PartnerForm } from "@/components/admin/partners/partner-form";
import { AssetLibrary, type LibraryNav } from "@/components/hub/assets/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import {
  adminGetPartner,
  adminInvitePartnerMember,
  adminRemovePartnerMember,
  adminRevokePartnerInvite,
  adminSetCreatorPartner,
} from "@/lib/hub/admin-partners.functions";
import { kitHero, kitLogo } from "@/lib/hub/collateral";
import { shortDate } from "@/lib/hub/model";
import { PARTNER_ROLES, type PartnerRole } from "@/lib/hub/partners";
import { cn } from "@/lib/utils";

const TABS = ["team", "creators", "library", "links", "settings"] as const;
type Tab = (typeof TABS)[number];

// /admin/partners/:id: one partner. Their team and invitations, the creators
// tied to them, their own library, their invite links and settings. ?tab= keeps
// the section.

export const Route = createFileRoute("/admin/partners/$partnerId")({
  validateSearch: z.object({ tab: z.enum(TABS).optional().catch(undefined) }),
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

const select =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function PartnerDetail() {
  const d = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const p = d.partner;
  const hub = `${d.origin}/partner-hub`;
  const program = `${d.origin}/with/${p.id}`;
  const logo = kitLogo(p.kit);
  const tab: Tab = search.tab ?? (d.members.length ? "creators" : "team");
  const active = d.creators.filter((c) => c.status === "approved").length;
  const signups = d.links.reduce((s, l) => s + l.uses, 0);

  return (
    <>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <header
          className={cn("relative isolate overflow-hidden rounded-3xl border", accentEdge)}
          style={{ background: p.brand.ink }}
        >
          <img
            src={kitHero(p.kit)}
            alt=""
            className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-right opacity-75 sm:w-3/4"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background: `linear-gradient(90deg, ${p.brand.ink} 0%, color-mix(in oklab, ${p.brand.ink} 88%, transparent) 45%, color-mix(in oklab, ${p.brand.ink} 15%, transparent) 100%)`,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 -z-10 h-px opacity-80"
            style={{
              background: `linear-gradient(90deg, transparent, ${p.brand.accent}, transparent)`,
            }}
          />
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
            <div className="min-w-0 max-w-xl">
              <BackLink to="/admin/partners">Partners</BackLink>
              <div className="mt-3 flex items-center gap-3">
                {logo ? (
                  <img src={logo.wordmark} alt="" className="h-8 w-auto sm:h-9" />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-10 place-items-center rounded-xl ring-1 ring-white/25"
                    style={{
                      background: `linear-gradient(135deg, ${p.brand.accent}, ${p.brand.primary})`,
                    }}
                  >
                    <span className="size-3 rounded-full bg-background/85" />
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                  {p.name}
                </h1>
                {p.status === "paused" ? (
                  <Tag tone="amber">Paused</Tag>
                ) : (
                  <Tag tone="mint">Live</Tag>
                )}
              </div>
              <p className="mt-1 text-sm text-white/70">
                Program page <span className="mono text-xs text-white/85">/with/{p.id}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" className="h-9">
                <Link to="/admin/partners/collateral" search={{ scope: p.id }}>
                  <FolderOpen aria-hidden /> Collateral
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 bg-black/30 backdrop-blur">
                <a href={program} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden /> Program page
                </a>
              </Button>
            </div>
          </div>
        </header>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
          <StatTile
            label="Creators"
            value={d.creators.length}
            hint={`${active} active`}
            icon={UsersRound}
            tone="sky"
            onClick={() => void navigate({ search: { tab: "creators" }, replace: true })}
            active={tab === "creators"}
          />
          <StatTile
            label="Team"
            value={d.members.length}
            hint={d.invites.length ? `${d.invites.length} invited` : "In the Partner Hub"}
            icon={Users}
            tone="violet"
            onClick={() => void navigate({ search: { tab: "team" }, replace: true })}
            active={tab === "team"}
          />
          <StatTile
            label="Their library"
            value={d.library.files.length}
            hint="Files only they see"
            icon={Library}
            tone="amber"
            onClick={() => void navigate({ search: { tab: "library" }, replace: true })}
            active={tab === "library"}
          />
          <StatTile
            label="Link sign-ups"
            value={signups}
            hint={`${d.links.length} invite link${d.links.length === 1 ? "" : "s"}`}
            icon={Link2}
            tone="mint"
            onClick={() => void navigate({ search: { tab: "links" }, replace: true })}
            active={tab === "links"}
          />
        </div>

        <AdminTabs
          label="Partner sections"
          value={tab}
          onChange={(t) => void navigate({ search: { tab: t }, replace: true })}
          tabs={[
            { id: "team", label: "Team", icon: Users, badge: <TabCount n={d.members.length} /> },
            {
              id: "creators",
              label: "Creators",
              icon: UsersRound,
              badge: <TabCount n={d.creators.length} />,
            },
            {
              id: "library",
              label: "Library",
              icon: Library,
              badge: <TabCount n={d.library.files.length} />,
            },
            { id: "links", label: "Links", icon: Link2, badge: <TabCount n={d.links.length} /> },
            { id: "settings", label: "Settings", icon: Settings },
          ]}
        >
          <AdminTab value="team" className="space-y-4">
            <div className={cn(well, "flex flex-wrap items-center gap-3 rounded-2xl p-3 sm:p-4")}>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block text-xs text-muted-foreground">
                  Partner Hub · teammates sign in at the Creator Hub sign-in and land here
                </span>
                <span className="mono block truncate text-[13px]">{hub}</span>
              </span>
              <CopyButton text={hub} showLabel size="sm" label="Copy link" />
            </div>
            <TeamPanel data={d} />
          </AdminTab>

          <AdminTab value="creators">
            <CreatorsPanel data={d} />
          </AdminTab>

          <AdminTab value="library">
            <Panel className="p-4 sm:p-5">
              <PanelTitle
                icon={Library}
                tone="amber"
                title={`${p.name} library`}
                sub="Only this partner sees these, under “From the MEDIALIFE team”. Files for every partner go in the MEDIALIFE kit."
                actions={
                  <Button asChild variant="outline" size="sm" className="bg-transparent">
                    <Link to="/admin/partners/kit">MEDIALIFE kit</Link>
                  </Button>
                }
              />
              <div className="mt-4">
                <LibraryFor
                  owner={d.library.owner}
                  files={d.library.files}
                  folders={d.library.folders}
                />
              </div>
            </Panel>
          </AdminTab>

          <AdminTab value="links">
            <Panel>
              <PanelTitle
                className="p-4 sm:p-5"
                icon={Link2}
                tone="mint"
                title="Invite links"
                sub="Made by the partner's team in the Partner Hub, plus their default link."
              />
              {d.links.length ? (
                <ul className="grid grid-cols-1 gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
                  {d.links.map((l) => (
                    <li
                      key={l.code}
                      className={cn(
                        well,
                        "flex flex-wrap items-center gap-x-3 gap-y-2 p-3",
                        l.archived && "opacity-60",
                      )}
                    >
                      <Avatar name={l.rep || p.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {l.rep || "Default link"}
                        </span>
                        <span className="mono block truncate text-xs text-muted-foreground">
                          ?invite={l.code}
                        </span>
                      </span>
                      {l.archived ? <Tag tone="amber">Archived</Tag> : null}
                      <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                        <UserPlus className="size-3.5 text-emerald-300" aria-hidden />
                        {l.uses}
                        <span className="text-xs font-normal text-muted-foreground">
                          sign-up{l.uses === 1 ? "" : "s"}
                        </span>
                      </span>
                      <CopyButton
                        text={`${program}?invite=${l.code}`}
                        size="sm"
                        showLabel
                        label="Copy program link"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <EmptyState icon={Link2} tone="mint" title="No links yet">
                    Their team makes links in the Partner Hub.
                  </EmptyState>
                </div>
              )}
            </Panel>
          </AdminTab>

          <AdminTab value="settings">
            <Panel className="p-4 sm:p-5">
              <PanelTitle
                icon={Settings}
                tone="slate"
                title="Settings"
                sub="Name, links, colours and their collateral set."
                className="mb-5"
              />
              <PartnerForm partner={p} />
            </Panel>
          </AdminTab>
        </AdminTabs>
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
    <div className="grid grid-cols-1 items-start gap-4 @5xl/inset:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={Users}
          tone="violet"
          title={`Team (${d.members.length})`}
          sub="People who can sign in to their Partner Hub."
        />
        {d.members.length ? (
          <ul className="mt-4 grid grid-cols-1 gap-2">
            {d.members.map((m) => (
              <li key={m.userId} className={cn(well, "flex items-center gap-3 p-2.5 pr-2")}>
                <Avatar name={m.name || m.email} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">{m.name || m.email}</span>
                    <Tag tone={m.role === "admin" ? "violet" : "slate"}>
                      {PARTNER_ROLES[m.role].label}
                    </Tag>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.email} · joined {shortDate(m.joinedAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
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
          <EmptyState icon={Users} tone="violet" title="No one yet" className="mt-4 py-8">
            Invite their first admin.
          </EmptyState>
        )}

        {d.invites.length ? (
          <>
            <h3 className="mt-5 mb-2 text-xs font-medium tracking-wide text-white/55 uppercase">
              Waiting to accept
            </h3>
            <ul className="grid grid-cols-1 gap-2">
              {d.invites.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-white/[0.12] p-2.5 pr-2"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-muted-foreground">
                    <Mail className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{i.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {PARTNER_ROLES[i.role].label} ·{" "}
                      {i.expiresAt < Date.now() ? "expired" : `until ${shortDate(i.expiresAt)}`}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    aria-label={`Cancel the invitation to ${i.email}`}
                    title="Cancel invitation"
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
          </>
        ) : null}
      </Panel>

      <Panel accent className="p-4 sm:p-5">
        <PanelTitle
          icon={Send}
          tone="sky"
          title={d.members.length ? "Invite someone" : "Invite their first admin"}
          sub="They get an email; the link works for 14 days, for that address only. Admins can invite the rest of their team."
        />
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
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
          <Field label="Email" htmlFor={`${uid}-email`} className="sm:col-span-2">
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
              className={select}
            >
              {(Object.keys(PARTNER_ROLES) as PartnerRole[]).map((r) => (
                <option key={r} value={r}>
                  {PARTNER_ROLES[r].label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={busy}>
              <Send aria-hidden /> Send invitation
            </Button>
          </div>
        </form>
        {link ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            <span className="min-w-0 flex-1">
              Email isn't configured here. Send this link yourself:
              <span className="block truncate font-mono text-xs">{link}</span>
            </span>
            <CopyButton text={link} />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function CreatorsPanel({ data: d }: { data: Data }) {
  const { run, busy } = useRun();
  const [pick, setPick] = useState("");
  const [rep, setRep] = useState("");
  return (
    <div className="grid grid-cols-1 items-start gap-4 @5xl/inset:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={UsersRound}
          tone="sky"
          title={`Creators (${d.creators.length})`}
          sub="The partner sees everything about these creators. Sign-ups through their links are tied automatically."
        />
        {d.creators.length ? (
          <ul className="mt-4 grid grid-cols-1 gap-2">
            {d.creators.map((c) => (
              <li
                key={c.id}
                className={cn(
                  well,
                  "group flex items-center gap-3 p-2.5 pr-2 transition-colors hover:border-[var(--partner)]/40",
                )}
              >
                <Avatar name={c.displayName} />
                <Link
                  to="/admin/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  className="min-w-0 flex-1 truncate rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {c.displayName}
                </Link>
                <StatusPill status={c.status} />
                <ArrowRight
                  className="hidden size-4 text-muted-foreground group-hover:text-foreground sm:block"
                  aria-hidden
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  aria-label={`Untie ${c.displayName}`}
                  title="Untie from this partner"
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
          <EmptyState icon={UsersRound} title="None yet" className="mt-4 py-8">
            Creators who join with the partner's links show up here.
          </EmptyState>
        )}
      </Panel>
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={Link2}
          tone="violet"
          title="Tie a creator"
          sub="For a creator who signed up without the partner's link."
        />
        <form
          className="mt-4 grid gap-3"
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
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={select}>
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
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !pick}>
              Tie creator
            </Button>
          </div>
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
