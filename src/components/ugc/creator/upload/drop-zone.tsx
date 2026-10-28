/**
 * The big drop zone: drag files onto it, or tap / press Enter to pick them.
 * It's a real button for keyboards and screen readers; the file input is
 * hidden behind it.
 */
import { useId, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { UGC_SUBMISSION_ACCEPT } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export function DropZone({
  onFiles,
  disabled,
  disabledReason,
  describedBy,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  disabledReason?: string;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();
  const pick = () => !disabled && input.current?.click();

  return (
    <div
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className="relative"
    >
      <button
        type="button"
        onClick={pick}
        disabled={disabled}
        aria-describedby={
          [describedBy, disabled ? `${id}-why` : null].filter(Boolean).join(" ") || undefined
        }
        className={cn(
          "group relative isolate flex w-full flex-col items-center justify-center overflow-hidden rounded-[26px] border-2 border-dashed px-6 py-10 text-center transition-[border-color,background,transform] duration-200 sm:py-14",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3fe6e0]",
          disabled
            ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-70"
            : over
              ? "scale-[1.01] border-[#3fe6e0] bg-[#3fe6e0]/[0.09]"
              : "border-[#3fe6e0]/35 bg-[linear-gradient(180deg,rgb(63_230_224/0.06),rgb(63_230_224/0.015))] hover:border-[#3fe6e0]/70 hover:bg-[#3fe6e0]/[0.06]",
        )}
      >
        <span
          aria-hidden
          className="absolute -top-24 left-1/2 -z-10 h-48 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(63_230_224/0.22),transparent)] blur-2xl"
        />
        <span
          aria-hidden
          className={cn(
            "grid size-16 place-items-center rounded-[20px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_16px_36px_-12px_rgb(255_55_174/0.55)] ring-1 ring-white/20 transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none",
            disabled ? "bg-white/10 shadow-none" : "bg-[linear-gradient(135deg,#19affe,#ff37ae)]",
          )}
        >
          <UploadCloud className="size-7" />
        </span>
        <span className="mt-5 text-xl font-bold tracking-[-0.025em]">
          <span className="sm:hidden">Tap to add your videos</span>
          <span className="hidden sm:inline">{over ? "Drop to add" : "Drag your videos here"}</span>
        </span>
        <span className="mt-1.5 text-sm text-muted-foreground">
          <span className="sm:hidden">Videos or photos from your camera roll</span>
          <span className="hidden sm:inline">
            or{" "}
            <span className="font-medium text-[#bff7f4] underline decoration-[#3fe6e0]/40 underline-offset-4">
              choose files
            </span>{" "}
            · videos or photos
          </span>
        </span>
      </button>
      {disabled && disabledReason ? (
        <p id={`${id}-why`} className="sr-only">
          {disabledReason}
        </p>
      ) : null}
      <input
        ref={input}
        type="file"
        multiple
        accept={UGC_SUBMISSION_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
