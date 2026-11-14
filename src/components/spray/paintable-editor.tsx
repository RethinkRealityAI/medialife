import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Rocket, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { savePaintable, sprayKeys, type AdminPaintable } from "./api";
import {
  buildCanvas,
  buildTarget,
  canvas,
  frameFor,
  loadImage,
  PAINT_H,
  PAINT_W,
  toBlob,
  type CanvasBuild,
  type Fit,
  type LinesMode,
  type TargetBuild,
} from "./convert";
import {
  ChoiceRow,
  CUT_LINE,
  EVADE_YELLOW,
  FilePick,
  Note,
  Preview,
  PreviewSlot,
  ScoreCard,
  Step,
} from "./parts";

// The paintable editor: a step-by-step form for a non-technical team. Everything is converted in the
// browser (convert.ts) and sent as the multipart form savePaintable() in src/lib/spray/server.ts reads.

const PICTURE_TYPES = "image/jpeg,image/png,image/webp";
const THUMB_W = 264;
const THUMB_H = 352;

type Picked = { file: File; img: HTMLImageElement };
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

/** The front picture with the paintable area tinted yellow, the lines on top and the cut line. */
function drawAlignment(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: CanvasImageSource | null,
  mask: CanvasImageSource | null,
  lines: CanvasImageSource | null,
  outline: [number, number][] | null,
) {
  if (base) g.drawImage(base, 0, 0, w, h);
  if (mask) {
    const t = canvas(w, h);
    const tg = t.getContext("2d")!;
    tg.drawImage(mask, 0, 0, w, h);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = EVADE_YELLOW;
    tg.fillRect(0, 0, w, h);
    g.globalAlpha = 0.5;
    g.drawImage(t, 0, 0);
    g.globalAlpha = 1;
  }
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

const ratio = (a: { naturalWidth: number; naturalHeight: number }) =>
  a.naturalWidth / a.naturalHeight;
const size = (a: { naturalWidth: number; naturalHeight: number }) =>
  `${a.naturalWidth} × ${a.naturalHeight}`;

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
  const [frontErr, setFrontErr] = useState<string | null>(null);
  const [backOn, setBackOn] = useState(oldBack >= 0);
  const [back, setBack] = useState<NewSide | null>(null);
  const [backErr, setBackErr] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(
    oldBack >= 0 ? paintable!.targets[oldBack].flip === -1 : true,
  );

  const [overlay, setOverlay] = useState<Picked | null>(null);
  const [overlayErr, setOverlayErr] = useState<string | null>(null);
  const [linesMode, setLinesMode] = useState<LinesChoice>(editing ? "keep" : "art");
  const [linesPick, setLinesPick] = useState<Picked | null>(null);

  const [busy, setBusy] = useState<null | "draft" | "live">(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !!front ||
    !!back ||
    !!overlay ||
    !!linesPick ||
    name !== (paintable?.name ?? "") ||
    client !== (paintable?.client ?? "EVADE") ||
    height !== (paintable ? String(paintable.heightMm) : "") ||
    backOn !== oldBack >= 0 ||
    (editing && linesMode !== "keep");

  async function pickSide(
    f: File,
    fit: Fit,
    set: (s: NewSide | null) => void,
    err: typeof setFrontErr,
  ) {
    err(null);
    try {
      const img = await loadImage(f);
      // let the "working" state paint before the (blocking) check
      await new Promise((r) => setTimeout(r, 0));
      set({ file: f, img, fit, build: buildTarget(img, fit) });
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
    }
  }
  const refit = (s: NewSide, fit: Fit) => ({ ...s, fit, build: buildTarget(s.img, fit) });

  async function pick(f: File, set: (p: Picked | null) => void, err?: typeof setFrontErr) {
    err?.(null);
    try {
      set({ file: f, img: await loadImage(f) });
    } catch (e) {
      err?.(e instanceof Error ? e.message : String(e));
    }
  }

  // the canvas overlay: rebuilt whenever its inputs change
  const built = useMemo((): { build: CanvasBuild | null; error: string | null } => {
    const mode: LinesMode = linesMode === "keep" ? "art" : linesMode;
    const linesImg = mode === "upload" ? (linesPick?.img ?? null) : null;
    try {
      if (overlay) {
        // framed exactly like the front upload; without a new front, like the saved 3:4 picture
        const frame = front
          ? front.build.frame
          : frameFor(overlay.img.naturalWidth, overlay.img.naturalHeight, "pad");
        return { build: buildCanvas(overlay.img, frame, mode, linesImg), error: null };
      }
      // a saved overlay with new lines: rebuild from the saved mask (already 768 x 1024, 3:4)
      if (stored?.mask && (linesMode === "edge" || (linesMode === "upload" && linesImg)))
        return {
          build: buildCanvas(stored.mask, frameFor(PAINT_W, PAINT_H, "pad"), mode, linesImg),
          error: null,
        };
      return { build: null, error: null };
    } catch (e) {
      return { build: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [overlay, front, linesMode, linesPick, stored]);

  // what the alignment preview shows
  const base = front?.build.colour ?? stored?.print ?? null;
  const maskSrc = built.build?.mask ?? (overlay ? null : (stored?.mask ?? null));
  const linesSrc =
    linesMode === "none"
      ? null
      : built.build
        ? built.build.lines
        : linesMode === "keep"
          ? (stored?.lines ?? null)
          : null;
  const outline = built.build?.outline ?? (overlay ? null : (stored?.outline ?? null));
  const hasOverlay = !!built.build || (editing && !overlay);

  const shapeWarning = useMemo(() => {
    if (!overlay) return null;
    if (front && Math.abs(ratio(overlay.img) - ratio(front.img)) > 0.01)
      return `The paintable-area picture is a different shape (${size(overlay.img)}) from the front picture (${size(front.img)}). Export both from the same file at the same size, or the paint won't line up with the print.`;
    if (!front && Math.abs(ratio(overlay.img) - 0.75) > 0.01)
      return `Without a new front picture, the paintable-area picture has to match the saved front picture, which is 3:4 (yours is ${size(overlay.img)}). Upload the front picture again too, or export the overlay at 3:4.`;
    return null;
  }, [overlay, front]);

  async function save(publish: boolean) {
    setError(null);
    const problems: string[] = [];
    const heightMm = Number(height.replace(",", "."));
    if (!name.trim()) problems.push("Give it a name (step 1).");
    if (!(heightMm >= 10 && heightMm <= 3000))
      problems.push("Enter the print height in millimetres, between 10 and 3000 (step 1).");
    if (!front && !editing) problems.push("Add the front tracking picture (step 2).");
    if (backOn && !back && oldBack < 0)
      problems.push("Add the back picture, or untick the back side (step 3).");
    if (!hasOverlay) problems.push("Add the paintable area picture (step 4).");
    if (built.error) problems.push(built.error);
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
      if (built.build) {
        fd.append("mask", await toBlob(built.build.mask, "image/png"), "mask.png");
        if (built.build.lines)
          fd.append("lines", await toBlob(built.build.lines, "image/png"), "lines.png");
        fd.append("outline", JSON.stringify({ points: built.build.outline }));
      }
      if (editing && (linesMode === "none" || (built.build && !built.build.lines)))
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
          onPick={(f) => pickSide(f, front?.fit ?? "pad", setFront, setFrontErr)}
          onFit={(fit) => front && setFront(refit(front, fit))}
          storedColour={stored?.print ?? null}
          storedLum={stored?.frontLum ?? null}
          storedScore={editing ? (paintable.targets[0]?.score ?? null) : null}
          editing={editing}
        />
        {front && editing && !overlay && linesMode === "keep" ? (
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
                onPick={(f) => pickSide(f, back?.fit ?? "pad", setBack, setBackErr)}
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
        sub={
          <>
            Upload a PNG where only the paintable part is visible and everything else is
            see-through, for example the character cut out of the shirt art. Export it from the same
            file and at the same size as the front picture, so it lines up.
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-5">
            <FilePick
              label="Choose the paintable-area PNG"
              accept="image/png,image/webp"
              fileName={overlay?.file.name ?? (editing ? "Using the saved paintable area" : null)}
              onPick={(f) => {
                if (linesMode === "keep") setLinesMode("art");
                void pick(f, setOverlay, setOverlayErr);
              }}
              hint="PNG with a transparent background. A picture on plain white also works: white counts as not paintable."
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
            {built.error ? (
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
                {(
                  [
                    ...(editing && !overlay
                      ? [["keep", "Keep the current lines", "Leave the lines as they are now."]]
                      : []),
                    ...(!editing || overlay
                      ? [
                          [
                            "art",
                            "Art's own dark lines",
                            "The dark outlines, faces and lettering from your picture, plus the edge.",
                          ],
                        ]
                      : []),
                    ["edge", "Edge only", "Just a line around the paintable area."],
                    ["none", "None", "No lines: paint only."],
                    [
                      "upload",
                      "Upload lines PNG",
                      "Your own lines: dark lines on transparent, framed like the front picture.",
                    ],
                  ] as [LinesChoice, string, string][]
                ).map(([v, t, s]) => (
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

          <div className="min-w-0">
            <div className="text-sm font-medium">Does it line up?</div>
            <div className="mt-2">
              {base && (maskSrc || linesSrc) ? (
                <Preview
                  label="The front picture with the paintable area in yellow, the lines on top and the cut line in pink"
                  deps={[base, maskSrc, linesSrc, outline]}
                  draw={(g, w, h) => drawAlignment(g, w, h, base, maskSrc, linesSrc, outline)}
                  caption={
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <Key colour={EVADE_YELLOW} text="Paint shows here" />
                      <Key colour="#15131a" text="Lines" border />
                      <Key colour={CUT_LINE} text="Sticker cut line" />
                    </span>
                  }
                />
              ) : (
                <PreviewSlot>
                  {base
                    ? "Add the paintable-area PNG to check it lines up with the front picture."
                    : "Add the front picture and the paintable-area PNG to check they line up."}
                </PreviewSlot>
              )}
            </div>
            {built.build ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Paintable: {Math.round(built.build.coverage * 100)}% of the picture.
              </p>
            ) : null}
          </div>
        </div>
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
          <Check1 ok={hasOverlay && !built.error} text="Paintable area" />
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
