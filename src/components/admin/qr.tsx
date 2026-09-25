import { useMemo } from "react";

import { qrPath } from "./qr-matrix";

/** A scannable QR code as inline SVG (dark on white, with a quiet zone). */
export function QrCode({
  value,
  className,
  title,
}: {
  value: string;
  className?: string;
  title?: string;
}) {
  const { d, size } = useMemo(() => qrPath(value), [value]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={title ?? "QR code"}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
