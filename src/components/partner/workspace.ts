/** The data every Partner Hub page shares, from the layout's loader. */
import { getRouteApi } from "@tanstack/react-router";

import type { getPartnerWorkspace } from "@/lib/hub/partner.functions";

export type PartnerWorkspace = Awaited<ReturnType<typeof getPartnerWorkspace>>;
export type PartnerCreator = PartnerWorkspace["creators"][number];

const appRoute = getRouteApi("/partner-hub/_app");

export const usePartnerWorkspace = () => appRoute.useLoaderData();

/** The link a creator applies through: the team member's own, or the partner's. */
export function inviteFor(ws: PartnerWorkspace, preferRep?: string) {
  const mine = preferRep
    ? ws.links.find((l) => l.rep.toLowerCase() === preferRep.toLowerCase())
    : undefined;
  return (
    (mine ?? ws.links.find((l) => l.code === ws.partner.id) ?? ws.links[0])?.code ?? ws.partner.id
  );
}

export const programUrl = (ws: PartnerWorkspace, invite: string) =>
  `${ws.origin}/with/${ws.partner.id}?invite=${encodeURIComponent(invite)}`;

export const shelfUrl = (ws: PartnerWorkspace, invite: string, name = "") =>
  `${ws.origin}/shelf?${new URLSearchParams({ ...(name ? { name } : {}), invite }).toString()}`;
