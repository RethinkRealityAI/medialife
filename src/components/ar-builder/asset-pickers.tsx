import type { ReactNode } from "react";
import { Box, ImageIcon, Replace, X } from "lucide-react";

import { assetIdFromRef, assetUrl, type Path } from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { assetPreviewUrl, useAssets } from "./assets-query";
import { useEditor, useField } from "./editor-context";
import { FieldShell } from "./fields";

// Fields that hold a file: an image (stored as "/api/ar/asset/<id>", or
// {src, mobile} when a phone-sized version exists) or a .glb model.

type ImageRef = string | { src: string; mobile?: string } | undefined;
const srcOf = (v: ImageRef) => (typeof v === "string" ? v : v?.src);

function fileName(ref: string | undefined, names: Map<string, string>): string {
  if (!ref) return "";
  const id = assetIdFromRef(ref);
  if (id) return names.get(id) ?? "Uploaded file";
  return ref.split("/").pop() ?? ref;
}

function PickerRow({
  id,
  preview,
  icon,
  name,
  detail,
  onChoose,
  onRemove,
  empty,
  compact,
}: {
  id: string;
  preview: string | null;
  icon: ReactNode;
  name: string;
  detail?: string;
  onChoose: () => void;
  onRemove?: () => void;
  empty: string;
  compact?: boolean;
}) {
  if (!name) {
    return (
      <button
        id={id}
        type="button"
        onClick={onChoose}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border border-dashed border-input bg-background/40 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4",
          compact ? "h-11" : "h-14",
        )}
      >
        {icon}
        {empty}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-input bg-background/60 p-1.5 pr-2">
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded bg-[conic-gradient(oklch(0.2_0.01_280)_25%,oklch(0.15_0.01_280)_0_50%,oklch(0.2_0.01_280)_0_75%,oklch(0.15_0.01_280)_0)] bg-[length:10px_10px] text-muted-foreground [&_svg]:size-4",
          compact ? "size-8" : "size-10",
        )}
      >
        {preview ? <img src={preview} alt="" className="size-full object-contain" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium" title={name}>
          {name}
        </span>
        {detail ? (
          <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        onClick={onChoose}
        className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Replace className="size-3.5" aria-hidden />
        Replace
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function ImagePicker({
  path,
  label,
  hint,
  optional = true,
  compact,
  onFocusSlot,
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  compact?: boolean;
  /** hover / focus, e.g. to highlight the panel on the schematic */
  onFocusSlot?: (on: boolean) => void;
}) {
  const { openLibrary } = useEditor();
  const f = useField<ImageRef>(path);
  const assets = useAssets();
  const names = new Map((assets.data ?? []).map((a) => [a.id, a.name]));
  const src = srcOf(f.value);
  const asset = (assets.data ?? []).find((a) => a.id === assetIdFromRef(src));
  const preview = asset ? assetPreviewUrl(asset) : (src ?? null);
  return (
    <div
      onMouseEnter={() => onFocusSlot?.(true)}
      onMouseLeave={() => onFocusSlot?.(false)}
      onFocus={() => onFocusSlot?.(true)}
      onBlur={() => onFocusSlot?.(false)}
    >
      <FieldShell id={f.id} label={label} hint={hint} error={f.error}>
        <PickerRow
          id={f.id}
          compact={compact}
          preview={preview}
          icon={<ImageIcon aria-hidden />}
          name={fileName(src, names)}
          detail={
            asset?.width
              ? `${asset.width}×${asset.height}${asset.mobile ? " · phone version" : ""}`
              : undefined
          }
          empty="Choose image"
          onChoose={() =>
            openLibrary({
              accept: "image",
              title: `Choose an image: ${label.toLowerCase()}`,
              currentId: assetIdFromRef(src),
              onPick: (a) =>
                f.set(
                  a.mobile ? { src: assetUrl(a.id), mobile: assetUrl(a.mobile) } : assetUrl(a.id),
                ),
            })
          }
          onRemove={optional ? () => f.set(undefined) : undefined}
        />
      </FieldShell>
    </div>
  );
}

export function ModelPicker({ path, label }: { path: Path; label: string }) {
  const { openLibrary } = useEditor();
  const f = useField<string | undefined>(path);
  const assets = useAssets();
  const names = new Map((assets.data ?? []).map((a) => [a.id, a.name]));
  const asset = (assets.data ?? []).find((a) => a.id === assetIdFromRef(f.value));
  return (
    <FieldShell id={f.id} label={label} error={f.error}>
      <PickerRow
        id={f.id}
        preview={assetPreviewUrl(asset)}
        icon={<Box aria-hidden />}
        name={fileName(f.value, names)}
        detail={asset ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : undefined}
        empty="Choose a .glb model"
        onChoose={() =>
          openLibrary({
            accept: "model",
            currentId: assetIdFromRef(f.value),
            onPick: (a) => f.set(assetUrl(a.id)),
          })
        }
        onRemove={() => f.set(undefined)}
      />
    </FieldShell>
  );
}
