import { createFileRoute } from "@tanstack/react-router";

import {
  parseUserAgent,
  sessionKey,
  trackPayloadSchema,
  type StoredSession,
} from "@/lib/ar/events";
import { arStore, namespaceFromRequest } from "@/lib/ar/store.server";

// Analytics ingestion for the activated-retail demos. Public, same-origin,
// called with navigator.sendBeacon by public/vendor/ar-kit/track.js.
// No IP addresses are stored; country/city come from Netlify's geo header.

const MAX_BODY = 64 * 1024;
const MAX_EVENTS_PER_SESSION = 3000;

function readGeo(request: Request): StoredSession["geo"] {
  const raw = request.headers.get("x-nf-geo");
  if (raw) {
    try {
      const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      return { country: g?.country?.code ?? null, city: g?.city ?? null };
    } catch {
      /* fall through */
    }
  }
  return { country: request.headers.get("x-country"), city: null };
}

export const Route = createFileRoute("/api/ar/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        if (text.length > MAX_BODY) return new Response(null, { status: 413 });
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return new Response(null, { status: 400 });
        }
        const parsed = trackPayloadSchema.safeParse(body);
        if (!parsed.success) return new Response(null, { status: 400 });
        const p = parsed.data;

        const store = await arStore("sessions", namespaceFromRequest(request));
        const key = sessionKey(p.sid);
        const now = Date.now();
        await store.update<StoredSession>(key, (existing) => {
          const s: StoredSession = existing ?? {
            sid: p.sid,
            vid: p.vid,
            demo: p.demo,
            link: p.link ?? null,
            client: p.client ?? null,
            startedAt: parseInt(p.sid.split("-")[0], 36) || now,
            lastAt: now,
            activeMs: 0,
            ref: p.ref ?? null,
            screen: p.screen ?? null,
            device: parseUserAgent(request.headers.get("user-agent") ?? ""),
            geo: readGeo(request),
            events: [],
          };
          // a link can be resolved after the first flush
          if (!s.link && p.link) s.link = p.link;
          if (!s.client && p.client) s.client = p.client;
          if (typeof p.activeMs === "number") s.activeMs = Math.max(s.activeMs, p.activeMs);
          for (const e of p.events) {
            if (s.events.length >= MAX_EVENTS_PER_SESSION) break;
            // never trust a client clock that runs ahead of the server
            s.events.push({ n: e.n, ts: Math.min(e.ts, now), ...(e.p ? { p: e.p } : {}) });
          }
          s.lastAt = now;
          return s;
        });
        return new Response(null, { status: 204 });
      },
    },
  },
});
