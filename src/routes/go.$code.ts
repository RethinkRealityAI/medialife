import { createFileRoute } from "@tanstack/react-router";

import { getExperience, getProduct, recordScan, resolveTriggerCode } from "@/lib/hub/data.server";
import { hubNs } from "@/lib/hub/store.server";

// /go/<code> — the activation link a product's QR code encodes and its NFC tag
// opens. It counts the scan for the creator's dashboard and sends the fan to
// the product's experience.
//
// Because the printed code points here rather than at the experience itself,
// the experience can be rebuilt, moved or swapped for a seasonal one without
// reprinting a single product.

// Link unfurlers fetch the URL when someone pastes it in a chat; they are not scans.
const BOTS =
  /bot|crawl|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram|twitter|skype|linkedin|embedly|quora|pinterest|vkshare|headless/i;

const HOME = "https://medialife.ai/";

function redirect(to: string) {
  return new Response(null, {
    status: 302,
    headers: {
      location: to,
      // every scan has to reach the function to be counted
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}

const safeUrl = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : null);

export const Route = createFileRoute("/go/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = hubNs(request);
        const ref = await resolveTriggerCode(ns, params.code.toLowerCase());
        if (!ref) return redirect(HOME);
        const product = await getProduct(ns, ref.creatorId, ref.productId);
        if (!product) return redirect(HOME);
        const experience = product.experienceId
          ? await getExperience(ns, ref.creatorId, product.experienceId)
          : null;
        const target = safeUrl(experience?.url) ?? safeUrl(product.commerce.shopUrl) ?? HOME;

        const ua = request.headers.get("user-agent") ?? "";
        if (ua && !BOTS.test(ua)) {
          try {
            await recordScan(ns, ref.creatorId, ref.productId);
          } catch (err) {
            // a scan that can't be counted must still open the experience
            console.error("[creator-hub] scan not recorded", err);
          }
        }
        return redirect(target);
      },
    },
  },
});
