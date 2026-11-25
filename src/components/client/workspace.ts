/** The viewer and client every Client Hub page shares, from the layout's route context. */
import { getRouteApi } from "@tanstack/react-router";

const appRoute = getRouteApi("/client-hub/_app");

export const useClientWorkspace = () => appRoute.useRouteContext().workspace;
