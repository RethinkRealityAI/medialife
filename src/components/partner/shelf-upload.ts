/**
 * Partner Hub image uploads for merch shelves (a creator's logo, a print, the
 * link-preview snapshot): init → PUT each chunk → complete, against
 * /api/hub/shelf-assets (see src/routes/api.hub.shelf-assets*.ts). The file
 * lands in the public asset store, so the shelf page can show it at
 * /api/ar/asset/<id>.
 */
const HEADERS = { "x-hub": "1" };

async function errorText(res: Response) {
  try {
    return ((await res.json()) as { error?: string }).error ?? `Upload failed (${res.status})`;
  } catch {
    return `Upload failed (${res.status})`;
  }
}

export const SHELF_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadShelfImage(
  blob: Blob,
  meta: { name: string; mime: string; tags?: string[]; width?: number; height?: number },
): Promise<{ id: string }> {
  const init = await fetch("/api/hub/shelf-assets", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({
      name: meta.name,
      size: blob.size,
      kind: "image",
      mime: meta.mime,
      tags: meta.tags,
      width: meta.width,
      height: meta.height,
    }),
  });
  if (!init.ok) throw new Error(await errorText(init));
  const { id, chunkSize, chunks } = (await init.json()) as {
    id: string;
    chunkSize: number;
    chunks: number;
  };
  for (let n = 0; n < chunks; n++) {
    const part = blob.slice(n * chunkSize, Math.min(blob.size, (n + 1) * chunkSize));
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`/api/hub/shelf-assets/${id}/chunks/${n}`, {
        method: "PUT",
        headers: { ...HEADERS, "content-type": "application/octet-stream" },
        body: part,
      });
      if (res.ok) break;
      if (attempt >= 2 || res.status < 500) throw new Error(await errorText(res));
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  const done = await fetch(`/api/hub/shelf-assets/${id}/complete`, {
    method: "POST",
    headers: HEADERS,
  });
  if (!done.ok) throw new Error(await errorText(done));
  return (await done.json()) as { id: string };
}

/** Pixel size of an image file, so the asset store records it. */
export async function imageSize(file: Blob): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return {};
  }
}
