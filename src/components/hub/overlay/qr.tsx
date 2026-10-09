import { useMemo } from "react";

import { qrPath } from "@/components/admin/qr-matrix";

/**
 * A real, scannable QR: dark modules on white, with the quiet zone that
 * qrPath() builds in. The rounded white plate around it is the card's job.
 */
export function OverlayQr({ value, className }: { value: string; className?: string }) {
  const qr = useMemo(() => {
    try {
      return qrPath(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#07070c" />
    </svg>
  );
}
