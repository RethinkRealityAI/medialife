import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { REVIEW_FILTERS, ReviewPage } from "@/components/ugc/admin/review-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminUgcReviewQueue } from "@/lib/ugc/admin.functions";

// /admin/ugc/review: uploads to review, oldest first, with a big player
// (Range-streamed), metadata, shots covered, the comment thread and
// Approve / Request changes / Not used. J/K move, A approves.
// ?status picks the queue (default "in-review"), ?id the open upload.

export const Route = createFileRoute("/admin/ugc/review")({
  validateSearch: z.object({
    status: z.enum(REVIEW_FILTERS).optional().catch(undefined),
    id: z
      .string()
      .regex(/^[A-Za-z0-9]{6,60}$/)
      .optional()
      .catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ status: search.status ?? "in-review" }),
  loader: ({ deps }) => adminUgcReviewQueue({ data: { status: deps.status } }),
  // picking another upload (?id) must not refetch; router.invalidate() after a decision does.
  staleTime: Infinity,
  gcTime: 0,
  head: () => ({ meta: [{ title: "Review · UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  component: ReviewRoute,
});

function ReviewRoute() {
  const items = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ReviewPage
      items={items}
      filter={search.status ?? "in-review"}
      selectedId={search.id}
      onFilter={(f) =>
        void navigate({
          search: { status: f === "in-review" ? undefined : f, id: undefined },
          replace: true,
        })
      }
      onSelect={(id) => void navigate({ search: (s) => ({ ...s, id }), replace: true })}
    />
  );
}
