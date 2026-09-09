/* MEDIALIFE virtual business card — interactions */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const card = $('#card');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cardUrl = card.dataset.cardUrl || location.href.split(/[?#]/)[0];
  // Root-absolute base for this card's own files (/c/<slug>/). Relative srcs
  // would resolve against /c/ when the page is served without a trailing
  // slash — which is exactly the URL the link QR encodes.
  const base = card.dataset.base || './';
  const name = card.dataset.name || 'Contact';

  /* ---------- toast + haptics ---------- */
  const toastEl = $('#toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  };
  const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  /* ---------- copy helpers ---------- */
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  };

  // Long-press on email / phone tiles copies the value (tap still opens the native app)
  document.querySelectorAll('[data-copy]').forEach((el) => {
    let t;
    const start = () => { t = setTimeout(async () => { if (await copy(el.dataset.copy)) { buzz(20); toast(`Copied ${el.dataset.copy}`); } }, 520); };
    const cancel = () => clearTimeout(t);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel); el.addEventListener('touchmove', cancel); el.addEventListener('touchcancel', cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* ---------- share / copy link ---------- */
  $('#share').addEventListener('click', async () => {
    buzz();
    const data = { title: `${name} · MEDIALIFE`, text: `${name}'s contact card`, url: cardUrl };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (await copy(cardUrl)) toast('Link copied — paste it anywhere');
  });
  $('#copy').addEventListener('click', async () => {
    buzz();
    toast((await copy(cardUrl)) ? 'Link copied' : 'Could not copy — long-press the URL bar');
  });
  $('#save').addEventListener('click', () => {
    buzz(18);
    // iOS opens the .vcf in a contact preview sheet; Android downloads it and offers Contacts on open
    toast(isAndroid ? 'Downloaded — open it to add to Contacts' : 'Opening contact card…');
  });
  document.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => buzz()));

  /* ---------- device-aware Save button ---------- */
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const saveLabel = $('#save-label');
  if (isIOS) saveLabel.textContent = 'Add to iPhone Contacts';
  else if (isAndroid) saveLabel.textContent = 'Add to Android Contacts';

  /* ---------- QR mode: contact (vCard) vs card link ---------- */
  const QR = {
    contact: { src: base + 'qr-contact.svg', alt: 'QR code — scan to save contact', caption: 'SCAN TO SAVE CONTACT', sub: 'Scan to save contact', hint: 'Point any phone camera at the code — tap "Add contact"' },
    link: { src: base + 'qr-link.svg', alt: 'QR code — scan to open this card', caption: 'SCAN TO OPEN CARD', sub: cardUrl, hint: 'Point any phone camera at the code' },
  };
  const setQr = (mode) => {
    const m = QR[mode] || QR.contact;
    for (const img of [$('#qr-img'), $('#qr-modal-img')]) { img.src = m.src; img.alt = m.alt; }
    $('#qr-caption').textContent = m.caption;
    $('#qr-modal-sub').textContent = m.sub;
    $('#qr-modal-hint').textContent = m.hint;
    document.querySelectorAll('.seg-btn').forEach((b) => { const on = b.dataset.qr === mode; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
  };
  document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => { buzz(); setQr(b.dataset.qr); }));

  /* ---------- QR modal (bright mode for scanning) ---------- */
  const modal = $('#qr-modal');
  const openBtn = $('#qr-open');
  let lastFocus;
  const openModal = () => {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#qr-close').focus();
    buzz();
    // Ask the browser to keep the screen on while someone scans
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => { modal._lock = l; }).catch(() => {});
  };
  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (modal._lock) { modal._lock.release().catch(() => {}); modal._lock = null; }
    lastFocus && lastFocus.focus();
  };
  openBtn.addEventListener('click', openModal);
  $('#qr-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  if (reduced) return;

  /* ---------- 3D tilt + sheen (pointer on desktop, gyroscope on mobile) ---------- */
  const root = document.documentElement.style;
  let targetX = 0, targetY = 0, curX = 0, curY = 0, raf;
  const MAX = 7;
  const setSheen = (px, py) => { root.setProperty('--sheen-x', `${px * 100}%`); root.setProperty('--sheen-y', `${py * 100}%`); };
  const tick = () => {
    curX += (targetX - curX) * 0.12; curY += (targetY - curY) * 0.12;
    root.setProperty('--tilt-x', `${curX.toFixed(2)}deg`); root.setProperty('--tilt-y', `${curY.toFixed(2)}deg`);
    if (Math.abs(curX - targetX) > 0.01 || Math.abs(curY - targetY) > 0.01) raf = requestAnimationFrame(tick); else raf = null;
  };
  const aim = (x, y) => { targetX = x; targetY = y; if (!raf) raf = requestAnimationFrame(tick); };

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      aim((0.5 - py) * MAX * 2, (px - 0.5) * MAX * 2);
      setSheen(px, py);
    });
    card.addEventListener('pointerleave', () => aim(0, 0));
  } else if ('DeviceOrientationEvent' in window) {
    let base = null;
    const onTilt = (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (base === null) base = { b: e.beta, g: e.gamma };
      const db = Math.max(-25, Math.min(25, e.beta - base.b));
      const dg = Math.max(-25, Math.min(25, e.gamma - base.g));
      aim((-db / 25) * MAX, (dg / 25) * MAX);
      setSheen(0.5 + dg / 50, 0.35 + db / 50);
    };
    const enable = () => window.addEventListener('deviceorientation', onTilt, { passive: true });
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+: needs a user gesture — first tap anywhere unlocks the motion effect
      const ask = () => { DeviceOrientationEvent.requestPermission().then((s) => s === 'granted' && enable()).catch(() => {}); };
      window.addEventListener('touchend', ask, { once: true, passive: true });
    } else enable();
  }

  /* ---------- ambient particles ---------- */
  const cv = $('#fx');
  const ctx = cv.getContext('2d', { alpha: true });
  const css = getComputedStyle(document.documentElement);
  const colors = [css.getPropertyValue('--primary').trim() || '#19affe', css.getPropertyValue('--accent').trim() || '#ff37ae', '#ffffff'];
  let W, H, dpr, pts = [];
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    const n = Math.round(Math.min(70, (innerWidth * innerHeight) / 14000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: (Math.random() * 1.4 + 0.4) * dpr,
      vx: (Math.random() - 0.5) * 0.12 * dpr, vy: (-Math.random() * 0.22 - 0.05) * dpr,
      c: colors[Math.random() < 0.15 ? 2 : Math.random() < 0.5 ? 0 : 1],
      a: Math.random() * 0.5 + 0.2, p: Math.random() * Math.PI * 2,
    }));
  };
  let last = 0, visible = true;
  const frame = (t) => {
    if (!visible) return;
    if (t - last < 33) { requestAnimationFrame(frame); return; } // ~30fps is plenty for ambience
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy; p.p += 0.02;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.p));
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  resize(); addEventListener('resize', resize); requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) requestAnimationFrame(frame); });
})();
