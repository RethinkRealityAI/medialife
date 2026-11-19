import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import {
  Eraser,
  Hand,
  Maximize,
  Minus,
  Paintbrush,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

import { canvas, PAINT_H, PAINT_W } from "./convert";
import { EVADE_YELLOW, Segmented } from "./parts";

// The brush: add or erase the part fans can paint by hand, on top of whatever made it (an uploaded
// cut-out, the target picture, or the saved shape). Works on the 768x1024 paint grid whatever the
// screen size; mouse, touch and pen through Pointer Events.

const N = PAINT_W * PAINT_H;
const MAX_UNDO = 40;

/** One stroke (or "Start again"): which pixels changed, what they were, what they became. */
type Diff = { idx: Uint32Array; before: Uint8Array; after: Uint8Array };

/**
 * Hand fixes on top of a shape: 0 = leave it, 1 = paintable, 2 = not paintable. Kept apart from the
 * shape they fix, so changing the background tolerance or the canvas fit keeps them.
 */
export class MaskEdits {
  data = new Uint8Array(N);
  undo: Diff[] = [];
  redo: Diff[] = [];
  /** Pixels with a hand fix. */
  count = 0;

  private recount() {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.data[i]) n++;
    this.count = n;
  }
  push(d: Diff) {
    if (!d.idx.length) return;
    this.undo.push(d);
    if (this.undo.length > MAX_UNDO) this.undo.shift();
    this.redo = [];
    this.recount();
  }
  stepBack(): boolean {
    const d = this.undo.pop();
    if (!d) return false;
    for (let k = 0; k < d.idx.length; k++) this.data[d.idx[k]] = d.before[k];
    this.redo.push(d);
    this.recount();
    return true;
  }
  stepForward(): boolean {
    const d = this.redo.pop();
    if (!d) return false;
    for (let k = 0; k < d.idx.length; k++) this.data[d.idx[k]] = d.after[k];
    this.undo.push(d);
    this.recount();
    return true;
  }
  /** Remove every hand fix (can be undone). */
  clear() {
    const idx: number[] = [];
    for (let i = 0; i < N; i++) if (this.data[i]) idx.push(i);
    if (!idx.length) return;
    const ix = Uint32Array.from(idx);
    const before = new Uint8Array(ix.length);
    ix.forEach((i, k) => (before[k] = this.data[i]));
    for (const i of ix) this.data[i] = 0;
    this.undo.push({ idx: ix, before, after: new Uint8Array(ix.length) });
    this.redo = [];
    this.count = 0;
  }
  /** The shape (0..255 per pixel) with the hand fixes on top. */
  apply(base: Uint8Array): Uint8Array {
    if (!this.count) return base;
    const o = new Uint8Array(N);
    for (let i = 0; i < N; i++) o[i] = this.data[i] === 1 ? 255 : this.data[i] === 2 ? 0 : base[i];
    return o;
  }
}

type Tool = "add" | "erase" | "move";
type View = { z: number; px: number; py: number };

export function MaskBrush({
  open,
  onOpenChange,
  picture,
  base,
  edits,
  onChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The framed 3:4 front picture, drawn under the paint area. */
  picture: CanvasImageSource | null;
  /** The shape before hand fixes, 0..255 per pixel. */
  base: Uint8Array | null;
  edits: MaskEdits;
  /** After every stroke, undo, redo or "Start again". */
  onChange: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-3 rounded-2xl border-white/[0.1] bg-card p-3 sm:h-[calc(100dvh-3rem)] sm:p-5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="pr-10">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Fix the paintable part by hand
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
            Yellow is the part fans can paint. Add paints more of it, Erase takes it away.
          </DialogDescription>
        </div>
        {open ? (
          <BrushBody
            picture={picture}
            base={base}
            edits={edits}
            onChange={onChange}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BrushBody({
  picture,
  base,
  edits,
  onChange,
  onDone,
}: {
  picture: CanvasImageSource | null;
  base: Uint8Array | null;
  edits: MaskEdits;
  onChange: () => void;
  onDone: () => void;
}) {
  const [tool, setTool] = useState<Tool>("add");
  const [size, setSize] = useState(24); // brush radius in paint pixels
  const [, setTick] = useState(0); // re-render for the undo / redo buttons
  const [zoomLabel, setZoomLabel] = useState(100);

  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tint = useRef<HTMLCanvasElement | null>(null);
  const tintData = useRef<ImageData | null>(null);
  const view = useRef<View>({ z: 1, px: 0, py: 0 });
  const box = useRef({ w: 0, h: 0, dpr: 1 });
  const hover = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const space = useRef(false);
  const toolRef = useRef(tool);
  const sizeRef = useRef(size);
  toolRef.current = tool;
  sizeRef.current = size;

  /** Paint-grid pixel is paintable now. */
  const isOn = useCallback(
    (i: number) => {
      const e = edits.data[i];
      return e === 1 ? true : e === 2 ? false : base ? base[i] > 127 : false;
    },
    [base, edits],
  );

  // ------------------------------------------------------------ drawing
  const layout = () => {
    const { w, h } = box.current;
    const k = Math.min(w / PAINT_W, h / PAINT_H) * view.current.z;
    const ox = (w - PAINT_W * k) / 2 + view.current.px;
    const oy = (h - PAINT_H * k) / 2 + view.current.py;
    return { k, ox, oy };
  };
  const render = useCallback(() => {
    raf.current = 0;
    const c = cv.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const { dpr } = box.current;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#1b1c21";
    g.fillRect(0, 0, c.width, c.height);
    const { k, ox, oy } = layout();
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    g.imageSmoothingEnabled = view.current.z < 3;
    g.fillStyle = "#2a2b31";
    g.fillRect(0, 0, PAINT_W, PAINT_H);
    if (picture) g.drawImage(picture, 0, 0, PAINT_W, PAINT_H);
    if (tint.current) g.drawImage(tint.current, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the brush circle
    const hv = hover.current;
    if (hv && toolRef.current !== "move" && !space.current) {
      g.beginPath();
      g.arc(hv.x, hv.y, Math.max(2, sizeRef.current * k), 0, Math.PI * 2);
      g.lineWidth = 2.5;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.stroke();
      g.lineWidth = 1.25;
      g.strokeStyle = toolRef.current === "erase" ? "#ff4fa3" : "#ffffff";
      g.stroke();
    }
  }, [picture]);
  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(render);
  }, [render]);

  /** Repaint the yellow tint for a rectangle of the paint grid (all of it by default). */
  const paintTint = useCallback(
    (x0 = 0, y0 = 0, x1 = PAINT_W, y1 = PAINT_H) => {
      if (!tint.current) {
        tint.current = canvas(PAINT_W, PAINT_H);
        tintData.current = tint.current.getContext("2d")!.createImageData(PAINT_W, PAINT_H);
      }
      const d = tintData.current!.data;
      x0 = Math.max(0, x0 | 0);
      y0 = Math.max(0, y0 | 0);
      x1 = Math.min(PAINT_W, Math.ceil(x1));
      y1 = Math.min(PAINT_H, Math.ceil(y1));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = y * PAINT_W + x;
          const on = isOn(i);
          // paintable: yellow; hand-erased: a faint pink so erased spots are easy to find
          const e = edits.data[i];
          d[i * 4] = on ? 246 : 255;
          d[i * 4 + 1] = on ? 195 : 79;
          d[i * 4 + 2] = on ? 68 : 163;
          d[i * 4 + 3] = on ? 128 : e === 2 ? 40 : 0;
        }
      if (x1 > x0 && y1 > y0)
        tint.current
          .getContext("2d")!
          .putImageData(tintData.current!, 0, 0, x0, y0, x1 - x0, y1 - y0);
    },
    [edits, isOn],
  );

  useEffect(() => {
    paintTint();
    schedule();
  }, [paintTint, schedule]);

  // size the canvas to its box (sharp on high-density screens)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // layout size, not getBoundingClientRect: the dialog opens with a zoom, which a transform does
      // and a resize observer never hears about
      const w = el.clientWidth,
        h = el.clientHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      box.current = { w, h, dpr };
      if (cv.current) {
        cv.current.width = Math.round(w * dpr);
        cv.current.height = Math.round(h * dpr);
      }
      schedule();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [schedule]);

  // ------------------------------------------------------------ strokes
  const stroke = useRef<{
    id: number;
    mode: 1 | 2;
    last: [number, number];
    idx: number[];
    before: number[];
    seen: Uint8Array;
  } | null>(null);
  const seenBuf = useRef<Uint8Array | null>(null);

  const toPaint = (cx: number, cy: number): [number, number] => {
    const r = cv.current!.getBoundingClientRect();
    const { k, ox, oy } = layout();
    return [(cx - r.left - ox) / k, (cy - r.top - oy) / k];
  };

  const stamp = (x: number, y: number) => {
    const s = stroke.current!;
    const R = sizeRef.current;
    const R2 = R * R;
    const x0 = Math.max(0, Math.floor(x - R)),
      x1 = Math.min(PAINT_W - 1, Math.ceil(x + R)),
      y0 = Math.max(0, Math.floor(y - R)),
      y1 = Math.min(PAINT_H - 1, Math.ceil(y + R));
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx + 0.5 - x,
          dy = yy + 0.5 - y;
        if (dx * dx + dy * dy > R2) continue;
        const i = yy * PAINT_W + xx;
        if (s.seen[i]) continue;
        s.seen[i] = 1;
        if (edits.data[i] === s.mode) continue;
        s.idx.push(i);
        s.before.push(edits.data[i]);
        edits.data[i] = s.mode;
      }
    return [x0, y0, x1 + 1, y1 + 1] as const;
  };

  /** Stamp along the segment, close enough together that a fast stroke stays a line. */
  const strokeTo = (x: number, y: number) => {
    const s = stroke.current!;
    const [lx, ly] = s.last;
    const d = Math.hypot(x - lx, y - ly);
    const step = Math.max(1, sizeRef.current * 0.3);
    const n = Math.max(1, Math.ceil(d / step));
    let bx0 = Infinity,
      by0 = Infinity,
      bx1 = -Infinity,
      by1 = -Infinity;
    for (let k = 1; k <= n; k++) {
      const [a, b, c, e] = stamp(lx + ((x - lx) * k) / n, ly + ((y - ly) * k) / n);
      bx0 = Math.min(bx0, a);
      by0 = Math.min(by0, b);
      bx1 = Math.max(bx1, c);
      by1 = Math.max(by1, e);
    }
    s.last = [x, y];
    paintTint(bx0, by0, bx1, by1);
  };

  const endStroke = (keep: boolean) => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    // `seen` also marks pixels that didn't change: clear the whole buffer
    s.seen.fill(0);
    if (!keep) {
      for (let k = 0; k < s.idx.length; k++) edits.data[s.idx[k]] = s.before[k];
      paintTint();
      schedule();
      return;
    }
    if (s.idx.length) {
      edits.push({
        idx: Uint32Array.from(s.idx),
        before: Uint8Array.from(s.before),
        after: new Uint8Array(s.idx.length).fill(s.mode),
      });
      setTick((t) => t + 1);
      onChange();
    }
  };

  // ------------------------------------------------------------ pointers: paint, pan, pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "pan"; x: number; y: number }
    | { kind: "pinch"; d: number; mx: number; my: number; z: number; px: number; py: number }
    | null
  >(null);

  const zoomAt = (cx: number, cy: number, z: number) => {
    const r = cv.current!.getBoundingClientRect();
    const v = view.current;
    const nz = Math.max(1, Math.min(16, z));
    const { k, ox, oy } = layout();
    // keep the paint point under (cx, cy) where it is
    const ux = (cx - r.left - ox) / k,
      uy = (cy - r.top - oy) / k;
    v.z = nz;
    const l2 = layout();
    v.px += cx - r.left - (l2.ox + ux * l2.k);
    v.py += cy - r.top - (l2.oy + uy * l2.k);
    if (nz === 1) {
      v.px = 0;
      v.py = 0;
    }
    setZoomLabel(Math.round(nz * 100));
    schedule();
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const v = view.current;
    gesture.current = {
      kind: "pinch",
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      z: v.z,
      px: v.px,
      py: v.py,
    };
  };

  const onDown = (e: RPE<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // a second finger: this is a pinch or a two-finger move, not paint
      endStroke(false);
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    if (toolRef.current === "move" || space.current || e.button === 1) {
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY };
      return;
    }
    if (!seenBuf.current) seenBuf.current = new Uint8Array(N);
    const p = toPaint(e.clientX, e.clientY);
    stroke.current = {
      id: e.pointerId,
      mode: toolRef.current === "erase" ? 2 : 1,
      last: p,
      idx: [],
      before: [],
      seen: seenBuf.current,
    };
    const [a, b, c, d] = stamp(p[0], p[1]);
    paintTint(a, b, c, d);
    schedule();
  };

  const onMove = (e: RPE<HTMLCanvasElement>) => {
    const r = cv.current!.getBoundingClientRect();
    hover.current =
      e.pointerType === "touch" ? null : { x: e.clientX - r.left, y: e.clientY - r.top };
    const pt = pointers.current.get(e.pointerId);
    if (pt) {
      pt.x = e.clientX;
      pt.y = e.clientY;
    }
    const gst = gesture.current;
    if (gst?.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const v = view.current;
      v.z = gst.z;
      v.px = gst.px;
      v.py = gst.py;
      zoomAt(gst.mx, gst.my, (gst.z * d) / gst.d);
      v.px += mx - gst.mx;
      v.py += my - gst.my;
    } else if (gst?.kind === "pan" && pt) {
      view.current.px += e.clientX - gst.x;
      view.current.py += e.clientY - gst.y;
      gst.x = e.clientX;
      gst.y = e.clientY;
    } else if (stroke.current && stroke.current.id === e.pointerId) {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ce of evs.length ? evs : [e.nativeEvent]) {
        const [x, y] = toPaint(ce.clientX, ce.clientY);
        strokeTo(x, y);
      }
    }
    schedule();
  };

  const onUp = (e: RPE<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (stroke.current?.id === e.pointerId) endStroke(e.type !== "pointercancel");
    if (gesture.current?.kind === "pinch" && pointers.current.size < 2) gesture.current = null;
    if (gesture.current?.kind === "pan" && pointers.current.size === 0) gesture.current = null;
    schedule();
  };

  // wheel zoom (not passive, so the page doesn't scroll)
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, view.current.z * Math.exp(-e.deltaY * 0.0015));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = useCallback(() => {
    if (edits.stepBack()) {
      paintTint();
      schedule();
      setTick((t) => t + 1);
      onChange();
    }
  }, [edits, onChange, paintTint, schedule]);
  const redo = useCallback(() => {
    if (edits.stepForward()) {
      paintTint();
      schedule();
      setTick((t) => t + 1);
      onChange();
    }
  }, [edits, onChange, paintTint, schedule]);
  const startAgain = () => {
    edits.clear();
    paintTint();
    schedule();
    setTick((t) => t + 1);
    onChange();
  };

  // keys: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, space to move, [ and ] for the brush size
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === " " && !(t && t.tagName === "BUTTON")) {
        e.preventDefault();
        if (!space.current) {
          space.current = true;
          if (cv.current) cv.current.style.cursor = "grab";
          schedule();
        }
      } else if (e.key === "[") setSize((s) => Math.max(2, Math.round(s / 1.25)));
      else if (e.key === "]") setSize((s) => Math.min(160, Math.round(s * 1.25)));
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") {
        space.current = false;
        if (cv.current) cv.current.style.cursor = "";
        schedule();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [undo, redo, schedule]);

  useEffect(() => schedule(), [tool, size, schedule]);

  const zoomBy = (f: number) => {
    const r = cv.current!.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.current.z * f);
  };
  const fit = () => {
    view.current = { z: 1, px: 0, py: 0 };
    setZoomLabel(100);
    schedule();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Brush"
          value={tool}
          onChange={setTool}
          options={[
            {
              value: "add",
              label: (
                <>
                  <Paintbrush className="size-4" aria-hidden />
                  Add
                </>
              ),
            },
            {
              value: "erase",
              label: (
                <>
                  <Eraser className="size-4" aria-hidden />
                  Erase
                </>
              ),
            },
            {
              value: "move",
              title: "Move around the picture (or hold space, or use two fingers)",
              label: (
                <>
                  <Hand className="size-4" aria-hidden />
                  Move
                </>
              ),
            },
          ]}
        />
        <label className="flex min-h-11 min-w-0 flex-1 basis-40 items-center gap-3 rounded-xl border border-white/[0.12] bg-black/25 px-3 sm:max-w-64">
          <span className="text-sm whitespace-nowrap text-white/80">Size</span>
          <Slider
            value={[size]}
            min={2}
            max={160}
            step={1}
            onValueChange={([v]) => setSize(v)}
            aria-label="Brush size"
            className="h-11 min-w-20 flex-1"
          />
          <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
            {size * 2}
          </span>
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={undo}
            disabled={!edits.undo.length}
            aria-label="Undo (Ctrl+Z)"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={redo}
            disabled={!edits.redo.length}
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => zoomBy(1 / 1.5)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-16 px-2 tabular-nums"
            onClick={fit}
            aria-label={`Zoom ${zoomLabel}%. Show the whole picture`}
            title="Show the whole picture"
          >
            {zoomLabel === 100 ? <Maximize aria-hidden /> : `${zoomLabel}%`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => zoomBy(1.5)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-white/80"
          onClick={startAgain}
          disabled={!edits.count}
        >
          <RotateCcw aria-hidden />
          Start again
        </Button>
      </div>
      <div
        ref={wrap}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1c21]"
      >
        <canvas
          ref={cv}
          role="img"
          aria-label="The front picture with the part fans can paint in yellow. Draw on it to add or erase."
          data-testid="mask-brush-canvas"
          className="absolute inset-0 block h-full w-full"
          style={{
            touchAction: "none",
            cursor: tool === "move" ? "grab" : "none",
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => {
            hover.current = null;
            schedule();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          <span
            aria-hidden
            className="mr-1.5 inline-block size-2.5 rounded-sm align-middle"
            style={{ background: EVADE_YELLOW }}
          />
          Paint shows here. Zoom with the wheel or a pinch; move with two fingers, the Move tool or
          by holding space.
        </p>
        <Button type="button" className="h-11 w-full sm:w-auto" onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}
