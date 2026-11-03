import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PIPELINE_FILTERS, PipelinePage } from "@/components/ugc/admin/pipeline-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminUgcPipeline, adminUgcReviewQueue, adminUgcShipping } from "@/lib/ugc/admin.functions";

// /admin/ugc: the UGC creator pipeline. A "Needs you" strip (sign-ups to
// review, packages to ship, content to review, deletion requests), status
// chips, search and a table with bulk approve / decline / pause / assign.
// ?status, ?q and ?campaign keep the filters.

export const Route = createFileRoute("/admin/ugc/")({
  validateSearch: z.object({
    status: z.enum(PIPELINE_FILTERS).optional().catch(undefined),
    q: z.string().max(120).optional().catch(undefined),
    campaign: z
      .string()
      .regex(/^[A-Za-z0-9]{6,60}$/)
      .optional()
      .catch(undefined),
  }),
  loader: async () => {
    const [pipeline, queue, shipping] = await Promise.all([
      adminUgcPipeline({ data: {} }),
      adminUgcReviewQueue({ data: {} }),
      adminUgcShipping({ data: { onlyUnshipped: true } }),
    ]);
    const oldest = queue[0]?.submission;
    return {
      pipeline,
      needs: {
        toReview: queue.length,
        oldestReviewAt: oldest ? (oldest.completedAt ?? oldest.createdAt) : null,
        toShip: shipping.filter((r) => r.status !== "paused" && !r.shipment?.shippedAt).length,
      },
    };
  },
  // filters live in the URL; changing them must not refetch. router.invalidate() still does.
  staleTime: Infinity,
  gcTime: 0,
  head: () => ({ meta: [{ title: "Pipeline · UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <PageSkeleton />,
  component: PipelineRoute,
});

function PipelineRoute() {
  const { pipeline, needs } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PipelinePage
      data={pipeline}
      needs={needs}
      filters={{
        status: search.status ?? "all",
        q: search.q ?? "",
        campaign: search.campaign ?? "",
      }}
      onFilters={(f) =>
        void navigate({
          search: (s) => ({
            ...s,
            status: f.status === undefined ? s.status : f.status === "all" ? undefined : f.status,
            q: f.q === undefined ? s.q : f.q || undefined,
            campaign: f.campaign === undefined ? s.campaign : f.campaign || undefined,
          }),
          replace: true,
        })
      }
    />
  );
}
