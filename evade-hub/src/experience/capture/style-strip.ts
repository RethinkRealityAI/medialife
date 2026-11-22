// The live frame + filter picker (selfie), Snapchat-style: one row of round glass chips above the shutter, each with
// a tiny preview of what it does and its name under it. Frames first, a thin divider, then filters. A tap applies it
// to the live view at once (the frame on the overlay canvas, the filter as a cheap CSS look on the camera canvas) and
// to the next photo exactly (frame-art.ts draws the same frame and runs the per-pixel filter). Two radio groups, so
// screen readers hear "Frame, Blossom, selected" etc; the row scrolls sideways on narrow phones.
import { el, esc, loadImage } from './ui';
import { FRAME_STYLES, PHOTO_FILTERS, applyFilter, drawFrameArt, loadFrameArt, type FrameStyle, type PhotoFilter } from './frame-art';

/** The live look of each filter on the camera canvas (close to applyFilter, GPU-cheap on every phone). */
export const FILTER_CSS: Record<PhotoFilter, { filter: string; tint: string }> = {
  natural: { filter: '', tint: '' },
  warm: { filter: 'sepia(0.16) saturate(1.12) brightness(1.03)', tint: '' },
  sakura: { filter: 'brightness(1.02)', tint: 'rgba(255, 183, 201, 0.14)' },
  mono: { filter: 'grayscale(1) contrast(1.12)', tint: '' },
};

export interface StyleStrip {
  el: HTMLElement;
  set(frame: FrameStyle, filter: PhotoFilter): void;
}

const PX = 112; // preview canvas size (drawn at 2x for a 56 px chip)

export function styleStrip(frame: FrameStyle, filter: PhotoFilter, onPick: (frame: FrameStyle, filter: PhotoFilter) => void): StyleStrip {
  const wrap = el('div', 'cbc-strip');
  const row = el('div', 'cbc-strip-row');
  wrap.appendChild(row);
  let cur = { frame, filter };
  const frameBtns = new Map<FrameStyle, HTMLButtonElement>();
  const filterBtns = new Map<PhotoFilter, HTMLButtonElement>();

  // each group: its chips, and a small caption under them ("Select frame" / "Select filter", Dapo round 5)
  const group = (label: string, caption: string) => {
    const sec = el('div', 'cbc-strip-sec');
    const g = el('div', 'cbc-strip-group');
    g.setAttribute('role', 'radiogroup');
    g.setAttribute('aria-label', label);
    const cap = el('span', 'cbc-strip-cap', esc(caption));
    cap.setAttribute('aria-hidden', 'true');
    sec.append(g, cap);
    row.appendChild(sec);
    return g;
  };
  const chip = (g: HTMLElement, label: string, onClick: () => void) => {
    const b = el('button', 'cbc-chipc', `<span class="cbc-chipc-face"><canvas width="${PX}" height="${PX}" aria-hidden="true"></canvas></span><span class="cbc-chipc-label">${esc(label)}</span>`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); });
    g.appendChild(b);
    return b;
  };

  const fg = group('Frame', 'Select frame');
  for (const f of FRAME_STYLES) frameBtns.set(f.id, chip(fg, f.label, () => { cur = { ...cur, frame: f.id }; sync(); onPick(cur.frame, cur.filter); }));
  row.appendChild(el('span', 'cbc-strip-div'));
  const lg = group('Filter', 'Select filter');
  for (const f of PHOTO_FILTERS) filterBtns.set(f.id, chip(lg, f.label, () => { cur = { ...cur, filter: f.id }; sync(); onPick(cur.frame, cur.filter); }));

  const sync = () => {
    for (const [k, b] of frameBtns) b.setAttribute('aria-checked', String(k === cur.frame));
    for (const [k, b] of filterBtns) b.setAttribute('aria-checked', String(k === cur.filter));
  };
  sync();

  // previews: a frame drawn over a plain sky; a filter run over Happi's happy head
  void loadFrameArt().then(() => {
    // draw each frame on a phone-shaped page, then show the telling corner of it in the circle
    const page = document.createElement('canvas');
    page.width = 300; page.height = 400;
    const pg = page.getContext('2d')!;
    for (const [id, b] of frameBtns) {
      pg.clearRect(0, 0, 300, 400);
      pg.fillStyle = '#8fd0f2'; pg.fillRect(0, 0, 300, 400);
      pg.fillStyle = '#f4d9c6'; pg.beginPath(); pg.ellipse(150, 230, 70, 90, 0, 0, Math.PI * 2); pg.fill();
      drawFrameArt(pg, 300, 400, { title: true, frame: id });
      const g = b.querySelector('canvas')!.getContext('2d')!;
      // zoom on the part that tells them apart: the blossom branch / the checker corner / the lockup
      const [sx, sy, sw] = id === 'clean' ? [150, 285, 150] : id === 'parade' ? [130, 260, 170] : [0, 0, 190];
      g.drawImage(page, sx, sy, sw, sw, 0, 0, PX, PX);
    }
  });
  void loadImage('/evade/hub/img/happi/head-happy.webp').then((img) => {
    for (const [id, b] of filterBtns) {
      const g = b.querySelector('canvas')!.getContext('2d', { willReadFrequently: true })!;
      g.fillStyle = '#8fd0f2'; g.fillRect(0, 0, PX, PX);
      if (img) {
        const s = PX * 0.92 / Math.max(img.naturalWidth, img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        g.drawImage(img, (PX - w) / 2, (PX - h) / 2 + PX * 0.04, w, h);
      }
      applyFilter(g, PX, PX, id);
    }
  });

  return { el: wrap, set(f, l) { cur = { frame: f, filter: l }; sync(); } };
}
