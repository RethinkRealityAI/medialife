import QRCode from "qrcode";

// QR codes for client links, drawn from the `qrcode` package's module matrix.
// Always dark modules on white with a quiet zone, so they scan from a screen,
// a slide or paper regardless of the page theme.

const QUIET = 2;

function matrix(value: string) {
  return QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
}

/** One SVG path for all dark modules (a rect per module would be thousands of nodes). */
export function qrPath(value: string): { d: string; size: number } {
  const m = matrix(value);
  let d = "";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.get(y, x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < m.size && m.get(y, x)) x++;
      d += `M${start + QUIET} ${y + QUIET}h${x - start}v1h-${x - start}z`;
    }
  }
  return { d, size: m.size + QUIET * 2 };
}

export function qrSvgString(value: string): string {
  const { d, size } = qrPath(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 12}" height="${size * 12}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** A PNG at `scale` px per module, drawn on a canvas. */
export function qrPngBlob(value: string, scale = 16): Promise<Blob | null> {
  const m = matrix(value);
  const size = (m.size + QUIET * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++)
      if (m.get(y, x)) ctx.fillRect((x + QUIET) * scale, (y + QUIET) * scale, scale, scale);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
