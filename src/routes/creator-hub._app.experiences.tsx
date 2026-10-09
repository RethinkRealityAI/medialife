import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Gift, ScanLine, ShoppingBag, Smartphone, Sparkles } from "lucide-react";

import { ProductThumb } from "@/components/hub/app/product-card";
import { EmptyState, Page, PageHeader, Panel, Pill } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { EXPERIENCE_KINDS, EXPERIENCE_STATUS, compact, fileUrl } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/_app/experiences")({
  head: () => ({ meta: [{ title: "Experiences · Creator Hub | MEDIALIFE" }] }),
  component: Experiences,
});

const HOW = [
  { icon: ShoppingBag, title: "Fan buys", body: "They get your activated merch." },
  {
    icon: ScanLine,
    title: "Scans or taps",
    body: "Phone camera on the QR, or a tap on the NFC tag.",
  },
  { icon: Smartphone, title: "It opens", body: "Right in the browser. No app to install." },
  { icon: Gift, title: "Reward unlocks", body: "The thing only owners of your merch get." },
];

function Experiences() {
  const ws = useWorkspace();

  return (
    <Page>
      <PageHeader
        title="Experiences"
        description="What fans see when they scan your merch: AR, a mini-game, an exclusive video or a reward."
      />

      <section aria-label="How it works" className="mt-6">
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border @4xl/inset:grid-cols-4">
          {HOW.map((s, i) => (
            <li key={s.title} className="flex gap-3 bg-background p-4">
              <span className="grid grid-cols-1 size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                <s.icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                  {s.title}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {ws.experiences.length ? (
        <ul className="mt-8 grid grid-cols-1 gap-5 @4xl/inset:grid-cols-2">
          {ws.experiences.map((e) => {
            const products = ws.products.filter((p) => p.experienceId === e.id);
            const scans = products.reduce((s, p) => s + p.scans, 0);
            const status = EXPERIENCE_STATUS[e.status];
            const tryUrl = e.previewUrl || e.url;
            return (
              <li key={e.id} id={`exp-${e.id}`} className="scroll-mt-24">
                <Panel
                  as="article"
                  className={
                    e.status === "review"
                      ? "h-full overflow-hidden border-amber-400/45"
                      : "h-full overflow-hidden"
                  }
                >
                  <div className="relative aspect-[16/7] overflow-hidden">
                    {e.imageFileId ? (
                      <img
                        src={fileUrl({ creatorId: e.creatorId, id: e.imageFileId })}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="relative size-full"
                        style={{ background: "var(--gradient-ember)" }}
                      >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
                        <Sparkles className="absolute right-6 bottom-5 size-10 text-white/85" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <Pill tone={status.tone} className="bg-background/85 backdrop-blur">
                        {status.label}
                      </Pill>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 p-5">
                    <div>
                      <p className="text-sm text-muted-foreground">{EXPERIENCE_KINDS[e.kind]}</p>
                      <h2 className="mt-0.5 text-lg font-medium">{e.name}</h2>
                      {e.description ? (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {e.description}
                        </p>
                      ) : null}
                    </div>
                    {e.reward ? (
                      <div className="flex gap-3 rounded-lg border border-border bg-white/[0.03] p-3">
                        <Gift className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <div className="text-sm">
                          <div className="font-medium">What fans get</div>
                          <p className="mt-0.5 text-muted-foreground">{e.reward}</p>
                        </div>
                      </div>
                    ) : null}
                    <div>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          Opened by {products.length} product{products.length === 1 ? "" : "s"}
                        </span>
                        <span>
                          <span className="font-medium tabular-nums">{compact(scans)}</span>{" "}
                          <span className="text-muted-foreground">scans</span>
                        </span>
                      </div>
                      {products.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {products.map((p) => (
                            <li key={p.id}>
                              <Link
                                to="/creator-hub/products/$productId"
                                params={{ productId: p.id }}
                                className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-xs hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                <ProductThumb product={p} className="size-6 rounded-full" />
                                {p.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {tryUrl ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button asChild variant={e.status === "review" ? "default" : "outline"}>
                          <a href={tryUrl} target="_blank" rel="noreferrer">
                            {e.status === "review" ? "Try it and review" : "Try it"}{" "}
                            <ExternalLink aria-hidden />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </Button>
                        {e.status === "review" && products[0] ? (
                          <Link
                            to="/creator-hub/products/$productId"
                            params={{ productId: products[0].id }}
                            hash="messages"
                            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            Send feedback
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Sparkles} title="No experiences yet" className="mt-8">
          Your experience is planned in each product's brief. Once the team starts building it,
          you'll see it here and can try it on your phone before launch.
        </EmptyState>
      )}
    </Page>
  );
}
