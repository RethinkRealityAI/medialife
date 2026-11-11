import type { CSSProperties } from "react";
import { InViewVideo } from "./InViewVideo";

/**
 * Immersive marketing, shown rather than told: the real Netflix campaign
 * pieces (the ONE PIECE Den of Geek cover, the Sakamoto Days poster, the
 * life-size standee and the NFC tap sticker) fanned out behind a phone that
 * plays the campaign recap. The pieces fan out as the block scrolls in, and
 * spread a little further on hover.
 *
 * Positions are in % of the stage (x of its width, y of its height, from the
 * centre); heights are in % of its height. Pieces are cut from our own deck
 * art and campaign files (no AI image tools).
 */
type Piece = {
  src: string;
  alt: string;
  x: number;
  y: number;
  h: number;
  r: number;
  z: number;
  /** Fan-out order */
  k: number;
  kind?: "print" | "cutout" | "sticker";
};

const PIECES: Piece[] = [
  {
    src: "/home/ar/one-piece.webp",
    alt: "The activated ONE PIECE Den of Geek cover",
    x: -29,
    y: -7,
    h: 66,
    r: -12,
    z: 1,
    k: 0,
  },
  {
    src: "/home/ar/sakamoto.webp",
    alt: "The activated Sakamoto Days Den of Geek poster",
    x: 27,
    y: -11,
    h: 60,
    r: 10,
    z: 1,
    k: 1,
  },
  {
    src: "/home/marketing/sakamoto-standee.webp",
    alt: "The life-size Sakamoto Days retail standee",
    x: 33,
    y: 9,
    h: 84,
    r: 3,
    z: 2,
    k: 2,
    kind: "cutout",
  },
  {
    src: "/home/marketing/sakamoto-nfc-sticker.webp",
    alt: "The NFC tap-to-activate sticker",
    x: -27,
    y: 29,
    h: 27,
    r: -9,
    z: 3,
    k: 3,
    kind: "sticker",
  },
];

export function MarketingCollage({ className = "" }: { className?: string }) {
  return (
    <div className={`mc-stage relative ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[8%] rounded-full bg-accent/25 blur-[80px]"
      />
      <ul className="contents">
        {PIECES.map((p) => (
          <li
            key={p.src}
            className={`mc-piece mc-piece--${p.kind ?? "print"} absolute left-1/2 top-1/2`}
            style={
              {
                "--x": p.x,
                "--y": p.y,
                "--r": `${p.r}deg`,
                "--k": p.k,
                height: `${p.h}%`,
                zIndex: p.z,
              } as CSSProperties
            }
          >
            <img
              src={p.src}
              alt={p.alt}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-auto max-w-none select-none"
            />
          </li>
        ))}
      </ul>
      <div className="mc-phone absolute left-1/2 top-1/2 z-[5] aspect-[360/642] h-[94%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-full overflow-hidden rounded-[30px] border-[5px] border-[#16171c] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.12)]">
          <InViewVideo
            src="/home/marketing/sakamoto-recap.mp4"
            poster="/home/marketing/sakamoto-recap.webp"
            label="Fans scanning the activated Sakamoto Days posters and standee at retail and conventions"
            className="h-full w-full object-cover"
          />
          <span
            aria-hidden
            className="absolute left-1/2 top-2 h-[14px] w-[34%] -translate-x-1/2 rounded-full bg-black"
          />
        </div>
      </div>
    </div>
  );
}
