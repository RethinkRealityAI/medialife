/* Key-art composer for the activated-retail engine.
 *
 * The "Your IP" re-skin from the Roblox demo (public/roblox/activated-retail/index.html),
 * lifted out so the engine can compose every fixture graphic from one key-art image:
 * palette + smart crop + one canvas per graphic slot (towers, totem, hero screen, video
 * wall). Pure 2D-canvas code: no three.js.
 * Changes from the demo: ipcTowerR can draw a real QR code in its NFC tile (meta.qr), the
 * platform lines name the theme's site (meta.site) instead of Roblox, and the small export
 * surface at the end.
 */
const IPC_FD = 'Unbounded, "Arial Black", system-ui, sans-serif';
const IPC_FB = "Figtree, system-ui, sans-serif";
const IPC_FM = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const ipcMk = (w, h) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
const ipcRng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const ipcClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ipcFilterOK = (() => {
  try {
    const g = ipcMk(2, 2).getContext("2d");
    g.filter = "blur(2px)";
    return g.filter === "blur(2px)";
  } catch (e) {
    return false;
  }
})();

/* ---------- colour ---------- */
function ipcRgb2hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2;
  let h = 0,
    s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function ipcHsl2int(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + h * 12) % 12,
      a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
const ipcHex = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0");
const ipcMix = (a, b, k) => {
  const c = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
const ipcHueDist = (a, b) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

// Dominant vibrant colours via a saturation-weighted hue histogram on a ~48px thumbnail.
function ipcPalette(src) {
  const w = 48,
    h = ipcClamp(Math.round((48 * src.height) / src.width), 8, 96);
  const c = ipcMk(w, h),
    g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const B = 36;
  const wt = new Float32Array(B),
    hx = new Float32Array(B),
    hy = new Float32Array(B),
    ss = new Float32Array(B),
    sl = new Float32Array(B);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const [hh, s, l] = ipcRgb2hsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.22 || l < 0.1 || l > 0.95) continue;
    const q = s * s * Math.max(0, 1 - Math.abs(l - 0.52) * 1.5);
    if (q <= 0) continue;
    const b = Math.floor(hh * B) % B;
    wt[b] += q;
    hx[b] += Math.cos(hh * 6.2832) * q;
    hy[b] += Math.sin(hh * 6.2832) * q;
    ss[b] += s * q;
    sl[b] += l * q;
    total += q;
  }
  const px = w * h;
  const DEF = {
    led: 0x8a5cff,
    led2: 0x4f7dff,
    bay: 0x9a7bff,
    spill: 0x7a4dff,
    text: "#b9a2ff",
    neutral: true,
  };
  if (total < px * 0.004) return DEF;
  const score = (i) => wt[i] + 0.5 * (wt[(i + B - 1) % B] + wt[(i + 1) % B]);
  const stat = (i) => {
    let x = 0,
      y = 0,
      s = 0,
      l = 0,
      q = 0;
    for (const j of [(i + B - 1) % B, i, (i + 1) % B]) {
      x += hx[j];
      y += hy[j];
      s += ss[j];
      l += sl[j];
      q += wt[j];
    }
    return { h: (Math.atan2(y, x) / 6.2832 + 1) % 1, s: s / q, l: l / q };
  };
  let top = 0;
  for (let i = 1; i < B; i++) if (score(i) > score(top)) top = i;
  const a = stat(top);
  let sec = -1;
  for (let i = 0; i < B; i++) {
    if (wt[i] <= 0 || ipcHueDist(stat(i).h, a.h) < 0.14 || score(i) < score(top) * 0.1) continue;
    if (sec < 0 || score(i) > score(sec)) sec = i;
  }
  const b =
    sec >= 0
      ? stat(sec)
      : { h: (a.h + (a.h > 0.55 && a.h < 0.85 ? -0.1 : 0.11) + 1) % 1, s: a.s, l: a.l };
  // LEDs have to read as light, not paint: push saturation up and keep lightness in the glowing band
  const vivid = (c) => [c.h, Math.max(0.84, c.s), ipcClamp(c.l, 0.5, 0.6)];
  const [h1, s1, l1] = vivid(a),
    [h2, s2, l2] = vivid(b);
  const led = ipcHsl2int(h1, s1, l1),
    led2 = ipcHsl2int(h2, s2, l2);
  return {
    led,
    led2,
    bay: ipcMix(led, 0xffffff, 0.14),
    spill: ipcHsl2int(h1, Math.min(1, s1 + 0.05), l1 - 0.06),
    text: ipcHex(ipcHsl2int(h1, 0.95, Math.max(0.66, l1))),
    text2: ipcHex(ipcHsl2int(h2, 0.95, Math.max(0.66, l2))),
  };
}

/* ---------- smart crop: pick the busiest (most detailed + colourful) window, biased to the centre ---------- */
function ipcEnergy(src) {
  const w = 64,
    h = ipcClamp(Math.round((64 * src.height) / src.width), 8, 160);
  const c = ipcMk(w, h),
    g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const Y = new Float32Array(w * h),
    S = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4],
      gg = d[i * 4 + 1],
      b = d[i * 4 + 2];
    Y[i] = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
    const mx = Math.max(r, gg, b),
      mn = Math.min(r, gg, b);
    S[i] = mx ? (mx - mn) / mx : 0;
  }
  const col = new Float32Array(w),
    row = new Float32Array(h);
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const e = Math.abs(Y[i] - Y[i + 1]) + Math.abs(Y[i] - Y[i + w]);
      const v = e * 3 + S[i] * Y[i] * 0.35 + Y[i] * 0.05;
      col[x] += v;
      row[y] += v;
    }
  return { col, row };
}
function ipcBestWindow(arr, frac, bias = 0.5, avoid = null) {
  const n = arr.length,
    win = Math.max(1, Math.round(frac * n));
  if (win >= n) return 0.5;
  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i] + arr[i]);
  let best = -1,
    bestC = 0.5,
    all = [];
  for (let s = 0; s + win <= n; s++) {
    const c = (s + win / 2) / n;
    const v = (pre[s + win] - pre[s]) * (1 - 1.1 * Math.pow(c - bias, 2));
    all.push([v, c]);
    if (v > best) {
      best = v;
      bestC = c;
    }
  }
  if (avoid == null) return bestC;
  let alt = null;
  for (const [v, c] of all) {
    if (Math.abs(c - avoid) >= frac * 0.7 && v >= best * 0.72 && (!alt || v > alt[0])) alt = [v, c];
  }
  return alt ? alt[1] : avoid;
}

/* ---------- drawing helpers ---------- */
// cover-fit src into (x,y,w,h), centring the crop on (fx,fy) in source space
function ipcCover(g, src, x, y, w, h, fx = 0.5, fy = 0.5, zoom = 1) {
  const sw = src.width,
    sh = src.height,
    ar = w / h;
  let cw = sw,
    ch = sw / ar;
  if (ch > sh) {
    ch = sh;
    cw = sh * ar;
  }
  cw /= zoom;
  ch /= zoom;
  const cx = ipcClamp(fx * sw - cw / 2, 0, sw - cw),
    cy = ipcClamp(fy * sh - ch / 2, 0, sh - ch);
  g.drawImage(src, cx, cy, cw, ch, x, y, w, h);
}
function ipcBlurred(src) {
  const w = ipcFilterOK ? 360 : 28,
    h = Math.max(1, Math.round((w * src.height) / src.width));
  const c = ipcMk(w, h),
    g = c.getContext("2d");
  if (ipcFilterOK) {
    g.filter = "blur(14px) saturate(1.25)";
    g.drawImage(src, -30, -30, w + 60, h + 60);
  } else {
    g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, w, h);
  }
  return c;
}
// the art in a band that dissolves into the backdrop at the top/bottom edges
function ipcBand(g, src, x, y, w, h, fx, fy, fadeTop = 0.16, fadeBot = 0.3, zoom = 1) {
  const t = ipcMk(w, h),
    tg = t.getContext("2d");
  tg.imageSmoothingQuality = "high";
  ipcCover(tg, src, 0, 0, t.width, t.height, fx, fy, zoom);
  tg.globalCompositeOperation = "destination-in";
  const gr = tg.createLinearGradient(0, 0, 0, t.height);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  if (fadeTop > 0) gr.addColorStop(fadeTop, "rgba(0,0,0,1)");
  else gr.addColorStop(0, "rgba(0,0,0,1)");
  gr.addColorStop(Math.max(fadeTop + 0.01, 1 - fadeBot), "rgba(0,0,0,1)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  tg.fillStyle = gr;
  tg.fillRect(0, 0, t.width, t.height);
  g.drawImage(t, x, y, w, h);
}
function ipcVGrad(g, x, y, w, h, stops) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  for (const [k, c] of stops) gr.addColorStop(k, c);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}
function ipcSpacing(g, px) {
  if ("letterSpacing" in g) g.letterSpacing = px ? px + "px" : "0px";
}
// break text into 1..maxLines balanced lines at the largest size that fits
function ipcFit(
  g,
  text,
  {
    weight = 700,
    family = IPC_FD,
    maxW,
    maxH = 1e9,
    maxLines = 3,
    maxSize,
    lh = 1.04,
    upper = true,
  },
) {
  const words = (upper ? text.toUpperCase() : text).split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: 0, lh };
  g.font = `${weight} 100px ${family}`;
  ipcSpacing(g, 0);
  const ww = words.map((w) => g.measureText(w).width),
    sp = g.measureText(" ").width,
    N = words.length;
  const width = (a, b) => {
    let s = 0;
    for (let i = a; i < b; i++) s += ww[i] + (i > a ? sp : 0);
    return s;
  };
  let best = null;
  for (let n = 1; n <= Math.min(maxLines, N); n++) {
    let cand = null;
    const rec = (start, left, cuts) => {
      if (left === 1) {
        let a = 0,
          mw = 0;
        const segs = [];
        for (const c of [...cuts, N]) {
          segs.push([a, c]);
          mw = Math.max(mw, width(a, c));
          a = c;
        }
        if (!cand || mw < cand.mw) cand = { mw, segs };
        return;
      }
      for (let c = start + 1; c <= N - left + 1; c++) rec(c, left - 1, [...cuts, c]);
    };
    if (N > 14 && n > 1) {
      // greedy fallback for very long names
      const target = width(0, N) / n;
      const segs = [];
      let a = 0;
      for (let i = 0; i < N; i++) {
        if (segs.length < n - 1 && i > a && width(a, i + 1) > target) {
          segs.push([a, i]);
          a = i;
        }
      }
      segs.push([a, N]);
      cand = { mw: Math.max(...segs.map(([s, e]) => width(s, e))), segs };
    } else rec(0, n, []);
    const size = Math.min(maxSize, (maxW * 100) / cand.mw, maxH / (n * lh));
    const lines = cand.segs.map(([s, e]) => words.slice(s, e).join(" "));
    if (!best || size > best.size * 1.18) best = { lines, size, lh };
  }
  return best;
}
function ipcDrawLines(
  g,
  fit,
  x,
  y,
  {
    weight = 700,
    family = IPC_FD,
    color = "#fff",
    align = "left",
    anchor = "top",
    shadow = 0,
  } = {},
) {
  const { lines, size, lh } = fit;
  if (!lines.length) return { top: y, bottom: y };
  g.font = `${weight} ${size}px ${family}`;
  ipcSpacing(g, 0);
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillStyle = color;
  const blockH = (lines.length - 1) * size * lh + size * 0.74; // cap height of the last line
  const top = anchor === "top" ? y : y - blockH;
  if (shadow) {
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = shadow;
    g.shadowOffsetY = shadow * 0.25;
  }
  lines.forEach((l, i) => g.fillText(l, x, top + size * 0.74 + i * size * lh));
  g.shadowColor = "transparent";
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
  return { top, bottom: top + blockH };
}
function ipcLabel(
  g,
  text,
  x,
  y,
  size,
  color,
  { weight = 500, family = IPC_FM, align = "left", spacing = 0.14 } = {},
) {
  g.font = `${weight} ${size}px ${family}`;
  ipcSpacing(g, size * spacing);
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillStyle = color;
  // letterSpacing adds trailing space: nudge centred text back
  const nudge = align === "center" && "letterSpacing" in g ? (size * spacing) / 2 : 0;
  g.fillText(text, x + nudge, y);
  ipcSpacing(g, 0);
}
// generic "tap your phone" glyph (phone + contactless waves), not a scannable code
function ipcTapGlyph(g, cx, cy, s, color) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  const pw = s * 0.36,
    ph = s * 0.62;
  g.lineWidth = s * 0.055;
  g.save();
  g.translate(-s * 0.16, s * 0.02);
  g.rotate(-0.22);
  g.beginPath();
  g.roundRect(-pw / 2, -ph / 2, pw, ph, s * 0.07);
  g.stroke();
  g.beginPath();
  g.moveTo(-pw * 0.18, -ph / 2 + s * 0.07);
  g.lineTo(pw * 0.18, -ph / 2 + s * 0.07);
  g.stroke();
  g.beginPath();
  g.arc(0, ph / 2 - s * 0.085, s * 0.028, 0, Math.PI * 2);
  g.fill();
  g.restore();
  for (let i = 0; i < 3; i++) {
    const r = s * (0.2 + i * 0.13);
    g.globalAlpha = 1 - i * 0.22;
    g.beginPath();
    g.arc(s * 0.1, -s * 0.06, r, -0.75, 0.75);
    g.stroke();
  }
  g.restore();
}
function ipcVignette(g, W, H, a = 0.5) {
  const gr = g.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.35,
    W / 2,
    H / 2,
    Math.hypot(W, H) * 0.6,
  );
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}
function ipcBackdrop(g, meta, W, H, dark = 0.5) {
  g.fillStyle = "#0a0818";
  g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = "high";
  ipcCover(g, meta.blur, 0, 0, W, H, meta.fx, 0.5);
  g.fillStyle = `rgba(8,6,20,${dark})`;
  g.fillRect(0, 0, W, H);
}

/* ---------- slot compositions (all measurements scale with the canvas, so previews reuse them) ---------- */
// Towers show u 0.0167–0.983 of the image; keep type inside a 7% side margin.
function ipcTowerL(meta, W, H) {
  const c = ipcMk(W, H),
    g = c.getContext("2d");
  const m = W * 0.075,
    cw = W - 2 * m;
  ipcBackdrop(g, meta, W, H, 0.42);
  const bandY = H * 0.2,
    bandH = H * 0.68,
    frac = W / bandH / meta.ar;
  ipcBand(g, meta.src, 0, bandY, W, bandH, meta.fxL(frac), meta.fy, 0.2, 0.26);
  ipcVGrad(g, 0, 0, W, H * 0.36, [
    [0, "rgba(7,5,18,.92)"],
    [0.6, "rgba(7,5,18,.6)"],
    [1, "rgba(7,5,18,0)"],
  ]);
  ipcLabel(g, "ACTIVATED MERCHANDISE®", W / 2, H * 0.045, W * 0.034, meta.pal.text, {
    align: "center",
  });
  const tl = ["PLAY", "COLLECT", "ACTIVATE"];
  g.font = `700 100px ${IPC_FD}`;
  ipcSpacing(g, 0);
  const ts = Math.min(W * 0.15, (cw * 100) / Math.max(...tl.map((l) => g.measureText(l).width)));
  ipcDrawLines(g, { lines: tl, size: ts, lh: 1.0 }, W / 2, H * 0.068, {
    align: "center",
    shadow: W * 0.03,
  });
  // bottom lockup on a scrim
  ipcVGrad(g, 0, H * 0.58, W, H * 0.42, [
    [0, "rgba(6,5,16,0)"],
    [0.45, "rgba(6,5,16,.78)"],
    [1, "rgba(6,5,16,.96)"],
  ]);
  const nf = ipcFit(g, meta.name, {
    maxW: cw,
    maxH: H * 0.2,
    maxLines: 3,
    maxSize: W * 0.2,
    lh: 1.02,
  });
  const nb = ipcDrawLines(g, nf, m, H * 0.905, { anchor: "bottom", shadow: W * 0.03 });
  g.fillStyle = meta.pal.text;
  g.fillRect(m, nb.top - W * 0.07, W * 0.16, W * 0.014);
  ipcLabel(g, "NOW FEATURING", m, nb.top - W * 0.105, W * 0.036, meta.pal.text);
  g.font = `600 ${W * 0.042}px ${IPC_FB}`;
  ipcSpacing(g, 0);
  g.fillStyle = "rgba(236,232,255,.82)";
  g.textAlign = "left";
  g.fillText("Tap any product to unlock in-game items", m, H * 0.905 + W * 0.085);
  ipcLabel(
    g,
    meta.site ? `ON ${meta.site.toUpperCase()}  ·  NO APP NEEDED` : "NO APP NEEDED",
    m,
    H * 0.905 + W * 0.15,
    W * 0.03,
    "rgba(236,232,255,.55)",
  );
  return c;
}
function ipcTowerR(meta, W, H) {
  const c = ipcMk(W, H),
    g = c.getContext("2d");
  const m = W * 0.075,
    cw = W - 2 * m;
  ipcBackdrop(g, meta, W, H, 0.5);
  const bandY = H * 0.5,
    bandH = H * 0.44,
    frac = W / bandH / meta.ar;
  ipcBand(g, meta.src, 0, bandY, W, bandH, meta.fxR(frac), meta.fy, 0.3, 0.22);
  ipcVGrad(g, 0, 0, W, H * 0.5, [
    [0, "rgba(7,5,18,.9)"],
    [0.75, "rgba(7,5,18,.55)"],
    [1, "rgba(7,5,18,0)"],
  ]);
  const lines = ["TAP", "TO UNLOCK", "EXCLUSIVE", "CONTENT"];
  g.font = `700 100px ${IPC_FD}`;
  const size = Math.min(
    W * 0.14,
    (cw * 100) / Math.max(...lines.map((l) => g.measureText(l).width)),
  );
  const tb = ipcDrawLines(g, { lines, size, lh: 1.0 }, W / 2, H * 0.05, {
    align: "center",
    shadow: W * 0.03,
  });
  // re-colour the first word
  g.fillStyle = meta.pal.text;
  g.font = `700 ${size}px ${IPC_FD}`;
  g.textAlign = "center";
  g.fillText("TAP", W / 2, tb.top + size * 0.74);
  // NFC target: a white tile with the tap glyph and ripples
  const cy = tb.bottom + W * 0.42,
    S = W * 0.5;
  for (let i = 3; i >= 1; i--) {
    g.strokeStyle = meta.pal.text;
    g.globalAlpha = 0.16 + (0.2 * (3 - i)) / 2;
    g.lineWidth = W * 0.008;
    g.beginPath();
    g.roundRect(
      W / 2 - S / 2 - i * W * 0.045,
      cy - S / 2 - i * W * 0.045,
      S + i * W * 0.09,
      S + i * W * 0.09,
      W * 0.06 + i * W * 0.04,
    );
    g.stroke();
  }
  g.globalAlpha = 1;
  g.shadowColor = meta.pal.text;
  g.shadowBlur = W * 0.06;
  g.fillStyle = "#fff";
  g.beginPath();
  g.roundRect(W / 2 - S / 2, cy - S / 2, S, S, W * 0.06);
  g.fill();
  g.shadowBlur = 0;
  g.shadowColor = "transparent";
  // a live experience: a real, scannable code in the tile instead of the tap glyph
  if (meta.qr) meta.qr(g, W / 2 - S * 0.42, cy - S * 0.42, S * 0.84);
  else ipcTapGlyph(g, W / 2, cy, S * 0.78, "#0b0a12");
  ipcLabel(
    g,
    meta.qr ? "SCAN OR TAP HERE" : "HOLD YOUR PHONE HERE",
    W / 2,
    cy + S / 2 + W * 0.26,
    W * 0.036,
    "#fff",
    { align: "center" },
  );
  // footer
  ipcVGrad(g, 0, H * 0.84, W, H * 0.16, [
    [0, "rgba(6,5,16,0)"],
    [0.5, "rgba(6,5,16,.85)"],
    [1, "rgba(6,5,16,.96)"],
  ]);
  ipcLabel(g, "ACTIVATED BY", W / 2, H * 0.945, W * 0.03, "rgba(236,232,255,.7)", {
    align: "center",
    spacing: 0.24,
  });
  g.font = `700 ${W * 0.075}px ${IPC_FD}`;
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.fillText("MEDIALIFE®", W / 2, H * 0.945 + W * 0.1);
  return c;
}
function ipcTotem(meta, W, H) {
  const c = ipcMk(W, H),
    g = c.getContext("2d");
  const m = W * 0.08,
    cw = W - 2 * m;
  ipcBackdrop(g, meta, W, H, 0.4);
  const bandY = H * 0.17,
    bandH = H * 0.62,
    frac = W / bandH / meta.ar;
  ipcBand(g, meta.src, 0, bandY, W, bandH, meta.fxL(frac), meta.fy, 0.2, 0.3);
  ipcVGrad(g, 0, 0, W, H * 0.33, [
    [0, "rgba(7,5,18,.92)"],
    [0.65, "rgba(7,5,18,.55)"],
    [1, "rgba(7,5,18,0)"],
  ]);
  const nf = ipcFit(g, meta.name, {
    maxW: cw,
    maxH: H * 0.17,
    maxLines: 3,
    maxSize: W * 0.17,
    lh: 1.02,
  });
  const nb = ipcDrawLines(g, nf, W / 2, H * 0.06, { align: "center", shadow: W * 0.03 });
  g.fillStyle = meta.pal.text;
  g.fillRect(W / 2 - W * 0.08, nb.bottom + W * 0.05, W * 0.16, W * 0.012);
  ipcLabel(g, "NOW ON THIS SHELF", W / 2, H * 0.035, W * 0.03, meta.pal.text, { align: "center" });
  ipcVGrad(g, 0, H * 0.6, W, H * 0.4, [
    [0, "rgba(6,5,16,0)"],
    [0.4, "rgba(6,5,16,.8)"],
    [1, "rgba(6,5,16,.97)"],
  ]);
  const lines = ["TAP", "PLAY", "UNLOCK"];
  g.font = `700 100px ${IPC_FD}`;
  const size = Math.min(
    W * 0.13,
    (cw * 100) / Math.max(...lines.map((l) => g.measureText(l).width)),
  );
  const blockBottom = H * 0.935,
    blockTop = blockBottom - (2 * size + size * 0.74),
    GS = W * 0.2,
    gy = blockTop - W * 0.075 - GS / 2;
  g.fillStyle = meta.pal.text;
  g.shadowColor = meta.pal.text;
  g.shadowBlur = W * 0.05;
  g.beginPath();
  g.arc(W / 2, gy, GS / 2, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.shadowColor = "transparent";
  ipcTapGlyph(g, W / 2, gy, GS * 0.72, "#0b0a12");
  ipcDrawLines(g, { lines, size, lh: 1.0 }, W / 2, blockTop, { align: "center", shadow: W * 0.02 });
  ipcLabel(
    g,
    "NO APP · NO LOGIN WALL",
    W / 2,
    blockBottom + W * 0.075,
    W * 0.03,
    "rgba(236,232,255,.7)",
    { align: "center" },
  );
  return c;
}
function ipcScreen(meta, W, H) {
  const c = ipcMk(W, H),
    g = c.getContext("2d");
  g.fillStyle = "#0a0818";
  g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = "high";
  ipcCover(g, meta.src, 0, 0, W, H, meta.fxS(W / H), meta.fy);
  const gl = g.createLinearGradient(0, 0, W * 0.7, 0);
  gl.addColorStop(0, "rgba(6,5,16,.78)");
  gl.addColorStop(0.55, "rgba(6,5,16,.25)");
  gl.addColorStop(1, "rgba(6,5,16,0)");
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  ipcVGrad(g, 0, H * 0.45, W, H * 0.55, [
    [0, "rgba(6,5,16,0)"],
    [1, "rgba(6,5,16,.9)"],
  ]);
  const m = W * 0.055;
  const nf = ipcFit(g, meta.name, {
    maxW: W * 0.6,
    maxH: H * 0.34,
    maxLines: 2,
    maxSize: W * 0.075,
    lh: 1.02,
  });
  const nb = ipcDrawLines(g, nf, m, H * 0.8, { anchor: "bottom", shadow: W * 0.012 });
  g.fillStyle = meta.pal.text;
  g.fillRect(m, nb.top - H * 0.07, W * 0.06, H * 0.012);
  ipcLabel(
    g,
    "NOW FEATURING  ·  ACTIVATED MERCHANDISE®",
    m,
    nb.top - H * 0.1,
    W * 0.014,
    meta.pal.text,
  );
  g.font = `500 ${W * 0.019}px ${IPC_FB}`;
  ipcSpacing(g, 0);
  g.fillStyle = "rgba(236,232,255,.86)";
  g.textAlign = "left";
  g.fillText(
    "Tap any product on this shelf to unlock exclusive in-game content",
    m,
    H * 0.8 + H * 0.075,
  );
  // corner chip
  const chip = (meta.site || "Live experience").toUpperCase();
  g.font = `500 ${W * 0.012}px ${IPC_FM}`;
  ipcSpacing(g, W * 0.012 * 0.14);
  const tw = g.measureText(chip).width;
  ipcSpacing(g, 0);
  g.strokeStyle = "rgba(255,255,255,.5)";
  g.lineWidth = Math.max(1, W * 0.0012);
  g.beginPath();
  g.roundRect(m, H * 0.07, tw + W * 0.03, H * 0.055, H * 0.03);
  g.stroke();
  ipcLabel(g, chip, m + W * 0.015, H * 0.07 + H * 0.037, W * 0.012, "#fff");
  return c;
}
// Wall: 12 tiles read the band v 0.122–0.878 across the full width (≈2.33:1)
function ipcWall(meta, W, H) {
  const c = ipcMk(W, H),
    g = c.getContext("2d");
  ipcBackdrop(g, meta, W, H, 0.3);
  const y0 = H * 0.118,
    bh = H * 0.764;
  g.imageSmoothingQuality = "high";
  ipcCover(g, meta.src, 0, y0, W, bh, meta.fxS(W / bh), meta.fyW(W / bh));
  g.fillStyle = "rgba(6,5,16,.2)";
  g.fillRect(0, 0, W, H);
  ipcVignette(g, W, H, 0.38);
  // per-tile brightness variation, like real panels, plus a fine LED pixel grid
  const r = ipcRng(7);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const v = r() * 0.07 - 0.02;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.5})` : `rgba(0,0,0,${-v})`;
      g.fillRect((col * W) / 4, y0 + (row * bh) / 3, W / 4, bh / 3);
    }
  const p = ipcMk(6, 6),
    pg = p.getContext("2d");
  pg.fillStyle = "rgba(0,0,0,.16)";
  pg.fillRect(0, 5, 6, 1);
  pg.fillRect(5, 0, 1, 6);
  const step = Math.max(3, Math.round(W / 1100));
  g.save();
  g.scale((step / 6) * 1, (step / 6) * 1);
  g.fillStyle = g.createPattern(p, "repeat");
  g.fillRect(0, 0, (W * 6) / step, (H * 6) / step);
  g.restore();
  return c;
}

/* ---------- image intake ---------- */
const IPC_MAX = 2048;
function ipcToWorking(img) {
  let w = img.naturalWidth || img.width,
    h = img.naturalHeight || img.height;
  if (!w || !h) {
    w = 1600;
    h = 900;
  } // e.g. an SVG with no intrinsic size
  const k = Math.min(1, IPC_MAX / Math.max(w, h));
  const c = ipcMk(w * k, h * k),
    g = c.getContext("2d");
  g.fillStyle = "#0a0818";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function ipcMeta(src, name, pal) {
  const e = ipcEnergy(src),
    ar = src.width / src.height;
  const cache = {};
  const fx = (frac) =>
    frac >= 1 ? 0.5 : (cache["L" + frac.toFixed(3)] ??= ipcBestWindow(e.col, frac, 0.5));
  return {
    src,
    name,
    pal,
    ar,
    blur: ipcBlurred(src),
    fx: 0.5,
    fy: 0.45,
    fxL: fx,
    fxR: (frac) => (frac >= 1 ? 0.5 : ipcBestWindow(e.col, frac, 0.5, fx(frac))),
    fxS: (outAr) => {
      const frac = outAr / ar;
      return frac >= 1 ? 0.5 : fx(frac);
    },
    fyW: (outAr) => {
      const frac = ar / outAr;
      return frac >= 1 ? 0.45 : ipcBestWindow(e.row, frac, 0.45);
    },
  };
}
async function ipcFonts() {
  if (!document.fonts?.load) return;
  const want = [
    `700 64px Unbounded`,
    `500 32px Figtree`,
    `600 32px Figtree`,
    `500 24px "JetBrains Mono"`,
  ];
  await Promise.race([
    Promise.all(want.map((f) => document.fonts.load(f).catch(() => {}))),
    new Promise((r) => setTimeout(r, 1800)),
  ]);
}

/* ---------- export surface ---------- */
// same pixel dimensions as the shipped HD graphics for each slot (halved on small screens)
export const IPC_SIZE = {
  towerL: [1088, 3200],
  towerR: [1088, 3200],
  totem: [1452, 3200],
  screen: [2560, 1452],
  wall: [4096, 2323],
};
const IPC_DRAW = {
  towerL: ipcTowerL,
  towerR: ipcTowerR,
  totem: ipcTotem,
  screen: ipcScreen,
  wall: ipcWall,
};
/** Compose the given slots from a meta (see ipcMeta). Returns { slot: canvas }. */
export function composeSlots(meta, slots = Object.keys(IPC_SIZE), half = false) {
  const out = {};
  for (const slot of slots) {
    const [w, h] = IPC_SIZE[slot];
    out[slot] = IPC_DRAW[slot](meta, half ? Math.round(w / 2) : w, half ? Math.round(h / 2) : h);
  }
  return out;
}
export {
  ipcPalette as palette,
  ipcMeta as meta,
  ipcToWorking as toWorking,
  ipcFonts as fonts,
  ipcHex as hex,
  ipcMix as mix,
  ipcFit as fit,
  ipcDrawLines as drawLines,
  ipcLabel as label,
  ipcMk as makeCanvas,
  ipcCover as cover,
  IPC_FD as FONT_DISPLAY,
  IPC_FB as FONT_BODY,
  IPC_FM as FONT_MONO,
};
