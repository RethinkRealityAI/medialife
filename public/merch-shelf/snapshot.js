/**
 * Images of the shelf: the framed PNG a visitor saves ("Save image") and the
 * raw hero render the admin builder asks for over postMessage.
 */
import { makeCanvas, FONT_SANS, FONT_MONO } from "./art.js";

const pad = (h) => ({
  top: Math.round(h * 0.05),
  bottom: Math.round(h * 0.035),
  left: 0,
  right: 0,
});

/** Raw hero view at w×h, as a PNG data URL (null if the canvas can't be read). */
export function heroDataUrl(app, w, h) {
  try {
    const c = app.scene.snapshot(Math.round(w), Math.round(h), { insetsOverride: pad(h) });
    return c.toDataURL("image/png");
  } catch (e) {
    console.warn("[shelf] snapshot failed", e);
    return null;
  }
}

/** The hero view with a slim branded frame: "{name} × MEDIALIFE · Activated merch". */
export function framedCanvas(app, W, H) {
  const bar = Math.round(H * 0.07);
  const shot = app.scene.snapshot(W, H - bar, { insetsOverride: pad(H - bar) });
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#05060c";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(shot, 0, 0);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#19affe");
  g.addColorStop(1, "#ff37ae");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - bar, W, Math.max(2, Math.round(bar * 0.05)));
  const fs = Math.round(bar * 0.36);
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fs}px ${FONT_SANS}`;
  ctx.fillStyle = "#f4f5f8";
  const y = H - bar / 2 + bar * 0.03;
  const gutter = Math.round(bar * 0.55);
  const left = `${app.config.creator.name} × MEDIALIFE`;
  ctx.fillText(left, gutter, y);
  const lw = ctx.measureText(left).width;
  ctx.font = `500 ${Math.round(fs * 0.78)}px ${FONT_MONO}`;
  ctx.fillStyle = "#a4a7b6";
  ctx.fillText("  ·  ACTIVATED MERCH", gutter + lw, y);
  ctx.textAlign = "right";
  ctx.fillText("medialife.ai", W - gutter, y);
  return c;
}

export async function saveImage(app, W, H) {
  const c = framedCanvas(app, W, H);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  if (!blob) return false;
  const a = document.createElement("a");
  const slug =
    app.config.creator.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "shelf";
  a.download = `${slug}-activated-merch-${W}x${H}.png`;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
