import { useQuery } from "@tanstack/react-query";

import type { AssetListItem } from "@/lib/ar/assets";
import { assetUrl } from "@/lib/ar/projects";

import { assetsQueryKey, fetchAssets } from "./api";

/** The asset library, cached for the session and refreshed after uploads and deletes. */
export function useAssets() {
  return useQuery({ queryKey: assetsQueryKey, queryFn: fetchAssets, staleTime: 30_000 });
}

/** Where to show a small preview of an asset (phone-sized image, or a model's thumbnail). */
export function assetPreviewUrl(a: AssetListItem | undefined | null): string | null {
  if (!a) return null;
  if (a.kind === "image") return assetUrl(a.mobile ?? a.id);
  return a.thumb ? assetUrl(a.thumb) : null;
}
