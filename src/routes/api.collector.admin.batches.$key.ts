import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/ar/auth.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { batchCodes, batchCsv } from "@/lib/collector/admin.server";
import { qrSvgString } from "@/components/admin/qr-matrix";

// Admin: a batch's codes for the factory, regenerated from the secret.
//   ?format=csv  serial, code, claim_url, product, batch, claimed
//   ?format=qr   a printable sheet: one QR (the claim URL) + code per cell

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export const Route = createFileRoute("/api/collector/admin/batches/$key")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const deny = await requireAdmin(request);
        if (deny) return deny;
        if (!/^[2-9A-Z]{2}$/.test(params.key)) return new Response("not found", { status: 404 });
        const data = await batchCodes(namespaceFromRequest(request), params.key);
        if (!data) return new Response("not found", { status: 404 });
        const { batch, rows } = data;
        const format = new URL(request.url).searchParams.get("format");
        const name = `bobo-codes-${batch.product}-${batch.key}`;
        if (format === "qr") {
          const cells = rows
            .map(
              (r) =>
                `<figure>${qrSvgString(r.url).replace(/width="\d+" height="\d+"/, "")}<figcaption><b>${esc(r.code)}</b><span>#${String(r.serial).padStart(5, "0")}</span></figcaption></figure>`,
            )
            .join("");
          const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(name)}</title>
<style>@page{margin:10mm}body{font:12px/1.3 Helvetica,Arial,sans-serif;margin:0;color:#000}header{padding:8px 0 12px}
main{display:grid;grid-template-columns:repeat(5,1fr);gap:6mm}figure{margin:0;break-inside:avoid;text-align:center}
svg{width:100%;height:auto}figcaption{display:flex;flex-direction:column;gap:2px;font-family:Menlo,Consolas,monospace}
figcaption span{color:#555;font-size:10px}</style></head><body>
<header><b>${esc(batch.label)}</b> · ${batch.count} codes · batch ${batch.key} · each QR opens ${esc(batch.experienceUrl)} with its code</header>
<main>${cells}</main></body></html>`;
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        }
        return new Response(batchCsv(batch, rows), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${name}.csv"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
