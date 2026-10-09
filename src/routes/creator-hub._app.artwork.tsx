import { useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ImageUp, Lightbulb, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { FileGallery } from "@/components/hub/app/gallery";
import { EmptyState, Page, PageHeader } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ARTWORK_CATEGORIES, HUB, type ArtworkCategory } from "@/lib/hub/model";
import { UPLOAD_ACCEPT, formatBytes, uploadHubFile } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/artwork")({
  head: () => ({ meta: [{ title: "Artwork · Creator Hub | MEDIALIFE" }] }),
  component: Artwork,
});

type UploadItem = {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

const MAX_MB = `${Math.round(HUB.maxUploadBytes / 1_048_576)} MB`;
const CATEGORY_IDS = Object.keys(ARTWORK_CATEGORIES) as ArtworkCategory[];
const ALLOWED_EXT = new Set(UPLOAD_ACCEPT.split(",").map((s) => s.trim().toLowerCase()));

const TIPS = [
  {
    title: "Logos & wordmarks",
    body: "Vector files: AI, SVG, EPS or PDF. They stay sharp at any size.",
  },
  {
    title: "Characters & art",
    body: "Transparent PNG, 3000px or larger on the long side. PSD with layers is great too.",
  },
  { title: "Fonts", body: "OTF or TTF files for any custom lettering you use." },
  { title: "Size", body: `Up to ${MAX_MB} per file. Zip a folder if you have lots of pieces.` },
];

function Artwork() {
  const ws = useWorkspace();
  const router = useRouter();
  const [category, setCategory] = useState<ArtworkCategory>("logo");
  const [filter, setFilter] = useState<ArtworkCategory | "all">("all");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const art = ws.files.filter((f) => f.kind === "artwork" && f.complete);
  const catOf = (f: { category: string }) =>
    (CATEGORY_IDS.includes(f.category as ArtworkCategory)
      ? f.category
      : "other") as ArtworkCategory;
  const present = CATEGORY_IDS.filter((c) => art.some((f) => catOf(f) === c));
  const shown = art
    .filter((f) => filter === "all" || catOf(f) === filter)
    .sort(
      (a, b) =>
        CATEGORY_IDS.indexOf(catOf(a)) - CATEGORY_IDS.indexOf(catOf(b)) ||
        b.createdAt - a.createdAt,
    );

  const patch = (key: string, p: Partial<UploadItem>) =>
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function start(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    const cat = category;
    const items = list.map((file, i) => {
      const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      const problem = !ALLOWED_EXT.has(ext)
        ? "This file type isn't supported. Try PNG, SVG, PDF, AI, PSD, a font or a ZIP."
        : file.size > HUB.maxUploadBytes
          ? `Too big: the limit is ${MAX_MB}. Zip it or send a smaller version.`
          : file.size === 0
            ? "This file is empty."
            : undefined;
      const item: UploadItem = {
        key: `${Date.now()}-${i}-${file.name}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: problem ? "error" : "uploading",
        error: problem,
      };
      return { file, item };
    });
    setUploads((u) => [...items.map((x) => x.item), ...u]);

    let ok = 0;
    await Promise.all(
      items
        .filter((x) => x.item.status === "uploading")
        .map(async ({ file, item }) => {
          try {
            await uploadHubFile(file, {
              kind: "artwork",
              category: cat,
              onProgress: (f) => patch(item.key, { progress: f }),
            });
            patch(item.key, { status: "done", progress: 1 });
            ok++;
          } catch (e) {
            patch(item.key, {
              status: "error",
              error: e instanceof Error ? e.message : "Upload failed. Try again.",
            });
          }
        }),
    );
    if (ok) {
      toast.success(ok === 1 ? "File uploaded" : `${ok} files uploaded`);
      await router.invalidate();
      setTimeout(() => setUploads((u) => u.filter((x) => x.status !== "done")), 2500);
    }
  }

  const busy = uploads.some((u) => u.status === "uploading");

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Artwork"
        description="Send your art once; we use it across your products."
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Lightbulb aria-hidden /> What works best
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <dl className="space-y-2.5 text-sm">
                {TIPS.map((t) => (
                  <div key={t.title}>
                    <dt className="font-medium">{t.title}</dt>
                    <dd className="mt-0.5 leading-relaxed text-muted-foreground">{t.body}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
        }
      />

      {/* Slim dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void start(e.dataTransfer.files);
        }}
        className={cn(
          "mt-5 flex flex-col gap-3 rounded-xl border-2 border-dashed p-3 transition-colors sm:flex-row sm:items-center sm:p-4",
          dragging ? "border-primary bg-primary/[0.07]" : "border-border",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12">
            <Upload className="size-4 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 text-sm">
            <div className="font-medium">
              <span className="hidden sm:inline">Drop files here or choose them</span>
              <span className="sm:hidden">Add your art</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Logos, characters, fonts, references · up to {MAX_MB} each
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="art-category" className="sr-only">
            What are you uploading?
          </label>
          <select
            id="art-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ArtworkCategory)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-none"
          >
            {CATEGORY_IDS.map((c) => (
              <option key={c} value={c}>
                {ARTWORK_CATEGORIES[c]}
              </option>
            ))}
          </select>
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            <ImageUp aria-hidden /> {busy ? "Uploading…" : "Choose files"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose artwork files"
            onChange={(e) => {
              if (e.target.files) void start(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {uploads.length ? (
        <ul
          className="mt-3 grid grid-cols-1 gap-2 @3xl/inset:grid-cols-2"
          aria-live="polite"
          aria-busy={busy}
        >
          {uploads.map((u) => (
            <li
              key={u.key}
              className="rounded-lg border border-border p-2.5 motion-safe:animate-in motion-safe:fade-in-0"
            >
              <div className="flex items-center gap-2.5">
                {u.status === "uploading" ? (
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : u.status === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-red-300" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {u.status === "uploading"
                    ? `${Math.round(u.progress * 100)}%`
                    : u.status === "done"
                      ? "Uploaded"
                      : formatBytes(u.size)}
                </span>
                {u.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Dismiss ${u.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              {u.status === "uploading" ? (
                <div
                  className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label={`Uploading ${u.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(u.progress * 100)}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.max(3, u.progress * 100)}%` }}
                  />
                </div>
              ) : null}
              {u.status === "error" && u.error ? (
                <p className="mt-1 pl-6.5 text-sm text-red-300" role="alert">
                  {u.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby="library-title" className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="library-title" className="text-sm font-medium text-muted-foreground">
            Your library · {art.length} file{art.length === 1 ? "" : "s"}
          </h2>
          {present.length > 1 ? (
            <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-1.5">
              {(["all", ...present] as Array<ArtworkCategory | "all">).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={filter === c}
                  onClick={() => setFilter(c)}
                  className={cn(
                    "h-7 rounded-full border px-2.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    filter === c
                      ? "border-primary/50 bg-primary/12 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "all" ? "All" : ARTWORK_CATEGORIES[c].split(" & ")[0]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <FileGallery
            files={shown}
            label={(f) => ARTWORK_CATEGORIES[catOf(f)]}
            canDelete={(f) => f.uploadedBy === "creator"}
            onDeleted={() => router.invalidate()}
          />
        ) : (
          <EmptyState icon={ImageUp} title="No artwork yet">
            Upload your logo and main character art to start. We'll use them for every product's
            design, so you only send them once.
          </EmptyState>
        )}
      </section>
    </Page>
  );
}
