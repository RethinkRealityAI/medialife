/**
 * Chart colours for the analytics dashboard, validated against the card surface
 * (oklch 0.12 0.01 280 ≈ #050509) with the data-viz palette checks:
 *
 * - series: the site's cyan and magenta re-stepped into the dark-mode lightness
 *   band (same values as the partner portal's charts). Worst adjacent CVD ΔE 12,
 *   normal-vision ΔE ≥ 28, both ≥ 3:1 on the surface.
 * - funnel: an ordinal ramp in the brand's cyan hue (240°), light → deep, one
 *   step per funnel stage. Monotone lightness, ΔL ≥ 0.06 between steps, the
 *   deepest step still 2.8:1 on the surface.
 * - context: the de-emphasis grey for "bounced opens" (3.3:1), so real visits
 *   stay the loud series.
 */
export const VIZ = {
  visits: "#069ce4",
  second: "#ec2fa0",
  context: "#61626c",
  funnel: ["#6fc8ff", "#4eb2f1", "#259cde", "#0086c7", "#0070ab", "#005b90"],
  /** hairline grid, one step off the surface */
  grid: "#191a22",
} as const;
