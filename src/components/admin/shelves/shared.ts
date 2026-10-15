import { useEffect, useState } from "react";

import type { ShelfStatus } from "@/lib/shelf/shelves";

export { copyText } from "@/components/ar-builder/api";

export const shelvesQueryKey = ["admin", "shelves"] as const;

/** Absolute URL on the host the admin runs on (links are shared from there). */
export function absoluteUrl(path: string): string {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

/**
 * This site's host once mounted ("medialife.ai" while server rendering), so
 * markup that shows a URL hydrates without a mismatch.
 */
export function useHost(): string {
  const [host, setHost] = useState("medialife.ai");
  useEffect(() => setHost(window.location.host), []);
  return host;
}

/** This site's origin once mounted ("https://medialife.ai" while server rendering). */
export function useOrigin(): string {
  const [origin, setOrigin] = useState("https://medialife.ai");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export const STATUS_LABEL: Record<ShelfStatus, string> = {
  draft: "Draft",
  published: "Published",
  changed: "Unpublished changes",
};

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
