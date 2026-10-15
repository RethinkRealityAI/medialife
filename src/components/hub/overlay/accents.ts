import type { OverlaySettings } from "@/lib/hub/overlay.server";

// The overlay's colour themes. Hex, not oklch: OBS and Streamlabs embed older
// Chromium builds (OBS 30 ships CEF 103) that predate oklch() in CSS and canvas.

export type Accent = OverlaySettings["accent"];

export type AccentPalette = {
  label: string;
  /** Gradient start / end. */
  a: string;
  b: string;
  /** A midpoint, for three-stop gradients. */
  mid: string;
  /** Confetti and sparkle colours. */
  particles: string[];
};

export const ACCENTS: Record<Accent, AccentPalette> = {
  ember: {
    label: "Ember",
    a: "#19affe",
    b: "#ff2fae",
    mid: "#b37bff",
    particles: ["#19affe", "#ff2fae", "#b37bff", "#7fd8ff", "#ff8fd1", "#ffffff"],
  },
  cyan: {
    label: "Ice",
    a: "#5cf2ff",
    b: "#1289e7",
    mid: "#2fc4f7",
    particles: ["#5cf2ff", "#1289e7", "#9ef8ff", "#2fc4f7", "#ffffff"],
  },
  magenta: {
    label: "Neon",
    a: "#ff6ad5",
    b: "#a443f4",
    mid: "#e052e8",
    particles: ["#ff6ad5", "#a443f4", "#ffb3ea", "#e052e8", "#ffffff"],
  },
  lime: {
    label: "Slime",
    a: "#c6ff4a",
    b: "#00d89c",
    mid: "#6cf07a",
    particles: ["#c6ff4a", "#00d89c", "#eaffb0", "#6cf07a", "#ffffff"],
  },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as Accent[];
