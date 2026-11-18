import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { namedStore, namespaceFromRequest, type ArStore } from "@/lib/ar/store.server";

// MEDIALIFE Holocast: live data beamed into a world-tracked AR hologram.
//
// A "room" is one hologram: a notice board, a live sketch, photo drops, a colour theme and the reactions
// viewers send back. The AR page (/labs/holocast/) and the companion control room (/labs/holocast/control/)
// both talk to this API. Transport v1 is plain polling of one JSON record per room (Netlify Blobs, strong
// consistency, etag-checked writes so two people drawing at once don't lose strokes). Viewers poll ~0.5-1.2 s,
// so an update shows up in about a second; a Realtime broadcast (Supabase, as Spray Studio does) can be laid
// on top later for instant strokes without changing the stored shape.
//
// Who may do what:
//   - anyone with the room code (it is in the AR link and the floating QR): read the room, send a reaction,
//     say "I'm watching" (presence)
//   - anyone with the room's write key (the control link's #k=..., made when the room was created): post and
//     remove notices, draw, clear, drop photos, change the theme, fire a pulse
//
// Storage (store "holocast-<ns>", ns = prod / preview / dev by host, as the other tools):
//   rooms/<CODE>          the room record (RoomRecord below)
//   photos/<CODE>/<id>    JPEG / PNG / WebP bytes (<= 900 KB, resized in the browser first)

export const noStore = { "cache-control": "no-store" };
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...headers } });

const store = (req: Request) => namedStore(`holocast-${namespaceFromRequest(req)}`);

// room codes: easy to read out loud and type (no 0/O, 1/I/L)
const CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KEY_ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
const rand = (abc: string, n: number) => {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += abc[b[i] % abc.length];
  return s;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ── limits ─────────────────────────────────────────────────────────────── */
export const LIMITS = {
  noticeChars: 160,
  fromChars: 24,
  notices: 24,
  strokes: 500,
  points: 40000, // all strokes together (each point is two ints 0..1000)
  pointsPerStroke: 2500,
  photos: 6,
  photoBytes: 900 * 1024,
  reactions: 40,
  titleChars: 40,
};
export const THEMES = ["cyan", "magenta", "gold", "lime", "white"] as const;
export const COLOURS = /^#[0-9a-f]{6}$/i;
export const SCREENS = [
  "notice",
  "globe",
  "sketch",
  "photo",
  "poll",
  "caption",
  "ticker",
  "reacts",
] as const;
export const REACTIONS = ["fire", "heart", "wow", "clap", "lol", "100"] as const;

/* ── the record ─────────────────────────────────────────────────────────── */
export interface Notice {
  id: string;
  text: string;
  from: string;
  at: number;
  pinned?: boolean;
  fling?: boolean; // thrown from the control room (swipe up): it shoots out of the projector
}
export interface Stroke {
  id: string;
  c: string; // colour
  w: number; // width, 1..40 (in 1/1000 of the sketch width)
  p: number[]; // x0,y0,x1,y1,... ints 0..1000
  r: number; // the sketch rev it last changed at
  done?: boolean;
}
export interface Photo {
  id: string;
  at: number;
  from: string;
  type: string;
  w: number;
  h: number;
  fling?: boolean;
}
export interface Poll {
  id: string;
  q: string;
  options: string[];
  open: boolean;
  at: number;
  voters: Record<string, number>; // viewer session -> option index (never sent out)
}
export interface Caption {
  text: string;
  at: number;
  final: boolean;
  from: string;
}
/** The control room's camera, live in the hologram (WebRTC, with a slow JPEG relay as the fallback). */
export interface Live {
  id: string;
  from: string;
  at: number;
  beat: number; // the streaming control room's last heartbeat (its presence ping)
  aspect: number; // width / height of the feed
  audio: boolean;
}
export interface Reaction {
  e: string;
  at: number;
  panel: string;
}
interface RoomRecord {
  v: 1;
  code: string;
  keyHash: string;
  createdAt: number;
  rev: number; // bumps on every change
  title: string;
  theme: (typeof THEMES)[number];
  pulse: number; // a time: viewers fire the beam pulse when it changes
  notices: Notice[];
  sketch: { rev: number; base: number; strokes: Stroke[] };
  photos: Photo[];
  reactions: Reaction[];
  poll: Poll | null;
  caption: Caption | null;
  live?: Live | null;
  hide?: string[]; // screens switched off for everyone (see SCREENS)
  viewers: Record<string, number>; // session id -> last seen (ms)
  controllers: Record<string, number>;
  stats: { notices: number; strokes: number; photos: number; reactions: number };
}

const roomKey = (code: string) => `rooms/${code}`;
const newId = () => rand(KEY_ABC, 8);
const clean = (s: unknown, n: number) =>
  String(s ?? "")
    // eslint-disable-next-line no-control-regex -- strip control characters from user text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);

function seed(code: string, keyHash: string): RoomRecord {
  const now = Date.now();
  return {
    v: 1,
    code,
    keyHash,
    createdAt: now,
    rev: 1,
    title: "My Holocast",
    theme: "cyan",
    pulse: 0,
    notices: [
      {
        id: newId(),
        text: "Welcome to Holocast. Type in the control room and it beams in here.",
        from: "MEDIALIFE",
        at: now,
        pinned: true,
      },
    ],
    sketch: { rev: 1, base: 1, strokes: [] },
    photos: [],
    reactions: [],
    poll: null,
    caption: null,
    viewers: {},
    controllers: {},
    stats: { notices: 1, strokes: 0, photos: 0, reactions: 0 },
  };
}

const ACTIVE_MS = 15000;
const live = (m: Record<string, number>, now: number) =>
  Object.values(m).filter((t) => now - t < ACTIVE_MS).length;
const prune = (m: Record<string, number>, now: number) => {
  for (const [k, t] of Object.entries(m)) if (now - t > ACTIVE_MS * 4) delete m[k];
};

function pollView(p: Poll | null | undefined) {
  if (!p) return null;
  const counts = p.options.map(() => 0);
  for (const v of Object.values(p.voters)) if (counts[v] != null) counts[v]++;
  return {
    id: p.id,
    q: p.q,
    options: p.options,
    counts,
    total: counts.reduce((a, b) => a + b, 0),
    open: p.open,
    at: p.at,
  };
}

/** What a viewer / controller sees. Sketch strokes only since `s` (their last sketch rev) when possible. */
function view(r: RoomRecord, s: number | null) {
  const now = Date.now();
  const sk = r.sketch;
  const full = s == null || s < sk.base || s > sk.rev;
  return {
    code: r.code,
    rev: r.rev,
    title: r.title,
    theme: r.theme,
    pulse: r.pulse,
    notices: r.notices,
    photos: r.photos,
    reactions: r.reactions.slice(-12),
    poll: pollView(r.poll),
    caption: r.caption ?? null,
    live: r.live ?? null,
    hide: r.hide ?? [],
    watching: live(r.viewers, now),
    controlling: live(r.controllers, now),
    stats: r.stats,
    sketch: {
      rev: sk.rev,
      base: sk.base,
      full,
      ids: full ? undefined : sk.strokes.map((x) => x.id),
      strokes: full ? sk.strokes : sk.strokes.filter((x) => x.r > (s ?? 0)),
    },
    now,
  };
}

/* ── handlers ───────────────────────────────────────────────────────────── */

/** POST /api/holocast/rooms: a new room. Returns the code and the write key (shown once, kept by the maker). */
export async function createRoom(req: Request): Promise<Response> {
  const st = await store(req);
  for (let i = 0; i < 6; i++) {
    const code = rand(CODE_ABC, 6);
    if (await st.getJSON(roomKey(code))) continue;
    const key = rand(KEY_ABC, 20);
    const rec = seed(code, hash(key));
    await st.setJSON(roomKey(code), rec);
    return json({ code, key, room: view(rec, null) }, 201);
  }
  return json({ error: "try again" }, 503);
}

async function load(st: ArStore, code: string) {
  return st.getJSON<RoomRecord>(roomKey(code));
}

/** GET /api/holocast/<CODE>?s=<sketch rev>&r=<rev>: the room (or {same:true} when nothing changed). */
export async function getRoom(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  const url = new URL(req.url);
  const st = await store(req);
  const r = await load(st, code);
  if (!r) return json({ error: "no such room" }, 404);
  const rev = Number(url.searchParams.get("r"));
  if (Number.isFinite(rev) && rev === r.rev) {
    return json({
      same: true,
      rev: r.rev,
      watching: live(r.viewers, Date.now()),
      lb: r.live?.beat ?? 0,
      now: Date.now(),
    });
  }
  const s = url.searchParams.has("s") ? Number(url.searchParams.get("s")) : null;
  return json(view(r, Number.isFinite(s as number) ? s : null));
}

type Body = Record<string, unknown>;
const OPEN_OPS = new Set(["react", "ping", "vote"]);

/**
 * POST /api/holocast/<CODE> { op, k?, ... }
 *   ping   { sid, role: 'viewer'|'control' }   presence (no key needed for viewers)
 *   react  { e, panel, sid }                   a reaction from the hologram (no key)
 *   notice { text, from, pin? }                post a notice           (key)
 *   unnotice { id } / pin { id }               remove / pin one        (key)
 *   stroke { id, c, w, p: [..], done }         start or extend a stroke (key; p are the NEW points only)
 *   undo / clear                               the sketch              (key)
 *   theme  { theme } / title { title } / pulse (key)
 *   unphoto { id }                             remove a photo          (key)
 *   poll   { q, options: [2..4] } / endpoll    ask a live poll / close it (key)
 *   vote   { option, sid }                     a viewer's vote, one per session, can change (no key)
 *   say    { text, final, from }               live captions from the control room's mic (key)
 *   hide   { hide: [screen...] }              switch screens off for every viewer (key)
 *   live   { on, id?, aspect, audio, from }    start / update / stop the control room's camera feed (key)
 */
export async function postRoom(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const op = String(b.op ?? "");
  const st = await store(req);
  const cur = await load(st, code);
  if (!cur) return json({ error: "no such room" }, 404);
  const k = typeof b.k === "string" ? b.k : (req.headers.get("x-holo-key") ?? "");
  const keyOk = !!k && sameHash(hash(k), cur.keyHash);
  if (!OPEN_OPS.has(op) && !keyOk) return json({ error: "this link can't change the room" }, 403);
  b.keyOk = keyOk;
  let err: string | null = null;
  const next = await st.update<RoomRecord>(roomKey(code), (r) => {
    if (!r) return cur; // gone between reads: write it back as it was
    err = apply(r, op, b);
    return r;
  });
  if (err) return json({ error: err }, 400);
  const s = b.s != null ? Number(b.s) : null;
  return json(view(next, Number.isFinite(s as number) ? s : null));
}

function apply(r: RoomRecord, op: string, b: Body): string | null {
  const now = Date.now();
  const sid = clean(b.sid, 40);
  switch (op) {
    case "ping": {
      if (!sid) return "sid needed";
      (b.role === "control" ? r.controllers : r.viewers)[sid] = now;
      // the streaming control room's ping keeps its live feed alive (viewers drop a feed with no beat for 25 s)
      if (b.keyOk === true && r.live && b.live === r.live.id) r.live.beat = now;
      prune(r.viewers, now);
      prune(r.controllers, now);
      return null; // presence does not bump rev (viewers would refetch for nothing)
    }
    case "react": {
      const e = String(b.e ?? "");
      if (!(REACTIONS as readonly string[]).includes(e)) return "unknown reaction";
      // one reaction per viewer every 300 ms is plenty
      const lastMine = r.reactions.length && r.reactions[r.reactions.length - 1];
      if (lastMine && now - lastMine.at < 120) return null;
      r.reactions.push({ e, at: now, panel: clean(b.panel, 16) });
      if (r.reactions.length > LIMITS.reactions)
        r.reactions.splice(0, r.reactions.length - LIMITS.reactions);
      r.stats.reactions++;
      if (sid) r.viewers[sid] = now;
      break;
    }
    case "notice": {
      const text = clean(b.text, LIMITS.noticeChars);
      if (!text) return "empty notice";
      const n: Notice = {
        id: newId(),
        text,
        from: clean(b.from, LIMITS.fromChars) || "Control room",
        at: now,
      };
      if (b.fling) n.fling = true;
      if (b.pin) {
        r.notices.forEach((x) => delete x.pinned);
        n.pinned = true;
      }
      r.notices.push(n);
      // keep the newest, but never drop the pinned one
      while (r.notices.length > LIMITS.notices) {
        const i = r.notices.findIndex((x) => !x.pinned);
        r.notices.splice(i < 0 ? 0 : i, 1);
      }
      r.stats.notices++;
      break;
    }
    case "unnotice": {
      const i = r.notices.findIndex((x) => x.id === b.id);
      if (i < 0) return null;
      r.notices.splice(i, 1);
      break;
    }
    case "pin": {
      const n = r.notices.find((x) => x.id === b.id);
      if (!n) return null;
      const was = !!n.pinned;
      r.notices.forEach((x) => delete x.pinned);
      if (!was) n.pinned = true;
      break;
    }
    case "stroke": {
      const id = clean(b.id, 16);
      if (!id) return "stroke id needed";
      const pts = Array.isArray(b.p) ? (b.p as unknown[]).map((v) => Math.round(Number(v))) : [];
      if (pts.length % 2 || pts.some((v) => !Number.isFinite(v) || v < -50 || v > 1050))
        return "bad points";
      const sk = r.sketch;
      let s = sk.strokes.find((x) => x.id === id);
      if (!s) {
        const c = String(b.c ?? "#ffffff");
        if (!COLOURS.test(c)) return "bad colour";
        s = { id, c, w: Math.max(1, Math.min(40, Math.round(Number(b.w) || 6))), p: [], r: 0 };
        sk.strokes.push(s);
        r.stats.strokes++;
        if (sk.strokes.length > LIMITS.strokes) {
          sk.strokes.splice(0, sk.strokes.length - LIMITS.strokes);
          sk.base = sk.rev + 1; // viewers that missed the dropped ones must reload all
        }
      }
      const room = Math.min(
        LIMITS.pointsPerStroke * 2 - s.p.length,
        LIMITS.points * 2 - sk.strokes.reduce((a, x) => a + x.p.length, 0),
      );
      if (room > 0) s.p.push(...pts.slice(0, room - (room % 2)));
      if (b.done) s.done = true;
      sk.rev = Math.max(sk.rev + 1, sk.base);
      s.r = sk.rev;
      break;
    }
    case "undo": {
      const sk = r.sketch;
      if (!sk.strokes.length) return null;
      sk.strokes.pop();
      sk.rev++;
      sk.base = sk.rev;
      break;
    }
    case "clear": {
      const sk = r.sketch;
      sk.strokes = [];
      sk.rev++;
      sk.base = sk.rev;
      break;
    }
    case "theme": {
      const t = String(b.theme ?? "");
      if (!(THEMES as readonly string[]).includes(t)) return "unknown theme";
      r.theme = t as RoomRecord["theme"];
      break;
    }
    case "title": {
      r.title = clean(b.title, LIMITS.titleChars) || "My Holocast";
      break;
    }
    case "pulse": {
      r.pulse = now;
      break;
    }
    case "unphoto": {
      const i = r.photos.findIndex((x) => x.id === b.id);
      if (i < 0) return null;
      r.photos.splice(i, 1);
      break;
    }
    case "poll": {
      const q = clean(b.q, 90);
      const options = (Array.isArray(b.options) ? (b.options as unknown[]) : [])
        .map((o) => clean(o, 28))
        .filter(Boolean)
        .slice(0, 4);
      if (!q || options.length < 2) return "a question and at least two answers";
      r.poll = { id: newId(), q, options, open: true, at: now, voters: {} };
      break;
    }
    case "endpoll": {
      if (!r.poll) return null;
      if (b.clear) r.poll = null;
      else r.poll.open = false;
      break;
    }
    case "vote": {
      const p = r.poll;
      if (!p || !p.open) return "the poll is closed";
      if (!sid) return "sid needed";
      const o = Math.round(Number(b.option));
      if (!(o >= 0 && o < p.options.length)) return "no such answer";
      if (p.voters[sid] === o) return null;
      if (!(sid in p.voters) && Object.keys(p.voters).length >= 5000) return "poll full";
      p.voters[sid] = o;
      r.viewers[sid] = now;
      break;
    }
    case "say": {
      const text = clean(b.text, 220);
      if (!text) {
        r.caption = null;
        break;
      }
      r.caption = {
        text,
        at: now,
        final: !!b.final,
        from: clean(b.from, LIMITS.fromChars) || "Control room",
      };
      break;
    }
    case "hide": {
      const want = Array.isArray(b.hide) ? b.hide.map(String) : [];
      r.hide = (SCREENS as readonly string[]).filter((n) => want.includes(n));
      break;
    }
    case "live": {
      if (!b.on) {
        if (!b.id || !r.live || b.id === r.live.id) r.live = null;
        break;
      }
      const aspect = Math.max(0.3, Math.min(3, Number(b.aspect) || 16 / 9));
      if (r.live && b.id === r.live.id) {
        r.live.aspect = aspect;
        r.live.beat = now;
        break;
      }
      r.live = {
        id: newId(),
        from: clean(b.from, LIMITS.fromChars) || "Control room",
        at: now,
        beat: now,
        aspect,
        audio: !!b.audio,
      };
      break;
    }
    default:
      return "unknown op";
  }
  if (sid && op !== "react" && op !== "vote") r.controllers[sid] = now;
  r.rev++;
  return null;
}

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** POST /api/holocast/<CODE>/photo (raw image body, x-holo-key, ?w=&h=&from=): a photo drop. */
export async function postPhoto(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!PHOTO_TYPES.has(type)) return json({ error: "JPEG, PNG or WebP only" }, 415);
  const st = await store(req);
  const cur = await load(st, code);
  if (!cur) return json({ error: "no such room" }, 404);
  const k = req.headers.get("x-holo-key") ?? "";
  if (!k || !sameHash(hash(k), cur.keyHash))
    return json({ error: "this link can't change the room" }, 403);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return json({ error: "empty" }, 400);
  if (buf.byteLength > LIMITS.photoBytes) return json({ error: "too big (resize first)" }, 413);
  const url = new URL(req.url);
  const id = newId();
  await st.setBytes(`photos/${code}/${id}`, buf, { type });
  const photo: Photo = {
    id,
    at: Date.now(),
    from: clean(url.searchParams.get("from"), LIMITS.fromChars) || "Control room",
    type,
    w: Math.max(1, Math.min(4096, Number(url.searchParams.get("w")) || 1)),
    h: Math.max(1, Math.min(4096, Number(url.searchParams.get("h")) || 1)),
  };
  if (url.searchParams.get("fling") === "1") photo.fling = true;
  const dropped: string[] = [];
  const next = await st.update<RoomRecord>(roomKey(code), (r) => {
    if (!r) return cur;
    r.photos.push(photo);
    while (r.photos.length > LIMITS.photos) dropped.push(r.photos.shift()!.id);
    r.stats.photos++;
    r.rev++;
    return r;
  });
  for (const d of dropped) await st.del(`photos/${code}/${d}`).catch(() => undefined);
  return json(view(next, null), 201);
}

/** GET /api/holocast/<CODE>/photo/<id>: the bytes (immutable, cached). */
export async function getPhoto(req: Request, code: string, id: string): Promise<Response> {
  if (!CODE_RE.test(code) || !/^[A-Za-z0-9]{8}$/.test(id))
    return new Response("not found", { status: 404 });
  const st = await store(req);
  const r = await load(st, code);
  const p = r?.photos.find((x) => x.id === id);
  const bytes = p ? await st.getBytes(`photos/${code}/${id}`) : null;
  if (!p || !bytes) return new Response("not found", { status: 404, headers: noStore });
  return new Response(bytes, {
    headers: { "content-type": p.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}

/* ── live video: WebRTC signalling + a JPEG relay for when peers can't connect ─────────────────────────────
 *
 * The control room's camera goes to each phone watching over its own WebRTC peer connection (the control room
 * is the hub; fine for a room of a few phones). Signalling rides this store, polled, without trickle ICE:
 *   viewer -> host  join            "I'm watching, send me an offer"
 *   host -> viewer  offer {sdp}     (candidates gathered into the SDP)
 *   viewer -> host  answer {sdp}
 *   viewer -> host  relay           "no direct path (strict NAT, no TURN): send frames instead"
 *   viewer -> host  leave / host -> viewer bye
 * Messages live 45 s in rtc/<CODE>. The relay is one JPEG at frames/<CODE>, overwritten ~2x a second, only
 * while someone asked for it in the last 15 s.
 *
 * ICE servers: Google STUN, plus TURN when HOLOCAST_ICE_SERVERS (a JSON RTCIceServer[]) or Cloudflare TURN
 * keys (HOLOCAST_CF_TURN_KEY_ID + HOLOCAST_CF_TURN_TOKEN) are set on the site. With TURN nobody needs the relay.
 */
export interface RtcMsg {
  n: number;
  to: string; // "host" or a viewer session id
  from: string;
  kind: "join" | "answer" | "relay" | "leave" | "offer" | "bye";
  live: string; // the live id it belongs to
  sdp?: string;
  at: number;
}
interface RtcBox {
  seq: number;
  msgs: RtcMsg[];
}
const rtcKey = (code: string) => `rtc/${code}`;
const VIEWER_KINDS = new Set(["join", "answer", "relay", "leave"]);
const HOST_KINDS = new Set(["offer", "bye"]);
const SID_RE = /^[A-Za-z0-9]{4,40}$/;

async function iceServers(): Promise<unknown[]> {
  const out: unknown[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
  const raw = env("HOLOCAST_ICE_SERVERS");
  if (raw) {
    try {
      const extra = JSON.parse(raw);
      if (Array.isArray(extra)) out.push(...extra);
    } catch {
      /* ignore a bad value */
    }
  }
  const id = env("HOLOCAST_CF_TURN_KEY_ID");
  const tok = env("HOLOCAST_CF_TURN_TOKEN");
  if (id && tok) {
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
          body: JSON.stringify({ ttl: 6 * 3600 }),
        },
      );
      const j = (await r.json()) as { iceServers?: unknown };
      if (Array.isArray(j.iceServers)) out.push(...j.iceServers);
      else if (j.iceServers) out.push(j.iceServers);
    } catch {
      /* STUN only */
    }
  }
  return out;
}

/** GET /api/holocast/<CODE>/rtc?for=<sid|host>&after=<n>[&ice=1]: messages for me (host needs the key). */
export async function getRtc(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  const url = new URL(req.url);
  const who = url.searchParams.get("for") ?? "";
  const after = Number(url.searchParams.get("after")) || 0;
  const st = await store(req);
  if (who === "host") {
    const r = await load(st, code);
    if (!r) return json({ error: "no such room" }, 404);
    const k = req.headers.get("x-holo-key") ?? "";
    if (!k || !sameHash(hash(k), r.keyHash)) return json({ error: "control link only" }, 403);
  } else if (!SID_RE.test(who)) return json({ error: "bad id" }, 400);
  const box = await st.getJSON<RtcBox>(rtcKey(code));
  const now = Date.now();
  const msgs = (box?.msgs ?? []).filter((m) => m.to === who && m.n > after && now - m.at < 45000);
  const out: Record<string, unknown> = { msgs, seq: box?.seq ?? 0, now };
  if (url.searchParams.get("ice") === "1") out.ice = await iceServers();
  return json(out);
}

/** POST /api/holocast/<CODE>/rtc { kind, to?, from?, live, sdp? } (offer / bye need x-holo-key). */
export async function postRtc(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const kind = String(b.kind ?? "") as RtcMsg["kind"];
  const st = await store(req);
  const r = await load(st, code);
  if (!r) return json({ error: "no such room" }, 404);
  if (!r.live || b.live !== r.live.id) return json({ error: "not live" }, 409);
  let to: string;
  let from: string;
  if (HOST_KINDS.has(kind)) {
    const k = req.headers.get("x-holo-key") ?? "";
    if (!k || !sameHash(hash(k), r.keyHash)) return json({ error: "control link only" }, 403);
    to = String(b.to ?? "");
    from = "host";
    if (!SID_RE.test(to)) return json({ error: "bad id" }, 400);
  } else if (VIEWER_KINDS.has(kind)) {
    to = "host";
    from = String(b.from ?? "");
    if (!SID_RE.test(from)) return json({ error: "bad id" }, 400);
  } else return json({ error: "unknown kind" }, 400);
  const sdp = typeof b.sdp === "string" ? b.sdp : undefined;
  if ((kind === "offer" || kind === "answer") && (!sdp || sdp.length > 20000))
    return json({ error: "bad sdp" }, 400);
  const now = Date.now();
  const live = r.live.id;
  const box = await st.update<RtcBox>(rtcKey(code), (cur) => {
    const x: RtcBox = cur ?? { seq: 0, msgs: [] };
    x.msgs = x.msgs.filter((m) => now - m.at < 45000 && m.live === live);
    // one pending message of a kind per pair is enough (a re-join replaces the old one)
    x.msgs = x.msgs.filter((m) => !(m.to === to && m.from === from && m.kind === kind));
    x.seq++;
    x.msgs.push({ n: x.seq, to, from, kind, live, sdp, at: now });
    if (x.msgs.length > 120) x.msgs.splice(0, x.msgs.length - 120);
    return x;
  });
  return json({ ok: true, n: box.seq });
}

const FRAME_TYPES = new Set(["image/jpeg", "image/webp"]);
/** POST /api/holocast/<CODE>/frame (raw JPEG, x-holo-key): the relay frame. GET: the latest one. */
export async function postFrame(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!FRAME_TYPES.has(type)) return json({ error: "JPEG or WebP only" }, 415);
  const st = await store(req);
  const r = await load(st, code);
  if (!r) return json({ error: "no such room" }, 404);
  const k = req.headers.get("x-holo-key") ?? "";
  if (!k || !sameHash(hash(k), r.keyHash)) return json({ error: "control link only" }, 403);
  if (!r.live) return json({ error: "not live" }, 409);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 200 * 1024) return json({ error: "bad size" }, 413);
  await st.setBytes(`frames/${code}`, buf, { type, at: String(Date.now()), live: r.live.id });
  return json({ ok: true });
}
export async function getFrame(req: Request, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return new Response("not found", { status: 404 });
  const st = await store(req);
  const bytes = await st.getBytes(`frames/${code}`);
  if (!bytes) return new Response("not found", { status: 404, headers: noStore });
  return new Response(bytes, { headers: { "content-type": "image/jpeg", ...noStore } });
}
