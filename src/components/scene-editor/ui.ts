import { Box, Film, Image as ImageIcon } from "lucide-react";

import { HEAVY_BYTES, HEAVY_TRIANGLES, type AssetInfo, type SceneItemKind } from "./types";

// Shared looks for the scene editor. Flat colours only (no gradients); every control at least 44 px.

export const ACCENT = "#f6c344";
export const card = "rounded-2xl border border-white/[0.08] bg-[#17181c] p-4";
export const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#202127] px-3 text-sm font-medium text-white/90 transition-colors hover:bg-[#2a2b32] focus-visible:ring-2 focus-visible:ring-[#f6c344] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0";
export const btnOn = "border-[#f6c344]/70 bg-[#f6c344]/15 text-[#ffe08a] hover:bg-[#f6c344]/20";

export const KIND_ICON: Record<SceneItemKind, typeof Box> = {
  model: Box,
  image: ImageIcon,
  video: Film,
};
export const KIND_WORD: Record<SceneItemKind, string> = {
  model: "3D model",
  image: "Picture",
  video: "Video",
};

export function isHeavy(info?: AssetInfo) {
  return !!info && ((info.triangles ?? 0) > HEAVY_TRIANGLES || (info.bytes ?? 0) > HEAVY_BYTES);
}
