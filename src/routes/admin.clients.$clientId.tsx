import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import {
  Clapperboard,
  Eye,
  EyeOff,
  FolderOpen,
  Images,
  Mail,
  Megaphone,
  MessageSquareText,
  Pencil,
  Settings,
  Shirt,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  AdminTab,
  AdminTabs,
  BackLink,
  CopyButton,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  PanelTitle,
  StatTile,
  TabCount,
  Tag,
  well,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  adminDeleteLink,
  adminDeleteMerch,
  adminDeletePost,
  adminGetClient,
  adminInviteClientMember,
  adminRemoveClientMember,
  adminRevokeClientInvite,
  adminSaveClient,
  adminSaveLink,
  adminSaveMerch,
  adminSavePost,
  adminViewClientHub,
} from "@/lib/client/admin.functions";
import {
  CLIENT_FEATURES,
  CLIENT_FEATURE_LABELS,
  CLIENT_ROLES,
  LINK_KINDS,
  LINK_KIND_LABELS,
  MERCH_STAGES,
  MERCH_STAGE_LABELS,
  POST_KINDS,
  POST_KIND_LABELS,
  UGC_VERDICT_LABELS,
  type ClientLink,
  type ClientPost,
  type ClientRole,
  type LinkKind,
  type MerchItem,
  type MerchStage,
  type PostKind,
} from "@/lib/client/model";
import { UGC_SUBMISSION_STATUS_LABELS } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const TABS = ["team", "updates", "merch", "files", "media", "feedback", "settings"] as const;
type Tab = (typeof TABS)[number];

// /admin/clients/:id: one client hub. The team and invitations, the updates,
// merch and documents MEDIALIFE shares, which Media Library files the client
// sees, the client's feedback on creator videos, and settings.

export const Route = createFileRoute("/admin/clients/$clientId")({
  validateSearch: z.object({ tab: z.enum(TABS).optional().catch(undefined) }),
  loader: async ({ params }) => {
    const d = await adminGetClient({ data: { id: params.clientId } });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.client.name ?? "Client"} · Client hubs | MEDIALIFE` }],
  }),
  component: ClientDetail,
});

type Data = Awaited<ReturnType<typeof adminGetClient>> & {};
const select =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
    done?: string,
  ): Promise<T | null> {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Couldn't save.");
      else {
        if (done) toast.success(done);
        await router.invalidate();
      }
      return r;
    } catch {
      toast.error("Something went wrong. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function ClientDetail() {
  const d = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const c = d.client;
  const tab: Tab = search.tab ?? "team";
  const visible = d.media.filter((m) => !m.hidden).length;
  const signIn =
    typeof window === "undefined"
      ? "/client-hub/sign-in"
      : `${window.location.origin}/client-hub/sign-in`;

  async function openHub() {
    await adminViewClientHub({ data: { id: c.id } });
    window.open("/client-hub", "_blank", "noopener");
  }

  return (
    <>
      <PageHeader
        back={<BackLink to="/admin/clients">Client hubs</BackLink>}
        icon={Users}
        tone="sky"
        title={c.name}
        badge={c.status === "paused" ? <Tag tone="amber">Paused</Tag> : <Tag tone="mint">Live</Tag>}
        description="Their own hub at /client-hub. Invite people from the Team tab: each one sets their own password. You can open the hub to see exactly what they see."
        actions={
          <>
            <Button onClick={openHub}>
              <Eye className="size-4" aria-hidden /> Open the hub as {c.name}
            </Button>
            <CopyButton
              text={signIn}
              label="Copy sign-in link"
              showLabel
              toastText="Sign-in link copied"
            />
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={Users}
            label="People"
            value={d.members.length}
            hint={`${d.invites.length} invited`}
          />
          <StatTile
            icon={Clapperboard}
            label="UGC"
            value={d.ugcCounts.videos}
            hint={`${d.ugcCounts.creators} creators`}
          />
          <StatTile
            icon={Images}
            label="Media they see"
            value={visible}
            hint={`of ${d.media.length} tagged ${c.mediaClient || "–"}`}
          />
          <StatTile
            icon={MessageSquareText}
            label="Video feedback"
            value={d.feedback.length}
            hint="From their team"
          />
        </div>

        <AdminTabs
          label="Client hub sections"
          value={tab}
          onChange={(t) => navigate({ search: { tab: t }, replace: true })}
          tabs={[
            { id: "team", label: "Team", icon: Users, badge: <TabCount n={d.members.length} /> },
            {
              id: "updates",
              label: "Updates",
              icon: Megaphone,
              badge: <TabCount n={d.posts.length} />,
            },
            { id: "merch", label: "Merch", icon: Shirt, badge: <TabCount n={d.merch.length} /> },
            {
              id: "files",
              label: "Documents",
              icon: FolderOpen,
              badge: <TabCount n={d.links.length} />,
            },
            { id: "media", label: "Media", icon: Images, badge: <TabCount n={visible} /> },
            {
              id: "feedback",
              label: "Their feedback",
              icon: MessageSquareText,
              badge: (
                <TabCount n={d.feedback.length} alert={d.feedback.length ? "amber" : undefined} />
              ),
            },
            { id: "settings", label: "Settings", icon: Settings },
          ]}
        >
          <AdminTab value="team">
            <TeamTab d={d} />
          </AdminTab>
          <AdminTab value="updates">
            <PostsTab d={d} />
          </AdminTab>
          <AdminTab value="merch">
            <MerchTab d={d} />
          </AdminTab>
          <AdminTab value="files">
            <LinksTab d={d} />
          </AdminTab>
          <AdminTab value="media">
            <MediaTab d={d} />
          </AdminTab>
          <AdminTab value="feedback">
            <FeedbackTab d={d} />
          </AdminTab>
          <AdminTab value="settings">
            <SettingsTab d={d} />
          </AdminTab>
        </AdminTabs>
      </PageBody>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}

/* ── Team ─────────────────────────────────────────────────────────────────── */

function TeamTab({ d }: { d: Data }) {
  const { busy, run } = useSave();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ClientRole>("admin");
  const [link, setLink] = useState<{ url: string; emailed: boolean; email: string } | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelTitle
          icon={UserPlus}
          title="Invite someone"
          sub="They get a link to set their own password. Invite the client's lead as Admin so they can add their own team."
        />
        <form
          className="grid gap-3 p-4 pt-0"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() =>
              adminInviteClientMember({ data: { id: d.client.id, email, name, role } }),
            );
            if (r && r.ok && "link" in r) {
              setLink({ url: r.link, emailed: r.emailSent, email });
              toast.success(
                r.emailSent ? `Emailed ${email}.` : "Invitation ready: copy the link below.",
              );
              setEmail("");
              setName("");
            }
          }}
        >
          <Input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <select
            className={select}
            value={role}
            onChange={(e) => setRole(e.target.value as ClientRole)}
            aria-label="Role"
          >
            <option value="admin">Admin: can invite their team</option>
            <option value="member">Member</option>
          </select>
          <Button type="submit" disabled={busy || !email}>
            <Mail className="size-4" aria-hidden /> Send invitation
          </Button>
          {link ? (
            <div className={cn(well, "p-3 text-sm")}>
              <p>
                {link.emailed
                  ? `Emailed to ${link.email}. The same link, to send yourself:`
                  : `Email isn't set up on this site, so send ${link.email} this link yourself (WhatsApp, email, Slack). It works once, for 14 days, for that email only.`}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 text-xs">
                  {link.url}
                </code>
                <CopyButton text={link.url} label="Copy invitation link" />
              </div>
            </div>
          ) : null}
        </form>
      </Panel>

      <div className="grid content-start gap-5">
        <Panel>
          <PanelTitle icon={Users} title="People" />
          {d.members.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {d.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.email} · {CLIENT_ROLES[m.role].label}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${m.name}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name}? They lose access straight away.`))
                        void run(
                          () =>
                            adminRemoveClientMember({
                              data: { id: d.client.id, userId: m.userId },
                            }),
                          "Removed.",
                        );
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No one has joined yet.</p>
          )}
        </Panel>
        {d.invites.length ? (
          <Panel>
            <PanelTitle icon={Mail} title="Invited" />
            <ul className="divide-y divide-white/[0.06]">
              {d.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.name || i.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.email} · {CLIENT_ROLES[i.role].label} ·{" "}
                      {i.expiresAt < Date.now()
                        ? "expired"
                        : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          adminRevokeClientInvite({ data: { id: d.client.id, inviteId: i.id } }),
                        "Cancelled.",
                      )
                    }
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              Lost the link? Invite the same email again: the old link stops working and you get a
              new one.
            </p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/* ── Updates ──────────────────────────────────────────────────────────────── */

const emptyPost = {
  id: null as string | null,
  kind: "update" as PostKind,
  title: "",
  body: "",
  linkLabel: "",
  linkUrl: "",
  pinned: false,
};

function PostsTab({ d }: { d: Data }) {
  const { busy, run } = useSave();
  const [f, setF] = useState(emptyPost);
  const edit = (p: ClientPost) =>
    setF({
      id: p.id,
      kind: p.kind,
      title: p.title,
      body: p.body,
      linkLabel: p.link?.label ?? "",
      linkUrl: p.link?.url ?? "",
      pinned: p.pinned,
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelTitle
          icon={Megaphone}
          title={f.id ? "Edit update" : "Post an update"}
          sub={`${d.client.name}'s team sees it on their home page and in Updates. It isn't emailed.`}
        />
        <form
          className="grid gap-3 p-4 pt-0"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              () =>
                adminSavePost({
                  data: {
                    clientId: d.client.id,
                    id: f.id,
                    kind: f.kind,
                    title: f.title,
                    body: f.body,
                    link: f.linkUrl ? { label: f.linkLabel, url: f.linkUrl } : null,
                    pinned: f.pinned,
                  },
                }),
              f.id ? "Update saved." : "Posted.",
            );
            if (r?.ok) setF(emptyPost);
          }}
        >
          <select
            className={select}
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as PostKind })}
            aria-label="Kind"
          >
            {POST_KINDS.map((k) => (
              <option key={k} value={k}>
                {POST_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Input
            placeholder="Title"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            maxLength={140}
            required
          />
          <Textarea
            placeholder="What's new? Blank lines make paragraphs."
            rows={6}
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            maxLength={6000}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Input
              placeholder="Button label"
              value={f.linkLabel}
              onChange={(e) => setF({ ...f, linkLabel: e.target.value })}
            />
            <Input
              placeholder="Link (https://… or /path)"
              value={f.linkUrl}
              onChange={(e) => setF({ ...f, linkUrl: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.pinned} onCheckedChange={(v) => setF({ ...f, pinned: v })} /> Pin to
            the top
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !f.title.trim()}>
              {f.id ? "Save" : "Post"}
            </Button>
            {f.id ? (
              <Button type="button" variant="ghost" onClick={() => setF(emptyPost)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>
      <div className="grid content-start gap-3">
        {d.posts.length ? (
          d.posts.map((p) => (
            <Row
              key={p.id}
              title={p.title}
              sub={`${POST_KIND_LABELS[p.kind]}${p.pinned ? " · pinned" : ""} · ${new Date(p.createdAt).toLocaleDateString()}`}
              onEdit={() => edit(p)}
              onDelete={() => {
                if (window.confirm(`Delete "${p.title}"?`))
                  void run(
                    () => adminDeletePost({ data: { clientId: d.client.id, id: p.id } }),
                    "Deleted.",
                  );
              }}
            />
          ))
        ) : (
          <EmptyState icon={Megaphone} title="No updates yet">
            A short welcome note is a good first post.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

/* ── Merch ────────────────────────────────────────────────────────────────── */

const emptyMerch = {
  id: null as string | null,
  name: "",
  stage: "idea" as MerchStage,
  description: "",
  image: "",
  eta: "",
  linkLabel: "",
  linkUrl: "",
  order: 0,
};

function MerchTab({ d }: { d: Data }) {
  const { busy, run } = useSave();
  const [f, setF] = useState(emptyMerch);
  const edit = (m: MerchItem) =>
    setF({
      id: m.id,
      name: m.name,
      stage: m.stage,
      description: m.description,
      image: m.image,
      eta: m.eta,
      linkLabel: m.link?.label ?? "",
      linkUrl: m.link?.url ?? "",
      order: m.order,
    });
  const imagePicks = d.media.filter((m) => m.kind === "image" && !m.hidden).slice(0, 40);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelTitle
          icon={Shirt}
          title={f.id ? "Edit drop" : "Add a merch drop"}
          sub="Move it through the stages as it progresses; the client sees a progress track."
        />
        <form
          className="grid gap-3 p-4 pt-0"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              () =>
                adminSaveMerch({
                  data: {
                    clientId: d.client.id,
                    id: f.id,
                    name: f.name,
                    stage: f.stage,
                    description: f.description,
                    image: f.image,
                    eta: f.eta,
                    link: f.linkUrl ? { label: f.linkLabel, url: f.linkUrl } : null,
                    order: f.order,
                  },
                }),
              "Saved.",
            );
            if (r?.ok) setF(emptyMerch);
          }}
        >
          <Input
            placeholder="Name, e.g. Bobo + Eclipse can keychain"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            maxLength={140}
            required
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={select}
              value={f.stage}
              onChange={(e) => setF({ ...f, stage: e.target.value as MerchStage })}
              aria-label="Stage"
            >
              {MERCH_STAGES.map((s) => (
                <option key={s} value={s}>
                  {MERCH_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            <Input
              placeholder="When, e.g. Mid December"
              value={f.eta}
              onChange={(e) => setF({ ...f, eta: e.target.value })}
              maxLength={60}
            />
          </div>
          <Textarea
            placeholder="What it is, what's next"
            rows={3}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            maxLength={1200}
          />
          <Input
            placeholder="Picture (https://… or /path)"
            value={f.image}
            onChange={(e) => setF({ ...f, image: e.target.value })}
          />
          {imagePicks.length ? (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">
                Or pick one of their images:
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imagePicks.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.title}
                    onClick={() => setF({ ...f, image: `/api/client-hub/media/${m.id}` })}
                    className={cn(
                      "size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10",
                      f.image === `/api/client-hub/media/${m.id}` && "ring-2 ring-sky-400",
                    )}
                  >
                    {m.thumbUrl ? (
                      <img src={m.thumbUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Input
              placeholder="Button label"
              value={f.linkLabel}
              onChange={(e) => setF({ ...f, linkLabel: e.target.value })}
            />
            <Input
              placeholder="Link (store, proof, mockup)"
              value={f.linkUrl}
              onChange={(e) => setF({ ...f, linkUrl: e.target.value })}
            />
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Order (lower shows first)
            <Input
              type="number"
              value={f.order}
              onChange={(e) => setF({ ...f, order: Number(e.target.value) || 0 })}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !f.name.trim()}>
              {f.id ? "Save" : "Add drop"}
            </Button>
            {f.id ? (
              <Button type="button" variant="ghost" onClick={() => setF(emptyMerch)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>
      <div className="grid content-start gap-3">
        {d.merch.length ? (
          d.merch.map((m) => (
            <Row
              key={m.id}
              title={m.name}
              sub={`${MERCH_STAGE_LABELS[m.stage]}${m.eta ? ` · ${m.eta}` : ""}`}
              image={m.image}
              onEdit={() => edit(m)}
              onDelete={() => {
                if (window.confirm(`Delete "${m.name}"?`))
                  void run(
                    () => adminDeleteMerch({ data: { clientId: d.client.id, id: m.id } }),
                    "Deleted.",
                  );
              }}
            />
          ))
        ) : (
          <EmptyState icon={Shirt} title="No drops yet" />
        )}
      </div>
    </div>
  );
}

/* ── Documents (links) ───────────────────────────────────────────────────── */

const emptyLink = {
  id: null as string | null,
  title: "",
  url: "",
  description: "",
  kind: "doc" as LinkKind,
};

function LinksTab({ d }: { d: Data }) {
  const { busy, run } = useSave();
  const [f, setF] = useState(emptyLink);
  const edit = (l: ClientLink) =>
    setF({ id: l.id, title: l.title, url: l.url, description: l.description, kind: l.kind });
  const pdfs = d.media.filter((m) => m.kind === "document");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelTitle
          icon={FolderOpen}
          title={f.id ? "Edit document link" : "Share a document by link"}
          sub={`Decks, Google Docs, Claude artifacts, briefs. To share a file instead (PDF, images, videos), upload it to the Media Library with client "${d.client.mediaClient}": it appears in their Files or Videos automatically.`}
        />
        <form
          className="grid gap-3 p-4 pt-0"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              () => adminSaveLink({ data: { clientId: d.client.id, ...f } }),
              "Saved.",
            );
            if (r?.ok) setF(emptyLink);
          }}
        >
          <Input
            placeholder="Title"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            maxLength={140}
            required
          />
          <Input
            placeholder="Link (https://… or /path)"
            value={f.url}
            onChange={(e) => setF({ ...f, url: e.target.value })}
            required
          />
          <select
            className={select}
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as LinkKind })}
            aria-label="Kind"
          >
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {LINK_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Textarea
            placeholder="What it is (optional)"
            rows={2}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            maxLength={1200}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !f.title.trim() || !f.url.trim()}>
              {f.id ? "Save" : "Share"}
            </Button>
            {f.id ? (
              <Button type="button" variant="ghost" onClick={() => setF(emptyLink)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>
      <div className="grid content-start gap-3">
        {d.links.map((l) => (
          <Row
            key={l.id}
            title={l.title}
            sub={`${LINK_KIND_LABELS[l.kind]} · ${l.url}`}
            onEdit={() => edit(l)}
            onDelete={() => {
              if (window.confirm(`Remove "${l.title}"?`))
                void run(
                  () => adminDeleteLink({ data: { clientId: d.client.id, id: l.id } }),
                  "Removed.",
                );
            }}
          />
        ))}
        {pdfs.length ? (
          <p className="text-xs text-muted-foreground">
            Plus {pdfs.length} PDF{pdfs.length === 1 ? "" : "s"} from the Media Library (manage them
            in the Media tab).
          </p>
        ) : null}
        {!d.links.length && !pdfs.length ? (
          <EmptyState icon={FolderOpen} title="No documents shared yet" />
        ) : null}
      </div>
    </div>
  );
}

/* ── Media visibility ────────────────────────────────────────────────────── */

function MediaTab({ d }: { d: Data }) {
  const { busy, run } = useSave();
  const [hidden, setHidden] = useState<Set<string>>(new Set(d.client.hiddenMedia));
  const [q, setQ] = useState("");
  const dirty =
    hidden.size !== d.client.hiddenMedia.length ||
    d.client.hiddenMedia.some((id) => !hidden.has(id));
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? d.media.filter((m) =>
          `${m.title} ${m.collection} ${m.tags.join(" ")}`.toLowerCase().includes(s),
        )
      : d.media;
  }, [d.media, q]);
  const toggle = (id: string) => {
    const n = new Set(hidden);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setHidden(n);
  };

  if (!d.media.length)
    return (
      <EmptyState
        icon={Images}
        title={`Nothing in the Media Library is tagged "${d.client.mediaClient}" yet`}
      >
        Upload files in Media library with client set to {d.client.mediaClient}. Videos land in
        their Videos page; PDFs and images in Files.
      </EmptyState>
    );

  return (
    <Panel>
      <PanelTitle
        icon={Images}
        title="What they see from the Media Library"
        sub={`Every finished file with client "${d.client.mediaClient}" shows in their hub unless you hide it here. Fan uploads from the experiences never show.`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setHidden(new Set())}>
              Show all
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHidden(new Set(d.media.map((m) => m.id)))}
            >
              Hide all
            </Button>
            <Button
              size="sm"
              disabled={!dirty || busy}
              onClick={() =>
                run(
                  () =>
                    adminSaveClient({
                      data: { id: d.client.id, patch: { hiddenMedia: [...hidden] } },
                    }),
                  "Saved.",
                )
              }
            >
              Save
            </Button>
          </>
        }
      />
      <div className="px-4">
        <Input
          placeholder="Filter by title, collection or tag"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((m) => {
          const off = hidden.has(m.id);
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => toggle(m.id)}
                aria-pressed={!off}
                className={cn(
                  "block w-full overflow-hidden rounded-xl border text-left transition-opacity",
                  off ? "border-white/5 opacity-45" : "border-sky-400/40",
                )}
              >
                <div className="relative aspect-video bg-black">
                  {m.thumbUrl ? (
                    <img
                      src={m.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : null}
                  <span className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/70">
                    {off ? (
                      <EyeOff className="size-3.5" aria-hidden />
                    ) : (
                      <Eye className="size-3.5" aria-hidden />
                    )}
                  </span>
                </div>
                <div className="p-2">
                  <div className="truncate text-xs font-medium">{m.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {m.sentBy
                      ? `Sent by ${m.sentBy}`
                      : `${m.kind}${m.collection ? ` · ${m.collection}` : ""} · ${off ? "hidden" : "shown"}`}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Feedback ─────────────────────────────────────────────────────────────── */

function FeedbackTab({ d }: { d: Data }) {
  if (!d.feedback.length)
    return (
      <EmptyState icon={MessageSquareText} title="No feedback yet">
        When {d.client.name}'s team rates a creator video (Love it, Needs changes, Not for us), it
        shows here. Make the call in UGC Hub › Review.
      </EmptyState>
    );
  return (
    <Panel>
      <PanelTitle
        icon={MessageSquareText}
        title={`${d.client.name}'s feedback on creator videos`}
        sub="Only their team and MEDIALIFE see this. Approve or ask for changes in UGC Hub › Review."
      />
      <ul className="divide-y divide-white/[0.06]">
        {d.feedback
          .sort((a, b) => b.feedback.at - a.feedback.at)
          .map((f) => (
            <li key={f.submissionId} className="flex gap-3 px-4 py-3">
              <span className="block h-16 w-10 shrink-0 overflow-hidden rounded bg-black">
                {f.posterUrl ? (
                  <img src={f.posterUrl} alt="" className="size-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {f.creatorName}
                  {f.feedback.verdict ? (
                    <Tag
                      tone={
                        f.feedback.verdict === "love"
                          ? "mint"
                          : f.feedback.verdict === "changes"
                            ? "amber"
                            : "rose"
                      }
                    >
                      {UGC_VERDICT_LABELS[f.feedback.verdict]}
                    </Tag>
                  ) : null}
                  <span className="text-xs font-normal text-muted-foreground">
                    {UGC_SUBMISSION_STATUS_LABELS[f.status]}
                  </span>
                </span>
                {f.feedback.note ? (
                  <span className="mt-1 block text-sm text-white/80">{f.feedback.note}</span>
                ) : null}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {f.feedback.byName} · {new Date(f.feedback.at).toLocaleString()} · {f.title}
                </span>
              </span>
            </li>
          ))}
      </ul>
    </Panel>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

function SettingsTab({ d }: { d: Data }) {
  const c = d.client;
  const { busy, run } = useSave();
  const [f, setF] = useState({
    name: c.name,
    status: c.status,
    accent: c.brand.accent,
    logo: c.logo,
    mediaClient: c.mediaClient,
    catalogClient: c.catalogClient,
    experiencesUrl: c.experiencesUrl,
    welcome: c.welcome,
    contactName: c.contact.name,
    contactEmail: c.contact.email,
    notes: c.notes,
    features: { ...c.features },
    giveawayIds: [...c.giveawayIds],
  });

  return (
    <form
      className="grid gap-5 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => adminSaveClient({ data: { id: c.id, patch: f } }), "Settings saved.");
      }}
    >
      <Panel>
        <PanelTitle icon={Settings} title="Hub" />
        <div className="grid gap-3 p-4 pt-0">
          <L label="Name">
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              maxLength={80}
            />
          </L>
          <L label="Status">
            <select
              className={select}
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value as "active" | "paused" })}
            >
              <option value="active">Live: their team can sign in</option>
              <option value="paused">Paused: nobody on their team can sign in</option>
            </select>
          </L>
          <L label="Accent colour">
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={f.accent}
                onChange={(e) => setF({ ...f, accent: e.target.value })}
                className="h-9 w-12 rounded border border-input bg-transparent"
                aria-label="Accent colour"
              />
              <Input
                value={f.accent}
                onChange={(e) => setF({ ...f, accent: e.target.value })}
                maxLength={7}
              />
            </span>
          </L>
          <L label="Logo (optional: a site path or https URL; a square mark works best)">
            <Input value={f.logo} onChange={(e) => setF({ ...f, logo: e.target.value })} />
          </L>
          <L label="Welcome line on their home page">
            <Input
              value={f.welcome}
              onChange={(e) => setF({ ...f, welcome: e.target.value })}
              maxLength={240}
            />
          </L>
          <div className="grid gap-2 sm:grid-cols-2">
            <L label="MEDIALIFE contact name">
              <Input
                value={f.contactName}
                onChange={(e) => setF({ ...f, contactName: e.target.value })}
              />
            </L>
            <L label="Contact email they see">
              <Input
                value={f.contactEmail}
                onChange={(e) => setF({ ...f, contactEmail: e.target.value })}
              />
            </L>
          </div>
          <L label="Internal notes (never shown to the client)">
            <Textarea
              rows={3}
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
            />
          </L>
        </div>
      </Panel>
      <div className="grid content-start gap-5">
        <Panel>
          <PanelTitle title="Sections they see" />
          <ul className="grid gap-2 p-4 pt-0">
            {CLIENT_FEATURES.map((k) => (
              <li key={k} className="flex items-center justify-between gap-3 text-sm">
                {CLIENT_FEATURE_LABELS[k]}
                <Switch
                  checked={f.features[k]}
                  onCheckedChange={(v) => setF({ ...f, features: { ...f.features, [k]: v } })}
                  aria-label={CLIENT_FEATURE_LABELS[k]}
                />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelTitle title="Where their content comes from" />
          <div className="grid gap-3 p-4 pt-0">
            <L label='Media Library "client" value'>
              <Input
                value={f.mediaClient}
                onChange={(e) => setF({ ...f, mediaClient: e.target.value })}
              />
            </L>
            <L label='Labs catalogue "client" value (Experiences page)'>
              <Input
                value={f.catalogClient}
                onChange={(e) => setF({ ...f, catalogClient: e.target.value })}
              />
            </L>
            <L label="Their showcase page">
              <Input
                value={f.experiencesUrl}
                onChange={(e) => setF({ ...f, experiencesUrl: e.target.value })}
                placeholder="/evade/labs/"
              />
            </L>
            <fieldset>
              <legend className="mb-1.5 text-xs text-muted-foreground">
                Giveaways they see (entrant counts only)
              </legend>
              {d.giveaways.length ? (
                <ul className="grid gap-1.5">
                  {d.giveaways.map((g) => (
                    <li key={g.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={f.giveawayIds.includes(g.id)}
                          onChange={(e) =>
                            setF({
                              ...f,
                              giveawayIds: e.target.checked
                                ? [...f.giveawayIds, g.id]
                                : f.giveawayIds.filter((x) => x !== g.id),
                            })
                          }
                        />
                        {g.title}{" "}
                        <span className="text-xs text-muted-foreground">({g.status})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No giveaways yet.</p>
              )}
            </fieldset>
          </div>
        </Panel>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Row({
  title,
  sub,
  image,
  onEdit,
  onDelete,
}: {
  title: string;
  sub: string;
  image?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn(well, "flex items-center gap-3 p-3")}>
      {image ? (
        <img src={image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${title}`}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${title}`}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
