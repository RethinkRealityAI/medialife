// Save and share (the good parts of the old SmartShare.ts, fixed):
// - Share hands the photo FILE to the system share sheet (Web Share API level 2) when `canShare({ files })` says yes.
//   The File is built before the tap, so `navigator.share` is the first thing the tap does (iOS drops the user
//   activation across an `await fetch(dataUrl)`, which the old code did first).
// - Cancelling the share sheet (AbortError) is not an error. Any other failure, or no file sharing at all, falls back
//   to saving the file.
// - Save downloads through an object URL (no huge data URLs), freed shortly after.

export type ShareResult = 'shared' | 'cancelled' | 'saved' | 'failed';

export function photoFile(blob: Blob, name: string): File {
  const type = blob.type || 'image/jpeg';
  try {
    return new File([blob], name, { type, lastModified: Date.now() });
  } catch {
    // very old WebKit: no File constructor
    return Object.assign(blob, { name, lastModified: Date.now() }) as File;
  }
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Download the blob as a file. Returns false if the browser refused. */
export function saveBlob(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch {
    return false;
  }
}

/** Call straight from a tap handler (no await before it). */
export async function shareFile(file: File, text: { title: string; text: string }): Promise<ShareResult> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: text.title, text: text.text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (activation lost) or a share target that failed: save instead
    }
  }
  return saveBlob(file, file.name) ? 'saved' : 'failed';
}
