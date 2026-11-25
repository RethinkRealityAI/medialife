import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Clapperboard,
  Eye,
  Gem,
  Megaphone,
  Play,
  Send,
  Shirt,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";

import {
  ClientHeader,
  ClientPage,
  ClientSection,
  Chip,
  Empty,
  Stat,
  card,
  cardHover,
  compact,
  day,
} from "@/components/client/ui";
import { useClientWorkspace } from "@/components/client/workspace";
import { HubLink } from "@/components/hub/app/hub-link";
import { getClientHome } from "@/lib/client/hub.functions";
import { MERCH_STAGE_LABELS, POST_KIND_LABELS } from "@/lib/client/model";
import { UGC_SUBMISSION_STATUS_LABELS } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/")({
  head: () => ({ meta: [{ title: "Home · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientHome(),
  staleTime: 15_000,
  component: Home,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Home() {
  const ws = useClientWorkspace();
  const d = Route.useLoaderData();
  const f = ws.client.features;
  const first = ws.me.medialife ? "" : (ws.me.name || "").split(/\s/)[0];

  return (
    <ClientPage>
      <ClientHeader
        eyebrow={`${ws.client.name} × MEDIALIFE`}
        title={
          <span suppressHydrationWarning>
            {greeting()}
            {first ? `, ${first}` : ""}
          </span>
        }
        description={ws.client.welcome}
      />

      {d.ugc ? (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Users} label="Creators" value={d.ugc.creators} hint="In the UGC program" />
          <Stat
            icon={Send}
            label="Combined reach"
            value={d.ugc.reach ? compact(d.ugc.reach) : "–"}
            hint="Followers and subscribers"
          />
          <Stat
            icon={Clapperboard}
            label="Creator videos"
            value={d.ugc.videos}
            hint="Uploaded so far"
          />
          <Stat
            icon={Eye}
            label="Waiting on you"
            value={d.ugc.toReview}
            hint={d.ugc.toReview ? "In review, no feedback yet" : "All caught up"}
          />
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">
          {d.ugc ? (
            <ClientSection
              title="Latest creator videos"
              actions={
                <HubLink
                  to="/client-hub/ugc"
                  className="text-sm text-[var(--client)] hover:underline"
                >
                  All UGC
                </HubLink>
              }
            >
              {d.ugc.latest.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
                  {d.ugc.latest.map((v) => (
                    <li key={v.id}>
                      <HubLink
                        to={`/client-hub/ugc?video=${v.id}`}
                        className={cn(card, cardHover, "block overflow-hidden")}
                      >
                        <div className="relative aspect-[9/16] bg-black">
                          {v.posterUrl ? (
                            <img
                              src={v.posterUrl}
                              alt=""
                              loading="lazy"
                              className="absolute inset-0 size-full object-cover"
                            />
                          ) : null}
                          <span className="absolute inset-0 grid place-items-center">
                            <span className="grid size-10 place-items-center rounded-full bg-black/60 text-white">
                              <Play className="size-4" aria-hidden />
                            </span>
                          </span>
                        </div>
                        <div className="p-2.5">
                          <div className="truncate text-sm font-medium">{v.creatorName}</div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {UGC_SUBMISSION_STATUS_LABELS[v.status]}
                          </div>
                        </div>
                      </HubLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={Clapperboard} title="No creator videos yet">
                  Creators upload here once their package arrives. You'll see each video as soon as
                  it lands.
                </Empty>
              )}
            </ClientSection>
          ) : null}

          {f.updates ? (
            <ClientSection
              title="Updates from MEDIALIFE"
              actions={
                <HubLink
                  to="/client-hub/updates"
                  className="text-sm text-[var(--client)] hover:underline"
                >
                  All updates
                </HubLink>
              }
            >
              {d.posts.length ? (
                <ul className="grid gap-3">
                  {d.posts.map((p) => (
                    <li key={p.id}>
                      <HubLink
                        to={`/client-hub/updates#${p.id}`}
                        className={cn(card, cardHover, "block p-4")}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={p.kind === "merch" ? "accent" : "muted"}>
                            {POST_KIND_LABELS[p.kind]}
                          </Chip>
                          {p.pinned ? <Chip tone="warn">Pinned</Chip> : null}
                          <span className="text-xs text-muted-foreground">{day(p.createdAt)}</span>
                        </div>
                        <div className="mt-2 font-medium">{p.title}</div>
                        {p.body ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {p.body}
                          </p>
                        ) : null}
                      </HubLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={Megaphone} title="No updates yet">
                  News, campaign notes and new documents from MEDIALIFE show up here.
                </Empty>
              )}
            </ClientSection>
          ) : null}
        </div>

        <div className="min-w-0">
          {f.merch ? (
            <ClientSection
              title="Merch"
              actions={
                <HubLink
                  to="/client-hub/merch"
                  className="text-sm text-[var(--client)] hover:underline"
                >
                  See all
                </HubLink>
              }
            >
              {d.merch.length ? (
                <ul className={cn(card, "divide-y divide-white/[0.06]")}>
                  {d.merch.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 p-3">
                      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.05]">
                        {m.image ? (
                          <img src={m.image} alt="" className="size-full object-cover" />
                        ) : (
                          <Shirt className="size-5 text-muted-foreground" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.eta || " "}
                        </span>
                      </span>
                      <Chip
                        tone={
                          m.stage === "live" ? "good" : m.stage === "paused" ? "warn" : "accent"
                        }
                      >
                        {MERCH_STAGE_LABELS[m.stage]}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={Shirt} title="No merch drops listed yet">
                  New drops and where each one is (design, samples, production, live) show up here.
                </Empty>
              )}
            </ClientSection>
          ) : null}

          {d.collector || d.giveaways.length ? (
            <ClientSection title="Fans">
              <div className="grid grid-cols-2 gap-3">
                {d.collector ? (
                  <Stat
                    icon={Gem}
                    label="Collector Hub owners"
                    value={d.collector.owners}
                    hint="Fans who activated merch"
                  />
                ) : null}
                {d.giveaways.map((g) => (
                  <Stat
                    key={g.id}
                    icon={Sparkles}
                    label={g.title}
                    value={g.entrants}
                    hint="Entrants"
                  />
                ))}
              </div>
            </ClientSection>
          ) : null}

          <ClientSection title="Jump to">
            <ul className="grid gap-2">
              {f.videos ? (
                <QuickLink
                  to="/client-hub/videos"
                  icon={Play}
                  label="Videos"
                  hint={`${d.videos} from MEDIALIFE`}
                />
              ) : null}
              {f.files ? (
                <QuickLink
                  to="/client-hub/files"
                  icon={ArrowRight}
                  label="Files and documents"
                  hint={`${d.files} files`}
                />
              ) : null}
              {f.uploads && !ws.me.medialife ? (
                <QuickLink
                  to="/client-hub/content?upload=1"
                  icon={Upload}
                  label="Upload content"
                  hint="Footage, art, logos or briefs, tagged by experience"
                />
              ) : null}
              {f.experiences ? (
                <QuickLink
                  to="/client-hub/experiences"
                  icon={Sparkles}
                  label={`Every ${ws.client.name} experience`}
                  hint="Open them on your phone"
                />
              ) : null}
            </ul>
          </ClientSection>
        </div>
      </div>
    </ClientPage>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: typeof Play;
  label: string;
  hint: string;
}) {
  return (
    <li>
      <HubLink to={to} className={cn(card, cardHover, "flex items-center gap-3 p-3")}>
        <span className="grid size-9 place-items-center rounded-xl bg-white/[0.05] text-[var(--client)]">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      </HubLink>
    </li>
  );
}
