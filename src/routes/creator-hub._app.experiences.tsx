import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
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
import { ART, Tile, lift, surface, type Tone } from "@/components/hub/app/look";
import { ProductThumb } from "@/components/hub/app/product-card";
import { EmptyState, Page, PageHeader, Pill } from "@/components/hub/app/ui";
import { productImage, useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { EXPERIENCE_KINDS, EXPERIENCE_STATUS, compact, fileUrl } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/experiences")({
  validateSearch: z.object({ preview: z.string().max(60).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Experiences · Creator Hub | MEDIALIFE" }] }),
  component: Experiences,
});

const HOW: Array<{ icon: typeof Gift; tone: Tone; title: string; body: string }> = [
  { icon: ShoppingBag, tone: "blue", title: "Fan buys", body: "Your activated merch" },
  { icon: ScanLine, tone: "ice", title: "Scans or taps", body: "QR code or NFC tag" },
  { icon: Smartphone, tone: "violet", title: "It opens", body: "In the browser, no app" },
  { icon: Gift, tone: "pink", title: "Reward unlocks", body: "Only owners get it" },
];

function Experiences() {
  const ws = useWorkspace();
  const { preview } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const previewing = ws.experiences.find((e) => e.id === preview) ?? null;
  const setPreview = (id: string | undefined) =>
    navigate({ search: { preview: id }, replace: true, resetScroll: false });

  return (
    <Page>
      <PageHeader
        image={ART.sticker}
        imageClassName="object-[50%_55%]"
        eyebrow="Experiences"
        title="What fans unlock when they scan"
        description="An AR moment, a 3D model, a video, a game or a reward. Try each one on your phone."
      />

      <ol aria-label="How it works" className="mt-4 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {HOW.map((s, i) => (
          <li key={s.title} className={cn(surface, "relative flex items-center gap-3 p-3")}>
            <Tile icon={s.icon} tone={s.tone} />
            <div className="min-w-0 text-sm">
              <div className="text-[11px] text-muted-foreground tabular-nums">Step {i + 1}</div>
              <div className="truncate font-medium">{s.title}</div>
              <p className="truncate text-xs text-muted-foreground">{s.body}</p>
            </div>
            {i < HOW.length - 1 ? (
              <ChevronRight
                aria-hidden
                className="absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 text-[var(--partner)] @4xl/inset:block"
              />
            ) : null}
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
                    surface,
                    lift,
                    "group flex h-full flex-col overflow-hidden",
                    review && "border-amber-400/45",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreview(e.id)}
                    className="relative aspect-[16/8] overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    aria-label={`Preview ${e.name}`}
                  >
                    <img
                      src={
                        e.imageFileId
                          ? fileUrl({ creatorId: e.creatorId, id: e.imageFileId })
                          : products[0]
                            ? productImage(products[0])
                            : ART.sticker
                      }
                      alt=""
                      className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgb(11_13_26/0.85)),radial-gradient(120%_80%_at_100%_100%,color-mix(in_oklab,var(--partner-2)_35%,transparent),transparent_60%)]"
                    />
                    <span className="absolute top-3 left-3">
                      <Pill tone={status.tone} className="bg-black/60 backdrop-blur-md">
                        {status.label}
                      </Pill>
                    </span>
                    <span className="absolute right-3 bottom-3 flex items-center gap-2">
                      <span className="glass grid size-12 place-items-center rounded-full text-white transition-transform group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                        <Play className="size-5 translate-x-0.5" aria-hidden />
                      </span>
                    </span>
                    <span className="absolute bottom-3 left-3 flex items-center gap-2 text-xs font-medium text-white/90">
                      <Sparkles className="size-3.5 text-[#f9a8d4]" aria-hidden />
                      {EXPERIENCE_KINDS[e.kind]}
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold tracking-tight">{e.name}</h2>
                      {e.reward ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          <Gift
                            className="mr-1 inline size-3.5 align-[-2px] text-[#f9a8d4]"
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
                        className="rounded-full"
                      >
                        <Play aria-hidden /> {review ? "Preview and review" : "Preview"}
                      </Button>
                      {review && products[0] ? (
                        <Button asChild size="sm" variant="ghost" className="rounded-full">
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
        <EmptyState icon={Sparkles} title="No experiences yet" className="mt-4" image={ART.sticker}>
          Each product's experience is planned in its brief. Once the team starts building it, try
          it here on your phone before launch.
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
