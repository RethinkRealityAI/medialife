import { createFileRoute } from "@tanstack/react-router";

import { ipGeo } from "@/lib/bobo/events.server";
import { countryPlace, nearestPlace, placeByName } from "@/lib/bobo/geo.server";

// "Bring Bobo to me" on /evade/where-is-bobo/: the visitor's city from
// Netlify's IP geolocation, snapped to the nearest big city. No permission
// prompt, city-level only, never stored. 404 when the location is unknown
// (local dev, some VPNs), and the page then offers the browser's location.
// With ?lat=&lng= it only names the nearest city for those coordinates.

export const Route = createFileRoute("/api/bobo/near")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = { "cache-control": "private, no-store" };
        // ?lat=&lng= (from the browser's location prompt) just names the nearest city
        const q = new URL(request.url).searchParams;
        const lat = Number(q.get("lat"));
        const lng = Number(q.get("lng"));
        if (
          q.has("lat") &&
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180
        ) {
          const n = await nearestPlace(lat, lng, 150);
          const body = n
            ? { city: n.city, country: n.country, countryCode: n.countryCode, lat, lng }
            : { city: "", country: "", countryCode: "", lat, lng };
          return Response.json(body, { headers });
        }
        const g = ipGeo(request);
        const p = g
          ? ((Number.isFinite(g.lat) ? await nearestPlace(g.lat, g.lng, 80) : null) ??
            (g.city ? await placeByName(g.city, g.cc) : null) ??
            (await countryPlace(g.cc)))
          : null;
        if (!p) return Response.json({ error: "unknown" }, { status: 404, headers });
        return Response.json(
          { city: p.city, country: p.country, countryCode: p.countryCode, lat: p.lat, lng: p.lng },
          { headers },
        );
      },
    },
  },
});
