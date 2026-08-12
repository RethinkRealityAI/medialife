type LogoProps = {
  variant?: "horizontal" | "vertical" | "icon" | "lockup";
  monochrome?: "none" | "white" | "black";
  className?: string;
};

/**
 * MEDIALIFE logo.
 *
 * The wordmark and the full "ACTIVATED BY MEDIALIFE™" lockup are the OFFICIAL
 * supplied artwork (public/brand/*.webp) — do not re-typeset them. Both files
 * are pure white on transparency, which is why the black variant is produced
 * with `filter: invert(1)`: on a pure-white-on-alpha source that inverts to
 * pure black with no colour drift, and it keeps one asset instead of two.
 *
 * The gradient orb is the brand mark and stays drawn as SVG so it can inherit
 * the ember gradient and scale losslessly.
 *
 * "ACTIVATED BY MEDIALIFE™" is an endorsement lockup for partner surfaces —
 * posters, standees, merch. On MEDIALIFE's own surfaces use the wordmark
 * (horizontal / vertical); reach for `lockup` only when showing the
 * endorsement mark itself, as the brand page does.
 */
export function Logo({ variant = "horizontal", monochrome = "none", className }: LogoProps) {
  const gid = `lg-${variant}-${monochrome}`;
  const ringStroke =
    monochrome === "white" ? "#fff" : monochrome === "black" ? "#000" : `url(#${gid}-ring)`;
  const dotFill =
    monochrome === "white" ? "#fff" : monochrome === "black" ? "#000" : `url(#${gid}-dot)`;
  const invert = monochrome === "black" ? { filter: "invert(1)" } : undefined;

  const Defs = (
    <defs>
      <linearGradient id={`${gid}-ring`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="oklch(0.72 0.16 240)" />
        <stop offset="100%" stopColor="oklch(0.68 0.26 350)" />
      </linearGradient>
      <radialGradient id={`${gid}-dot`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="oklch(0.78 0.18 240)" />
        <stop offset="100%" stopColor="oklch(0.68 0.26 350)" />
      </radialGradient>
    </defs>
  );

  const Mark = ({ size = 32 }: { size?: number }) => (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" aria-hidden>
      {Defs}
      <circle cx="24" cy="24" r="22" stroke={ringStroke} strokeWidth="1" opacity="0.4" />
      <circle cx="24" cy="24" r="15" stroke={ringStroke} strokeWidth="1.25" />
      <circle cx="24" cy="24" r="7" fill={dotFill} />
    </svg>
  );

  if (variant === "icon") {
    return (
      <span className={className} aria-label="MEDIALIFE">
        <Mark size={48} />
      </span>
    );
  }

  if (variant === "lockup") {
    return (
      <img
        src="/brand/medialife-lockup.webp"
        alt="Activated by MEDIALIFE"
        width={686}
        height={183}
        style={invert}
        className={`h-auto w-full max-w-[280px] ${className ?? ""}`}
      />
    );
  }

  if (variant === "vertical") {
    return (
      <div className={`inline-flex flex-col items-center gap-3 ${className ?? ""}`}>
        <Mark size={56} />
        <Wordmark className="h-4 w-auto" style={invert} />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Mark size={28} />
      <Wordmark className="h-3.5 w-auto" style={invert} />
    </div>
  );
}

/**
 * The official MEDIALIFE™ wordmark. Width/height are the intrinsic asset size
 * so the browser reserves the right box before the image lands — a nav logo is
 * the worst place to ship layout shift.
 */
export function Wordmark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src="/brand/medialife-wordmark.webp"
      alt="MEDIALIFE"
      width={420}
      height={70}
      style={style}
      className={className}
    />
  );
}
