import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PartnerShelfEditor } from "@/components/partner/shelf-editor";
import { usePartnerWorkspace } from "@/components/partner/workspace";
import { useSidebar } from "@/components/ui/sidebar";
import { partnerShelvesFn } from "@/lib/shelf/partner-shelves.functions";

// The team's merch shelves: opens straight onto the current shelf (their
// starting one the first time), already live in the 3D preview.
export const Route = createFileRoute("/partner-hub/_app/shelves")({
  validateSearch: z.object({ shelf: z.string().max(60).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ shelf: search.shelf }),
  loader: ({ deps }) => partnerShelvesFn({ data: { slug: deps.shelf } }),
  // Always the latest draft: autosave writes it from this page.
  gcTime: 0,
  staleTime: 0,
  head: () => ({ meta: [{ title: "Merch shelves · Partner Hub | MEDIALIFE" }] }),
  component: Shelves,
});

function Shelves() {
  const ws = usePartnerWorkspace();
  const d = Route.useLoaderData();
  // The preview gets the room while building; the sidebar comes back after.
  // Here rather than in the editor, which remounts for each shelf.
  const { open, setOpen } = useSidebar();
  const wasOpen = useRef(open);
  useEffect(() => {
    const restore = wasOpen.current;
    if (restore) setOpen(false);
    return () => {
      if (restore) setOpen(true);
    };
  }, [setOpen]);
  return (
    <PartnerShelfEditor
      // A reload (reset, a newer draft elsewhere) starts the editor afresh.
      key={`${d.current.doc.slug}:${d.current.doc.updatedAt}`}
      doc={d.current.doc}
      summary={d.current.summary}
      shelves={d.shelves}
      invites={d.invites}
      partnerName={ws.partner.name}
    />
  );
}
