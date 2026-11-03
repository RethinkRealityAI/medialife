/**
 * Browser side of Creator Hub downloads.
 *
 * A streamed function response tops out near 20 MB on Netlify, so the server
 * answers range requests in pieces of at most HUB.maxResponseBytes (see
 * fileResponse). Small files download with a plain link; bigger ones are read
 * piece by piece here and saved from memory. Several files at once go into a
 * ZIP built in the browser (stored, not compressed: art files are compressed
 * already, and it keeps memory and time flat).
 */
import { HUB, fileUrl, type HubFile } from "./model";

type Progress = (fraction: number) => void;

/** The file's bytes, in range-request pieces. */
export async function fetchHubFile(
  f: Pick<HubFile, "creatorId" | "id" | "size" | "mime">,
  opts: { onProgress?: Progress; signal?: AbortSignal } = {},
): Promise<Blob> {
  return fetchRanged(fileUrl(f, true), f, opts);
}

/** Any Range-capable URL whose size is known, read in pieces of at most HUB.maxResponseBytes. */
export async function fetchRanged(
  url: string,
  f: { size: number; mime: string },
  opts: { onProgress?: Progress; signal?: AbortSignal } = {},
): Promise<Blob> {
  const parts: ArrayBuffer[] = [];
  let at = 0;
  while (at < f.size) {
    const end = Math.min(f.size, at + HUB.maxResponseBytes) - 1;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { headers: { range: `bytes=${at}-${end}` }, signal: opts.signal });
      if (res.ok || res.status < 500) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    if (!res?.ok) throw new Error(`Couldn't download the file (${res?.status ?? "network"}).`);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("The download stopped early. Try again.");
    parts.push(buf);
    // A 200 is the whole file (a server without ranges); otherwise keep going.
    at = res.status === 200 ? f.size : at + buf.byteLength;
    opts.onProgress?.(Math.min(1, at / f.size));
  }
  return new Blob(parts, { type: f.mime });
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** True when a plain link can carry the whole file in one response. */
export const directDownload = (f: Pick<HubFile, "size">) => f.size <= HUB.maxResponseBytes;

export async function downloadHubFile(
  f: Pick<HubFile, "creatorId" | "id" | "size" | "mime" | "name">,
  opts: { onProgress?: Progress; signal?: AbortSignal } = {},
) {
  if (directDownload(f)) {
    const a = document.createElement("a");
    a.href = fileUrl(f, true);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  saveBlob(await fetchHubFile(f, opts), f.name);
}

/* ---------------------------------------------------------------------------
   ZIP (store method, data written up front so sizes and CRCs are known)
   --------------------------------------------------------------------------- */

/** Most a browser-built ZIP may hold (it lives in memory until saved). */
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array, crc = 0) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  crc = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return ~crc >>> 0;
}

function dosTime(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** One name per entry: "a.png", "a (2).png", … */
function uniquePaths(paths: string[]) {
  const seen = new Set<string>();
  return paths.map((p) => {
    let out = p;
    const dot = p.lastIndexOf(".");
    const [base, ext] = dot > p.lastIndexOf("/") ? [p.slice(0, dot), p.slice(dot)] : [p, ""];
    for (let i = 2; seen.has(out.toLowerCase()); i++) out = `${base} (${i})${ext}`;
    seen.add(out.toLowerCase());
    return out;
  });
}

const safeSegment = (s: string) =>
  Array.from(s)
    .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? "_" : c))
    .join("")
    .replace(/^\.+/, "_")
    .trim() || "_";

export type ZipEntry = {
  file: HubFile;
  /** Folder path inside the ZIP, e.g. "Branding/Logos". */ dir?: string;
};

export async function downloadZip(
  entries: ZipEntry[],
  zipName: string,
  opts: { onProgress?: Progress; signal?: AbortSignal } = {},
) {
  const total = entries.reduce((s, e) => s + e.file.size, 0);
  if (total > ZIP_MAX_BYTES)
    throw new Error("That's more than 1 GB. Download fewer files at a time.");
  const enc = new TextEncoder();
  const paths = uniquePaths(
    entries.map((e) =>
      [...(e.dir ? e.dir.split("/").map(safeSegment) : []), safeSegment(e.file.name)].join("/"),
    ),
  );
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let done = 0;
  const { time, date } = dosTime(new Date());

  for (let i = 0; i < entries.length; i++) {
    const f = entries[i].file;
    const blob = await fetchHubFile(f, {
      signal: opts.signal,
      onProgress: (x) => opts.onProgress?.((done + x * f.size) / Math.max(1, total)),
    });
    const data = new Uint8Array(await blob.arrayBuffer());
    const name = enc.encode(paths[i]);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);

    offset += 30 + name.length + data.length;
    done += f.size;
  }

  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  parts.push(...central, end.buffer);

  opts.onProgress?.(1);
  saveBlob(new Blob(parts, { type: "application/zip" }), `${safeSegment(zipName)}.zip`);
}
