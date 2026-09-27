import { useEffect, useState } from "react";

import { demoPath, type ArLink } from "@/lib/ar/events";
import type { DemoOption } from "@/lib/ar/analytics.server";

export const CODE_RE = /^[a-z0-9_-]{2,40}$/;

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

export function randomSuffix(n = 4): string {
  const a = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (0/o, 1/l)
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (x) => a[x % a.length]).join("");
}

/** "toei-animation-x7k2": readable, and hard to guess from the name alone. */
export function suggestCode(name: string, suffix: string): string {
  return `${slugify(name) || "client"}-${suffix}`;
}

export function shareUrl(origin: string, link: Pick<ArLink, "demo" | "code">): string {
  return `${origin}${demoPath(link.demo)}?c=${encodeURIComponent(link.code)}`;
}

/** What goes into an email: the link, plus the password when the link doesn't skip it. */
export function emailText(url: string, link: Pick<ArLink, "unlock">, demo: DemoOption | undefined) {
  return !link.unlock && demo?.password ? `${url}\nPassword: ${demo.password}` : url;
}

/** This site's origin once mounted: links are shared from the host the admin runs on. */
export function useOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
