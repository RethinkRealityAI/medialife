import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { PartnerShell } from "@/components/partner/shell";
import { PartnerWelcome, WelcomeProvider } from "@/components/partner/welcome";
import { Toaster } from "@/components/ui/sonner";
import { getHubSession } from "@/lib/hub/auth.functions";
import { getPartnerWorkspace } from "@/lib/hub/partner.functions";

// The Partner Hub (/partner-hub): an agency's space in the Activated
// Merchandise Program. Signed-in hub accounts on a partner team only; anyone
// else is sent to sign in, or to their Creator Hub.

export const Route = createFileRoute("/partner-hub/_app")({
  head: () => ({
    meta: [
      { title: "Partner Hub | MEDIALIFE" },
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
    if (!session.partner) throw redirect({ href: "/creator-hub/dashboard" });
    return { session };
  },
  loader: () => getPartnerWorkspace(),
  staleTime: 15_000,
  component: PartnerLayout,
});

function PartnerLayout() {
  const { session } = Route.useRouteContext();
  const ws = Route.useLoaderData();
  return (
    <WelcomeProvider welcomed={ws.me.welcomed}>
      <PartnerShell partner={ws.partner} me={ws.me} hasCreatorProfile={!!session.creator}>
        <Outlet />
        <Toaster theme="dark" position="top-center" richColors closeButton />
      </PartnerShell>
      {/* First visit only (and "Take the tour" in the account menu). */}
      <PartnerWelcome />
    </WelcomeProvider>
  );
}
