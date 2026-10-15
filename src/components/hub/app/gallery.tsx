/** A grid of file tiles that open in the lightbox. */
import { useState } from "react";

import type { HubFile } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { DeleteFileButton, FileTile } from "./file-tile";
import { Lightbox } from "./lightbox";

export function FileGallery({
  files,
  label,
  canDelete,
  onDeleted,
  className,
}: {
  files: HubFile[];
  label?: (f: HubFile) => string | undefined;
  canDelete?: (f: HubFile) => boolean;
  onDeleted?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  return (
    <>
      <ul
        className={cn(
          "grid grid-cols-3 gap-2.5 @3xl/inset:grid-cols-5 @5xl/inset:grid-cols-6",
          className,
        )}
      >
        {files.map((f, i) => (
          <FileTile
            key={f.id}
            file={f}
            label={label?.(f)}
            onOpen={() => {
              setIndex(i);
              setOpen(true);
            }}
          />
        ))}
      </ul>
      <Lightbox
        files={files}
        index={Math.min(index, Math.max(0, files.length - 1))}
        onIndexChange={setIndex}
        open={open && files.length > 0}
        onOpenChange={setOpen}
        label={label}
        actions={(f) =>
          canDelete?.(f) ? (
            <DeleteFileButton
              file={f}
              onDeleted={() => {
                setOpen(false);
                onDeleted?.();
              }}
            />
          ) : null
        }
      />
    </>
  );
}
