type LogoProps = {
  variant?: "horizontal" | "vertical" | "icon";
  monochrome?: "none" | "white" | "black";
  className?: string;
};

/**
 * MediaLife.AI Logo
 * - Icon: concentric ring + ember dot (brand mark)
 * - Horizontal: mark + wordmark side-by-side
 * - Vertical: mark above wordmark
 */
export function Logo({ variant = "horizontal", monochrome = "none", className }: LogoProps) {
  const gid = `lg-${variant}-${monochrome}`;
  const ringStroke =
    monochrome === "white" ? "#fff" : monochrome === "black" ? "#000" : `url(#${gid}-ring)`;
  const dotFill =
    monochrome === "white" ? "#fff" : monochrome === "black" ? "#000" : `url(#${gid}-dot)`;
  const wordColor =
    monochrome === "white" ? "#fff" : monochrome === "black" ? "#000" : "currentColor";
  const dotAccent =
    monochrome === "white" ? "#fff" : monochrome === "black" ? "#000" : "var(--accent)";

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
      <span className={className} aria-label="MediaLife.AI">
        <Mark size={48} />
      </span>
    );
  }

  if (variant === "vertical") {
    return (
      <div className={`inline-flex flex-col items-center gap-3 ${className ?? ""}`}>
        <Mark size={56} />
        <div className="mono text-xs tracking-[0.28em] uppercase" style={{ color: wordColor }}>
          MediaLife
          <span style={{ color: dotAccent }}>.</span>AI
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Mark size={28} />
      <div className="mono text-xs tracking-[0.22em] uppercase" style={{ color: wordColor }}>
        MediaLife
        <span style={{ color: dotAccent }}>.</span>AI
      </div>
    </div>
  );
}
