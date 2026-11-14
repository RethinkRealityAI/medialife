// Spray Bobo CMS: shared shapes (server + admin UI + the static Studio / Viewer pages read the same JSON).
//
// A "Paintable" is one piece of merch you can spray: its tracking picture(s) (the 8th Wall image targets,
// one per side), its canvas overlay (mask = where paint shows, lines = the outline drawn over the paint,
// outline = the die-cut line of the finished sticker) and a colour print (what it looks like). All pictures
// share one 3:4 frame, so a point on the tracked picture is a point on the canvas.
//
// A "Creation" is one painting on a Paintable, made in the Studio (or later the AR page), with an unlisted
// share link. Moderation: links work until hidden; only "featured" creations may appear anywhere public.

export const PAINT_W = 768;
export const PAINT_H = 1024;
export const LUM_W = 480;
export const LUM_H = 640;

export type PaintableStatus = "draft" | "live";

/** One side of the merch the camera can find. */
export type PaintableTarget = {
  /** Unique image-target name (the engine reports it when found). */
  name: string;
  side: "front" | "back";
  /** -1: the canvas is mirrored on this picture (the print seen through clear acrylic). */
  flip: 1 | -1;
  /** Where the canvas sits on this picture when it is not the front one (metres, y up; radians). */
  xf?: { x: number; y: number; rz: number; s: number } | null;
  /** Pixel size of the tracked picture (3:4). */
  width: number;
  height: number;
  /** 0..100, from the admin page's feature check. */
  score: number | null;
  /** The luminance picture the engine tracks (480x640 greyscale JPEG). */
  luminance: string;
  /** The colour picture of this side (for people: previews, the test page). */
  image: string;
};

// ------------------------------------------------------------------ the scene (things placed around the print)
//
// One coordinate system everywhere (the admin scene editor, the Studio, the share viewer, the AR page):
// the origin is the centre of the 3:4 tracked picture; x runs right, y up, z out of the print towards the
// viewer; units are MILLIMETRES of the real print. The picture is heightMm tall and heightMm * 3/4 wide.
// A renderer whose card is H units tall multiplies every length by H / heightMm, so the scene sits and
// scales exactly as placed. Rotations are degrees, applied in XYZ order.

export type SceneItemKind = "model" | "image" | "video";

export type SceneItem = {
  id: string;
  kind: SceneItemKind;
  name: string;
  /** /api/spray/file/... path of the asset (GLB, PNG/JPEG/WebP, MP4). */
  file: string;
  /** Centre of the item, millimetres from the centre of the print. */
  pos: [number, number, number];
  /** Degrees, XYZ order. */
  rot: [number, number, number];
  /** Height of the item in millimetres (models: bounding-box height; images and video: the plane's height). */
  size: number;
  /** Images and video: width / height of the picture. Models: null. */
  aspect: number | null;
  /** Models: the animation clip to loop, or null for none. */
  clip: string | null;
  /** Video: play with sound (after a tap); images and models ignore it. */
  sound: boolean;
  /** Hidden items stay in the editor but are not shown to anyone. */
  visible: boolean;
};

export const SCENE_MAX_ITEMS = 12;
export const SCENE_MAX_BYTES = { model: 8 * 1024 * 1024, image: 4 * 1024 * 1024, video: 20 * 1024 * 1024 };

export type Paintable = {
  id: string;
  name: string;
  client: string;
  status: PaintableStatus;
  /** Built into the site (the EVADE keychain charms): read-only in the CMS. */
  builtin: boolean;
  /** The real print's height in millimetres (sets the AR scale). */
  heightMm: number;
  targets: PaintableTarget[];
  /** Things placed around the print (models, pictures, video). Missing on older records: treat as []. */
  scene?: SceneItem[];
  files: {
    /** Colour picture of the front, 3:4. */
    print: string;
    /** 768x1024 PNG, alpha = paintable. */
    mask: string;
    /** 768x1024 PNG outline drawn over the paint, or null. */
    lines: string | null;
    /** JSON { points: [[u, v], ...] } in picture fractions (v down): the sticker's cut line. */
    outline: string;
    thumb: string;
  };
  createdAt: number;
  updatedAt: number;
};

export type CreationStatus = "unlisted" | "featured" | "hidden";

export type Creation = {
  id: string;
  paintable: string;
  /** Paint layer, 768x1024 PNG (transparent where unpainted). */
  image: string;
  primer: boolean;
  linesOn: boolean;
  colours: string[];
  /** 0..1 share of the canvas painted. */
  coverage: number;
  /** Free-text tag set by staff: where it was made ("Mall pop-up, Toronto"). */
  event: string | null;
  source: "studio" | "ar";
  status: CreationStatus;
  reports: number;
  /** For Fan Pass later: who claimed it. */
  ownerId: string | null;
  views: number;
  createdAt: number;
  updatedAt: number;
};

/** Public view of a creation (no report details). */
export type PublicCreation = Pick<
  Creation,
  "id" | "paintable" | "image" | "primer" | "linesOn" | "colours" | "coverage" | "createdAt"
> & { name: string | null };

export const REPORTS_TO_HIDE = 3;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const ID_RE = /^[A-Za-z0-9]{6,40}$/;
