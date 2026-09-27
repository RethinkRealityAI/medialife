import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/ar/assets";
import { VIEWS, type Project, type ViewId } from "@/lib/ar/project";
import { assetIdFromRef } from "@/lib/ar/projects";

import { assetsQueryKey } from "../api";
import { useAssets } from "../assets-query";
import { useEditor } from "../editor-context";
import { Group, SelectField, SwitchField, TextField } from "../fields";
import { buildAndUploadAR } from "../ar-files";
import { Note } from "./basics";

// Tour (the guided walkthrough) and AR (Scene Viewer / Quick Look files).

const VIEW_OPTIONS = (Object.keys(VIEWS) as ViewId[]).map((v) => ({ value: v, label: VIEWS[v] }));

export function TourSection() {
  const { draft, update, engine, showPreview } = useEditor();
  const steps = draft.tour;
  const themeOptions = draft.themes.map((t) => ({ value: t.id, label: t.name || t.id }));

  const add = () =>
    update((d) => {
      d.tour.push({ title: "New step", body: "", view: "aisle" });
    });
  const move = (i: number, to: number) =>
    update((d) => {
      const [s] = d.tour.splice(i, 1);
      d.tour.splice(to, 0, s);
    });

  return (
    <>
      <Group
        title="Guided tour"
        description="Plays when the endcap opens. Visitors can skip it. Up to 10 steps."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 pointer-coarse:h-11"
              onClick={() => {
                engine.tour(true);
                showPreview();
              }}
              disabled={!steps.length}
            >
              <Play aria-hidden /> Play
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 pointer-coarse:size-11"
              onClick={() => engine.tour(false)}
              aria-label="Stop the tour"
            >
              <Square aria-hidden />
            </Button>
          </>
        }
      >
        {!steps.length ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm">No tour</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Visitors start exploring straight away.
            </p>
            <Button size="sm" className="mt-4" onClick={add}>
              <Plus aria-hidden /> Add a step
            </Button>
          </div>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/40">
                <div className="flex items-center gap-1 border-b border-border py-1.5 pr-1.5 pl-3">
                  <span className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Step {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate pl-2 text-xs text-foreground/80">
                    {s.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 pointer-coarse:size-11"
                    aria-label={`Show step ${i + 1} in the preview`}
                    onClick={() => {
                      engine.goto({ view: s.view, ...(s.theme ? { theme: s.theme } : {}) });
                      showPreview();
                    }}
                  >
                    <Eye aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 pointer-coarse:size-11"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 pointer-coarse:size-11"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive pointer-coarse:size-11"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() =>
                      update((d) => {
                        d.tour.splice(i, 1);
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="space-y-3 p-3">
                  <TextField path={["tour", i, "title"]} label="Title" maxLength={80} />
                  <TextField
                    path={["tour", i, "body"]}
                    label="Text"
                    multiline
                    rows={3}
                    maxLength={500}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField path={["tour", i, "view"]} label="Camera" options={VIEW_OPTIONS} />
                    <SelectField
                      path={["tour", i, "theme"]}
                      label="Theme"
                      options={themeOptions}
                      emptyValue={{ label: "Keep current" }}
                    />
                  </div>
                  <SwitchField path={["tour", i, "dashboard"]} label="Open the dashboard panel" />
                </div>
              </li>
            ))}
          </ol>
        )}
        {steps.length ? (
          <Button
            variant="outline"
            size="sm"
            onClick={add}
            disabled={steps.length >= 10}
            className="w-full"
          >
            <Plus aria-hidden /> {steps.length >= 10 ? "10 steps is the limit" : "Add a step"}
          </Button>
        ) : null}
      </Group>
    </>
  );
}

function ArFiles({ ar, label }: { ar: Project["ar"] | undefined; label: string }) {
  const assets = useAssets();
  if (!ar?.glb && !ar?.usdz) return null;
  const size = (ref?: string) => {
    const a = (assets.data ?? []).find((x) => x.id === assetIdFromRef(ref));
    return a ? formatBytes(a.size) : "…";
  };
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium">{label}</p>
        {ar.generatedAt ? (
          <p className="text-[11px] text-muted-foreground">
            made {formatDistanceToNow(ar.generatedAt, { addSuffix: true })}
          </p>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1.5">
        {[
          { ref: ar.glb, name: "Android (.glb)" },
          { ref: ar.usdz, name: "iPhone and iPad (.usdz)" },
        ].map((f) =>
          f.ref ? (
            <li key={f.name} className="flex items-center justify-between gap-2 text-xs">
              <span>{f.name}</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[11px] text-muted-foreground tabular-nums">
                  {size(f.ref)}
                </span>
                <a
                  href={f.ref}
                  download
                  className="grid size-7 place-items-center rounded text-muted-foreground pointer-coarse:size-11 hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Download ${f.name}`}
                >
                  <Download className="size-3.5" aria-hidden />
                </a>
              </span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

export function ArSection({ published }: { published: Project | null }) {
  const { draft, update, engine } = useEditor();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const ready = engine.status === "ready" || engine.status === "loaded";
  const sameAsLive = published?.ar?.glb && published.ar.glb === draft.ar?.glb;

  async function regenerate() {
    setBusy("Starting");
    try {
      const ar = await buildAndUploadAR(engine, draft, (label, f) =>
        setBusy(f === undefined ? label : `${label} · ${Math.round(f * 100)}%`),
      );
      update((d) => {
        d.ar = ar;
      });
      await qc.invalidateQueries({ queryKey: assetsQueryKey });
      toast.success("New AR files are ready", {
        description: "They go live the next time you publish.",
      });
    } catch (e) {
      toast.error("Couldn't make the AR files", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Group
      title="View in AR"
      description="Visitors can place the endcap in their room: Scene Viewer on Android, Quick Look on iPhone."
    >
      <Note>
        The AR files are rebuilt from the <strong className="text-foreground">default theme</strong>{" "}
        every time you publish, so there's usually nothing to do here.
      </Note>
      <ArFiles ar={published?.ar} label="Live version" />
      {!sameAsLive ? <ArFiles ar={draft.ar} label="Made since the last publish" /> : null}
      {!published?.ar?.glb && !draft.ar?.glb ? (
        <p className="text-xs text-muted-foreground">
          No AR files yet. They're made when you publish.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={regenerate} disabled={!!busy || !ready}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          {busy ? "Working…" : "Make AR files now"}
        </Button>
        <span className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
          {busy ?? (!ready ? "Waiting for the preview" : "To test them before publishing")}
        </span>
      </div>
    </Group>
  );
}
