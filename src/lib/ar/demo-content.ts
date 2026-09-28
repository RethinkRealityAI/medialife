import { z } from "zod";

import { DEMO_TOURS, type DemoId } from "./demo-tours";

// Content overrides for the live static demos, edited in /admin/demos.
//
// One document per demo: the tour now; product copy can join it later as another
// optional top-level key (e.g. `products: { [id]: {...} }`) without touching the tour.
// Only fields that differ from the page's defaults are stored, so a default the
// team later changes in the page still reaches every stop nobody overrode.

export const TOUR_LIMITS = { t: 80, b: 500 } as const;

export const tourStepOverrideSchema = z
  .object({
    t: z.string().max(TOUR_LIMITS.t).optional(),
    b: z.string().max(TOUR_LIMITS.b).optional(),
    ar: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
export type TourStepOverride = z.infer<typeof tourStepOverrideSchema>;

export const demoContentSchema = z.object({
  tour: z.record(z.string().regex(/^[a-z0-9-]{1,32}$/), tourStepOverrideSchema).optional(),
});
export type DemoContent = z.infer<typeof demoContentSchema>;

/** What is stored per demo (arStore("content"), key "<demo>.json"). */
export interface DemoContentDoc {
  draft: DemoContent;
  published: DemoContent | null;
  publishedAt: number | null;
  updatedAt: number;
}

export const emptyDemoDoc = (): DemoContentDoc => ({
  draft: {},
  published: null,
  publishedAt: null,
  updatedAt: 0,
});

/**
 * Keep only what differs from the defaults: known stop ids, a title or text that
 * isn't blank and isn't the default, an AR flag that flips the default, hidden: true.
 */
export function normalizeDemoContent(demo: DemoId, content: DemoContent): DemoContent {
  const tour: Record<string, TourStepOverride> = {};
  for (const step of DEMO_TOURS[demo].steps) {
    const o = content.tour?.[step.id];
    if (!o) continue;
    const out: TourStepOverride = {};
    const t = o.t?.trim();
    const b = o.b?.trim();
    if (t && t !== step.default.t) out.t = t;
    if (b && b !== step.default.b) out.b = b;
    if (typeof o.ar === "boolean" && o.ar !== step.default.ar) out.ar = o.ar;
    if (o.hidden === true) out.hidden = true;
    if (Object.keys(out).length) tour[step.id] = out;
  }
  return Object.keys(tour).length ? { tour } : {};
}

/** The tour as visitors see it with `content` applied (hidden stops included, flagged). */
export function resolveTour(demo: DemoId, content: DemoContent | null | undefined) {
  return DEMO_TOURS[demo].steps.map((step) => {
    const o = content?.tour?.[step.id] ?? {};
    return {
      ...step,
      t: o.t?.trim() || step.default.t,
      b: o.b?.trim() || step.default.b,
      ar: typeof o.ar === "boolean" ? o.ar : step.default.ar,
      hidden: o.hidden === true,
    };
  });
}

/** How many stops a document changes, for status lines. */
export const changedStops = (content: DemoContent | null | undefined) =>
  Object.keys(content?.tour ?? {}).length;

/** Same overrides, whatever the key order. */
export function sameContent(a: DemoContent, b: DemoContent): boolean {
  const canon = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(canon).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
            .join(",")}}`
        : JSON.stringify(v ?? null);
  return canon(a.tour ?? {}) === canon(b.tour ?? {});
}
