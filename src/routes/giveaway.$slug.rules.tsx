import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { UgcTheme } from "@/components/ugc/creator/kit";
import { btnGhost } from "@/components/ugc/shared/look";
import { getGiveaway } from "@/lib/giveaway/public.functions";
import type { GiveawayCampaign } from "@/lib/giveaway/model";
import { generatedRules, parseRules } from "@/lib/giveaway/rules";
import { cn } from "@/lib/utils";

// /giveaway/<slug>/rules: the official rules. The team's pasted rules when set,
// otherwise rules generated from the campaign's own settings.

export const Route = createFileRoute("/giveaway/$slug/rules")({
  loader: async ({ params }) => {
    const data = await getGiveaway({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `Official rules · ${loaderData?.campaign.title ?? "Giveaway"} | MEDIALIFE` }],
  }),
  component: Rules,
});

function Rules() {
  const { campaign: c } = Route.useLoaderData();
  const text =
    c.rulesText.trim() ||
    generatedRules({
      ...c,
      tasks: c.tasks.map((t) => ({ ...t, codes: [], enabled: true })),
      createdAt: 0,
      updatedAt: 0,
    } as GiveawayCampaign);
  const blocks = parseRules(text);
  return (
    <div className="min-h-dvh bg-[#05080a] text-foreground">
      <UgcTheme />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
        <Link
          to="/giveaway/$slug"
          params={{ slug: c.slug }}
          className={cn(btnGhost, "min-h-10 px-3.5 text-[13px]")}
        >
          <ArrowLeft aria-hidden /> Back to the giveaway
        </Link>
        <article className="mt-8 text-[15px] leading-relaxed text-[#c9d1d8]">
          {blocks.map((b, i) =>
            b.kind === "h" ? (
              i === 0 ? (
                <h1
                  key={i}
                  className="text-3xl font-bold tracking-[-0.03em] text-white text-balance"
                >
                  {b.text}
                </h1>
              ) : (
                <h2 key={i} className="mt-8 text-lg font-semibold text-white">
                  {b.text}
                </h2>
              )
            ) : b.kind === "ul" ? (
              <ul key={i} className="mt-3 list-disc space-y-1 pl-5">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ) : (
              <p key={i} className="mt-3">
                {b.text}
              </p>
            ),
          )}
        </article>
      </main>
    </div>
  );
}
