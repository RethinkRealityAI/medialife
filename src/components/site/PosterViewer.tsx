import { useCallback, useEffect, useRef, useState } from "react";
import { TiltCard } from "./TiltCard";

/**
 * Campaign poster with pointer tilt, scroll lean, and a click-to-zoom lightbox.
 *
 * The lightbox is a native <dialog> opened with showModal(), which gives us
 * Escape-to-close, a focus trap, inert background content and the ::backdrop
 * pseudo-element for free — all things a hand-rolled overlay gets wrong.
 * We add: backdrop-click to close, scroll lock, and a returned focus target.
 */
export function PosterViewer({
  src,
  large,
  alt,
  caption,
}: {
  src: string;
  large: string;
  alt: string;
  caption?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const openDialog = () => {
    dialogRef.current?.showModal();
    setOpen(true);
  };

  // Lock background scroll while the dialog is open. <dialog> makes the page
  // inert but does not stop it scrolling behind the modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onClose = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Clicking the backdrop closes. The dialog element itself fills the viewport,
  // so a click whose target IS the dialog (not the image inside it) is a
  // backdrop click.
  const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) close();
  };

  return (
    <>
      <TiltCard className="w-full">
        <div className="relative w-full animate-drift">
          {/* Glow pooled under the poster to lift it off the page */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[-26px] h-10 w-[62%] rounded-[50%] blur-2xl opacity-45"
            style={{ background: "oklch(0.68 0.26 350 / 55%)" }}
          />
          <button
            ref={triggerRef}
            type="button"
            onClick={openDialog}
            aria-haspopup="dialog"
            className="group/poster relative block w-full cursor-zoom-in rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"
            style={{
              transform:
                "perspective(1000px) rotateX(var(--tilt-x)) rotateY(calc(var(--tilt-y) + var(--scroll-lean))) translateY(var(--scroll-shift))",
              transition: "transform 200ms ease-out",
              willChange: "transform",
            }}
          >
            <img
              src={src}
              alt={alt}
              width={662}
              height={900}
              loading="lazy"
              className="w-full border border-border"
              style={{ filter: "drop-shadow(0 30px 60px oklch(0.68 0.26 350 / 34%))" }}
            />

            {/* Cursor-tracking sheen, as on the merch shot */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-300"
              style={{
                opacity: "calc(var(--glare) * 0.55)",
                background:
                  "radial-gradient(340px circle at var(--point-x) var(--point-y), oklch(1 0 0 / 22%), transparent 62%)",
                mixBlendMode: "screen",
              }}
            />

            {/* Zoom affordance */}
            <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-2 bg-background/85 backdrop-blur border border-border px-3 py-1.5 mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground opacity-0 group-hover/poster:opacity-100 group-focus-visible/poster:opacity-100 transition-opacity">
              Expand ⤢
            </span>
          </button>
        </div>
      </TiltCard>

      {caption && (
        <p className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground text-center">
          {caption}
        </p>
      )}

      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={onDialogClick}
        aria-label={alt}
        className="backdrop:bg-black/85 backdrop:backdrop-blur-sm bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full"
      >
        <div className="relative w-full h-full flex items-center justify-center p-3 sm:p-6">
          <img
            src={large}
            alt={alt}
            className="max-w-full max-h-[94vh] w-auto h-auto object-contain border border-border shadow-2xl"
          />

          {/* Chrome floats over the image so the poster gets the whole viewport */}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 sm:top-6 sm:right-6 h-11 w-11 grid place-items-center bg-background/85 backdrop-blur border border-border mono text-sm hover:border-primary hover:text-primary transition-colors"
          >
            ✕
          </button>
          {caption && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/85 backdrop-blur border border-border px-4 py-2 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap max-w-[92vw] overflow-hidden text-ellipsis">
              {caption}
            </span>
          )}
        </div>
      </dialog>
    </>
  );
}
