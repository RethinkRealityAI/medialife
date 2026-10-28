import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { errorMessage } from "@/components/admin/creators/ui";
import { Panel, SignInAgain } from "@/components/admin/kit";
import {
  MediaLibraryPage,
  type MediaFilters,
  type MediaFiltersPatch,
} from "@/components/media/library-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { adminMediaLibrary } from "@/lib/media/admin.functions";
import {
  MEDIA_KINDS,
  MEDIA_ORIENTATIONS,
  MEDIA_PURPOSES,
  MEDIA_SORTS,
  type MediaSort,
} from "@/lib/media/model";

// /admin/media: the site-wide Media Library (video, images, audio, 3D,
// documents, fonts). The /admin layout enforces the admin password. Filters,
// the layout and the open file live in the URL; changing them never refetches
// (router.invalidate() after a change does). Contract: README "Media Library".

const text = (max: number) => z.string().max(max).optional().catch(undefined);

export const Route = createFileRoute("/admin/media")({
  validateSearch: z.object({
    q: text(200),
    kind: z.enum(MEDIA_KINDS).optional().catch(undefined),
    /** Comma-separated; every tag must match. */
    tags: text(800),
    client: text(120),
    collection: text(160),
    purpose: z.enum(MEDIA_PURPOSES).optional().catch(undefined),
    vis: z.enum(["public", "private"]).optional().catch(undefined),
    ai: z.enum(["yes", "no"]).optional().catch(undefined),
    orient: z
      .enum(MEDIA_ORIENTATIONS as [string, ...string[]])
      .optional()
      .catch(undefined),
    sort: z
      .enum(Object.keys(MEDIA_SORTS) as [MediaSort, ...MediaSort[]])
      .optional()
      .catch(undefined),
    view: z.enum(["grid", "list"]).optional().catch(undefined),
    asset: z
      .string()
      .regex(/^[A-Za-z0-9]{6,60}$/)
      .optional()
      .catch(undefined),
  }),
  loader: () => adminMediaLibrary(),
  staleTime: Infinity,
  gcTime: 0,
  head: () => ({ meta: [{ title: "Media library | MEDIALIFE" }] }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  errorComponent: MediaError,
  component: MediaRoute,
});

const splitTags = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

function MediaRoute() {
  const data = Route.useLoaderData();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filters: MediaFilters = {
    q: s.q ?? "",
    kind: s.kind,
    tags: splitTags(s.tags),
    client: s.client,
    collection: s.collection,
    purpose: s.purpose,
    vis: s.vis,
    ai: s.ai,
    orient: s.orient as MediaFilters["orient"],
    sort: s.sort,
    view: s.view ?? "grid",
    asset: s.asset,
  };
  const onFilters = useCallback(
    (p: MediaFiltersPatch) =>
      void navigate({
        search: (cur) => {
          const next: Record<string, unknown> = { ...cur };
          for (const [k, v] of Object.entries(p)) {
            if (k === "tags")
              next.tags = (v as string[] | undefined)?.length
                ? (v as string[]).join(",")
                : undefined;
            else if (k === "q") next.q = (v as string | undefined)?.trim() ? v : undefined;
            else if (k === "view") next.view = v === "grid" ? undefined : v;
            else next[k] = v;
          }
          return next as typeof cur;
        },
        replace: !("asset" in p),
        resetScroll: false,
      }),
    [navigate],
  );
  return (
    <>
      <Toaster theme="dark" position="bottom-right" closeButton />
      <MediaLibraryPage data={data} filters={filters} onFilters={onFilters} />
    </>
  );
}

function MediaError({ error }: { error: Error }) {
  const router = useRouter();
  if (/forbidden|unauthori[sz]ed/i.test(error.message)) return <SignInAgain />;
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-base font-medium">The media library didn't load</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {errorMessage(error, "Check your connection and try again.")}
      </p>
      <Button className="mt-4 h-11 sm:h-9" onClick={() => void router.invalidate()}>
        Try again
      </Button>
    </Panel>
  );
}
