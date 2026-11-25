import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ClientShell } from "@/components/client/shell";
import { Toaster } from "@/components/ui/sonner";
import { getClientSession } from "@/lib/client/hub.functions";

// The Client Hub (/client-hub): an IP client's own space (EVADE first). Members
// of a client team see their client; the MEDIALIFE team (admin cookie) sees the
// client picked in /admin/clients. Anyone else signs in.

export const Route = createFileRoute("/client-hub/_app")({
  head: () => ({
    meta: [
      { title: "Client Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const s = await getClientSession();
    if (!s.viewer)
      throw redirect({
        href: `/client-hub/sign-in?next=${encodeURIComponent(location.pathname + (location.searchStr ?? ""))}`,
      });
    return { workspace: s.viewer };
  },
  component: Layout,
});

function Layout() {
  const { workspace } = Route.useRouteContext();
  return (
    <ClientShell client={workspace.client} me={workspace.me}>
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </ClientShell>
  );
}
