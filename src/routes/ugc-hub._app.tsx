import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { UgcShell } from "@/components/ugc/creator/shell";
import { UgcPageSkeleton, UgcRouteError } from "@/components/ugc/creator/states";
import { getUgcSession } from "@/lib/ugc/auth.functions";
import { getUgcHome } from "@/lib/ugc/creator.functions";
import { UGC_ROUTES } from "@/lib/ugc/model";

// The signed-in EVADE UGC Hub: Home, Brief, Upload, Assets, Perks, Profile.
// A pathless layout under /ugc-hub, so the sign-in pages stay outside it.
// Its loader is the Home data (status, campaign, counts), which the shell
// needs for badges and the deadline; pages read it with useLoaderData.

export const Route = createFileRoute("/ugc-hub/_app")({
  head: () => ({
    meta: [
      { title: "EVADE UGC Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const session = await getUgcSession();
    if (!session.signedIn) {
      throw redirect({
        href: `${UGC_ROUTES.signIn}?next=${encodeURIComponent(location.pathname + (location.searchStr ?? ""))}`,
      });
    }
    return { session };
  },
  loader: () => getUgcHome(),
  staleTime: 10_000,
  pendingComponent: () => <UgcPageSkeleton hero />,
  errorComponent: UgcRouteError,
  component: UgcAppLayout,
});

function UgcAppLayout() {
  const home = Route.useLoaderData();
  return (
    <UgcShell home={home}>
      <Outlet />
    </UgcShell>
  );
}
