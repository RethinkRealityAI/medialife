/* ar-kit/track.js: first-party analytics + client links for the activated-retail demos.
 *
 *   <script src="/vendor/ar-kit/track.js"></script>
 *   ARTrack.init({ demo: 'roblox' });           // once, as early as possible
 *   ARTrack.event('product_open', { id: 'cap' });
 *   ARTrack.link.then(l => l && greet(l.name)); // personal link from ?c=CODE (or ?to=Name)
 *
 * - One anonymous visitor id (localStorage) and one session id per page load. No cookies,
 *   no IP addresses, nothing sent to third parties. Events go to POST /api/ar/track.
 * - Events are batched and flushed every 10 s, and immediately when the page is hidden
 *   (sendBeacon), so closing the tab doesn't lose the last actions.
 * - Visible time is measured with the Page Visibility API (a background tab doesn't count).
 * - Internal visits can be excluded: ?notrack=1 (remembered on this device) or the switch in
 *   /admin. ?track=1 turns tracking back on.
 * Contract: src/lib/ar/events.ts. Never throws into the page.
 */
(function () {
  'use strict';
  if (window.ARTrack && window.ARTrack.__v) return;

  var API = '/api/ar/track';
  var LINK_API = '/api/ar/link?c=';
  var FLUSH_MS = 10000, HEARTBEAT_MS = 30000;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function rid(n) {
    var s = '', a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var r = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : null;
    for (var i = 0; i < n; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % 36];
    return s;
  }

  var params = new URLSearchParams(location.search);
  if (params.get('notrack') === '1') ls('ml-ar-notrack', '1');
  if (params.get('track') === '1') ls('ml-ar-notrack', null);
  var disabled = ls('ml-ar-notrack') === '1';

  var vid = ls('ml-ar-vid');
  if (!vid || !/^[0-9a-z-]{6,40}$/.test(vid)) { vid = rid(16); ls('ml-ar-vid', vid); }
  var sid = Date.now().toString(36) + '-' + rid(10);

  var cfg = null, queue = [], pending = [], activeMs = 0, visibleSince = null, lastSentActive = -1, lastSend = 0;
  var linkCode = (params.get('c') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || null;
  var clientName = (params.get('to') || '').trim().slice(0, 80) || null;

  // ---- client link ----
  var link = new Promise(function (resolve) {
    if (!linkCode) return resolve(clientName ? { code: null, name: clientName, unlock: false } : null);
    var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
    setTimeout(function () { finish(clientName ? { code: linkCode, name: clientName, unlock: false } : null); }, 3000);
    try {
      fetch(LINK_API + encodeURIComponent(linkCode), { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (l) {
          if (l && l.name) { clientName = clientName || l.name; finish({ code: linkCode, name: clientName, unlock: !!l.unlock, demo: l.demo }); }
          else finish(clientName ? { code: linkCode, name: clientName, unlock: false } : null);
        })
        .catch(function () { finish(null); });
    } catch (e) { finish(null); }
  });

  // ---- visible time ----
  function tickVisible() {
    if (visibleSince !== null) { activeMs += Date.now() - visibleSince; visibleSince = Date.now(); }
  }
  function onVis() {
    if (document.hidden) { tickVisible(); visibleSince = null; flush(true); }
    else { visibleSince = Date.now(); }
  }

  // ---- sending ----
  function send(body, beacon) {
    var json = JSON.stringify(body);
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon(API, new Blob([json], { type: 'text/plain;charset=UTF-8' }))) return;
      fetch(API, { method: 'POST', body: json, keepalive: json.length < 60000, headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(function () {});
    } catch (e) {}
  }
  function flush(beacon) {
    if (disabled || !cfg) return;
    tickVisible();
    var active = Math.round(activeMs);
    var heartbeatDue = active !== lastSentActive && Date.now() - lastSend > HEARTBEAT_MS;
    if (!queue.length && !heartbeatDue && !(beacon && active !== lastSentActive)) return;
    var events = queue.splice(0, 200);
    lastSentActive = active; lastSend = Date.now();
    send({
      sid: sid, vid: vid, demo: cfg.demo, link: linkCode, client: clientName,
      ref: document.referrer ? document.referrer.slice(0, 300) : null,
      activeMs: active, screen: (screen.width || 0) + 'x' + (screen.height || 0),
      events: events
    }, beacon);
    if (queue.length) flush(beacon);
  }

  function clean(p) {
    if (!p || typeof p !== 'object') return undefined;
    var out = {}, n = 0;
    for (var k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k) || n >= 12) continue;
      var v = p[k];
      if (v === undefined) continue;
      if (typeof v === 'string') v = v.slice(0, 300);
      else if (typeof v !== 'number' && typeof v !== 'boolean' && v !== null) v = String(v).slice(0, 300);
      out[String(k).slice(0, 40)] = v; n++;
    }
    return n ? out : undefined;
  }

  var T = window.ARTrack = {
    __v: 1,
    sid: sid,
    vid: vid,
    disabled: disabled,
    link: link,
    /** Start tracking this page. opts.demo: 'roblox' | 'monkey-quest' | 'x:<slug>' */
    init: function (opts) {
      if (cfg) return T;
      cfg = { demo: String((opts && opts.demo) || 'unknown').toLowerCase() };
      visibleSince = document.hidden ? null : Date.now();
      document.addEventListener('visibilitychange', onVis);
      addEventListener('pagehide', function () { flush(true); });
      setInterval(function () { flush(false); }, FLUSH_MS);
      T.event('session_start', { path: location.pathname, w: innerWidth, h: innerHeight, touch: matchMedia('(pointer:coarse)').matches });
      pending.forEach(function (e) { queue.push(e); }); pending = [];
      link.then(function (l) { if (l) T.event('link_resolved', { code: l.code || '', name: l.name }); });
      setTimeout(function () { flush(false); }, 1500);
      return T;
    },
    /** Record an event: snake_case name, small flat props. */
    event: function (name, props) {
      try {
        if (disabled) return;
        var n = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '').slice(0, 40);
        if (!n) return;
        var e = { n: n, ts: Date.now() }, p = clean(props);
        if (p) e.p = p;
        (cfg ? queue : pending).push(e);
        if (queue.length >= 40) flush(false);
      } catch (err) {}
    },
    flush: function () { flush(true); },
    /** Exclude (true) or re-include (false) this device from analytics. */
    exclude: function (on) { ls('ml-ar-notrack', on ? '1' : null); disabled = !!on; T.disabled = disabled; }
  };
})();
