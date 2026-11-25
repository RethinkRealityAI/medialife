import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
  CheckCircle2,
  CloudUpload,
  Library,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";

import { MediaGrid } from "@/components/client/media";
import {
  ClientHeader,
  ClientPage,
  Empty,
  btnGhost,
  btnPrimary,
  bytes,
  card,
} from "@/components/client/ui";
import { useClientWorkspace } from "@/components/client/workspace";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getClientUploads } from "@/lib/client/hub.functions";
import { readMediaMeta } from "@/lib/media/media-client";
import {
  MEDIA,
  MEDIA_ACCEPT,
  MEDIA_KIND_LABELS,
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_LABELS,
  formatBytes,
  type MediaKind,
  type MediaPurpose,
} from "@/lib/media/model";
import { MediaUploadTask } from "@/lib/media/upload-client";
import { cn } from "@/lib/utils";

// /client-hub/content: the client's content library. Everything MEDIALIFE
// shares with them plus everything their own team uploads, with filters
// (who added it, experience, type, tags). Uploads land private in the Media
// Library under the client's name, tagged "From client" plus what they chose.

export const Route = createFileRoute("/client-hub/_app/content")({
  validateSearch: z.object({ upload: z.coerce.number().optional() }),
  head: () => ({ meta: [{ title: "Content library · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientUploads(),
  staleTime: 10_000,
  component: Content,
});

const INPUT = "h-11 border-white/10 bg-black/30";
const SELECT =
  "h-11 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-foreground";

/** Tags most of their content needs, one tap each. */
const POPULAR_TAGS = [
  "AR",
  "Bobo",
  "Eclipse can",
  "Keychain",
  "Merch",
  "Social post",
  "Behind the scenes",
  "Event",
  "Fan content",
  "Launch",
];

const OWNERS = [
  { id: "client", label: (n: string) => n },
  { id: "creator", label: () => "A creator (UGC)" },
  { id: "medialife", label: () => "MEDIALIFE" },
  { id: "other", label: () => "Someone else (say who in the note)" },
] as const;
type Owner = (typeof OWNERS)[number]["id"];

type Who = "all" | "team" | "medialife";

/** The client's experiences from the public Labs catalogue (same rules as the Experiences page). */
function useExperiences(catalogClient: string) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/labs/catalog.json")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          all: {
            title: string;
            client?: string;
            url?: string;
            share?: false | { title?: string };
          }[],
        ) => {
          if (!live) return;
          const names = all
            .filter((e) => e.client === catalogClient && e.share !== false && e.url)
            .map((e) => (e.share && e.share.title) || e.title);
          setList([...new Set(names)]);
        },
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [catalogClient]);
  return list;
}

function Content() {
  const ws = useClientWorkspace();
  const { items, canUpload } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/client-hub/content" });
  const experiences = useExperiences(ws.client.catalogClient);
  const teamName = ws.client.name;
  const mayUpload = canUpload && !ws.me.medialife;

  const [q, setQ] = useState("");
  const [who, setWho] = useState<Who>("all");
  const [exp, setExp] = useState("");
  const [kind, setKind] = useState<MediaKind | "">("");
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<"new" | "old" | "name">("new");
  const uploadOpen = !!search.upload && mayUpload;
  const setUploadOpen = (open: boolean) =>
    void navigate({ search: open ? { upload: 1 } : {}, replace: true });

  // experiences that actually have content, plus the catalogue list for uploads
  const expOptions = useMemo(() => {
    const have = new Set<string>();
    for (const m of items) {
      for (const e of experiences)
        if (m.collection === e || m.tags.some((t) => t.toLowerCase() === e.toLowerCase()))
          have.add(e);
    }
    return experiences.filter((e) => have.has(e));
  }, [items, experiences]);

  const kinds = useMemo(() => [...new Set(items.map((m) => m.kind))], [items]);

  const topTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of items)
      for (const t of m.tags) if (t !== "From client") count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [items]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items.filter((m) => {
      if (who === "team" && !m.sentBy) return false;
      if (who === "medialife" && m.sentBy) return false;
      if (kind && m.kind !== kind) return false;
      if (exp && m.collection !== exp && !m.tags.some((t) => t.toLowerCase() === exp.toLowerCase()))
        return false;
      if (tags.length && !tags.every((t) => m.tags.includes(t))) return false;
      if (
        s &&
        !`${m.title} ${m.name} ${m.description} ${m.collection} ${m.tags.join(" ")} ${m.sentBy ?? ""}`
          .toLowerCase()
          .includes(s)
      )
        return false;
      return true;
    });
    if (sort === "old") list.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, q, who, kind, exp, tags, sort]);

  const filtered = !!(q || who !== "all" || exp || kind || tags.length);
  const teamCount = items.filter((m) => m.sentBy).length;

  return (
    <ClientPage>
      <ClientHeader
        eyebrow={`${teamName} × MEDIALIFE`}
        title="Content library"
        description={`Everything for ${teamName} in one place: what your team uploads and what MEDIALIFE shares with you. Only your team and MEDIALIFE can see it.`}
        actions={
          mayUpload ? (
            <button
              type="button"
              className={cn(btnPrimary, "h-11")}
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="size-4" aria-hidden /> Upload
            </button>
          ) : null
        }
      />

      {ws.me.medialife ? (
        <p className={cn(card, "mt-6 p-4 text-sm text-muted-foreground")}>
          You're viewing as MEDIALIFE. Their team uploads here; their files also land in Admin ›
          Media library, tagged "From client".
        </p>
      ) : null}

      {/* Filters */}
      <div className={cn(card, "mt-6 grid gap-3 p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search names, notes and tags"
              className={cn(INPUT, "pl-9")}
            />
          </label>
          <div
            role="radiogroup"
            aria-label="Added by"
            className="flex rounded-full border border-white/10 p-1"
          >
            {(
              [
                ["all", `All ${items.length}`],
                ["team", `Your team ${teamCount}`],
                ["medialife", `MEDIALIFE ${items.length - teamCount}`],
              ] as [Who, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={who === id}
                onClick={() => setWho(id)}
                className={cn(
                  "h-9 rounded-full px-3 text-sm whitespace-nowrap",
                  who === id
                    ? "bg-[var(--client)] text-[var(--client-ink)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className={SELECT}
            value={exp}
            onChange={(e) => setExp(e.target.value)}
            aria-label="Experience"
          >
            <option value="">All experiences</option>
            {expOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            value={kind}
            onChange={(e) => setKind(e.target.value as MediaKind | "")}
            aria-label="Type"
          >
            <option value="">All types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {MEDIA_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Sort"
          >
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        {topTags.length ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Tags">
            {topTags.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs",
                    on
                      ? "border-[var(--client)] bg-[var(--client)] text-[var(--client-ink)]"
                      : "border-white/10 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {shown.length} {shown.length === 1 ? "file" : "files"}
          {filtered ? " match" : ""}
        </p>
        {filtered ? (
          <button
            type="button"
            className="text-sm text-[var(--client)] hover:underline"
            onClick={() => {
              setQ("");
              setWho("all");
              setExp("");
              setKind("");
              setTags([]);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        {shown.length ? (
          <MediaGrid items={shown} />
        ) : items.length ? (
          <Empty icon={Search} title="Nothing matches">
            Try fewer filters.
          </Empty>
        ) : (
          <Empty icon={Library} title="No content yet">
            {mayUpload
              ? "Upload footage, artwork, logos or briefs, and everything MEDIALIFE shares shows up here too."
              : "Everything MEDIALIFE shares with you shows up here."}
          </Empty>
        )}
      </div>

      {mayUpload ? (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          teamName={teamName}
          experiences={experiences}
        />
      ) : null}
    </ClientPage>
  );
}

/* ── Upload ───────────────────────────────────────────────────────────────── */

type Staged = { key: string; file: File; task: MediaUploadTask | null; tooBig: boolean };

function UploadDialog({
  open,
  onOpenChange,
  teamName,
  experiences,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamName: string;
  experiences: string[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<Staged[]>([]);
  const [owner, setOwner] = useState<Owner>("client");
  const [exp, setExp] = useState("");
  const [purpose, setPurpose] = useState<MediaPurpose | "">("");
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const inputRef = useRef<HTMLInputElement>(null);

  const started = files.some((f) => f.task);
  const busy = files.some((f) => f.task?.state === "uploading" || f.task?.state === "queued");
  const ready = files.filter((f) => !f.task && !f.tooBig);
  const allDone = started && files.every((f) => f.tooBig || f.task?.state === "done");

  const addFiles = (list: FileList | File[]) => {
    const next = Array.from(list)
      .filter((f) => f.size > 0)
      .map((file) => ({
        key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
        file,
        task: null,
        tooBig: file.size > MEDIA.maxFileBytes,
      }));
    setFiles((cur) => [...cur, ...next]);
  };

  const addCustom = () => {
    const t = custom.trim().slice(0, 40);
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setCustom("");
  };

  const reset = useCallback(() => {
    setFiles([]);
    setTitle("");
    setNote("");
    setTags([]);
    setPurpose("");
    setExp("");
    setOwner("client");
  }, []);

  const start = async () => {
    const rights =
      owner === "client"
        ? `Owned by ${teamName}`
        : owner === "creator"
          ? "Owned by a creator (UGC)"
          : owner === "medialife"
            ? "Owned by MEDIALIFE"
            : "Owned by someone else (see note)";
    const allTags = [...tags, ...(exp ? [exp] : []), ...(owner === "creator" ? ["UGC"] : [])];
    const single = ready.length === 1;
    for (const s of ready) {
      const meta = await readMediaMeta(s.file).catch(() => null);
      const task = new MediaUploadTask(s.file, {
        meta,
        fields: {
          title: single && title.trim() ? title.trim() : undefined,
          description: note.trim() || undefined,
          collection: exp || undefined,
          purpose: purpose || undefined,
          tags: allTags,
          rights,
        },
      });
      task.subscribe(rerender);
      setFiles((cur) => cur.map((f) => (f.key === s.key ? { ...f, task } : f)));
      void task.start().then((r) => {
        if (r) void router.invalidate();
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && allDone) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto border-white/10 bg-[#0b0e14] p-0">
        <div className="grid gap-5 p-5 sm:p-6">
          <div>
            <DialogTitle className="text-xl">Upload content</DialogTitle>
            <DialogDescription className="mt-1">
              Add the files, tag them once, then upload. Only your team and MEDIALIFE see them.
            </DialogDescription>
          </div>

          {/* 1. Files */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => !started && inputRef.current?.click()}
            onKeyDown={(e) => {
              if (!started && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!started) addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "grid place-items-center rounded-2xl border border-dashed p-5 text-center",
              started ? "hidden" : "cursor-pointer",
              drag
                ? "border-[var(--client)] bg-white/[0.04]"
                : "border-white/15 hover:bg-white/[0.03]",
            )}
          >
            <CloudUpload className="size-7 text-[var(--client)]" aria-hidden />
            <span className="mt-2 font-semibold">Drop files here, or tap to choose</span>
            <span className="mt-1 text-xs text-muted-foreground">
              Video, images, PDFs, audio, 3D, ZIP. Up to {formatBytes(MEDIA.maxFileBytes)} each. Big
              videos pick up where they left off if the connection drops.
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={MEDIA_ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {files.length ? (
            <ul className={cn(card, "divide-y divide-white/[0.06]")} aria-live="polite">
              {files.map((s) => (
                <FileRow
                  key={s.key}
                  s={s}
                  onRemove={() => setFiles((cur) => cur.filter((f) => f.key !== s.key))}
                />
              ))}
            </ul>
          ) : null}

          {!started ? (
            <>
              {/* 2. Details */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Who owns it
                  <select
                    className={SELECT}
                    value={owner}
                    onChange={(e) => setOwner(e.target.value as Owner)}
                  >
                    {OWNERS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label(teamName)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Experience or game
                  <select className={SELECT} value={exp} onChange={(e) => setExp(e.target.value)}>
                    <option value="">Not about one experience</option>
                    {experiences.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">What is it</legend>
                <div className="flex flex-wrap gap-1.5">
                  {MEDIA_PURPOSES.filter((p) => p !== "other").map((p) => (
                    <Pill
                      key={p}
                      on={purpose === p}
                      onClick={() => setPurpose(purpose === p ? "" : p)}
                    >
                      {MEDIA_PURPOSE_LABELS[p]}
                    </Pill>
                  ))}
                </div>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Tags</legend>
                <div className="flex flex-wrap gap-1.5">
                  {[...POPULAR_TAGS, ...tags.filter((t) => !POPULAR_TAGS.includes(t))].map((t) => {
                    const on = tags.includes(t);
                    return (
                      <Pill
                        key={t}
                        on={on}
                        onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                      >
                        {t}
                      </Pill>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                    placeholder="Add your own tag"
                    maxLength={40}
                    className={INPUT}
                  />
                  <button
                    type="button"
                    className={cn(btnGhost, "h-11 px-3")}
                    onClick={addCustom}
                    disabled={!custom.trim()}
                  >
                    <Plus className="size-4" aria-hidden /> Add
                  </button>
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Name {ready.length > 1 ? "(one file only)" : "(optional)"}
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Winter drop artwork"
                    maxLength={140}
                    disabled={ready.length > 1}
                    className={INPUT}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium sm:row-span-2">
                  Note for MEDIALIFE (optional)
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What it is and how you'd like it used"
                    maxLength={1200}
                    rows={3}
                    className="border-white/10 bg-black/30"
                  />
                </label>
              </div>

              <button
                type="button"
                className={cn(btnPrimary, "h-12")}
                disabled={!ready.length}
                onClick={() => void start()}
              >
                <Upload className="size-4" aria-hidden />
                {ready.length
                  ? `Upload ${ready.length} ${ready.length === 1 ? "file" : "files"}`
                  : "Choose files to upload"}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {busy
                  ? "Uploading. You can keep this open or close it: uploads keep going while this tab is open."
                  : allDone
                    ? "Done. Your files are in the library and MEDIALIFE has them."
                    : "Some files didn't finish. Tap Retry."}
              </p>
              <div className="flex gap-2">
                {allDone ? (
                  <button type="button" className={cn(btnGhost, "h-11")} onClick={reset}>
                    Upload more
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(btnPrimary, "h-11")}
                  onClick={() => {
                    if (allDone) reset();
                    onOpenChange(false);
                  }}
                >
                  {allDone ? "Done" : "Close"}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3 text-sm",
        on
          ? "border-[var(--client)] bg-[var(--client)] text-[var(--client-ink)]"
          : "border-white/12 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FileRow({ s, onRemove }: { s: Staged; onRemove: () => void }) {
  const t = s.task;
  const st = t?.state;
  const pct = t ? Math.round(t.progress.fraction * 100) : 0;
  return (
    <li className="flex items-center gap-3 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05]">
        {st === "done" ? (
          <CheckCircle2 className="size-4 text-emerald-400" aria-hidden />
        ) : st === "uploading" || st === "queued" ? (
          <Loader2 className="size-4 animate-spin text-[var(--client)]" aria-hidden />
        ) : (
          <Upload className="size-4 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{s.file.name}</span>
        {t ? (
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <span
              className={cn(
                "block h-full rounded-full",
                st === "error" ? "bg-red-400" : "bg-[var(--client)]",
              )}
              style={{ width: `${st === "done" ? 100 : pct}%` }}
            />
          </span>
        ) : null}
        <span
          className={cn(
            "mt-1 block text-xs",
            s.tooBig || st === "error" ? "text-red-300" : "text-muted-foreground",
          )}
        >
          {s.tooBig
            ? `Too big: files can be up to ${formatBytes(MEDIA.maxFileBytes)}`
            : !t
              ? bytes(s.file.size)
              : st === "done"
                ? `Uploaded · ${bytes(s.file.size)}`
                : st === "error"
                  ? (t.error?.message ?? "Upload failed")
                  : st === "paused"
                    ? `Paused at ${pct}%`
                    : `${pct}% of ${bytes(s.file.size)}`}
        </span>
      </span>
      {t && (st === "error" || st === "paused") ? (
        <button type="button" className={cn(btnGhost, "h-9 px-3")} onClick={() => void t.resume()}>
          <RotateCcw className="size-4" aria-hidden /> Retry
        </button>
      ) : null}
      {!t || st === "uploading" ? (
        <button
          type="button"
          aria-label={t ? `Cancel ${s.file.name}` : `Remove ${s.file.name}`}
          className={cn(btnGhost, "size-9 p-0")}
          onClick={() => (t ? void t.cancel().then(onRemove) : onRemove())}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
