/**
 * What you can paint: the Spray Bobo paintables from the CMS (/api/spray/sets), filled in at run time
 * by `ensureCustomModels()` (paint/customModels.ts). AiroHub's generated object catalog is not used.
 */
import { TargetObjectType } from '../types';

export type ObjectCategory = 'Merch' | 'Drafts';

/** A paintable as the CMS serves it (see src/lib/spray/model.ts in the site). */
export interface SprayPaintable {
  id: string;
  name: string;
  client: string;
  status: 'draft' | 'live';
  builtin: boolean;
  heightMm: number;
  files: { print: string; mask: string; lines: string | null; outline: string; thumb: string };
  targets: { name: string; side: string; flip: number }[];
}

export interface PaintableObject {
  id: TargetObjectType;
  label: string;
  short: string;
  thumb?: string;
  category: ObjectCategory;
  blurb: string;
  /** Longest dimension in world units after normalisation. */
  targetSize: number;
  yaw?: number;
  paintable?: SprayPaintable;
}

export const PAINTABLE_OBJECTS: PaintableObject[] = [];

export const OBJECT_BY_ID = new Map<TargetObjectType, PaintableObject>();

export const OBJECT_CATEGORIES: ObjectCategory[] = ['Merch', 'Drafts'];

export function objectsInCategory(category: ObjectCategory): PaintableObject[] {
  return PAINTABLE_OBJECTS.filter((o) => o.category === category);
}

export const paintableId = (id: string) => `sp-${id}` as TargetObjectType;
