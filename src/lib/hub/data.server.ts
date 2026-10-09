import {
  HUB,
  emptyCreator,
  summarizeEarnings,
  totalAudience,
  type Activity,
  type ActivityKind,
  type Creator,
  type CreatorAdminFields,
  type CreatorStatus,
  type Experience,
  type HubFile,
  type Invite,
  type Message,
  type Order,
  type Payout,
  type Product,
  type ScanStats,
} from "./model";
import { KEYS, hubStore, newId, readAll, type HubNamespace } from "./store.server";

// Repositories for the Creator Hub. Every read and write of hub records goes
// through here, so the server functions, API routes and webhooks agree on keys
// and side effects (index upkeep, activity entries).

/* ---------------------------------------------------------------------------
   Creators
   --------------------------------------------------------------------------- */

/** What the admin list shows without reading every creator record. */
export type CreatorSummary = {
  id: string;
  displayName: string;
  email: string;
  status: CreatorStatus;
  agency: string | null;
  createdAt: number;
  submittedAt: number | null;
  updatedAt: number;
  skus: string[];
  audience: number;
  platforms: string[];
};

const summarize = (c: Creator): CreatorSummary => ({
  id: c.id,
  displayName: c.profile.displayName || c.profile.email,
  email: c.profile.email,
  status: c.status,
  agency: c.agency?.name ?? null,
  createdAt: c.createdAt,
  submittedAt: c.submittedAt,
  updatedAt: c.updatedAt,
  skus: c.interests.skus,
  audience: totalAudience(c.channels),
  platforms: c.channels.filter((ch) => ch.handle.trim()).map((ch) => ch.platform),
});

export async function getCreator(ns: HubNamespace, id: string) {
  return (await hubStore(ns)).getJSON<Creator>(KEYS.creator(id));
}

export async function saveCreator(ns: HubNamespace, c: Creator) {
  const store = await hubStore(ns);
  c.updatedAt = Date.now();
  await store.setJSON(KEYS.creator(c.id), c);
  await store.update<Record<string, CreatorSummary>>(KEYS.creatorIndex(), (cur) => ({
    ...(cur ?? {}),
    [c.id]: summarize(c),
  }));
  return c;
}

export async function createCreator(ns: HubNamespace, userId: string, email: string) {
  return saveCreator(ns, emptyCreator(newId(), userId, email));
}

export async function listCreatorSummaries(ns: HubNamespace): Promise<CreatorSummary[]> {
  const idx =
    (await (await hubStore(ns)).getJSON<Record<string, CreatorSummary>>(KEYS.creatorIndex())) ?? {};
  return Object.values(idx).sort(
    (a, b) => (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt),
  );
}

const emptyAdmin = (): CreatorAdminFields => ({
  internalNotes: "",
  manager: { name: "", email: "", discord: "" },
  tags: [],
});

export async function getCreatorAdmin(ns: HubNamespace, id: string): Promise<CreatorAdminFields> {
  return {
    ...emptyAdmin(),
    ...((await (await hubStore(ns)).getJSON<CreatorAdminFields>(KEYS.creatorAdmin(id))) ?? {}),
  };
}

export async function saveCreatorAdmin(ns: HubNamespace, id: string, f: CreatorAdminFields) {
  await (await hubStore(ns)).setJSON(KEYS.creatorAdmin(id), f);
}

/** The manager a creator sees: name and how to reach them. Notes and tags stay internal. */
export async function getManager(ns: HubNamespace, creatorId: string) {
  const a = await getCreatorAdmin(ns, creatorId);
  return a.manager.name || a.manager.email ? a.manager : null;
}

/* ---------------------------------------------------------------------------
   Products, experiences, files
   --------------------------------------------------------------------------- */

export async function listProducts(ns: HubNamespace, creatorId: string) {
  const all = await readAll<Product>(await hubStore(ns), KEYS.products(creatorId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getProduct(ns: HubNamespace, creatorId: string, id: string) {
  return (await hubStore(ns)).getJSON<Product>(KEYS.product(creatorId, id));
}

export async function saveProduct(ns: HubNamespace, p: Product) {
  const store = await hubStore(ns);
  p.updatedAt = Date.now();
  await store.setJSON(KEYS.product(p.creatorId, p.id), p);
  await store.setJSON(KEYS.code(p.trigger.code), { creatorId: p.creatorId, productId: p.id });
  await indexCommerce(ns, p);
  return p;
}

export async function deleteProduct(ns: HubNamespace, p: Product) {
  const store = await hubStore(ns);
  await store.del(KEYS.product(p.creatorId, p.id));
  await store.del(KEYS.code(p.trigger.code));
  await indexCommerce(ns, p, true);
}

/* ---------------------------------------------------------------------------
   Commerce index: which product an incoming order line belongs to
   --------------------------------------------------------------------------- */

export type CommerceRef = { creatorId: string; productId: string };
type CommerceIndex = Record<string, CommerceRef>;
const COMMERCE_INDEX = "index/commerce";

/** Keys an order line can match on: a Shopify product id, or a variant SKU (case-insensitive). */
export const commerceKeys = (p: Pick<Product, "commerce">) => [
  ...p.commerce.shopifyProductIds.map((id) => `pid:${id.trim()}`),
  ...p.commerce.skus.map((s) => `sku:${s.trim().toLowerCase()}`),
];

async function indexCommerce(ns: HubNamespace, p: Product, remove = false) {
  const store = await hubStore(ns);
  const mine = new Set(remove ? [] : commerceKeys(p));
  await store.update<CommerceIndex>(COMMERCE_INDEX, (cur) => {
    const next: CommerceIndex = {};
    for (const [k, ref] of Object.entries(cur ?? {})) {
      if (ref.productId !== p.id) next[k] = ref;
    }
    for (const k of mine) next[k] = { creatorId: p.creatorId, productId: p.id };
    return next;
  });
}

export async function commerceIndex(ns: HubNamespace): Promise<CommerceIndex> {
  return (await (await hubStore(ns)).getJSON<CommerceIndex>(COMMERCE_INDEX)) ?? {};
}

/** Another product already claims one of these keys — two products can't share a Shopify product or SKU. */
export async function commerceConflicts(ns: HubNamespace, p: Pick<Product, "id" | "commerce">) {
  const idx = await commerceIndex(ns);
  return commerceKeys(p).filter((k) => idx[k] && idx[k].productId !== p.id);
}

/** A short, unambiguous trigger code (no 0/O, 1/l/I) that isn't in use. */
export async function newTriggerCode(ns: HubNamespace): Promise<string> {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const store = await hubStore(ns);
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    if (!(await store.getJSON(KEYS.code(code)))) return code;
  }
}

export async function resolveTriggerCode(ns: HubNamespace, code: string) {
  if (!/^[a-z0-9]{4,16}$/.test(code)) return null;
  return (await hubStore(ns)).getJSON<{ creatorId: string; productId: string }>(KEYS.code(code));
}

export async function listExperiences(ns: HubNamespace, creatorId: string) {
  const all = await readAll<Experience>(await hubStore(ns), KEYS.experiences(creatorId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getExperience(ns: HubNamespace, creatorId: string, id: string) {
  return (await hubStore(ns)).getJSON<Experience>(KEYS.experience(creatorId, id));
}

export async function saveExperience(ns: HubNamespace, e: Experience) {
  e.updatedAt = Date.now();
  await (await hubStore(ns)).setJSON(KEYS.experience(e.creatorId, e.id), e);
  return e;
}

export async function listFiles(ns: HubNamespace, creatorId: string) {
  const all = await readAll<HubFile>(await hubStore(ns), KEYS.files(creatorId));
  return all.filter((f) => f.complete).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getFile(ns: HubNamespace, creatorId: string, id: string) {
  return (await hubStore(ns)).getJSON<HubFile>(KEYS.file(creatorId, id));
}

/* ---------------------------------------------------------------------------
   Orders and payouts
   --------------------------------------------------------------------------- */

export async function listOrders(ns: HubNamespace, creatorId: string) {
  const all = await readAll<Order>(await hubStore(ns), KEYS.orders(creatorId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveOrder(ns: HubNamespace, o: Order) {
  await (await hubStore(ns)).setJSON(KEYS.order(o.creatorId, o.id), o);
}

export async function listPayouts(ns: HubNamespace, creatorId: string) {
  const all = await readAll<Payout>(await hubStore(ns), KEYS.payouts(creatorId));
  return all.sort((a, b) => b.paidAt - a.paidAt);
}

export async function savePayout(ns: HubNamespace, p: Payout) {
  await (await hubStore(ns)).setJSON(KEYS.payout(p.creatorId, p.id), p);
}

export async function earningsFor(ns: HubNamespace, creatorId: string) {
  const [orders, payouts] = await Promise.all([
    listOrders(ns, creatorId),
    listPayouts(ns, creatorId),
  ]);
  return { orders, payouts, summary: summarizeEarnings(orders, payouts) };
}

/* ---------------------------------------------------------------------------
   Activity, threads, scans
   --------------------------------------------------------------------------- */

const ACTIVITY_CAP = 200;

export async function logActivity(
  ns: HubNamespace,
  creatorId: string,
  a: {
    kind: ActivityKind;
    title: string;
    body?: string;
    productId?: string | null;
    actionable?: boolean;
    at?: number;
  },
) {
  const entry: Activity = {
    id: newId(6),
    kind: a.kind,
    at: a.at ?? Date.now(),
    title: a.title,
    body: a.body ?? "",
    productId: a.productId ?? null,
    actionable: a.actionable ?? false,
  };
  await (
    await hubStore(ns)
  ).update<Activity[]>(KEYS.activity(creatorId), (cur) =>
    [entry, ...(cur ?? [])].sort((x, y) => y.at - x.at).slice(0, ACTIVITY_CAP),
  );
  return entry;
}

export async function listActivity(ns: HubNamespace, creatorId: string) {
  return (await (await hubStore(ns)).getJSON<Activity[]>(KEYS.activity(creatorId))) ?? [];
}

export async function getThread(ns: HubNamespace, creatorId: string, productId: string) {
  return (await (await hubStore(ns)).getJSON<Message[]>(KEYS.thread(creatorId, productId))) ?? [];
}

export async function postToThread(
  ns: HubNamespace,
  creatorId: string,
  productId: string,
  m: Omit<Message, "id" | "at">,
) {
  const msg: Message = { ...m, id: newId(6), at: Date.now() };
  await (
    await hubStore(ns)
  ).update<Message[]>(KEYS.thread(creatorId, productId), (cur) =>
    [...(cur ?? []), msg].slice(-500),
  );
  return msg;
}

export async function recordScan(
  ns: HubNamespace,
  creatorId: string,
  productId: string,
  now = Date.now(),
) {
  const day = new Date(now).toISOString().slice(0, 10);
  await (
    await hubStore(ns)
  ).update<ScanStats>(KEYS.scans(creatorId, productId), (cur) => {
    const s = cur ?? { total: 0, byDay: {}, lastAt: null };
    const byDay = { ...s.byDay, [day]: (s.byDay[day] ?? 0) + 1 };
    // keep a year of days
    const keys = Object.keys(byDay).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 366))) delete byDay[k];
    return { total: s.total + 1, byDay, lastAt: now };
  });
}

export async function getScans(
  ns: HubNamespace,
  creatorId: string,
  productId: string,
): Promise<ScanStats> {
  return (
    (await (await hubStore(ns)).getJSON<ScanStats>(KEYS.scans(creatorId, productId))) ?? {
      total: 0,
      byDay: {},
      lastAt: null,
    }
  );
}

export async function scansFor(ns: HubNamespace, creatorId: string, productIds: string[]) {
  const entries = await Promise.all(
    productIds.map(async (id) => [id, await getScans(ns, creatorId, id)] as const),
  );
  return Object.fromEntries(entries) as Record<string, ScanStats>;
}

/* ---------------------------------------------------------------------------
   Invites (agency / partner links)
   --------------------------------------------------------------------------- */

export async function getInvite(ns: HubNamespace, code: string) {
  if (!/^[a-z0-9-]{2,40}$/.test(code)) return null;
  const inv = await (await hubStore(ns)).getJSON<Invite>(KEYS.invite(code));
  return inv && !inv.archived ? inv : null;
}

export async function listInvites(ns: HubNamespace) {
  const all = await readAll<Invite>(await hubStore(ns), KEYS.invites());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveInvite(ns: HubNamespace, inv: Invite) {
  await (await hubStore(ns)).setJSON(KEYS.invite(inv.code), inv);
}

export async function countInviteUse(ns: HubNamespace, code: string) {
  const store = await hubStore(ns);
  if (!(await store.getJSON<Invite>(KEYS.invite(code)))) return;
  await store.update<Invite>(KEYS.invite(code), (cur) => ({
    ...(cur as Invite),
    uses: (cur?.uses ?? 0) + 1,
  }));
}

/* ---------------------------------------------------------------------------
   Everything a creator's dashboard needs, in one read
   --------------------------------------------------------------------------- */

export async function creatorWorkspace(ns: HubNamespace, creatorId: string) {
  const [creator, products, experiences, files, activity, earnings, manager] = await Promise.all([
    getCreator(ns, creatorId),
    listProducts(ns, creatorId),
    listExperiences(ns, creatorId),
    listFiles(ns, creatorId),
    listActivity(ns, creatorId),
    earningsFor(ns, creatorId),
    getManager(ns, creatorId),
  ]);
  const scans = await scansFor(
    ns,
    creatorId,
    products.map((p) => p.id),
  );
  return { creator, products, experiences, files, activity, earnings, manager, scans };
}

export { HUB };
