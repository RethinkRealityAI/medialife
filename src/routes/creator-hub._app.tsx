import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { HubAppShell } from "@/components/hub/app/app-shell";
import { needsYou } from "@/components/hub/app/workspace";
import { Toaster } from "@/components/ui/sonner";
import { getHubSession } from "@/lib/hub/auth.functions";
import { getWorkspace } from "@/lib/hub/creator.functions";

// The signed-in Creator Hub app: Home, Products, Artwork, Experiences, Launch
// kit, Earnings and Account. A layout route without its own URL segment beyond
// /creator-hub, so the landing page (creator-hub.index.tsx) and the auth pages
// (creator-hub.sign-in.tsx and friends) stay outside it.

export const Route = createFileRoute("/creator-hub/_app")({
  head: () => ({
    meta: [
      { title: "Creator Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const session = await getHubSession();
    if (!session.signedIn) {
      throw redirect({
        href: `/creator-hub/sign-in?next=${encodeURIComponent(location.pathname + (location.searchStr ?? ""))}`,
      });
    }
    if (!session.creator || session.creator.status === "draft") {
      throw redirect({ href: "/creator-hub/onboarding" });
    }
    return { session };
  },
  loader: () => getWorkspace(),
  // Every page reads the workspace; keep it for a few seconds between page
  // changes, and router.invalidate() after any change refreshes it at once.
  staleTime: 15_000,
  component: HubAppLayout,
});

function HubAppLayout() {
  const { session } = Route.useRouteContext();
  const ws = Route.useLoaderData();
  const items = needsYou(ws, session);

  return (
    <HubAppShell
      needs={items}
      manager={ws.manager}
      creator={{
        displayName: ws.creator.profile.displayName,
        status: ws.creator.status,
        agency: ws.creator.agency?.name ?? null,
        email: session.user.email,
        avatar: session.user.discord?.avatar ?? null,
      }}
    >
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </HubAppShell>
  );
}
