// Spray Bobo CMS: the merch the team adds in the admin (src/lib/spray/server.ts, shapes in src/lib/spray/model.ts)
// turned into pieces for the AR page (the same fields as the built-in PIECES in main.js). No three.js here, so the
// mapping can be checked in Node.
//
// Reads (all optional; the page works without any of them, e.g. from a plain static server):
//   GET /api/spray/sets              live paintables, each with `targetData` ready for the engine
//   GET /api/spray/sets/<id>         one paintable, drafts included (?set=<id>, the Studio's camera button)
//   GET /api/spray/creations/<id>    a shared painting and its paintable (?c=<id>, "See it on your merch")
//   GET <creation.image>             its paint layer (768x1024 PNG)

// The engine tracks at most this many image targets at once (8th Wall: "up to 10 image targets can be active
// at the same time"; more slow detection down and are not guaranteed to be found). The built-in pieces use 5.
export const MAX_TARGETS = 10;
export const LIST_MS = 2500;          // the merch list: past this the page carries on with the built-in pieces
export const ONE_MS = 8000;           // ?set= / ?c=: what the visitor came for, so it gets longer

// GET as JSON with a time limit. Never throws: { status, data } (status 0: network error, time out, not JSON).
export async function getJson(url, ms, f = (...a) => fetch(...a)) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ac && ac.abort(), ms);
  try {
    const r = await f(url, { signal: ac ? ac.signal : undefined, credentials: 'same-origin', headers: { accept: 'application/json' } });
    let data = null; try { data = await r.json(); } catch (e) { return { status: r.ok ? 0 : r.status, data: null }; }
    return { status: r.status, data };
  } catch (e) { return { status: 0, data: null }; } finally { clearTimeout(t); }
}
export async function getBlob(url, ms, f = (...a) => fetch(...a)) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ac && ac.abort(), ms);
  try { const r = await f(url, { signal: ac ? ac.signal : undefined, credentials: 'same-origin' }); return r.ok ? await r.blob() : null; } catch (e) { return null; } finally { clearTimeout(t); }
}

// Tuning from the real size, fitted to the built-ins: Bobo (80 mm) uses the defaults (drawn at real size, spray
// x1, "come closer" past 40 cm); the Sukeban tee (406 mm) is drawn at 0.1 m, spray x1.6, closer past 90 cm.
// Anything up to 12 cm is drawn at real size (a charm, a pin, a sticker); bigger prints are drawn 10 cm tall so
// the sticker, its hover and hops keep the charm's look (the camera has no sense of real size anyway).
export function tuning(heightMm) {
  const h = Number(heightMm) > 0 ? Number(heightMm) : 80, k = h / 80;
  const t = {};
  if (h > 120) t.view = 0.1;
  const sprayK = Math.min(2.5, Math.max(1, Math.pow(k, 0.3)));
  if (sprayK > 1.001) t.sprayK = +sprayK.toFixed(2);
  t.near = Math.round(Math.min(150, Math.max(40, 40 * Math.sqrt(k))));
  return t;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// "Bobo (cat charm)" -> "Bobo": the name the tips use
export const shortName = (n) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'your merch';

// One CMS paintable (with targetData) -> a piece, or null when it can't be used. The built-in pieces are not
// made here (they stay exactly as main.js has them; only their scene comes from the CMS).
export function pieceFromPaintable(p) {
  if (!p || typeof p !== 'object' || p.builtin) return null;
  if (typeof p.id !== 'string' || !/^[A-Za-z0-9]{6,40}$/.test(p.id)) return null;
  const f = p.files || {};
  if (typeof f.mask !== 'string' || typeof f.outline !== 'string' || typeof f.print !== 'string') return null;
  const ts = Array.isArray(p.targets) ? p.targets : [], td = Array.isArray(p.targetData) ? p.targetData : [];
  // the engine's data for each target, matched by name (front first, at most two sides: the page knows two)
  const sides = ts.filter((t) => t && typeof t.name === 'string' && t.width > 0 && t.height > 0)
    .map((t) => ({ t, d: td.find((d) => d && d.name === t.name && typeof d.imagePath === 'string' && d.properties && d.properties.width > 0 && d.properties.height > 0) }))
    .filter((x) => x.d)
    .sort((a, b) => (a.t.side === 'front' ? 0 : 1) - (b.t.side === 'front' ? 0 : 1))
    .slice(0, 2);
  if (!sides.length) return null;
  const heightMm = isNum(p.heightMm) && p.heightMm > 0 ? p.heightMm : 80;
  const front = sides[0].t, aspect = front.width / front.height;
  const name = shortName(p.name), flip = {}, xf = {};
  for (const { t } of sides) {
    if (t.flip === -1) flip[t.name] = -1;
    const x = t.xf; if (x && isNum(x.x) && isNum(x.y) && isNum(x.rz) && isNum(x.s) && x.s > 0) xf[t.name] = { x: x.x, y: x.y, rz: x.rz, s: x.s };
  }
  return {
    k: p.id, cms: true, id: p.id, status: p.status === 'live' ? 'live' : 'draft',
    name, title: ('My ' + name).toUpperCase().slice(0, 28), seek: name,
    targets: sides.map((x) => x.t.name), flip, xf0: xf, mirrorPair: sides.some((x) => x.t.flip === -1),
    key: 'cms:' + p.id,
    found: `Found ${name}! Tap the spray can`, back: `Your ${name} is back`, line: `Sprayed on my ${name}`,
    them: 'it', ask: `Deck out ${name}?`, evade: String(p.client || '').toUpperCase() === 'EVADE',
    ...tuning(heightMm),
    heightMm,
    real: { widthM: heightMm * aspect / 1000, heightM: heightMm / 1000 },   // stands in for layout.json
    urls: { mask: f.mask, lines: typeof f.lines === 'string' && f.lines ? f.lines : null, outline: f.outline, print: f.print },
    targetData: sides.map((x) => x.d),
    scene: Array.isArray(p.scene) ? p.scene : [],
  };
}

// The pieces to run, in order, from the built-ins and what the CMS said. Returns
// { order: [keys], add: [new pieces], scenes: { builtinKey: { scene, heightMm } }, skipped: [ids over the limit] }.
//   only: one key (?set=): just that piece.   first: a key to put first (?c=).
// Built-ins keep their place and always fit; CMS pieces follow in the CMS's order while the targets fit.
export function plan({ builtins, list = [], only = null, first = null, extra = [] }) {
  const scenes = {}, cms = [], skipped = [];
  const used = new Set(Object.values(builtins).flatMap((P) => P.targets));
  for (const p of [...extra, ...list]) {
    if (!p || typeof p !== 'object') continue;
    if (p.builtin) { if (builtins[p.id] && Array.isArray(p.scene)) scenes[p.id] = { scene: p.scene, heightMm: p.heightMm }; continue; }
    const P = p.k ? p : pieceFromPaintable(p);
    if (!P || cms.some((x) => x.k === P.k) || builtins[P.k]) continue;
    if (P.targets.some((n) => used.has(n))) continue;          // a name clash would confuse the engine
    cms.push(P);
  }
  let keys = [...Object.keys(builtins), ...cms.map((P) => P.k)];
  if (only && keys.includes(only)) keys = [only];
  else if (first && keys.includes(first)) keys = [first, ...keys.filter((k) => k !== first)];
  const byKey = (k) => builtins[k] || cms.find((P) => P.k === k);
  // targets: the first piece and the built-ins are always in; CMS pieces in order while they fit
  let n = 0; const order = [];
  const must = new Set([keys[0], ...Object.keys(builtins).filter((k) => keys.includes(k))]);
  for (const k of keys) if (must.has(k)) n += byKey(k).targets.length;
  for (const k of keys) {
    if (must.has(k)) { order.push(k); continue; }
    const c = byKey(k).targets.length;
    if (n + c <= MAX_TARGETS) { order.push(k); n += c; } else skipped.push(k);
  }
  return { order, add: cms.filter((P) => order.includes(P.k)), scenes, skipped, targets: n };
}

// Everything the CMS has to say for this visit. Never throws; never takes longer than ONE_MS (+ the image).
// Returns { list, extra, only, viewer, notice, gone }.
//   ?set=<id>: only that piece (painting test, drafts included). Unknown: a notice, then the usual pieces.
//   ?c=<id>:   VIEWER MODE (only that creation's piece, no painting): viewer = { key, name, rec, thumb, print }
//              with rec = { paint: Blob, primer, linesOn, colours, decals }. Unknown / taken down / unreachable:
//              viewer stays null and gone = 404 | 410 | 0 with a notice (the page then offers the normal page).
export async function readCms(params, f = (...a) => fetch(...a)) {
  const set = (params.get('set') || '').trim(), cid = params.has('c') ? (params.get('c') || '').trim() : null;
  const out = { list: [], extra: [], only: null, viewer: null, notice: '', gone: null };
  const okId = (s) => /^[A-Za-z0-9-]{2,40}$/.test(s);
  if (cid != null) {
    const r = okId(cid) ? await getJson('/api/spray/creations/' + encodeURIComponent(cid), ONE_MS, f) : { status: 404 };
    const c = r.status === 200 && r.data && r.data.creation;
    let p = r.status === 200 && r.data && r.data.paintable;
    const fail = (status) => {
      out.gone = status;
      out.notice = status === 410 ? 'This painting was taken down.' : status === 404 ? "We couldn't find that painting." : "Couldn't load that painting right now. Check your connection and try again.";
      return out;
    };
    if (!c || !p) return fail(r.status === 410 || r.status === 404 ? r.status : 0);
    // the merch, through the same door as ?set= (fresh targets, drafts too); the creation's copy if that fails
    const pid = typeof c.paintable === 'string' && c.paintable ? c.paintable : p.id;
    const s = okId(pid) ? await getJson('/api/spray/sets/' + encodeURIComponent(pid), ONE_MS, f) : { status: 0 };
    if (s.status === 200 && s.data && s.data.set) p = s.data.set;
    if (!p.builtin && !pieceFromPaintable(p)) return fail(0);
    const rec = { primer: c.primer !== false, linesOn: c.linesOn !== false, colours: Array.isArray(c.colours) ? c.colours.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 12) : [],
      decals: Array.isArray(c.decals) ? c.decals : [], at: c.createdAt || 0, id: c.id || cid, shared: true };
    const blob = await getBlob(typeof c.image === 'string' && c.image ? c.image : `/api/spray/creations/${encodeURIComponent(cid)}/image`, ONE_MS, f);
    if (!blob) return fail(0);
    rec.paint = blob;
    out.extra.push(p); out.only = p.id;
    const fl = p.files || {};
    out.viewer = { key: p.id, name: shortName(p.name), rec, thumb: fl.thumb || fl.print || null, print: fl.print || null };
    return out;
  }
  if (set) {
    const r = okId(set) ? await getJson('/api/spray/sets/' + encodeURIComponent(set), ONE_MS, f) : { status: 404 };
    const p = r.status === 200 && r.data && r.data.set;
    if (p && (p.builtin || pieceFromPaintable(p))) { out.extra.push(p); out.only = p.id; return out; }
    out.notice = r.status === 404 ? "We couldn't find that merch, so here are the usual pieces." : "Couldn't load that merch right now, so here are the usual pieces.";
  }
  const r = await getJson('/api/spray/sets', LIST_MS, f);
  if (r.status === 200 && r.data && Array.isArray(r.data.sets)) out.list = r.data.sets;
  return out;
}

// The scene items worth showing (the contract in model.ts): visible, a known kind, a file and a size.
const KINDS = new Set(['model', 'image', 'video']);
export function sceneItems(scene) {
  return (Array.isArray(scene) ? scene : []).filter((it) => it && it.visible !== false && KINDS.has(it.kind) && typeof it.file === 'string' && it.file && Number(it.size) > 0);
}
