// Shared capture module (xr-capture): one implementation of countdown, flash, compositing, review sheet, save/share
// and the reveal / behind-the-scenes players, used by the Selfie (modes/face) and 3D Photo (modes/photo) modes.
//
//   const img = await engineShot(ctx.engine);            // camera + 3D as drawn (mirror image in Selfie)
//   const { blob } = await compose(img, drawMyFrameArt); // JPEG 0.9, long edge 1600..1920
//   ctx.capture(blob);                                   // the app hears `photo`
//   review.show(blob);                                   // Save / Share / Retake (+ reveal, behind the scenes)
//
// Everything frees what it made: object URLs on close, video elements paused, src removed and detached.
export { Countdown, flash } from './countdown';
export { compose, drawCover, engineShot, JPEG_QUALITY, MAX_EDGE, type OverlayFn } from './compose';
export { ReviewSheet, type ReviewOptions } from './review';
export { RevealPlayer, BtsPlayer, REVEAL_URL, BTS_URL } from './reveal';
export { photoFile, saveBlob, shareFile, canShareFile } from './share';
export { chromaMaterial } from './chroma';
export { el, esc, CICON, actionButton, iconButton, segmented, loadImage } from './ui';
export { recorder, clipHold, clipExt, CLIP_MAX_S } from './recorder';
