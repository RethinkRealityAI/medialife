import { getCreator, getFile, getProduct, listOrders, listProducts, scansFor } from "./data.server";
import { HUB, lineUnits, triggerUrl, type Product } from "./model";
import { hubStore, newId, sha256Hex, type HubNamespace } from "./store.server";

// The Live Drop overlay: a browser source a creator adds to OBS / Streamlabs /
// TikTok Live Studio that shows their merch selling in real time — a sales
// goal filling up, an alert for every order, the QR viewers scan, confetti
// when the goal is hit.
//
// The overlay URL carries a secret token (like every streaming-alert service):
// OBS has no cookies, so the token is the credential. It can be regenerated at
// any time, which kills the old URL. The public feed carries only what's fit
// to show on stream: product names, quantities, buyer COUNTRY, totals. Never a
// buyer's name, never money unless the creator turns it on.

export type OverlaySettings = {
  enabled: boolean;
  /** The product the overlay sells; null = every live product. */
  productId: string | null;
  /** Units to reach; 0 hides the goal bar. Counts from `goalStartedAt`. */
  goal: number;
  goalStartedAt: number;
  headline: string;
  /** Where the on-stream QR points: the product's activation link or its shop page. */
  qrTarget: "shop" | "activation";
  showQr: boolean;
  /** Show revenue on stream. Off by default — most creators won't want it. */
  showRevenue: boolean;
  position: "bottom" | "top";
  accent: "ember" | "cyan" | "magenta" | "lime";
  /** Set by "Send a test alert"; the overlay plays a fake order when it changes. */
  testAt: number | null;
};

type OverlayRecord = OverlaySettings & { token: string; createdAt: number };

const overlayKey = (creatorId: string) => `overlay/${creatorId}`;
const tokenKey = (hash: string) => `overlay-token/${hash}`;

export const defaultOverlay = (): OverlaySettings => ({
  enabled: true,
  productId: null,
  goal: 100,
  goalStartedAt: Date.now(),
  headline: "Scan to unlock",
  qrTarget: "shop",
  showQr: true,
  showRevenue: false,
  position: "bottom",
  accent: "ember",
  testAt: null,
});

async function createRecord(
  ns: HubNamespace,
  creatorId: string,
  base?: OverlaySettings,
): Promise<OverlayRecord> {
  const store = await hubStore(ns);
  const token = newId(24, false);
  const rec: OverlayRecord = { ...(base ?? defaultOverlay()), token, createdAt: Date.now() };
  await store.setJSON(overlayKey(creatorId), rec);
  await store.setJSON(tokenKey(await sha256Hex(token)), { creatorId });
  return rec;
}

/** The creator's overlay, created on first use. */
export async function getOverlay(ns: HubNamespace, creatorId: string): Promise<OverlayRecord> {
  const rec = await (await hubStore(ns)).getJSON<OverlayRecord>(overlayKey(creatorId));
  return rec ?? createRecord(ns, creatorId);
}

export async function saveOverlay(
  ns: HubNamespace,
  creatorId: string,
  patch: Partial<OverlaySettings>,
) {
  const cur = await getOverlay(ns, creatorId);
  const next: OverlayRecord = { ...cur, ...patch };
  await (await hubStore(ns)).setJSON(overlayKey(creatorId), next);
  return next;
}

/** A new secret URL; the old one stops working immediately. */
export async function rotateOverlay(ns: HubNamespace, creatorId: string) {
  const cur = await getOverlay(ns, creatorId);
  await (await hubStore(ns)).del(tokenKey(await sha256Hex(cur.token)));
  const { token: _t, createdAt: _c, ...settings } = cur;
  return createRecord(ns, creatorId, settings);
}

export const overlayPath = (token: string) => `/overlay/${token}`;

async function creatorForToken(ns: HubNamespace, token: string) {
  if (!/^[A-Za-z0-9]{20,80}$/.test(token)) return null;
  const ref = await (
    await hubStore(ns)
  ).getJSON<{ creatorId: string }>(tokenKey(await sha256Hex(token)));
  if (!ref) return null;
  const rec = await getOverlay(ns, ref.creatorId);
  return rec.token === token ? { creatorId: ref.creatorId, rec } : null;
}

const COUNTRY_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export type OverlayFeed = {
  status: "live";
  creator: string;
  settings: Omit<OverlaySettings, "enabled">;
  product: { name: string; sku: string; image: string | null } | null;
  qrUrl: string | null;
  units: number;
  revenue: number | null;
  currency: string;
  scans: number;
  /** Newest first. ids are opaque and stable, so the overlay can tell what's new. */
  recent: Array<{
    id: string;
    at: number;
    product: string;
    qty: number;
    country: string | null;
    flag: string | null;
  }>;
  serverTime: number;
};

const flagOf = (cc: string | null) =>
  cc && /^[A-Z]{2}$/.test(cc)
    ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : null;

/**
 * What the overlay shows: the feed, "off" (the creator switched it off or isn't
 * approved yet — the overlay renders nothing) or "gone" (an unknown or rotated
 * link — the overlay says so). Both are 200s, so OBS's console stays clean.
 */
export async function overlayFeed(
  ns: HubNamespace,
  token: string,
  origin: string,
): Promise<OverlayFeed | { status: "off" } | { status: "gone" }> {
  const hit = await creatorForToken(ns, token);
  if (!hit) return { status: "gone" };
  if (!hit.rec.enabled) return { status: "off" };
  const { creatorId, rec } = hit;
  const [creator, products, orders] = await Promise.all([
    getCreator(ns, creatorId),
    listProducts(ns, creatorId),
    listOrders(ns, creatorId),
  ]);
  if (!creator) return { status: "gone" };
  if (creator.status !== "approved") return { status: "off" };

  const focus: Product | null = rec.productId
    ? (products.find((p) => p.id === rec.productId) ?? null)
    : null;
  const inScope = (productId: string) => (focus ? productId === focus.id : true);

  let units = 0;
  let revenue = 0;
  const recent: OverlayFeed["recent"] = [];
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const lines = o.lines.filter((l) => inScope(l.productId));
    if (!lines.length) continue;
    if (o.createdAt >= rec.goalStartedAt) {
      for (const l of lines) {
        units += lineUnits(l);
        revenue += Math.max(0, l.unitPrice * l.qty - l.discount - l.refunded);
      }
    }
    if (recent.length < 12) {
      recent.push({
        // opaque: never the store's order number
        id: (await sha256Hex(`${token}:${o.id}`)).slice(0, 16),
        at: o.createdAt,
        product: lines.map((l) => l.name).join(" + "),
        qty: lines.reduce((s, l) => s + l.qty, 0),
        country: o.country ? (COUNTRY_NAMES?.of(o.country) ?? o.country) : null,
        flag: flagOf(o.country),
      });
    }
  }

  const live = products.filter((p) => p.stage === "live");
  const qrProduct = focus ?? live[0] ?? null;
  const qrUrl = qrProduct
    ? rec.qrTarget === "activation"
      ? triggerUrl(origin, qrProduct.trigger.code)
      : qrProduct.commerce.shopUrl || triggerUrl(origin, qrProduct.trigger.code)
    : null;
  const scans = Object.values(
    await scansFor(ns, creatorId, focus ? [focus.id] : live.map((p) => p.id)),
  ).reduce((s, x) => s + x.total, 0);
  const imageProduct = focus ?? live[0] ?? null;
  const { enabled: _e, token: _t, createdAt: _c, ...settings } = rec;
  return {
    status: "live",
    creator: creator.profile.displayName,
    settings,
    product: imageProduct
      ? {
          name: focus
            ? focus.name
            : live.length > 1
              ? `${creator.profile.displayName} merch`
              : imageProduct.name,
          sku: imageProduct.sku,
          image: imageProduct.imageFileId ? `/api/hub/overlay/${token}/image` : null,
        }
      : null,
    qrUrl,
    units,
    revenue: rec.showRevenue ? revenue : null,
    currency: orders[0]?.currency ?? "USD",
    scans,
    recent,
    serverTime: Date.now(),
  };
}

/** The hero image of the overlay's product, for OBS (which has no hub cookie). */
export async function overlayImage(ns: HubNamespace, token: string) {
  const hit = await creatorForToken(ns, token);
  if (!hit || !hit.rec.enabled) return null;
  const products = await listProducts(ns, hit.creatorId);
  const p = hit.rec.productId
    ? await getProduct(ns, hit.creatorId, hit.rec.productId)
    : (products.find((x) => x.stage === "live") ?? null);
  if (!p?.imageFileId) return null;
  const file = await getFile(ns, hit.creatorId, p.imageFileId);
  return file?.complete ? file : null;
}

export { HUB };
