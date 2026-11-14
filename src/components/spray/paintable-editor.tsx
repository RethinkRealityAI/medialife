import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Loader2,
  Paintbrush,
  Rocket,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { savePaintable, sprayKeys, type AdminPaintable } from "./api";
import {
  autoMask,
  prepareAuto,
  TOL_DEFAULT,
  TOL_MAX,
  TOL_MIN,
  type AutoPrep,
  type AutoResult,
  type Tap,
} from "./auto-mask";
import {
  alphaOf,
  buildTarget,
  canvas,
  drawFramed,
  finishCanvas,
  frameFor,
  hasTransparency,
  isPlaced,
  linesPlaced,
  loadImage,
  overlayShape,
  PAINT_H,
  PAINT_W,
  pixels,
  PLACE0,
  toBlob,
  type CanvasBuild,
  type Fit,
  type Frame,
  type LinesMode,
  type Place,
  type TargetBuild,
} from "./convert";
import { MaskBrush, MaskEdits } from "./mask-brush";
import {
  ChoiceRow,
  CUT_LINE,
  EVADE_YELLOW,
  FilePick,
  Note,
  PreviewSlot,
  ScoreCard,
  Segmented,
  Step,
  TouchPreview,
  Preview,
} from "./parts";

// The paintable editor: a step-by-step form for a non-technical team. Everything is converted in the
// browser (convert.ts, auto-mask.ts) and sent as the multipart form savePaintable() in
// src/lib/spray/server.ts reads.

const PICTURE_TYPES = "image/jpeg,image/png,image/webp";
const THUMB_W = 264;
const THUMB_H = 352;

type Picked = { file: File; img: HTMLImageElement };
type Overlay = Picked & { noAlpha: boolean };
type NewSide = Picked & { fit: Fit; build: TargetBuild };
/** What an existing paintable already has, loaded for the previews. */
type Stored = {
  print: HTMLImageElement | null;
  frontLum: HTMLImageElement | null;
  backImg: HTMLImageElement | null;
  backLum: HTMLImageElement | null;
  mask: HTMLImageElement | null;
  lines: HTMLImageElement | null;
  outline: [number, number][] | null;
};
type LinesChoice = LinesMode | "keep";
/** Where the part fans can paint comes from. */
type Source = "target" | "upload" | "saved";
/** The target picture, ready for "Use the target picture". */
type AutoSrc = { prep: AutoPrep; own: boolean };

const optional = (p: Promise<HTMLImageElement>) => p.catch(() => null);

function useStored(p: AdminPaintable | null): Stored | null {
  const [s, setS] = useState<Stored | null>(null);
  useEffect(() => {
    if (!p) return;
    let alive = true;
    const back = p.targets.find((t) => t.side === "back");
    void Promise.all([
      optional(loadImage(p.targets[0]?.image ?? p.files.print)),
      p.targets[0] ? optional(loadImage(p.targets[0].luminance)) : null,
      back ? optional(loadImage(back.image)) : null,
      back ? optional(loadImage(back.luminance)) : null,
      optional(loadImage(p.files.mask)),
      p.files.lines ? optional(loadImage(p.files.lines)) : null,
      fetch(p.files.outline)
        .then((r) => r.json() as Promise<{ points?: [number, number][] }>)
        .then((o) => o.points ?? null)
        .catch(() => null),
    ]).then(([print, frontLum, backImg, backLum, mask, lines, outline]) => {
      if (alive) setS({ print, frontLum, backImg, backLum, mask, lines, outline });
    });
    return () => {
      alive = false;
    };
  }, [p]);
  return s;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The front picture on the paint grid, with its pad bars (known background), ready for the auto step. */
function autoFromFront(img: HTMLImageElement, f: Frame): AutoSrc {
  const c = drawFramed(img, f, PAINT_W, PAINT_H, null);
  const rgba = c
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, PAINT_W, PAINT_H).data;
  const k = PAINT_W / f.w;
  const pad: [number, number, number, number] = [
    -f.x * k,
    -f.y * k,
    (f.sw - f.x) * k,
    (f.sh - f.y) * k,
  ];
  return { prep: prepareAuto(rgba, PAINT_W, PAINT_H, pad), own: hasTransparency(img) };
}

/** Draw the tracked (greyscale) picture with the corner points the check found. */
function drawTracked(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  src: CanvasImageSource | null,
  points: [number, number][] = [],
) {
  if (!src) return;
  g.drawImage(src, 0, 0, w, h);
  const k = w / 480;
  g.fillStyle = EVADE_YELLOW;
  g.strokeStyle = "#15131a";
  g.lineWidth = 1;
  for (const [x, y] of points) {
    g.beginPath();
    g.arc(x * k, y * k, 3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

/** A white-on-transparent canvas of the part fans can paint (0..255 per pixel). */
function shapeCanvas(alpha: Uint8Array): HTMLCanvasElement {
  const c = canvas(PAINT_W, PAINT_H);
  const g = c.getContext("2d")!;
  const d = g.createImageData(PAINT_W, PAINT_H);
  for (let i = 0; i < alpha.length; i++) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255;
    d.data[i * 4 + 3] = alpha[i];
  }
  g.putImageData(d, 0, 0);
  return c;
}

type ViewMode = "fill" | "edge";

/**
 * The front picture with the paintable area tinted yellow, the lines on top and the cut line; or,
 * in "edge" view, just the edge of the paintable area over the picture (misalignment is easy to see).
 */
function drawAlignment(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: CanvasImageSource | null,
  mask: CanvasImageSource | null,
  lines: CanvasImageSource | null,
  outline: [number, number][] | null,
  view: ViewMode,
  taps: Tap[],
) {
  if (base) g.drawImage(base, 0, 0, w, h);
  if (mask && view === "edge") {
    const t = canvas(w, h);
    const tg = t.getContext("2d", { willReadFrequently: true })!;
    tg.drawImage(mask, 0, 0, w, h);
    const src = tg.getImageData(0, 0, w, h);
    const out = tg.createImageData(w, h);
    const on = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < w && y < h && src.data[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = on(x, y);
        if (v === on(x + 1, y) && v === on(x, y + 1) && v === on(x - 1, y) && v === on(x, y - 1))
          continue;
        const j = (y * w + x) * 4;
        out.data[j] = 255;
        out.data[j + 1] = 79;
        out.data[j + 2] = 163;
        out.data[j + 3] = 255;
      }
    tg.putImageData(out, 0, 0);
    // a dark halo first, so the edge reads on light and dark prints
    g.globalAlpha = 0.6;
    g.filter = "blur(1.5px) brightness(0)";
    g.drawImage(t, 0, 0);
    g.filter = "none";
    g.globalAlpha = 1;
    g.drawImage(t, 0, 0);
  } else if (mask) {
    const t = canvas(w, h);
    const tg = t.getContext("2d")!;
    tg.drawImage(mask, 0, 0, w, h);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = EVADE_YELLOW;
    tg.fillRect(0, 0, w, h);
    g.globalAlpha = 0.5;
    g.drawImage(t, 0, 0);
    g.globalAlpha = 1;
    if (lines) g.drawImage(lines, 0, 0, w, h);
    if (outline && outline.length > 2) {
      g.beginPath();
      outline.forEach(([u, v], i) => (i ? g.lineTo(u * w, v * h) : g.moveTo(u * w, v * h)));
      g.closePath();
      g.lineWidth = 2.5;
      g.strokeStyle = CUT_LINE;
      g.stroke();
    }
  }
  for (const t of taps) {
    g.beginPath();
    g.arc(t.u * w, t.v * h, 6, 0, Math.PI * 2);
    g.fillStyle = t.keep ? EVADE_YELLOW : "#15131a";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = t.keep ? "#15131a" : "#ffffff";
    g.stroke();
  }
}

const ratio = (a: { naturalWidth: number; naturalHeight: number }) =>
  a.naturalWidth / a.naturalHeight;
const size = (a: { naturalWidth: number; naturalHeight: number }) =>
  `${a.naturalWidth} × ${a.naturalHeight}`;

const CONFIDENCE: Record<AutoResult["confidence"], { tone: "info" | "warn"; text: string }> = {
  good: {
    tone: "info",
    text: "The background looks plain, so this should be accurate. Check the edge in the preview.",
  },
  ok: {
    tone: "warn",
    text: "The background is mostly plain. Check the edge in the preview, and fix any spots with the brush.",
  },
  poor: {
    tone: "warn",
    text: "The background is busy, so this edge is probably wrong. Use the brush, or upload a cut-out PNG instead.",
  },
};

export function PaintableEditor({
  paintable,
  onClose,
}: {
  /** null: a new paintable */
  paintable: AdminPaintable | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const uid = useId();
  const editing = !!paintable;
  const stored = useStored(paintable);
  const oldBack = paintable?.targets.findIndex((t) => t.side === "back") ?? -1;

  const [name, setName] = useState(paintable?.name ?? "");
  const [client, setClient] = useState(paintable?.client ?? "EVADE");
  const [height, setHeight] = useState(paintable ? String(paintable.heightMm) : "");

  const [front, setFront] = useState<NewSide | null>(null);
  const [frontAuto, setFrontAuto] = useState<AutoSrc | null>(null);
  const [frontErr, setFrontErr] = useState<string | null>(null);
  const [backOn, setBackOn] = useState(oldBack >= 0);
  const [back, setBack] = useState<NewSide | null>(null);
  const [backErr, setBackErr] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(
    oldBack >= 0 ? paintable!.targets[oldBack].flip === -1 : true,
  );

  // step 4: where the part fans can paint comes from, and how it is adjusted
  const [source, setSource] = useState<Source>(editing ? "saved" : "target");
  const [sourceWhy, setSourceWhy] = useState<string | null>(null);
  const [sourceTouched, setSourceTouched] = useState(false);
  const [tol, setTol] = useState(TOL_DEFAULT);
  const [taps, setTaps] = useState<Tap[]>([]);
  const [tapMode, setTapMode] = useState<"off" | "bg" | "keep">("off");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [overlayErr, setOverlayErr] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>(PLACE0);
  const [fitOpen, setFitOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("fill");
  const [linesMode, setLinesMode] = useState<LinesChoice>(editing ? "keep" : "art");
  const [linesPick, setLinesPick] = useState<Picked | null>(null);
  const [brushOpen, setBrushOpen] = useState(false);
  // hand fixes, one set per source (switching back and forth keeps them)
  const editsRef = useRef<Partial<Record<Source, MaskEdits>>>({});
  const [editsVer, setEditsVer] = useState(0);
  const edits = (editsRef.current[source] ??= new MaskEdits());

  const [busy, setBusy] = useState<null | "draft" | "live">(null);
  const [error, setError] = useState<string | null>(null);

  async function pickSide(
    f: File,
    fit: Fit,
    set: (s: NewSide | null) => void,
    err: typeof setFrontErr,
    isFront: boolean,
  ) {
    err(null);
    try {
      const img = await loadImage(f);
      // let the "working" state paint before the (blocking) check
      await new Promise((r) => setTimeout(r, 0));
      const side = { file: f, img, fit, build: buildTarget(img, fit) };
      set(side);
      if (isFront) frontPicked(side);
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
    }
  }
  const refit = (s: NewSide, fit: Fit) => ({ ...s, fit, build: buildTarget(s.img, fit) });

  /** A new front picture: get the auto step ready and pick the best way to make the canvas. */
  function frontPicked(side: NewSide) {
    const a = autoFromFront(side.img, side.build.frame);
    setFrontAuto(a);
    if (editing || sourceTouched) return;
    if (a.own) {
      setSource("target");
      setSourceWhy(
        "Your front picture already has see-through parts, so they mark the part fans can paint.",
      );
      return;
    }
    const r = autoMask(a.prep, TOL_DEFAULT, []);
    if (r.confidence === "poor") {
      setSource("upload");
      setSourceWhy(
        "The front picture's background is busy, so a cut-out PNG will be more accurate. You can still try the target picture.",
      );
    } else {
      setSource("target");
      setSourceWhy(
        "The front picture has a plain background, so the part fans can paint can come straight from it.",
      );
    }
  }

  async function pick(f: File, set: (p: Picked | null) => void, err?: typeof setFrontErr) {
    err?.(null);
    try {
      set({ file: f, img: await loadImage(f) });
    } catch (e) {
      err?.(e instanceof Error ? e.message : String(e));
    }
  }

  const chooseSource = (s: Source) => {
    setSource(s);
    setSourceTouched(true);
    setSourceWhy(null);
    setTapMode("off");
    if (s !== "saved" && linesMode === "keep") setLinesMode("art");
  };

  // ------------------------------------------------------------ the shape before hand fixes
  const storedAuto = useMemo(
    () =>
      source === "target" && !front && stored?.print
        ? {
            prep: prepareAuto(pixels(stored.print, PAINT_W, PAINT_H), PAINT_W, PAINT_H, null),
            own: false,
          }
        : null,
    [source, front, stored],
  );
  const autoSrc = front ? frontAuto : storedAuto;
  const dTol = useDebounced(tol, 120);
  const auto = useMemo(
    () => (source === "target" && autoSrc ? autoMask(autoSrc.prep, dTol, taps) : null),
    [source, autoSrc, dTol, taps],
  );

  // the uploaded overlay is framed exactly like the front upload; without a new front, like the
  // saved 3:4 picture
  const overlayFrame = useMemo(
    (): Frame | null =>
      overlay
        ? front
          ? front.build.frame
          : frameFor(overlay.img.naturalWidth, overlay.img.naturalHeight, "pad")
        : null,
    [overlay, front],
  );
  const shaped = useMemo(() => {
    if (source !== "upload" || !overlay || !overlayFrame) return null;
    return overlayShape(overlay.img, overlayFrame, place, overlay.noAlpha);
  }, [source, overlay, overlayFrame, place]);
  const storedAlpha = useMemo(
    () => (source === "saved" && stored?.mask ? alphaOf(stored.mask) : null),
    [source, stored],
  );
  const baseAlpha: Uint8Array | null =
    source === "target"
      ? (auto?.alpha ?? null)
      : source === "upload"
        ? (shaped?.alpha ?? null)
        : storedAlpha;

  // the picture under the paint: the new front picture, or the saved one
  const basePic: CanvasImageSource | null = front?.build.colour ?? stored?.print ?? null;
  const basePixels = useMemo(
    () => (basePic && source !== "upload" ? pixels(basePic, PAINT_W, PAINT_H) : null),
    [basePic, source],
  );
  // what "Art's own dark lines" reads: the overlay for an upload, the target picture otherwise
  const artPixels = source === "upload" ? (shaped?.art ?? null) : basePixels;

  // the final shape: hand fixes on top (recomputed after every stroke)
  const finalAlpha = useMemo(
    () => (baseAlpha ? edits.apply(baseAlpha) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseAlpha, edits, editsVer],
  );
  const finalCanvas = useMemo(() => (finalAlpha ? shapeCanvas(finalAlpha) : null), [finalAlpha]);
  const handFixed = edits.count > 0;

  // ------------------------------------------------------------ lines and cut line (debounced)
  const linesUpload = useMemo(() => {
    if (linesMode !== "upload" || !linesPick) return null;
    const frame =
      front?.build.frame ??
      frameFor(linesPick.img.naturalWidth, linesPick.img.naturalHeight, "pad");
    return linesPlaced(linesPick.img, frame, source === "upload" ? place : PLACE0);
  }, [linesMode, linesPick, front, source, place]);
  /** Whether new canvas files get saved (a saved shape with nothing changed stays as it is). */
  const needBuild =
    source !== "saved" || handFixed || (linesMode !== "keep" && linesMode !== "none");
  const buildNow = useCallback((): { build: CanvasBuild | null; error: string | null } => {
    if (!finalAlpha || !needBuild) return { build: null, error: null };
    const mode: LinesMode = linesMode === "keep" ? "none" : linesMode;
    try {
      return { build: finishCanvas(finalAlpha, artPixels, mode, linesUpload), error: null };
    } catch (e) {
      return { build: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [finalAlpha, needBuild, linesMode, artPixels, linesUpload]);
  const [built, setBuilt] = useState<{ build: CanvasBuild | null; error: string | null }>({
    build: null,
    error: null,
  });
  const [building, setBuilding] = useState(false);
  useEffect(() => {
    setBuilding(true);
    const t = setTimeout(() => {
      setBuilt(buildNow());
      setBuilding(false);
    }, 220);
    return () => clearTimeout(t);
  }, [buildNow]);

  // what the alignment preview shows
  const keepSaved = source === "saved" && !handFixed;
  const maskSrc: CanvasImageSource | null =
    finalCanvas ?? (source === "saved" ? (stored?.mask ?? null) : null);
  const linesSrc =
    linesMode === "none"
      ? null
      : linesMode === "keep"
        ? (stored?.lines ?? null)
        : (built.build?.lines ?? null);
  const outline = built.build?.outline ?? (keepSaved ? (stored?.outline ?? null) : null);
  const hasShape = !!finalAlpha || (editing && source === "saved");

  const shapeWarning = useMemo(() => {
    if (source !== "upload" || !overlay) return null;
    if (front && Math.abs(ratio(overlay.img) - ratio(front.img)) > 0.01)
      return `The cut-out is a different shape (${size(overlay.img)}) from the front picture (${size(front.img)}). Export both from the same file at the same size, or line it up by hand next to the preview.`;
    if (!front && Math.abs(ratio(overlay.img) - 0.75) > 0.01)
      return `Without a new front picture, the cut-out has to match the saved front picture, which is 3:4 (yours is ${size(overlay.img)}). Upload the front picture again too, or line it up by hand next to the preview.`;
    return null;
  }, [source, overlay, front]);

  const dirty =
    !!front ||
    !!back ||
    !!overlay ||
    !!linesPick ||
    taps.length > 0 ||
    handFixed ||
    isPlaced(place) ||
    (editing && source !== "saved") ||
    name !== (paintable?.name ?? "") ||
    client !== (paintable?.client ?? "EVADE") ||
    height !== (paintable ? String(paintable.heightMm) : "") ||
    backOn !== oldBack >= 0 ||
    (editing && linesMode !== "keep");

  async function save(publish: boolean) {
    setError(null);
    const problems: string[] = [];
    const heightMm = Number(height.replace(",", "."));
    const fresh = buildNow();
    if (!name.trim()) problems.push("Give it a name (step 1).");
    if (!(heightMm >= 10 && heightMm <= 3000))
      problems.push("Enter the print height in millimetres, between 10 and 3000 (step 1).");
    if (!front && !editing) problems.push("Add the front tracking picture (step 2).");
    if (backOn && !back && oldBack < 0)
      problems.push("Add the back picture, or untick the back side (step 3).");
    if (!hasShape)
      problems.push(
        source === "upload"
          ? "Add the cut-out PNG, or use the target picture (step 4)."
          : "Mark the part fans can paint (step 4).",
      );
    if (fresh.error) problems.push(fresh.error);
    if (linesMode === "upload" && !linesPick)
      problems.push("Choose the lines picture, or pick another lines option (step 4).");
    if (problems.length) {
      setError(problems.join(" "));
      return;
    }
    setBusy(publish ? "live" : "draft");
    try {
      const fd = new FormData();
      const targets: {
        side: "front" | "back";
        flip: 1 | -1;
        score: number | null;
        keep?: number;
      }[] = [];
      const addSide = async (i: number, s: NewSide) => {
        fd.append(`t${i}_lum`, await toBlob(s.build.lum, "image/jpeg", 0.92), `t${i}_lum.jpg`);
        fd.append(`t${i}_img`, await toBlob(s.build.colour, "image/jpeg", 0.9), `t${i}.jpg`);
      };
      if (front) {
        targets.push({ side: "front", flip: 1, score: front.build.track.score });
        await addSide(0, front);
        const th = canvas(THUMB_W, THUMB_H);
        th.getContext("2d")!.drawImage(front.build.colour, 0, 0, THUMB_W, THUMB_H);
        fd.append("thumb", await toBlob(th, "image/jpeg", 0.85), "thumb.jpg");
      } else targets.push({ side: "front", flip: 1, score: paintable!.targets[0].score, keep: 0 });
      if (backOn) {
        const flip = mirrored ? -1 : 1;
        if (back) {
          targets.push({ side: "back", flip, score: back.build.track.score });
          await addSide(1, back);
        } else
          targets.push({
            side: "back",
            flip,
            score: paintable!.targets[oldBack].score,
            keep: oldBack,
          });
      }
      const b = fresh.build;
      if (b) {
        fd.append("mask", await toBlob(b.mask, "image/png"), "mask.png");
        if (b.lines && linesMode !== "keep")
          fd.append("lines", await toBlob(b.lines, "image/png"), "lines.png");
        fd.append("outline", JSON.stringify({ points: b.outline }));
      }
      if (editing && (linesMode === "none" || (b && !b.lines && linesMode !== "keep")))
        fd.append("lines_clear", "1");
      fd.append(
        "meta",
        JSON.stringify({
          name: name.trim(),
          client: client.trim() || "EVADE",
          status: publish ? "live" : "draft",
          heightMm,
          targets,
        }),
      );
      const saved = await savePaintable(paintable?.id ?? null, fd);
      await qc.invalidateQueries({ queryKey: sprayKeys.sets });
      toast.success(
        publish
          ? `${saved.name} is live: fans can paint it in the Studio`
          : `${saved.name} saved as a draft`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function cancel() {
    if (dirty && !window.confirm("Leave without saving? Your changes will be lost.")) return;
    onClose();
  }

  const live = paintable?.status === "live";
  const fid = (s: string) => `${uid}-${s}`;
  const nudge = (dx: number, dy: number) =>
    setPlace((p) => ({ ...p, x: p.x + dx / PAINT_W, y: p.y + dy / PAINT_H }));
  const canFit = source === "upload" && !!overlay;
  const previewMode =
    tapMode !== "off" && source === "target" ? "tap" : fitOpen && canFit ? "drag" : null;

  const linesOptions: [LinesChoice, string, string][] = [
    ...(editing && source === "saved"
      ? ([["keep", "Keep the current lines", "Leave the lines as they are now."]] as [
          LinesChoice,
          string,
          string,
        ][])
      : []),
    [
      "art",
      "Art's own dark lines",
      source === "upload"
        ? "The dark outlines, faces and lettering from your cut-out, plus the edge."
        : "The dark outlines, faces and lettering from the front picture, plus the edge.",
    ],
    ["edge", "Edge only", "Just a line around the paintable area."],
    ["none", "None", "No lines: paint only."],
    [
      "upload",
      "Upload lines PNG",
      "Your own lines: dark lines on transparent, framed like the front picture.",
    ],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button
            type="button"
            variant="ghost"
            onClick={cancel}
            className="-ml-3 h-11 text-white/70 hover:text-white"
          >
            <ArrowLeft aria-hidden />
            All paintables
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">
            {editing ? `Edit ${paintable.name}` : "New paintable"}
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {editing
              ? "Change what you need. Pictures you don't replace stay as they are."
              : "Five steps: the basics, the pictures the camera looks for, the part fans can paint, then save."}
          </p>
        </div>
      </div>

      {/* 1 */}
      <Step n={1} title="The basics" sub="What it is, who it's for, and how big the real print is.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <Label htmlFor={fid("name")}>Name</Label>
            <Input
              id={fid("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Bobo tee, front print"
              className="mt-1.5 h-11"
              autoComplete="off"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor={fid("client")}>Client</Label>
            <Input
              id={fid("client")}
              value={client}
              onChange={(e) => setClient(e.target.value)}
              maxLength={60}
              className="mt-1.5 h-11"
              autoComplete="off"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor={fid("height")}>Real print height (mm)</Label>
            <Input
              id={fid("height")}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 80"
              className="mt-1.5 h-11"
              aria-describedby={fid("height-hint")}
            />
            <p
              id={fid("height-hint")}
              className="mt-1.5 text-xs leading-relaxed text-muted-foreground"
            >
              Measure the printed picture on the real merch, top to bottom. This sets how big the
              paint appears in AR, so it sits exactly on the print.
            </p>
          </div>
        </div>
      </Step>

      {/* 2 */}
      <Step
        n={2}
        title="Front tracking picture"
        sub="A straight-on, evenly lit picture of the printed front (JPG, PNG or WebP). This is what the phone camera looks for to place the paint."
      >
        <SideInput
          idBase={fid("front")}
          side={front}
          error={frontErr}
          onPick={(f) => pickSide(f, front?.fit ?? "pad", setFront, setFrontErr, true)}
          onFit={(fit) => {
            if (!front) return;
            const s = refit(front, fit);
            setFront(s);
            frontPicked(s);
          }}
          storedColour={stored?.print ?? null}
          storedLum={stored?.frontLum ?? null}
          storedScore={editing ? (paintable.targets[0]?.score ?? null) : null}
          editing={editing}
        />
        {front && editing && source === "saved" ? (
          <div className="mt-4">
            <Note tone="info">
              You changed the front picture: check in step 4 that the paintable area still lines up
              with it.
            </Note>
          </div>
        ) : null}
      </Step>

      {/* 3 */}
      <Step
        n={3}
        title="Back side (optional)"
        sub="If fans can also point the camera at the back (for example a clear acrylic charm), add a picture of the back too."
      >
        <div className="space-y-4">
          <ChoiceRow
            id={fid("back-on")}
            selected={backOn}
            control={
              <Checkbox
                id={fid("back-on")}
                checked={backOn}
                onCheckedChange={(v) => setBackOn(v === true)}
              />
            }
            title="This merch has a back side the camera should find too"
          />
          {backOn ? (
            <>
              <ChoiceRow
                id={fid("mirror")}
                selected={mirrored}
                control={
                  <Checkbox
                    id={fid("mirror")}
                    checked={mirrored}
                    onCheckedChange={(v) => setMirrored(v === true)}
                  />
                }
                title="Mirrored (same print seen through clear acrylic)"
                sub="Tick this when the back shows the front print reversed. Leave it unticked when the back has its own artwork."
              />
              <SideInput
                idBase={fid("back")}
                side={back}
                error={backErr}
                onPick={(f) => pickSide(f, back?.fit ?? "pad", setBack, setBackErr, false)}
                onFit={(fit) => back && setBack(refit(back, fit))}
                storedColour={stored?.backImg ?? null}
                storedLum={stored?.backLum ?? null}
                storedScore={oldBack >= 0 ? paintable!.targets[oldBack].score : null}
                editing={oldBack >= 0}
              />
            </>
          ) : null}
        </div>
      </Step>

      {/* 4 */}
      <Step
        n={4}
        title="The part fans can paint"
        sub="Only this part takes paint. Let the target picture show it, or upload a cut-out. You can fix any spot by hand."
        id="paintable-step-4"
      >
        <fieldset className="min-w-0">
          <legend className="sr-only">Where the part fans can paint comes from</legend>
          <RadioGroup
            value={source}
            onValueChange={(v) => chooseSource(v as Source)}
            className={cn("gap-2", editing ? "sm:grid-cols-3" : "sm:grid-cols-2")}
            aria-label="Where the part fans can paint comes from"
          >
            {editing ? (
              <ChoiceRow
                id={fid("src-saved")}
                selected={source === "saved"}
                control={<RadioGroupItem id={fid("src-saved")} value="saved" />}
                title="Keep the saved shape"
                sub="The part fans can paint now. You can still fix it by hand."
              />
            ) : null}
            <ChoiceRow
              id={fid("src-target")}
              selected={source === "target"}
              control={<RadioGroupItem id={fid("src-target")} value="target" />}
              title="Use the target picture"
              sub="Finds the part fans can paint by removing a plain background from the front picture. No extra file."
            />
            <ChoiceRow
              id={fid("src-upload")}
              selected={source === "upload"}
              control={<RadioGroupItem id={fid("src-upload")} value="upload" />}
              title="Upload a cut-out PNG"
              sub="Only the paintable part shows, the rest is see-through. Best for busy backgrounds."
            />
          </RadioGroup>
          {sourceWhy ? (
            <p className="mt-2 text-sm text-white/75" role="status">
              {sourceWhy}
            </p>
          ) : null}
        </fieldset>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-5">
            {source === "target" ? (
              !autoSrc ? (
                <Note tone="info">
                  {editing
                    ? "Loading the saved front picture…"
                    : "Add the front picture in step 2 first: the part fans can paint comes from it."}
                </Note>
              ) : (
                <div className="space-y-4">
                  {auto ? (
                    <Note
                      tone={autoSrc.own ? "info" : CONFIDENCE[auto.confidence].tone}
                      role="status"
                    >
                      {autoSrc.own
                        ? "Your picture has see-through parts, so they mark the edge."
                        : CONFIDENCE[auto.confidence].text}
                    </Note>
                  ) : null}
                  {!autoSrc.own ? (
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <Label htmlFor={fid("tol")}>Background tolerance</Label>
                        <span className="text-xs text-muted-foreground tabular-nums">{tol}</span>
                      </div>
                      <Slider
                        id={fid("tol")}
                        value={[tol]}
                        min={TOL_MIN}
                        max={TOL_MAX}
                        step={1}
                        onValueChange={([v]) => setTol(v)}
                        aria-label="Background tolerance"
                        className="mt-1 h-11"
                      />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Higher removes more of the background (shadows, uneven light) but can eat
                        into the art. Lower keeps more.
                      </p>
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Fix by tapping the preview</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Segmented
                        label="What a tap on the preview does"
                        value={tapMode}
                        onChange={setTapMode}
                        options={[
                          { value: "off", label: "Off" },
                          { value: "bg", label: "Tap the background" },
                          { value: "keep", label: "Tap to keep" },
                        ]}
                      />
                      {taps.length ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11"
                            onClick={() => setTaps((t) => t.slice(0, -1))}
                          >
                            <Undo2 aria-hidden />
                            Undo tap
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11"
                            onClick={() => setTaps([])}
                          >
                            Clear taps
                          </Button>
                        </>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {tapMode === "bg"
                        ? "Tap a leftover patch of background in the preview: that colour patch is removed."
                        : tapMode === "keep"
                          ? "Tap a part of the art that went missing: that colour patch comes back."
                          : "Leftover background, or a missing part of the art? Pick a tap tool, then tap the preview."}
                    </p>
                  </div>
                </div>
              )
            ) : null}

            {source === "upload" ? (
              <div className="space-y-3">
                <FilePick
                  label="Choose the cut-out PNG"
                  accept="image/png,image/webp"
                  fileName={overlay?.file.name ?? null}
                  onPick={(f) => {
                    setOverlayErr(null);
                    void loadImage(f)
                      .then((img) => setOverlay({ file: f, img, noAlpha: !hasTransparency(img) }))
                      .catch((e: unknown) =>
                        setOverlayErr(e instanceof Error ? e.message : String(e)),
                      );
                  }}
                  hint="Export it from the same file and at the same size as the front picture, so it lines up. A picture on plain white also works: white counts as not paintable."
                />
                {overlayErr ? (
                  <Note tone="error" role="alert">
                    {overlayErr}
                  </Note>
                ) : null}
                {shapeWarning ? (
                  <Note tone="warn" role="status">
                    {shapeWarning}
                  </Note>
                ) : null}
              </div>
            ) : null}

            {source === "saved" ? (
              <p className="text-sm text-white/75">
                The yellow area in the preview is what fans can paint now.
                {front
                  ? " You changed the front picture: check it still lines up."
                  : " Fix it by hand without uploading anything."}
              </p>
            ) : null}

            {finalAlpha || (source === "saved" && stored?.mask) ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setBrushOpen(true)}
                  disabled={!finalAlpha}
                >
                  <Paintbrush aria-hidden />
                  Fix by hand
                </Button>
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {handFixed
                    ? "Your brush fixes are on. They stay when you change the settings above."
                    : "Paint in or erase any part with a brush."}
                </span>
                {handFixed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={() => {
                      edits.clear();
                      setEditsVer((v) => v + 1);
                    }}
                  >
                    <RotateCcw aria-hidden />
                    Remove brush fixes
                  </Button>
                ) : null}
              </div>
            ) : null}

            {built.error && finalAlpha ? (
              <Note tone="error" role="alert">
                {built.error}
              </Note>
            ) : null}

            <fieldset className="min-w-0">
              <legend className="text-sm font-medium">Lines drawn over the paint</legend>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Like a colouring book: the lines stay on top, so the artwork still reads after
                painting.
              </p>
              <RadioGroup
                value={linesMode}
                onValueChange={(v) => setLinesMode(v as LinesChoice)}
                className="mt-2.5 gap-2"
                aria-label="Lines drawn over the paint"
              >
                {linesOptions.map(([v, t, s]) => (
                  <ChoiceRow
                    key={v}
                    id={fid(`lines-${v}`)}
                    selected={linesMode === v}
                    control={<RadioGroupItem id={fid(`lines-${v}`)} value={v} />}
                    title={t}
                    sub={s}
                  />
                ))}
              </RadioGroup>
              {linesMode === "keep" && handFixed ? (
                <p className="mt-2 text-xs leading-relaxed text-amber-200">
                  You changed the shape, so the current lines may not follow the new edge. Pick
                  Art&apos;s own dark lines or Edge only to redraw them.
                </p>
              ) : null}
              {linesMode === "upload" ? (
                <div className="mt-3">
                  <FilePick
                    label="Choose the lines PNG"
                    accept="image/png"
                    fileName={linesPick?.file.name}
                    onPick={(f) => void pick(f, setLinesPick, setOverlayErr)}
                  />
                </div>
              ) : null}
            </fieldset>
          </div>

          {/* on a phone the preview comes first, next to the controls that change it */}
          <div className="order-first min-w-0 lg:order-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Does it line up?</div>
              <Segmented
                label="Preview"
                value={view}
                onChange={setView}
                options={[
                  { value: "fill", label: "Fill" },
                  { value: "edge", label: "Outline only" },
                ]}
              />
            </div>
            <div className="mt-2">
              {basePic && (maskSrc || linesSrc) ? (
                <TouchPreview
                  label={
                    view === "edge"
                      ? "The front picture with the edge of the part fans can paint in pink"
                      : "The front picture with the paintable area in yellow, the lines on top and the cut line in pink"
                  }
                  deps={[basePic, maskSrc, linesSrc, outline, view, taps]}
                  draw={(g, w, h) =>
                    drawAlignment(g, w, h, basePic, maskSrc, linesSrc, outline, view, taps)
                  }
                  interactive={previewMode}
                  onTap={(u, v) =>
                    tapMode !== "off" && setTaps((t) => [...t, { u, v, keep: tapMode === "keep" }])
                  }
                  onDrag={(du, dv) => setPlace((p) => ({ ...p, x: p.x + du, y: p.y + dv }))}
                  caption={
                    view === "edge" ? (
                      <span className="flex flex-wrap gap-x-4 gap-y-1">
                        <Key colour={CUT_LINE} text="Edge of the part fans can paint" />
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-x-4 gap-y-1">
                        <Key colour={EVADE_YELLOW} text="Paint shows here" />
                        <Key colour="#15131a" text="Lines" border />
                        <Key colour={CUT_LINE} text="Sticker cut line" />
                      </span>
                    )
                  }
                />
              ) : (
                <PreviewSlot>
                  {!basePic && !(source === "upload" && overlay)
                    ? "Add the front picture to see what fans can paint."
                    : source === "upload"
                      ? "Add the cut-out PNG to check it lines up with the front picture."
                      : "Working out the part fans can paint…"}
                </PreviewSlot>
              )}
            </div>
            <p className="mt-2 min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {building && finalAlpha
                ? "Updating the lines and cut line…"
                : built.build
                  ? `Paintable: ${Math.round(built.build.coverage * 100)}% of the picture.`
                  : null}
            </p>
            {canFit ? (
              <FitControls
                open={fitOpen}
                onOpen={setFitOpen}
                place={place}
                setPlace={setPlace}
                nudge={nudge}
              />
            ) : null}
          </div>
        </div>
        <MaskBrush
          open={brushOpen}
          onOpenChange={setBrushOpen}
          picture={basePic ?? finalCanvas}
          base={baseAlpha}
          edits={edits}
          onChange={() => setEditsVer((v) => v + 1)}
        />
      </Step>

      {/* 5 */}
      <Step
        n={5}
        title="Save"
        sub={
          live
            ? "It's live now. Saving keeps it live; or take it offline as a draft."
            : "Save a draft to test it in the Studio first, or publish so fans can paint it."
        }
      >
        <ul className="mb-4 grid gap-1.5 text-sm sm:grid-cols-2">
          <Check1 ok={!!name.trim()} text="Name" />
          <Check1 ok={Number(height) >= 10} text="Print height" />
          <Check1 ok={!!front || editing} text="Front tracking picture" />
          <Check1 ok={hasShape && !built.error} text="Part fans can paint" />
        </ul>
        {error ? (
          <div className="mb-4">
            <Note tone="error" role="alert">
              {error}
            </Note>
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="ghost" className="h-11" onClick={cancel} disabled={!!busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void save(false)}
            disabled={!!busy}
          >
            {busy === "draft" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            {live ? "Save and unpublish" : "Save as draft"}
          </Button>
          <Button type="button" className="h-11" onClick={() => void save(true)} disabled={!!busy}>
            {busy === "live" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Rocket aria-hidden />
            )}
            {live ? "Save (stays live)" : "Save and publish"}
          </Button>
        </div>
      </Step>
    </div>
  );
}

/** Move, size and turn an uploaded cut-out against the front picture ("Canvas fit"). */
function FitControls({
  open,
  onOpen,
  place,
  setPlace,
  nudge,
}: {
  open: boolean;
  onOpen: (o: boolean) => void;
  place: Place;
  setPlace: (f: (p: Place) => Place) => void;
  nudge: (dx: number, dy: number) => void;
}) {
  const id = useId();
  const px = (v: number, n: number) => {
    const r = Math.round(v * n);
    return `${r > 0 ? "+" : ""}${r} px`;
  };
  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/20">
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
        aria-expanded={open}
        aria-controls={`${id}-fit`}
        onClick={() => onOpen(!open)}
      >
        <span>
          Line it up by hand
          {isPlaced(place) ? (
            <span className="ml-2 text-xs font-normal text-[var(--partner)]">adjusted</span>
          ) : null}
        </span>
        <span aria-hidden className="text-muted-foreground">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div id={`${id}-fit`} className="space-y-4 px-3.5 pb-3.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            For a cut-out that doesn&apos;t sit exactly on the print. Tip: switch the preview to
            Outline only. Saving bakes this in.
          </p>
          <div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">Move</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {px(place.x, PAINT_W)} across, {px(place.y, PAINT_H)} down
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Drag the preview, or nudge a pixel at a time.
            </p>
            <div className="mt-2 flex gap-1">
              {(
                [
                  [ArrowLeft, "Nudge left", -1, 0],
                  [ArrowUp, "Nudge up", 0, -1],
                  [ArrowDown, "Nudge down", 0, 1],
                  [ArrowRight, "Nudge right", 1, 0],
                ] as const
              ).map(([Icon, label, dx, dy]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label={label}
                  title={`${label} (Shift: 10 px)`}
                  onClick={(e) => nudge(dx * (e.shiftKey ? 10 : 1), dy * (e.shiftKey ? 10 : 1))}
                >
                  <Icon aria-hidden />
                </Button>
              ))}
            </div>
          </div>
          <FitSlider
            label="Size"
            unit="%"
            value={Math.round(place.s * 1000) / 10}
            min={50}
            max={200}
            step={0.5}
            onChange={(v) => setPlace((p) => ({ ...p, s: v / 100 }))}
          />
          <FitSlider
            label="Turn"
            unit="°"
            value={place.r}
            min={-45}
            max={45}
            step={0.5}
            onChange={(v) => setPlace((p) => ({ ...p, r: v }))}
          />
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => setPlace(() => PLACE0)}
            disabled={!isPlaced(place)}
          >
            <RotateCcw aria-hidden />
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FitSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [editingText, setEditingText] = useState(false);
  const shown = editingText ? text : String(value);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="flex items-center gap-1 text-sm">
          <Input
            id={id}
            inputMode="decimal"
            value={shown}
            onFocus={() => {
              setText(String(value));
              setEditingText(true);
            }}
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value.replace(",", "."));
              if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
            }}
            onBlur={() => setEditingText(false)}
            className="h-11 w-20 text-right tabular-nums"
          />
          <span className="w-4 text-muted-foreground">{unit}</span>
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
        className="h-11"
      />
    </div>
  );
}

function Key({ colour, text, border }: { colour: string; text: string; border?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn("size-3 rounded-sm", border && "ring-1 ring-white/40")}
        style={{ background: colour }}
      />
      {text}
    </span>
  );
}

function Check1({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-white/85" : "text-muted-foreground")}>
      <span
        aria-hidden
        className={cn(
          "grid size-5 place-items-center rounded-full",
          ok ? "bg-emerald-400 text-black" : "ring-1 ring-white/25",
        )}
      >
        {ok ? <Check className="size-3.5" /> : null}
      </span>
      {text}
      <span className="sr-only">{ok ? ": done" : ": not done yet"}</span>
    </li>
  );
}

/** Upload + fit + the three previews (framed picture, what the camera tracks, the score). */
function SideInput({
  idBase,
  side,
  error,
  onPick,
  onFit,
  storedColour,
  storedLum,
  storedScore,
  editing,
}: {
  idBase: string;
  side: NewSide | null;
  error: string | null;
  onPick: (f: File) => void;
  onFit: (f: Fit) => void;
  storedColour: HTMLImageElement | null;
  storedLum: HTMLImageElement | null;
  storedScore: number | null;
  editing: boolean;
}) {
  const colour = side?.build.colour ?? storedColour;
  const lum = side?.build.lum ?? storedLum;
  const small = side && Math.min(side.img.naturalWidth, side.img.naturalHeight) < 640;
  const fit = side?.fit ?? "pad";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <FilePick
          label="Choose a picture"
          accept={PICTURE_TYPES}
          fileName={side?.file.name ?? (editing ? "Using the saved picture" : null)}
          onPick={onPick}
          hint="At least 1000 px tall is best. Crop out the table or wall around the print if you can."
        />
        {error ? (
          <Note tone="error" role="alert">
            {error}
          </Note>
        ) : null}
        {small ? (
          <Note tone="warn" role="status">
            This picture is small ({size(side.img)}). A bigger one gives sharper tracking.
          </Note>
        ) : null}
        <fieldset disabled={!side} className="min-w-0 disabled:opacity-60">
          <legend className="text-sm font-medium">Fit into the 3:4 frame</legend>
          <RadioGroup
            value={fit}
            onValueChange={(v) => onFit(v as Fit)}
            className="mt-2 gap-2"
            aria-label="Fit into the 3:4 frame"
          >
            <ChoiceRow
              id={`${idBase}-pad`}
              selected={fit === "pad"}
              control={<RadioGroupItem id={`${idBase}-pad`} value="pad" />}
              title="Whole picture (pad)"
              sub="Keeps all of it and fills the sides with the background colour."
            />
            <ChoiceRow
              id={`${idBase}-crop`}
              selected={fit === "crop"}
              control={<RadioGroupItem id={`${idBase}-crop`} value="crop" />}
              title="Fill (crop)"
              sub="Fills the frame and trims the edges, keeping the middle."
            />
          </RadioGroup>
        </fieldset>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {colour ? (
          <Preview
            label="The picture framed 3:4"
            deps={[colour]}
            draw={(g, w, h) => g.drawImage(colour, 0, 0, w, h)}
            caption="Framed 3:4"
          />
        ) : (
          <PreviewSlot>The framed picture shows here.</PreviewSlot>
        )}
        {lum ? (
          <Preview
            label={`What the camera tracks${side ? `, with ${side.build.track.points.length} detail points marked` : ""}`}
            deps={[lum, side]}
            draw={(g, w, h) => drawTracked(g, w, h, lum, side?.build.track.points)}
            caption={
              side
                ? "What the camera tracks. Dots: details it can lock on to."
                : "What the camera tracks"
            }
          />
        ) : (
          <PreviewSlot>What the camera tracks shows here.</PreviewSlot>
        )}
        {side ? (
          <ScoreCard
            className="col-span-2 sm:col-span-1"
            score={side.build.track.score}
            advice={side.build.track.advice}
          />
        ) : editing ? (
          <ScoreCard className="col-span-2 sm:col-span-1" score={storedScore} />
        ) : (
          <div className="col-span-2 sm:col-span-1">
            <PreviewSlot>The tracking score shows here.</PreviewSlot>
          </div>
        )}
      </div>
    </div>
  );
}
