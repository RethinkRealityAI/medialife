import { useId, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ImageUp, Lightbulb, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { FileTile } from "@/components/hub/app/file-tile";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
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
  category: ArtworkCategory;
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
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const art = ws.files.filter((f) => f.kind === "artwork" && f.complete);
  const groups = CATEGORY_IDS.map((c) => ({
    id: c,
    label: ARTWORK_CATEGORIES[c],
    files: art.filter((f) => f.category === c),
  })).filter((g) => g.files.length);
  const other = art.filter((f) => !CATEGORY_IDS.includes(f.category as ArtworkCategory));
  if (other.length) groups.push({ id: "other", label: ARTWORK_CATEGORIES.other, files: other });

  const patch = (key: string, p: Partial<UploadItem>) =>
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function start(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    const cat = category;
    const items: Array<{ file: File; item: UploadItem }> = list.map((file, i) => {
      const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      const problem = !ALLOWED_EXT.has(ext)
        ? "This file type isn't supported. Try PNG, SVG, PDF, AI, PSD, a font or a ZIP."
        : file.size > HUB.maxUploadBytes
          ? `Too big: the limit is ${MAX_MB}. Zip it or send a smaller version.`
          : file.size === 0
            ? "This file is empty."
            : undefined;
      return {
        file,
        item: {
          key: `${Date.now()}-${i}-${file.name}`,
          name: file.name,
          size: file.size,
          category: cat,
          progress: 0,
          status: problem ? "error" : "uploading",
          error: problem,
        },
      };
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
      // Finished rows have done their job once the file shows in the library.
      setTimeout(() => setUploads((u) => u.filter((x) => x.status !== "done")), 2500);
    }
  }

  const busy = uploads.some((u) => u.status === "uploading");

  return (
    <Page>
      <PageHeader
        title="Artwork"
        description="Send your art once; we use it across your products. Logos, characters, fonts, references — anything that helps us get your look right."
      />

      <div className="mt-8 grid grid-cols-1 gap-6 @5xl/inset:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <Panel className="p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="art-category" className="text-sm font-medium">
                What are you uploading?
              </label>
              <select
                id="art-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ArtworkCategory)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:ml-auto sm:min-w-56"
              >
                {CATEGORY_IDS.map((c) => (
                  <option key={c} value={c}>
                    {ARTWORK_CATEGORIES[c]}
                  </option>
                ))}
              </select>
            </div>

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
                "mt-4 flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
                dragging ? "border-primary bg-primary/[0.07]" : "border-border",
              )}
            >
              <span className="grid grid-cols-1 size-12 place-items-center rounded-full bg-primary/12">
                <Upload className="size-5 text-primary" aria-hidden />
              </span>
              <p className="mt-4 font-medium">
                <span className="hidden sm:inline">Drop files here, or </span>
                <span className="sm:hidden">Add files from your phone</span>
              </p>
              <Button type="button" className="mt-3" onClick={() => inputRef.current?.click()}>
                <ImageUp aria-hidden /> Choose files
              </Button>
              <input
                ref={inputRef}
                id={inputId}
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
              <p className="mt-3 text-xs text-muted-foreground">
                Saved as “{ARTWORK_CATEGORIES[category]}” · up to {MAX_MB} each
              </p>
            </div>

            {uploads.length ? (
              <ul className="mt-4 space-y-2" aria-live="polite" aria-busy={busy}>
                {uploads.map((u) => (
                  <li key={u.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
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
                          className="grid grid-cols-1 size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                      <p className="mt-1.5 pl-7 text-sm text-red-300" role="alert">
                        {u.error}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </div>

        <aside aria-labelledby="tips-title">
          <Panel className="p-5">
            <h2 id="tips-title" className="flex items-center gap-2 font-medium">
              <Lightbulb className="size-4 text-primary" aria-hidden /> What works best
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              {TIPS.map((t) => (
                <div key={t.title}>
                  <dt className="font-medium">{t.title}</dt>
                  <dd className="mt-0.5 leading-relaxed text-muted-foreground">{t.body}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </aside>
      </div>

      <Section
        title="Your library"
        description={art.length ? `${art.length} file${art.length === 1 ? "" : "s"}` : undefined}
      >
        {groups.length ? (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`cat-${g.id}`}>
                <h3 id={`cat-${g.id}`} className="mb-3 text-sm font-medium text-muted-foreground">
                  {g.label} <span className="tabular-nums">({g.files.length})</span>
                </h3>
                <ul className="grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @5xl/inset:grid-cols-4">
                  {g.files.map((f) => (
                    <FileTile
                      key={f.id}
                      file={f}
                      canDelete={f.uploadedBy === "creator"}
                      onDeleted={() => router.invalidate()}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={ImageUp} title="No artwork yet">
            Upload your logo and main character art to start. We'll use them for every product's
            design, so you only send them once.
          </EmptyState>
        )}
      </Section>
    </Page>
  );
}
