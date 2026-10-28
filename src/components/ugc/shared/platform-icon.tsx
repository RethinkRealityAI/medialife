/** Marks for the six profile platforms and the places a post can go. */
import { Globe, Instagram, Youtube } from "lucide-react";

import type { UgcPlatform, UgcPostPlatform } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

function Svg({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

const TIKTOK =
  "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.59-2.6 2.6 2.6 0 0 1 3.4-2.47V9.68a5.7 5.7 0 0 0-.81-.06 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.68-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z";
const X =
  "M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z";
const ROBLOX = "M5.1 2 2 18.9 18.9 22 22 5.1 5.1 2Zm8.6 13.3-4.9-.9.9-4.9 4.9.9-.9 4.9Z";
const DISCORD =
  "M20.317 4.369A19.79 19.79 0 0 0 15.432 2.85a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z";

const COLORS: Record<UgcPlatform | "other", string> = {
  roblox: "text-slate-100",
  instagram: "text-[#f472b6]",
  youtube: "text-[#ff4e45]",
  discord: "text-[#8b93f8]",
  x: "text-slate-100",
  tiktok: "text-slate-100",
  other: "text-muted-foreground",
};

export function UgcPlatformIcon({
  platform,
  className,
  plain,
}: {
  platform: UgcPlatform | UgcPostPlatform;
  className?: string;
  /** Inherit the text colour instead of the brand tint. */
  plain?: boolean;
}) {
  const cls = cn("size-4 shrink-0", !plain && COLORS[platform], className);
  switch (platform) {
    case "instagram":
      return <Instagram className={cls} aria-hidden />;
    case "youtube":
      return <Youtube className={cls} aria-hidden />;
    case "tiktok":
      return <Svg d={TIKTOK} className={cls} />;
    case "x":
      return <Svg d={X} className={cls} />;
    case "roblox":
      return <Svg d={ROBLOX} className={cls} />;
    case "discord":
      return <Svg d={DISCORD} className={cls} />;
    default:
      return <Globe className={cls} aria-hidden />;
  }
}
