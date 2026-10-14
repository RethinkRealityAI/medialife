import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, FileSignature, Mail, MessageCircle } from "lucide-react";

import { TrendChart } from "@/components/hub/app/earnings-chart";
import { EmptyState, Facts, Panel, Pill, TimeAgo } from "@/components/hub/app/ui";
import { AssetDetails } from "@/components/hub/assets/details";
import { AssetThumb } from "@/components/hub/assets/shared";
import { CreatorStatusPill, JourneyTrack } from "@/components/partner/parts";
import { Page } from "@/components/hub/app/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPartnerCreator } from "@/lib/hub/partner.functions";
import {
  EXPERIENCE_KINDS,
  PLATFORMS,
  SKUS,
  fileUrl,
  money,
  shortDate,
  stageOf,
  type HubFile,
} from "@/lib/hub/model";
import { JOURNEY } from "@/lib/hub/partners";

export const Route = createFileRoute("/partner-hub/_app/creators/$creatorId")({
  loader: async ({ params }) => {
    const d = await getPartnerCreator({ data: { id: params.creatorId } });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.row?.displayName ?? "Creator"} · Partner Hub | MEDIALIFE` }],
  }),
  notFoundComponent: () => (
    <Page>
      <EmptyState icon={ArrowLeft} title="Creator not found">
        They may not be tied to your team.{" "}
        <Link to="/partner-hub/creators" className="text-primary underline">
          Back to creators
        </Link>
      </EmptyState>
    </Page>
  ),
  component: CreatorDetail,
});

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function CreatorDetail() {
  const d = Route.useLoaderData();
  const [file, setFile] = useState<HubFile | null>(null);
  const row = d.row!;
  const c = d.creator;
  const step = JOURNEY.find((s) => s.id === row.journey)!;

  return (
    <Page className="lg:pt-8">
      <Link
        to="/partner-hub/creators"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Creators
      </Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{row.displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CreatorStatusPill status={c.status} />
            {c.agency?.rep ? <span>Brought in by {c.agency.rep}</span> : null}
            <span>Joined {shortDate(c.createdAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {c.profile.email ? (
            <a
              href={`mailto:${c.profile.email}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-white/5"
            >
              <Mail className="size-4" aria-hidden /> Email
            </a>
          ) : null}
          {c.contact.discordUsername ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm">
              <MessageCircle className="size-4" aria-hidden /> @{c.contact.discordUsername}
            </span>
          ) : null}
        </div>
      </header>

      <Panel className="mt-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            Step {step.n} of 5: {step.title}
          </h2>
          <span className="text-xs text-muted-foreground">{nextFor(row.journey, c.status)}</span>
        </div>
        <JourneyTrack current={row.journey} status={c.status} className="mt-3" />
      </Panel>

      <Tabs defaultValue="overview" className="mt-6">
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products ({d.products.length})</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="files">Files ({d.files.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 grid gap-4 @3xl/inset:grid-cols-2">
          <Panel className="p-4 sm:p-5">
            <h3 className="text-sm font-medium text-muted-foreground">Profile</h3>
            <Facts
              className="mt-2"
              rows={[
                ["Name", c.profile.displayName || "—"],
                ["Legal name", c.profile.legalName || "—"],
                ["Email", c.profile.email || "—"],
                ["Country", c.profile.country || "—"],
                ["Audience", c.profile.audienceRegions || "—"],
                ["Categories", c.profile.categories.join(", ") || "—"],
              ]}
            />
            {c.profile.bio ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.profile.bio}</p>
            ) : null}
          </Panel>
          <Panel className="p-4 sm:p-5">
            <h3 className="text-sm font-medium text-muted-foreground">Channels</h3>
            {c.channels.filter((ch) => ch.handle.trim()).length ? (
              <ul className="mt-2 divide-y divide-border text-sm">
                {c.channels
                  .filter((ch) => ch.handle.trim())
                  .map((ch) => (
                    <li
                      key={ch.platform + ch.handle}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block">
                          {PLATFORMS[ch.platform]?.label ?? ch.platform}
                        </span>
                        {ch.url ? (
                          <a
                            href={ch.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-primary hover:underline"
                          >
                            {ch.handle}
                          </a>
                        ) : (
                          <span className="block truncate text-xs text-muted-foreground">
                            {ch.handle}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {ch.audience ? ch.audience.toLocaleString() : "—"}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No channels yet.</p>
            )}
          </Panel>
          <Panel className="p-4 sm:p-5">
            <h3 className="text-sm font-medium text-muted-foreground">Program</h3>
            <Facts
              className="mt-2"
              rows={[
                ["Status", <CreatorStatusPill key="s" status={c.status} />],
                ["Applied", c.submittedAt ? shortDate(c.submittedAt) : "Not yet"],
                ["Approved", c.approvedAt ? shortDate(c.approvedAt) : "Not yet"],
                ["Revenue share", pct(c.revenueShare)],
                ["Payout details", c.payoutSetUp ? "Set up" : "Not yet"],
                [
                  "Products wanted",
                  c.interests.skus.map((s) => SKUS[s as keyof typeof SKUS]?.name ?? s).join(", ") ||
                    "—",
                ],
              ]}
            />
          </Panel>
          <Panel className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileSignature className="size-4" aria-hidden /> Agreement
            </h3>
            {d.signatures.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {d.signatures.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 text-emerald-400" aria-hidden />
                    <span>
                      {s.title} (v{s.version})
                      <span className="block text-xs text-muted-foreground">
                        Signed by {s.signedName} on {shortDate(s.signedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {c.status === "approved"
                  ? "Not signed yet. It's waiting for them in the Creator Hub."
                  : "Opens once their application is approved."}
              </p>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          {d.products.length ? (
            <ul className="grid grid-cols-1 gap-3 @3xl/inset:grid-cols-2">
              {d.products.map((p) => {
                const exp = d.experiences.find((e) => e.id === p.experienceId);
                const proof = p.proofs[p.proofs.length - 1];
                return (
                  <li key={p.id}>
                    <Panel className="flex h-full gap-4 p-4">
                      <img
                        src={
                          p.imageFileId
                            ? fileUrl({ creatorId: c.id, id: p.imageFileId })
                            : SKUS[p.sku].image
                        }
                        alt=""
                        className="size-20 shrink-0 rounded-lg border border-border object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          <Pill tone={p.stage === "live" ? "live" : "primary"}>
                            {stageOf(p.stage).name}
                          </Pill>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {[SKUS[p.sku].name, p.campaign, p.eta ? `on sale ~${p.eta}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {p.nextStep && p.stage !== "live" ? (
                          <p className="mt-2 text-sm">
                            <span
                              className={
                                p.waitingOn === "creator"
                                  ? "text-amber-300"
                                  : "text-muted-foreground"
                              }
                            >
                              {p.waitingOn === "creator" ? "Waiting on the creator: " : "Next: "}
                            </span>
                            {p.nextStep}
                          </p>
                        ) : null}
                        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Units sold</dt>
                            <dd className="tabular-nums">{p.sales.units}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Sales</dt>
                            <dd className="tabular-nums">{money(p.sales.net, p.currency)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Scans</dt>
                            <dd className="tabular-nums">{p.scans}</dd>
                          </div>
                        </dl>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {exp
                            ? `Experience: ${exp.name} (${EXPERIENCE_KINDS[exp.kind]})`
                            : "Experience to come"}
                          {proof
                            ? ` · Design v${proof.version} ${proof.decision === "approved" ? "approved" : proof.decision === "changes" ? "needs changes" : "waiting for approval"}`
                            : ""}
                        </p>
                      </div>
                    </Panel>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No products yet. MEDIALIFE sets them up once the creator is approved and signed.
            </p>
          )}
        </TabsContent>

        <TabsContent value="sales" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 @3xl/inset:grid-cols-4">
            {[
              ["Orders", d.earnings.orders.toLocaleString()],
              ["Sales (net)", money(d.earnings.net, d.earnings.currency)],
              ["Creator earned", money(d.earnings.earned, d.earnings.currency)],
              ["Paid out", money(d.earnings.paid, d.earnings.currency)],
            ].map(([k, v]) => (
              <Panel key={k} className="p-4">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
              </Panel>
            ))}
          </div>
          {d.earnings.orders ? (
            <Panel className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground">Sales, last 60 days</h3>
              <TrendChart
                data={d.trend}
                metric="net"
                currency={d.earnings.currency}
                className="mt-3 h-48"
              />
            </Panel>
          ) : null}
          {d.orders.length ? (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 font-medium">Order</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Country</th>
                    <th className="px-4 py-2.5 text-right font-medium">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5">{o.number}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {shortDate(o.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{o.country ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {o.lines.reduce((s, l) => s + l.qty, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          )}
          {d.payouts.length ? (
            <Panel className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground">Payouts</h3>
              <ul className="mt-2 divide-y divide-border text-sm">
                {d.payouts.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2">
                    <span>{p.periodLabel || shortDate(p.paidAt)}</span>
                    <span className="tabular-nums">{money(p.amount, p.currency)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          {d.files.length ? (
            <ul className="grid grid-cols-2 gap-2.5 @md/inset:grid-cols-3 @3xl/inset:grid-cols-5">
              {d.files.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setFile(f)}
                    className="block w-full overflow-hidden rounded-xl border border-border text-left hover:border-[var(--partner)]/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <AssetThumb file={f} className="aspect-square" />
                    <span className="block truncate p-2 text-xs font-medium">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          )}
          <AssetDetails
            mode="admin"
            readOnly
            file={file}
            open={!!file}
            onOpenChange={(o) => !o && setFile(null)}
            folders={[]}
            yourTags={[]}
            usedIn={[]}
            canEdit={false}
            canDelete={false}
            onPatch={() => {}}
            onDeleted={() => {}}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {d.activity.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {d.activity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 p-3 text-sm">
                  <span className="min-w-0">
                    <span className="block">{a.title}</span>
                    {a.body ? (
                      <span className="block text-xs text-muted-foreground">{a.body}</span>
                    ) : null}
                  </span>
                  <TimeAgo ts={a.at} className="shrink-0 text-xs text-muted-foreground" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function nextFor(step: string, status: string) {
  if (status === "declined") return "MEDIALIFE sent them a reason and a route back.";
  if (status === "waitlist") return "On the waitlist: MEDIALIFE will be in touch.";
  if (status === "draft") return "Next: finish and send their application.";
  if (status === "submitted") return "Next: MEDIALIFE reviews within two business days.";
  if (step === "sign") return "Next: they read and sign the agreement in the Creator Hub.";
  if (step === "approve") return "Next: MEDIALIFE designs; they approve each design.";
  if (step === "make") return "Next: production, then launch.";
  return "Live and selling.";
}
