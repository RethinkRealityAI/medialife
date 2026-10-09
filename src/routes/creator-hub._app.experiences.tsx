import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Gift,
  MessageSquare,
  Play,
  ScanLine,
  ShoppingBag,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { z } from "zod";

import { ExperiencePreview } from "@/components/hub/app/experience-preview";
import { ProductThumb } from "@/components/hub/app/product-card";
import { EmptyState, Page, PageHeader, Pill } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { EXPERIENCE_KINDS, EXPERIENCE_STATUS, compact, fileUrl } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/experiences")({
  validateSearch: z.object({ preview: z.string().max(60).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Experiences · Creator Hub | MEDIALIFE" }] }),
  component: Experiences,
});

const HOW = [
  { icon: ShoppingBag, title: "Fan buys", body: "Your activated merch" },
  { icon: ScanLine, title: "Scans or taps", body: "QR code or NFC tag" },
  { icon: Smartphone, title: "It opens", body: "In the browser, no app" },
  { icon: Gift, title: "Reward unlocks", body: "Only owners get it" },
];

function Experiences() {
  const ws = useWorkspace();
  const { preview } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const previewing = ws.experiences.find((e) => e.id === preview) ?? null;
  const setPreview = (id: string | undefined) =>
    navigate({ search: { preview: id }, replace: true, resetScroll: false });

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Experiences"
        description="What fans see when they scan your merch: an AR moment, a 3D model, a video, a game or a reward."
      />

      <ol
        aria-label="How it works"
        className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border @4xl/inset:grid-cols-4"
      >
        {HOW.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 bg-background px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
              <s.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">
                <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                {s.title}
              </div>
              <p className="truncate text-xs text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {ws.experiences.length ? (
        <ul className="mt-5 grid grid-cols-1 gap-4 @3xl/inset:grid-cols-2 @6xl/inset:grid-cols-3">
          {ws.experiences.map((e) => {
            const products = ws.products.filter((p) => p.experienceId === e.id);
            const scans = products.reduce((s, p) => s + p.scans, 0);
            const status = EXPERIENCE_STATUS[e.status];
            const review = e.status === "review";
            return (
              <li key={e.id}>
                <article
                  className={cn(
                    "group flex h-full flex-col overflow-hidden rounded-xl border bg-white/[0.02] transition-colors",
                    review ? "border-amber-400/45" : "border-border hover:border-primary/40",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreview(e.id)}
                    className="relative aspect-[16/8] overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    aria-label={`Preview ${e.name}`}
                  >
                    {e.imageFileId ? (
                      <img
                        src={fileUrl({ creatorId: e.creatorId, id: e.imageFileId })}
                        alt=""
                        className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="relative size-full"
                        style={{ background: "var(--gradient-ember)" }}
                      >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
                        <Sparkles className="absolute right-5 bottom-4 size-9 text-white/85" />
                      </div>
                    )}
                    <span className="absolute top-3 left-3">
                      <Pill tone={status.tone} className="bg-background/85 backdrop-blur">
                        {status.label}
                      </Pill>
                    </span>
                    <span className="absolute inset-0 grid place-items-center bg-background/0 transition-colors group-hover:bg-background/30">
                      <span className="grid size-12 scale-90 place-items-center rounded-full bg-background/85 opacity-0 backdrop-blur transition-all group-hover:scale-100 group-hover:opacity-100">
                        <Play className="size-5 translate-x-0.5" aria-hidden />
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{EXPERIENCE_KINDS[e.kind]}</p>
                      <h2 className="truncate text-base font-medium">{e.name}</h2>
                      {e.reward ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          <Gift
                            className="mr-1 inline size-3.5 align-[-2px] text-primary"
                            aria-hidden
                          />
                          {e.reward}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div className="flex min-w-0 items-center -space-x-1.5">
                        {products.slice(0, 4).map((p) => (
                          <Link
                            key={p.id}
                            to="/creator-hub/products/$productId"
                            params={{ productId: p.id }}
                            title={p.name}
                            className="rounded-full ring-2 ring-background focus-visible:ring-ring"
                          >
                            <ProductThumb product={p} className="size-7 rounded-full" />
                            <span className="sr-only">{p.name}</span>
                          </Link>
                        ))}
                        <span className="pl-3">
                          {products.length} product{products.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span className="shrink-0">
                        <span className="font-medium text-foreground tabular-nums">
                          {compact(scans)}
                        </span>{" "}
                        scans
                      </span>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={review ? "default" : "outline"}
                        onClick={() => setPreview(e.id)}
                      >
                        <Play aria-hidden /> {review ? "Preview and review" : "Preview"}
                      </Button>
                      {review && products[0] ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            to="/creator-hub/products/$productId"
                            params={{ productId: products[0].id }}
                            search={{ tab: "messages" }}
                          >
                            <MessageSquare aria-hidden /> Send feedback
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Sparkles} title="No experiences yet" className="mt-6">
          Your experience is planned in each product's brief. Once the team starts building it,
          you'll see it here and can try it on your phone before launch.
        </EmptyState>
      )}

      {previewing ? (
        <ExperiencePreview
          experience={previewing}
          open
          onOpenChange={(o) => !o && setPreview(undefined)}
        />
      ) : null}
    </Page>
  );
}
