/* ar-kit/ar-launch.js: "View in your space" for iPhone/iPad and Android, plus a desktop handoff.
 *
 *   <script src="/vendor/ar-kit/qrcode.min.js"></script>   (only needed for the desktop QR)
 *   <script src="/vendor/ar-kit/ar-launch.js"></script>
 *   button.onclick = () => ARLaunch.open({
 *     usdz: 'ar/display-evade.usdz',   // iOS / iPadOS: AR Quick Look
 *     glb:  'ar/display-evade.glb',    // Android: Google Scene Viewer (needs a public https URL)
 *     title: 'AR-01 endcap · EVADE',
 *     handoffUrl: '/ar/?m=…',          // what the desktop QR opens (see public/ar/index.html)
 *     onEvent: (name, props) => ARTrack.event(name, props),
 *     action: { label: 'Book a call', onTap: () => ARLead.open({ source: 'ar' }) },  // optional
 *   });
 *
 * - iOS: an <a rel="ar"> click opens Quick Look (Safari, Chrome and every other iOS browser).
 *   `action` adds Quick Look's banner button (iOS 13.3+); tapping it closes AR and calls onTap.
 * - Android: an intent:// URL opens Scene Viewer in AR (ar_preferred falls back to its 3D
 *   viewer on phones without ARCore). The browser fallback returns here with #ar-unavailable.
 * - Anything else (desktop, unsupported browser): a modal with a QR code that opens this page
 *   on a phone, ready to launch AR.
 * Must be called from a user gesture (tap/click): both OS viewers require one.
 */
(function () {
  'use strict';
  if (window.ARLaunch) return;

  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return u; } }

  function platform() {
    var ua = navigator.userAgent || '';
    var iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (iOS) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }

  function quickLookSupported() {
    try { var a = document.createElement('a'); return !!(a.relList && a.relList.supports && a.relList.supports('ar')); } catch (e) { return false; }
  }

  var qlAnchor = null;
  function openQuickLook(usdz, title, action) {
    // Quick Look needs an anchor with rel="ar" whose first child is an image. It stays in the
    // page while AR is open: the banner button reports its tap as a message event on it.
    if (qlAnchor) qlAnchor.remove();
    var a = document.createElement('a');
    a.rel = 'ar';
    var hash = 'allowsContentScaling=1';
    if (action && action.label) {
      hash += '&callToAction=' + encodeURIComponent(action.label) +
        (title ? '&checkoutTitle=' + encodeURIComponent(title) : '') +
        (action.subtitle ? '&checkoutSubtitle=' + encodeURIComponent(action.subtitle) : '');
      a.addEventListener('message', function (e) {
        if (e.data === '_apple_ar_quicklook_button_tapped' && typeof action.onTap === 'function') {
          try { action.onTap(); } catch (err) {}
        }
      }, false);
    }
    a.href = abs(usdz) + (usdz.indexOf('#') < 0 ? '#' + hash : '');
    var img = document.createElement('img');
    img.alt = ''; img.width = 1; img.height = 1;
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    a.appendChild(img);
    a.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(a);
    a.click();
    qlAnchor = a;
  }

  function openSceneViewer(glb, title, fallback) {
    var params = 'file=' + encodeURIComponent(abs(glb)) + '&mode=ar_preferred' + (title ? '&title=' + encodeURIComponent(title) : '');
    var url = 'intent://arvr.google.com/scene-viewer/1.0?' + params +
      '#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;' +
      'S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end;';
    location.href = url;
  }

  // ---- desktop handoff modal (self-contained styles) ----
  var CSS = '' +
    '.arl-wrap{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;' +
    'background:rgba(6,5,14,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font:15px/1.45 Figtree,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f5f3fb;opacity:0;transition:opacity .25s}' +
    '.arl-wrap.on{opacity:1}' +
    '.arl-card{position:relative;width:min(400px,100%);box-sizing:border-box;padding:24px;border-radius:24px;text-align:center;' +
    'background:linear-gradient(165deg,rgba(255,255,255,.1),rgba(255,255,255,.03) 45%),#14112a;border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 60px rgba(0,0,0,.5)}' +
    '.arl-card h3{margin:4px 0 6px;font:700 20px/1.2 Unbounded,"Arial Black",system-ui,sans-serif;letter-spacing:-.01em}' +
    '.arl-card p{margin:0 0 16px;color:#c9c4dc;font-size:14px}' +
    '.arl-eyebrow{font:500 10.5px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#b39cff}' +
    '.arl-qr{width:200px;height:200px;margin:0 auto 14px;padding:12px;border-radius:18px;background:#fff;box-sizing:content-box}' +
    '.arl-qr svg{display:block;width:100%;height:100%}' +
    '.arl-steps{text-align:left;margin:0 auto;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#cfc9e4;max-width:300px}' +
    '.arl-steps li{display:flex;gap:8px;padding-left:14px;position:relative}.arl-steps li:before{content:"";position:absolute;left:0;top:.6em;width:5px;height:5px;border-radius:50%;background:#b39cff}.arl-steps b{color:#fff}' +
    '.arl-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:16px;line-height:1}' +
    '.arl-x:hover{background:rgba(255,255,255,.16)}' +
    '.arl-link{display:inline-block;margin-top:14px;font-size:12.5px;color:#9fdcff;word-break:break-all}';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var modal = null;
  function closeModal() {
    if (!modal) return;
    var m = modal; modal = null; m.classList.remove('on');
    setTimeout(function () { m.remove(); }, 260);
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeModal(); } }

  function showHandoff(url, title) {
    if (!document.getElementById('arl-css')) { var st = document.createElement('style'); st.id = 'arl-css'; st.textContent = CSS; document.head.appendChild(st); }
    closeModal();
    var w = document.createElement('div');
    w.className = 'arl-wrap'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'View in your space');
    var qr = '';
    try { if (window.QRCode && QRCode.toString) QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, function (err, svg) { if (!err) qr = svg; }); } catch (e) {}
    w.innerHTML = '<div class="arl-card"><button class="arl-x" type="button" aria-label="Close">✕</button>' +
      '<div class="arl-eyebrow">View in your space</div>' +
      '<h3>' + (title ? esc(title) : 'Place it in your room') + '</h3>' +
      '<p>AR runs on your phone. Scan this code with its camera, then tap <b>View in AR</b>.</p>' +
      (qr ? '<div class="arl-qr">' + qr + '</div>' : '') +
      '<ul class="arl-steps"><li><span><b>iPhone / iPad</b>: opens in AR Quick Look</span></li>' +
      '<li><span><b>Android</b>: opens in Google Scene Viewer</span></li>' +
      '<li><span>Shown at true size. Walk around it, or pinch to resize.</span></li></ul>' +
      '<a class="arl-link" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a></div>';
    w.addEventListener('click', function (e) { if (e.target === w || (e.target.closest && e.target.closest('.arl-x'))) closeModal(); });
    document.body.appendChild(w);
    void w.offsetWidth; w.classList.add('on');
    document.addEventListener('keydown', onKey, true);
    modal = w;
    try { w.querySelector('.arl-x').focus({ preventScroll: true }); } catch (e) {}
  }

  window.ARLaunch = {
    platform: platform,
    /** Launch AR for the given assets. Returns 'ios' | 'android' | 'desktop'. */
    open: function (o) {
      o = o || {};
      var ev = typeof o.onEvent === 'function' ? o.onEvent : function () {};
      var p = platform();
      var handoff = o.handoffUrl || location.href;
      if (p === 'ios' && o.usdz && quickLookSupported()) { ev('ar_open', { platform: 'ios' }); openQuickLook(o.usdz, o.title, o.action); return 'ios'; }
      if (p === 'android' && o.glb) {
        ev('ar_open', { platform: 'android' });
        var back = location.href.split('#')[0] + '#ar-unavailable';
        openSceneViewer(o.glb, o.title, back);
        return 'android';
      }
      ev('ar_qr', { platform: p });
      showHandoff(handoff, o.title);
      return 'desktop';
    },
    close: closeModal,
    /** True when this device can launch a native AR viewer (so a page can label its button). */
    nativeAvailable: function () { var p = platform(); return (p === 'ios' && quickLookSupported()) || p === 'android'; }
  };
})();
