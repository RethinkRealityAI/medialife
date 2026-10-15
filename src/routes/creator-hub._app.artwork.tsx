import { createFileRoute, redirect } from "@tanstack/react-router";

// The Artwork page grew into the asset library. Old links (emails, bookmarks)
// land in its Branding section.
export const Route = createFileRoute("/creator-hub/_app/artwork")({
  beforeLoad: () => {
    throw redirect({ to: "/creator-hub/assets", search: { s: "branding" }, replace: true });
  },
});
