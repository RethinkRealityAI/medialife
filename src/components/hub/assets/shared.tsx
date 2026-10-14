/**
 * Pieces the asset library, its upload dialog and its details panel share:
 * section and type icons, thumbnails that know each media type, and the
 * mutations (with an instant local update while the server catches up).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  AudioLines,
  BadgeCheck,
  Box,
  Clapperboard,
  File,
  FileArchive,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Megaphone,
  Palette,
  PenTool,
  Shapes,
  Star,
  Type,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createFolder,
  removeFolder,
  renameFolder,
  renameTag,
  updateAssets,
} from "@/lib/hub/assets.functions";
import {
  applyAssetPatch,
  extOf,
  mediaTypeOf,
  type AssetPatch,
  type AssetSection,
  type MediaType,
} from "@/lib/hub/assets";
import { fileUrl, isImage, type AssetFolder, type HubFile } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const SECTION_ICON: Record<AssetSection, LucideIcon> = {
  branding: Palette,
  social: Megaphone,
  art: ImageIcon,
  video: Clapperboard,
  "3d": Box,
  audio: AudioLines,
  documents: FileText,
  other: Shapes,
};

export const VIEW_ICON = { all: LayoutGrid, starred: Star, medialife: BadgeCheck } as const;

export const TYPE_ICON: Record<MediaType, LucideIcon> = {
  image: ImageIcon,
  vector: PenTool,
  video: Film,
  "3d": Box,
  audio: AudioLines,
  document: FileText,
  font: Type,
  design: Layers,
  archive: FileArchive,
  other: File,
};

export const errorText = (e: unknown, fallback = "Something went wrong. Try again.") =>
  e instanceof Error && e.message && !/^\{|^\[/.test(e.message) ? e.message : fallback;

/* ---------------------------------------------------------------------------
   Thumbnails
   --------------------------------------------------------------------------- */

/** True once the element has been near the viewport (videos and fonts load lazily). */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

const loadedFonts = new Map<string, Promise<string | null>>();
/** Registers an uploaded font and resolves to its CSS family name. */
export function useFontFamily(f: HubFile, enabled = true) {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || typeof FontFace === "undefined") return;
    let p = loadedFonts.get(f.id);
    if (!p) {
      const fam = `hub-font-${f.id}`;
      p = new FontFace(fam, `url(${fileUrl(f)})`)
        .load()
        .then((face) => {
          document.fonts.add(face);
          return fam;
        })
        .catch(() => null);
      loadedFonts.set(f.id, p);
    }
    let live = true;
    void p.then((fam) => live && setFamily(fam));
    return () => {
      live = false;
    };
  }, [f, enabled]);
  return family;
}

function TypeFallback({ f, large }: { f: Pick<HubFile, "name" | "mime">; large?: boolean }) {
  const type = mediaTypeOf(f);
  const Icon = TYPE_ICON[type];
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_top,oklch(0.3_0.1_240/35%),transparent_70%)]">
      <Icon className={cn("text-muted-foreground", large ? "size-10" : "size-7")} aria-hidden />
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {extOf(f.name).slice(0, 9) || "file"}
      </span>
    </div>
  );
}

const CHECKER =
  "bg-[conic-gradient(at_50%_50%,#1a1a22_25%,#22222c_0_50%,#1a1a22_0_75%,#22222c_0)] bg-[length:16px_16px]";

/** A square-ish thumbnail for any file: the image, a video frame, a font sample, or its type. */
export function AssetThumb({ file, className }: { file: HubFile; className?: string }) {
  const type = mediaTypeOf(file);
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [broken, setBroken] = useState(false);
  const family = useFontFamily(file, seen && type === "font");
  const Icon = TYPE_ICON[type];

  let body: ReactNode;
  if (broken) body = <TypeFallback f={file} />;
  else if (isImage(file.mime))
    body = (
      <img
        src={fileUrl(file)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn("size-full object-contain", CHECKER)}
      />
    );
  else if (type === "video" && file.mime !== "video/quicktime")
    body = seen ? (
      <video
        src={`${fileUrl(file)}#t=0.5`}
        preload="metadata"
        muted
        playsInline
        onError={() => setBroken(true)}
        className="size-full bg-black object-cover"
        aria-hidden
        tabIndex={-1}
      />
    ) : null;
  else if (type === "font")
    body = (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-white/[0.03]">
        <span
          className="text-4xl leading-none text-foreground"
          style={family ? { fontFamily: family } : { opacity: 0.25 }}
          aria-hidden
        >
          Aa
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {extOf(file.name)}
        </span>
      </div>
    );
  else body = <TypeFallback f={file} />;

  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-white/[0.03]", className)}>
      {body}
      {type === "video" || type === "3d" || type === "audio" ? (
        <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-background/80 backdrop-blur">
          <Icon className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Mutations
   --------------------------------------------------------------------------- */

type Override = { file: HubFile; v: number };

/**
 * The library's writes. Each change shows at once (an override on top of the
 * loader data) and is dropped once the reloaded data carries it, or rolled
 * back with a message if the server refuses.
 */
export function useAssetMutations(creatorId: string | undefined, folders: AssetFolder[]) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const version = useRef(0);

  const merge = useCallback(
    (files: HubFile[]) => files.map((f) => overrides[f.id]?.file ?? f),
    [overrides],
  );

  const update = useCallback(
    async (files: HubFile[], patch: AssetPatch, message?: string) => {
      if (!files.length) return true;
      const v = ++version.current;
      const folder = patch.folderId ? (folders.find((x) => x.id === patch.folderId) ?? null) : null;
      setOverrides((o) => {
        const next = { ...o };
        for (const f of files) next[f.id] = { file: applyAssetPatch(f, patch, folder), v };
        return next;
      });
      const clear = () =>
        setOverrides((o) => {
          const next = { ...o };
          for (const f of files) if (next[f.id]?.v === v) delete next[f.id];
          return next;
        });
      try {
        await updateAssets({ data: { ...patch, ids: files.map((f) => f.id), creatorId } });
        await router.invalidate();
        clear();
        if (message) toast.success(message);
        return true;
      } catch (e) {
        clear();
        toast.error(errorText(e, "Couldn't save that change. Try again."));
        return false;
      }
    },
    [creatorId, folders, router],
  );

  const folderOps = {
    create: async (name: string, section: AssetSection) => {
      const r = await createFolder({ data: { name: name.trim(), section, creatorId } });
      await router.invalidate();
      return r.folder;
    },
    rename: async (id: string, name: string) => {
      await renameFolder({ data: { id, name: name.trim(), creatorId } });
      await router.invalidate();
    },
    remove: async (id: string) => {
      const r = await removeFolder({ data: { id, creatorId } });
      await router.invalidate();
      return r.moved;
    },
  };

  const tagOps = {
    rename: async (from: string, to: string | null) => {
      const r = await renameTag({ data: { from, to, creatorId } });
      await router.invalidate();
      return r.changed;
    },
  };

  return { merge, update, folderOps, tagOps, reload: () => router.invalidate() };
}

export type AssetMutations = ReturnType<typeof useAssetMutations>;
