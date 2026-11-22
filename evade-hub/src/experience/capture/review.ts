// The photo review sheet: full screen (z-index 60, over the HUD), the photo, Save, Share, Retake, and optionally
// "Watch photo animation" and "Behind the scenes". The bottom of the sheet keeps the app's talk-button corner free
// (padding = --cbx-reserved), so no control sits under it.
import { actionButton, CICON, el, iconButton } from './ui';
import { photoFile, saveBlob, shareFile } from './share';
import { clipExt } from './recorder';

export interface ReviewOptions {
  container: HTMLElement;
  /** File name stem, e.g. 'cheer-bear-selfie'. */
  name: string;
  share: { title: string; text: string };
  title?: string;
  onRetake(): void;
  /** Show "Watch photo animation". */
  onReveal?: (blob: Blob) => void;
  /** Show "Behind the scenes". */
  onBts?: () => void;
  /** Post-snap choices (frame and filter chips). `restyle` recomposes the photo; the sheet swaps it in. */
  styles?: ReviewStyles;
}

export interface ReviewStyles {
  frames: Array<{ id: string; label: string }>;
  filters: Array<{ id: string; label: string }>;
  frame: string;
  filter: string;
  restyle(frame: string, filter: string): Promise<Blob>;
  /** The photo changed (the mode keeps the latest for its diagnostics / reveal). */
  onChange?(blob: Blob, frame: string, filter: string): void;
}

export class ReviewSheet {
  private node: HTMLElement | null = null;
  private url: string | null = null;
  private blob: Blob | null = null;
  private file: File | null = null;
  private status: HTMLElement | null = null;
  private statusT = 0;
  private prevFocus: Element | null = null;
  private img: HTMLImageElement | null = null;
  private styleJob = 0;

  constructor(private o: ReviewOptions) {}

  get open(): boolean {
    return !!this.node;
  }
  get photoUrl(): string | null {
    return this.url;
  }

  show(blob: Blob): void {
    this.close();
    const video = blob.type.startsWith('video');
    this.blob = blob;
    this.file = photoFile(blob, `${this.o.name}-${stamp()}.${video ? clipExt(blob) : 'jpg'}`);
    this.url = URL.createObjectURL(blob);
    this.prevFocus = document.activeElement;
    const title = video ? 'Your video' : (this.o.title ?? 'Your photo');

    const n = el('div', 'cbc-review');
    n.setAttribute('role', 'dialog');
    n.setAttribute('aria-modal', 'true');
    n.setAttribute('aria-label', title);
    const top = el('div', 'cbc-rv-top');
    top.appendChild(iconButton(CICON.close, 'Back to the camera', () => this.retake()));
    top.appendChild(el('h2', '', title));
    const ph = el('div', 'cbc-rv-photo');
    if (video) {
      // the clip plays on a loop, muted, inline (no fullscreen takeover on iPhone)
      const v = el('video') as HTMLVideoElement;
      v.src = this.url;
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-label', 'Your video with Happi');
      ph.appendChild(v);
      void v.play().catch(() => { /* autoplay refused: the poster frame stays */ });
    } else {
      const img = el('img');
      img.src = this.url;
      img.alt = 'Your photo with Happi';
      ph.appendChild(img);
      this.img = img;
    }

    const acts = el('div', 'cbc-rv-actions');
    // one compact row (Dapo, 2026-11-20: the photo big, the buttons smaller): Retake (navy), Save, Share
    const r1 = el('div', 'row main');
    r1.append(
      actionButton('Retake', CICON.retake, () => this.retake(), 'navy'),
      actionButton('Save', CICON.save, () => this.save()),
      actionButton('Share', CICON.share, () => void this.share()),
    );
    const st = video ? undefined : this.o.styles;
    if (st) acts.append(this.styleRows(st));
    acts.append(r1);
    if (this.o.onReveal && !video) {
      const r2 = el('div', 'row');
      r2.append(actionButton('Watch photo animation', CICON.play, () => this.blob && this.o.onReveal!(this.blob), 'alt'));
      acts.append(r2);
    }
    const foot = el('div', 'row foot');
    if (this.o.onBts && !video) foot.append(actionButton('Behind the scenes', CICON.clapper, () => this.o.onBts!(), 'ghost'));
    this.status = el('p', 'cbc-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    foot.append(this.status);
    acts.append(foot);

    n.append(top, ph, acts);
    n.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.retake(); });
    this.o.container.appendChild(n);
    this.node = n;
    (r1.children[1] as HTMLElement).focus({ preventScroll: true });
  }

  /** Two rows of chips: Frame (Blossom, Parade, Clean) and Filter (Natural, Warm, Sakura, Mono). */
  private styleRows(st: ReviewStyles): HTMLElement {
    const box = el('div', 'cbc-rv-styles');
    let frame = st.frame, filter = st.filter;
    const row = (label: string, items: Array<{ id: string; label: string }>, cur: () => string, set: (id: string) => void) => {
      const r = el('div', 'cbc-chips');
      r.setAttribute('role', 'group');
      r.setAttribute('aria-label', label);
      r.appendChild(el('span', 'lbl', label));
      const btns: HTMLButtonElement[] = [];
      for (const it of items) {
        const b = el('button', 'cbc-chip', it.label) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.id = it.id;
        b.setAttribute('aria-pressed', String(it.id === cur()));
        b.addEventListener('click', () => {
          if (it.id === cur()) return;
          set(it.id);
          btns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === it.id)));
          void this.restyle(st, frame, filter);
        });
        btns.push(b);
        r.appendChild(b);
      }
      return r;
    };
    box.append(
      row('Frame', st.frames, () => frame, (id) => { frame = id; }),
      row('Filter', st.filters, () => filter, (id) => { filter = id; }),
    );
    return box;
  }

  private async restyle(st: ReviewStyles, frame: string, filter: string): Promise<void> {
    const job = ++this.styleJob;
    this.node?.classList.add('cbc-busy');
    try {
      const blob = await st.restyle(frame, filter);
      if (job !== this.styleJob || !this.node || !this.img) return; // a newer choice, or the sheet closed
      if (this.url) URL.revokeObjectURL(this.url);
      this.blob = blob;
      this.file = photoFile(blob, `${this.o.name}-${stamp()}.jpg`);
      this.url = URL.createObjectURL(blob);
      this.img.src = this.url;
      st.onChange?.(blob, frame, filter);
    } catch (e) {
      console.warn('[review] restyle failed', e);
      this.say('That look did not work. Try another?');
    } finally {
      if (job === this.styleJob) this.node?.classList.remove('cbc-busy');
    }
  }

  private say(text: string): void {
    if (!this.status) return;
    this.status.textContent = text;
    clearTimeout(this.statusT);
    this.statusT = window.setTimeout(() => { if (this.status) this.status.textContent = ''; }, 3500);
  }

  private save(): void {
    if (!this.file) return;
    const what = this.file.type.startsWith('video') ? 'video' : 'photo';
    this.say(saveBlob(this.file, this.file.name) ? 'Saved to your downloads' : `Press and hold the ${what} to save it`);
  }

  private async share(): Promise<void> {
    if (!this.file) return;
    const r = await shareFile(this.file, this.o.share); // first thing in the tap: keeps the user activation
    if (r === 'saved') this.say('Saved. Share it from your photos');
    else if (r === 'failed') this.say('Press and hold the photo to save it');
  }

  private retake(): void {
    this.close();
    this.o.onRetake();
  }

  close(): void {
    clearTimeout(this.statusT);
    this.node?.remove();
    this.node = null;
    this.status = null;
    this.img = null;
    this.styleJob++;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.blob = null;
    this.file = null;
    const f = this.prevFocus as HTMLElement | null;
    this.prevFocus = null;
    if (f && f.isConnected && typeof f.focus === 'function') f.focus({ preventScroll: true });
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
