import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";

// A QR code (SVG) for a Spray Bobo share link: ?id=<creation id>. Only our own /sb/ links, so this is
// not an open QR generator.

export const Route = createFileRoute("/api/spray/qr")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const id = u.searchParams.get("id") ?? "";
        if (!/^[A-Za-z0-9]{6,40}$/.test(id)) return new Response("bad id", { status: 400 });
        const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || u.host;
        const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
        const m = QRCode.create(`${proto}://${host}/sb/${id}`, { errorCorrectionLevel: "M" }).modules;
        const n = m.size, q = 2;
        let d = "";
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) if (m.get(x, y)) d += `M${x + q} ${y + q}h1v1h-1z`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#15131a" d="${d}"/></svg>`;
        return new Response(svg, {
          headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
        });
      },
    },
  },
});
