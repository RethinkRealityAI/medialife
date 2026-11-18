// MEDIALIFE Holocast: the live room client, shared by the AR page and the control room.
//
// One JSON record per room on the server (src/lib/holocast/server.ts). This polls it: fast (450 ms) for a few
// seconds after anything changes, so a drawing streams in, then 1.2 s while it is quiet, and it stops while the
// tab is hidden. GET ?r=<rev> answers {same:true} when nothing changed (tiny), and ?s=<sketch rev> sends only
// the strokes that changed since, so a big drawing is not re-sent every poll.
//
// Writes (notices, strokes, theme...) go through send(); stroke points are batched by the caller.

const API = '/api/holocast';
export const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
const LS = 'holocast-room';

export function sessionId() {
  try {
    let s = sessionStorage.getItem('holocast-sid');
    if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('holocast-sid', s); }
    return s;
  } catch (e) { return 'x' + Math.random().toString(36).slice(2, 10); }
}

/** The room this device last used ({code, key?}), or null. */
export function savedRoom() {
  try { const r = JSON.parse(localStorage.getItem(LS) || 'null'); return r && CODE_RE.test(r.code) ? r : null; } catch (e) { return null; }
}
export function saveRoom(code, key) {
  try {
    const cur = savedRoom();
    // keep a key we already hold for the same room if this link came without one
    const k = key || (cur && cur.code === code ? cur.key : '') || '';
    localStorage.setItem(LS, JSON.stringify({ code, key: k }));
  } catch (e) { /* private mode */ }
}
/** A key from the link's #k=..., kept out of the address bar afterwards. */
export function keyFromHash() {
  const m = /[#&]k=([A-Za-z0-9]{20})/.exec(location.hash || '');
  return m ? m[1] : '';
}

export async function createRoom() {
  const r = await fetch(`${API}/rooms`, { method: 'POST' });
  if (!r.ok) throw new Error('Couldn\'t make a room (' + r.status + ')');
  return r.json();   // { code, key, room }
}

export const controlUrl = (code, key) => `${location.origin}/labs/holocast/control/?room=${code}${key ? '#k=' + key : ''}`;
export const viewUrl = (code) => `${location.origin}/labs/holocast/?room=${code}`;

export class Room {
  constructor(code, key, opts = {}) {
    this.code = code; this.key = key || ''; this.role = opts.role || 'viewer';
    this.sid = sessionId();
    this.state = null;                 // the last full view (notices, photos, theme...)
    this.strokes = new Map();          // id -> stroke (merged)
    this.sketchRev = null;
    this.rev = null;
    this.listeners = new Set();
    this.fastUntil = 0; this.timer = 0; this.inFlight = false; this.stopped = true; this.fails = 0;
    this.pingAt = 0;
    this._vis = () => { if (document.hidden) clearTimeout(this.timer); else this.poll(); };
  }
  get canWrite() { return !!this.key; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what, prev) { for (const fn of this.listeners) try { fn(what, this, prev); } catch (e) { console.error(e); } }
  start() { this.stopped = false; document.addEventListener('visibilitychange', this._vis); this.poll(); return this; }
  stop() { this.stopped = true; clearTimeout(this.timer); document.removeEventListener('visibilitychange', this._vis); }
  hurry(ms = 6000) { this.fastUntil = Math.max(this.fastUntil, performance.now() + ms); }

  async poll() {
    clearTimeout(this.timer);
    if (this.stopped || document.hidden) return;
    if (!this.inFlight) {
      this.inFlight = true;
      try {
        const q = new URLSearchParams();
        if (this.rev != null) q.set('r', this.rev);
        if (this.sketchRev != null) q.set('s', this.sketchRev);
        const res = await fetch(`${API}/${this.code}?${q}`, { cache: 'no-store' });
        if (res.status === 404) { this.emit('gone'); this.stop(); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const v = await res.json();
        this.fails = 0;
        if (v.same) { if (this.state && v.watching !== this.state.watching) { this.state.watching = v.watching; this.emit('presence'); } }
        else this.take(v);
        if (this.fails === 0 && this.offline) { this.offline = false; this.emit('online'); }
      } catch (e) {
        this.fails++;
        if (this.fails === 3) { this.offline = true; this.emit('offline'); }
      } finally { this.inFlight = false; }
      const now = performance.now();
      if (now - this.pingAt > 8000) { this.pingAt = now; this.send({ op: 'ping', role: this.role }, { quiet: true }); }
    }
    const fast = performance.now() < this.fastUntil;
    const wait = this.fails ? Math.min(8000, 1000 * 2 ** this.fails) : fast ? 450 : 1200;
    this.timer = setTimeout(() => this.poll(), wait);
  }

  /** Merge a view from the server (a GET or the answer to a write). */
  take(v) {
    if (!v || v.same || v.error) return;
    const prev = this.state;
    this.rev = v.rev;
    const changed = new Set();
    const sk = v.sketch;
    if (sk) {
      if (sk.full) { this.strokes.clear(); changed.add('sketch-reset'); }
      else if (sk.ids) { const keep = new Set(sk.ids); for (const id of [...this.strokes.keys()]) if (!keep.has(id)) { this.strokes.delete(id); changed.add('sketch-reset'); } }
      for (const s of sk.strokes) { this.strokes.set(s.id, s); changed.add('sketch'); }
      this.sketchRev = sk.rev;
    }
    this.state = v;
    if (!prev) { this.emit('init'); return; }
    if (JSON.stringify(prev.notices) !== JSON.stringify(v.notices)) changed.add('notices');
    if (JSON.stringify(prev.photos.map((p) => p.id)) !== JSON.stringify(v.photos.map((p) => p.id))) changed.add('photos');
    if (prev.theme !== v.theme) changed.add('theme');
    if (prev.title !== v.title) changed.add('title');
    if (prev.pulse !== v.pulse) changed.add('pulse');
    if (JSON.stringify(prev.poll) !== JSON.stringify(v.poll)) changed.add('poll');
    if (JSON.stringify(prev.caption) !== JSON.stringify(v.caption)) changed.add('caption');
    const lastR = (s) => (s.reactions.length ? s.reactions[s.reactions.length - 1].at : 0);
    if (lastR(v) > lastR(prev)) changed.add('reactions');
    if (prev.watching !== v.watching || prev.controlling !== v.controlling) changed.add('presence');
    if (changed.size) this.hurry();
    for (const c of changed) this.emit(c, prev);
  }

  /** A write. Returns the server's answer (also merged into the state), or null on failure. */
  async send(body, { quiet = false } = {}) {
    try {
      const res = await fetch(`${API}/${this.code}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, k: this.key || undefined, sid: this.sid, s: this.sketchRev ?? undefined }),
      });
      const v = await res.json().catch(() => null);
      if (!res.ok) { if (!quiet) this.emit('error', { message: (v && v.error) || 'HTTP ' + res.status }); return null; }
      if (body.op !== 'ping') { this.take(v); this.hurry(); }
      return v;
    } catch (e) { if (!quiet) this.emit('error', { message: 'You look offline' }); return null; }
  }

  async sendPhoto(blob, w, h, from, fling) {
    const res = await fetch(`${API}/${this.code}/photo?w=${w}&h=${h}&from=${encodeURIComponent(from || '')}${fling ? '&fling=1' : ''}`, {
      method: 'POST', headers: { 'content-type': blob.type, 'x-holo-key': this.key }, body: blob,
    });
    const v = await res.json().catch(() => null);
    if (!res.ok) throw new Error((v && v.error) || 'HTTP ' + res.status);
    this.take(v); this.hurry();
    return v;
  }
  photoUrl(id) { return `${API}/${this.code}/photo/${id}`; }
}

/** "just now", "4 min ago"... */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}

export const THEMES = {
  cyan: { name: 'Cyan', c: '#3fe6ff', ink: '#062a33' },
  magenta: { name: 'Magenta', c: '#ff2fae', ink: '#3a0628' },
  gold: { name: 'Gold', c: '#ffc53d', ink: '#3a2a04' },
  lime: { name: 'Lime', c: '#7dff6a', ink: '#103a08' },
  white: { name: 'Ice', c: '#e8f6ff', ink: '#1a2a33' },
};
export const REACTIONS = [
  { e: 'fire', g: '🔥' }, { e: 'heart', g: '💙' }, { e: 'wow', g: '🤯' }, { e: 'clap', g: '👏' }, { e: 'lol', g: '😂' }, { e: '100', g: '💯' },
];
