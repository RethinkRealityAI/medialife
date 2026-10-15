import { memo } from "react";

/**
 * A stand-in "stream" behind the overlay preview: a blocky night landscape
 * (the Snowday roster plays a lot of Minecraft) and a facecam, drawn in one
 * SVG so it costs no image download. Deterministic, so SSR and the client
 * draw the same thing. Slightly defocused, the way gameplay sits behind an
 * overlay on a real stream.
 */

const W = 1920;
const H = 1080;
const B = 48;

/** Smooth-ish deterministic terrain: a sum of sines, snapped to the block grid. */
function ridge(base: number, amp: number, seed: number) {
  const cols = Math.ceil(W / B) + 1;
  const rects: Array<[x: number, y: number]> = [];
  for (let i = 0; i < cols; i++) {
    const t = i / cols;
    const n =
      Math.sin(t * 6.1 + seed) * 0.55 +
      Math.sin(t * 13.7 + seed * 2.3) * 0.3 +
      Math.sin(t * 29.3 + seed * 4.1) * 0.15;
    const y = Math.round((base - n * amp) / B) * B;
    rects.push([i * B, y]);
  }
  return rects;
}

function stars() {
  const out: Array<[number, number, number]> = [];
  let s = 7;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 90; i++) out.push([r() * W, r() * 520, r() < 0.15 ? 6 : 3]);
  return out;
}

const FAR = ridge(560, 150, 1.3);
const MID = ridge(720, 110, 4.2);
const NEAR = ridge(880, 70, 8.9);
const STARS = stars();

function Layer({ cols, fill, top }: { cols: Array<[number, number]>; fill: string; top?: string }) {
  return (
    <g>
      {cols.map(([x, y]) => (
        <rect key={x} x={x} y={y} width={B + 0.5} height={H - y} fill={fill} />
      ))}
      {top
        ? cols.map(([x, y]) => (
            <rect key={`t${x}`} x={x} y={y} width={B + 0.5} height={B / 4} fill={top} />
          ))
        : null}
    </g>
  );
}

export const StreamScene = memo(function StreamScene({
  facecam = "top",
  className,
}: {
  facecam?: "top" | "bottom" | "none";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#070a1f" }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          filter: "blur(1.2px) saturate(1.1)",
          transform: "scale(1.02)",
        }}
      >
        <defs>
          <linearGradient id="mls-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#050818" />
            <stop offset="0.45" stopColor="#151240" />
            <stop offset="0.72" stopColor="#3b1a5e" />
            <stop offset="1" stopColor="#5a2160" />
          </linearGradient>
          <radialGradient id="mls-glow" cx="0.5" cy="0.62" r="0.6">
            <stop offset="0" stopColor="#ff2fae" stopOpacity="0.35" />
            <stop offset="0.5" stopColor="#7a3cff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mls-moon" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#bfe9ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#bfe9ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mls-torch" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffb347" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mls-fog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1446" stopOpacity="0" />
            <stop offset="1" stopColor="#1a1446" stopOpacity="0.85" />
          </linearGradient>
          <radialGradient id="mls-vignette" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.65" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#mls-sky)" />
        <rect width={W} height={H} fill="url(#mls-glow)" />
        {STARS.map(([x, y, s], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width={s}
            height={s}
            fill="#dff3ff"
            opacity={0.35 + (i % 5) * 0.12}
          />
        ))}
        <circle cx={1080} cy={170} r={200} fill="url(#mls-moon)" />
        <rect x={1025} y={115} width={110} height={110} fill="#e9f6ff" />
        <rect x={1045} y={140} width={22} height={22} fill="#cfe3f2" />
        <rect x={1090} y={180} width={18} height={18} fill="#cfe3f2" />
        {/* blocky clouds */}
        <g fill="#c8d6ff" opacity="0.07">
          <rect x={180} y={170} width={288} height={48} />
          <rect x={228} y={122} width={144} height={48} />
          <rect x={760} y={260} width={336} height={48} />
          <rect x={856} y={212} width={192} height={48} />
          <rect x={1620} y={330} width={240} height={48} />
        </g>
        <Layer cols={FAR} fill="#1d1846" />
        <rect y={420} width={W} height={300} fill="url(#mls-fog)" />
        <Layer cols={MID} fill="#1a1538" top="#2c6f74" />
        {/* a lit window and a torch glow, for life */}
        <rect x={1104} y={MID[23][1] + 48} width={24} height={24} fill="#ffcf6b" opacity="0.85" />
        <circle cx={1116} cy={MID[23][1] + 60} r={90} fill="url(#mls-torch)" />
        <Layer cols={NEAR} fill="#0d0b20" top="#1f5a52" />
        <rect width={W} height={H} fill="url(#mls-vignette)" />
      </svg>

      {facecam !== "none" ? (
        <div
          style={{
            position: "absolute",
            right: "2.9%",
            [facecam === "top" ? "top" : "bottom"]: "4.4%",
            width: "21%",
            aspectRatio: "16 / 9",
            borderRadius: "clamp(4px, 0.9vw, 14px)",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.7)",
            background:
              "radial-gradient(60% 80% at 30% 20%, #3a2f6b 0%, #18142e 60%, #0e0c1c 100%)",
          }}
        >
          {/* silhouette: a headset-wearing streamer */}
          <svg
            viewBox="0 0 160 90"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <defs>
              <linearGradient id="mls-rim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#19affe" stopOpacity="0.55" />
                <stop offset="1" stopColor="#ff2fae" stopOpacity="0.55" />
              </linearGradient>
            </defs>
            <rect x="110" y="8" width="40" height="26" rx="2" fill="#ff2fae" opacity="0.18" />
            <rect x="12" y="14" width="26" height="40" rx="2" fill="#19affe" opacity="0.12" />
            <ellipse cx="80" cy="96" rx="44" ry="30" fill="#07060f" />
            <circle cx="80" cy="44" r="17" fill="#07060f" />
            <path d="M61 44a19 19 0 0 1 38 0" fill="none" stroke="url(#mls-rim)" strokeWidth="3" />
            <rect x="57" y="40" width="7" height="12" rx="3" fill="#1b1830" />
            <rect x="96" y="40" width="7" height="12" rx="3" fill="#1b1830" />
            <ellipse
              cx="80"
              cy="96"
              rx="44"
              ry="30"
              fill="none"
              stroke="url(#mls-rim)"
              strokeWidth="1.5"
              opacity="0.6"
            />
          </svg>
        </div>
      ) : null}
    </div>
  );
});
