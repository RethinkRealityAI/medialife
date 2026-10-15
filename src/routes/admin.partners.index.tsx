import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  FolderOpen,
  Handshake,
  Library,
  Plus,
  Rocket,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";

import {
  EmptyState,
  IconTile,
  PageBody,
  PageHeader,
  SectionTitle,
  StatTile,
  Tag,
  lift,
  surface,
} from "@/components/admin/kit";
import { PartnerForm } from "@/components/admin/partners/partner-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { adminListPartners } from "@/lib/hub/admin-partners.functions";
import { kitHero, kitLogo } from "@/lib/hub/collateral";
import { SNOWDAY_PRESET } from "@/lib/hub/partners";
import { cn } from "@/lib/utils";

// /admin/partners: agencies that bring creators into the program (Snowday
// Media first). Each has a team in the Partner Hub, creators tied to it, invite
// links and a collateral library; every partner also gets the MEDIALIFE kit.

export const Route = createFileRoute("/admin/partners/")({
  loader: () => adminListPartners(),
  head: () => ({ meta: [{ title: "Partners · Creator Hub | MEDIALIFE" }] }),
  component: Partners,
});

function Partners() {
  const d = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<null | "blank" | "snowday">(null);
  const hasSnowday = d.partners.some((p) => p.id === SNOWDAY_PRESET.id);
  const sum = (k: "creators" | "approved" | "members") => d.partners.reduce((s, p) => s + p[k], 0);

  return (
    <>
      <PageHeader
        title="Partners"
        icon={Handshake}
        tone="violet"
        description="Agencies bringing creators into the program. Each gets its own Partner Hub."
        actions={
          <>
            {!hasSnowday ? (
              <Button
                variant="outline"
                className="bg-black/30 backdrop-blur"
                onClick={() => setCreating("snowday")}
              >
                Set up Snowday Media
              </Button>
            ) : null}
            <Button onClick={() => setCreating("blank")}>
              <Plus aria-hidden /> New partner
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
          <StatTile label="Partners" value={d.partners.length} icon={Handshake} tone="violet" />
          <StatTile
            label="Creators via partners"
            value={sum("creators")}
            icon={UsersRound}
            tone="sky"
          />
          <StatTile label="Active creators" value={sum("approved")} icon={Rocket} tone="mint" />
          <StatTile label="Partner teammates" value={sum("members")} icon={Users} tone="amber" />
        </div>

        <section aria-labelledby="partners-title">
          <SectionTitle id="partners-title">Partner Hubs</SectionTitle>
          {d.partners.length ? (
            <ul className="grid gap-3 @3xl/inset:grid-cols-2 @6xl/inset:grid-cols-3">
              {d.partners.map((p) => {
                const logo = kitLogo(p.kit);
                return (
                  <li key={p.id}>
                    <Link
                      to="/admin/partners/$partnerId"
                      params={{ partnerId: p.id }}
                      className={cn(surface, lift, "group block h-full overflow-hidden")}
                    >
                      <span
                        className="relative block h-28 overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${p.brand.ink}, ${p.brand.primary})`,
                        }}
                      >
                        <img
                          src={kitHero(p.kit)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                        <span
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-[#0b0d1a] via-[#0b0d1a]/40 to-transparent"
                        />
                        <span
                          aria-hidden
                          className="absolute inset-x-0 top-0 h-px"
                          style={{
                            background: `linear-gradient(90deg, transparent, ${p.brand.accent}, transparent)`,
                          }}
                        />
                        <span className="absolute bottom-3 left-4 flex items-center gap-3">
                          <span
                            aria-hidden
                            className="grid size-11 place-items-center rounded-xl ring-1 ring-white/25 shadow-[0_8px_20px_-8px_rgb(0_0_0/0.9)]"
                            style={{
                              background: logo
                                ? p.brand.ink
                                : `linear-gradient(135deg, ${p.brand.accent}, ${p.brand.primary})`,
                            }}
                          >
                            {logo ? (
                              <img src={logo.mark} alt="" className="size-7 object-contain" />
                            ) : (
                              <span className="size-3 rounded-full bg-background/85" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-lg font-semibold tracking-tight text-white">
                              {p.name}
                            </span>
                            <span className="block text-xs text-white/60">/with/{p.id}</span>
                          </span>
                        </span>
                        {p.status === "paused" ? (
                          <Tag tone="amber" className="absolute top-3 right-3">
                            Paused
                          </Tag>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2 p-4">
                        <span className="grid flex-1 grid-cols-3 gap-2">
                          <Figure
                            label="Creators"
                            value={p.creators}
                            sub={`${p.approved} active`}
                          />
                          <Figure label="Team" value={p.members} />
                          <Figure label="Files" value={p.files} />
                        </span>
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--partner)]/12 text-[var(--partner)] transition-colors group-hover:bg-[var(--partner)] group-hover:text-[var(--partner-ink)]">
                          <ArrowRight className="size-4" aria-hidden />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => setCreating("blank")}
                  className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.015] p-6 text-sm text-muted-foreground transition-colors hover:border-[var(--partner)]/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
                >
                  <IconTile icon={Plus} tone="violet" />
                  <span className="font-medium">Add a partner</span>
                </button>
              </li>
            </ul>
          ) : (
            <EmptyState
              icon={Handshake}
              tone="violet"
              title="No partners yet"
              action={
                <>
                  <Button onClick={() => setCreating("snowday")}>Set up Snowday Media</Button>
                  <Button variant="outline" onClick={() => setCreating("blank")}>
                    <Plus aria-hidden /> New partner
                  </Button>
                </>
              }
            >
              Create Snowday Media to get started, then invite their first admin.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="shared-title">
          <SectionTitle id="shared-title">Shared with every partner</SectionTitle>
          <ul className="grid gap-3 @3xl/inset:grid-cols-2">
            {[
              {
                to: "/admin/partners/collateral" as const,
                image: "/partner-kit/medialife/portfolio.webp",
                position: "object-[50%_20%]",
                icon: FolderOpen,
                title: "Partner collateral",
                body: "Add, edit and hide what partners see in Collateral.",
              },
              {
                to: "/admin/partners/kit" as const,
                image: "/partner-kit/medialife/shelf-preview.webp",
                position: "object-[50%_45%]",
                icon: Library,
                title: "MEDIALIFE kit",
                body: `Loose files every partner gets · ${d.kitFiles} uploaded`,
              },
            ].map((t) => (
              <li key={t.to}>
                <Link
                  to={t.to}
                  className={cn(surface, lift, "group flex h-full items-stretch overflow-hidden")}
                >
                  <span className="relative hidden w-40 shrink-0 overflow-hidden bg-[var(--partner-ink)] sm:block">
                    <img
                      src={t.image}
                      alt=""
                      loading="lazy"
                      className={cn(
                        "size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                        t.position,
                      )}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0b0d1a]/60"
                    />
                  </span>
                  <span className="flex flex-1 items-center gap-3 p-4">
                    <IconTile icon={t.icon} tone="violet" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.title}</span>
                      <span className="block text-sm text-muted-foreground">{t.body}</span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-violet-300" aria-hidden />
            Files for one partner only go in that partner's Library tab.
          </p>
        </section>
      </PageBody>

      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New partner</DialogTitle>
            <DialogDescription>
              You'll invite their team next. A default invite link (their id) is created for their
              program page.
            </DialogDescription>
          </DialogHeader>
          <PartnerForm
            key={creating ?? "none"}
            partner={null}
            preset={creating === "snowday" ? SNOWDAY_PRESET : undefined}
            onSaved={(p) => {
              setCreating(null);
              void navigate({ to: "/admin/partners/$partnerId", params: { partnerId: p.id } });
            }}
          />
        </DialogContent>
      </Dialog>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}

function Figure({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className="block text-lg leading-tight font-semibold tabular-nums">
        {value}
        {sub ? <span className="ml-1 text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );
}
