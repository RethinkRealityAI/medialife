import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { GiveawayPage } from "@/components/giveaway/campaign-page";
import { getGiveaway } from "@/lib/giveaway/public.functions";

// /giveaway/<slug>: a points giveaway's public page. ?ref=<code> credits the friend
// who shared it; ?discord=<result> comes back from the Discord check.

export const Route = createFileRoute("/giveaway/$slug/")({
  validateSearch: z.object({
    ref: z
      .string()
      .regex(/^[a-z0-9]{3,20}$/)
      .optional()
      .catch(undefined),
    discord: z.string().max(20).optional().catch(undefined),
  }),
  loader: async ({ params }) => {
    const data = await getGiveaway({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const c = loaderData?.campaign;
    const title = c ? `${c.title} | ${c.brandLine || "MEDIALIFE"}` : "Giveaway | MEDIALIFE";
    return {
      meta: [
        { title },
        { name: "description", content: c?.tagline ?? "" },
        { property: "og:title", content: c?.title ?? "Giveaway" },
        { property: "og:description", content: c?.tagline ?? "" },
        ...(c?.heroImage ? [{ property: "og:image", content: c.heroImage }] : []),
        ...(loaderData?.preview ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
    };
  },
  component: GiveawayRoute,
});

function GiveawayRoute() {
  const data = Route.useLoaderData();
  const { ref, discord } = Route.useSearch();
  return <GiveawayPage data={data} refCode={ref} discord={discord} />;
}
