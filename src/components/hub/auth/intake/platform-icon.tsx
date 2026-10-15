import { Globe, Instagram, Twitch, Youtube } from "lucide-react";

import { DiscordMark } from "@/components/hub/auth/fields";
import type { PlatformId } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.59-2.6 2.6 2.6 0 0 1 3.4-2.47V9.68a5.7 5.7 0 0 0-.81-.06 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.68-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z" />
    </svg>
  );
}

function KickMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M4 3h6v4h2V5h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-2h-2v-2h-2v4H4V3Z" />
    </svg>
  );
}

const COLORS: Record<PlatformId, string> = {
  youtube: "text-[#ff4e45]",
  twitch: "text-[#a970ff]",
  tiktok: "text-foreground",
  x: "text-foreground",
  instagram: "text-[#e1306c]",
  kick: "text-[#53fc18]",
  discord: "text-[#7983f5]",
  other: "text-muted-foreground",
};

export function PlatformIcon({
  platform,
  className,
}: {
  platform: PlatformId;
  className?: string;
}) {
  const cls = cn("size-4 shrink-0", COLORS[platform], className);
  switch (platform) {
    case "youtube":
      return <Youtube className={cls} aria-hidden />;
    case "twitch":
      return <Twitch className={cls} aria-hidden />;
    case "instagram":
      return <Instagram className={cls} aria-hidden />;
    case "tiktok":
      return <TikTok className={cls} />;
    case "x":
      return <XMark className={cls} />;
    case "kick":
      return <KickMark className={cls} />;
    case "discord":
      return <DiscordMark className={cls} />;
    default:
      return <Globe className={cls} aria-hidden />;
  }
}
