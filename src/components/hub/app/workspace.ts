/**
 * The data every Creator Hub app page shares: the signed-in session (from the
 * layout's beforeLoad) and the workspace (from the layout's loader), plus the
 * "Needs you" list derived from them.
 */
import { getRouteApi } from "@tanstack/react-router";

import type { getHubSession } from "@/lib/hub/auth.functions";
import type { getWorkspace } from "@/lib/hub/creator.functions";
import { SKUS, fileUrl, stageIndex, type Product, type StageId } from "@/lib/hub/model";

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type WsProduct = Workspace["products"][number];
export type WsExperience = Workspace["experiences"][number];
export type HubSession = Extract<Awaited<ReturnType<typeof getHubSession>>, { signedIn: true }>;

const appRoute = getRouteApi("/creator-hub/_app");

export const useWorkspace = () => appRoute.useLoaderData();
export const useHubSession = (): HubSession => appRoute.useRouteContext().session;

/** Statuses where the creator has applied but has no live program yet. */
export const PRE_APPROVAL = new Set(["submitted", "waitlist", "declined", "paused"]);

export function productImage(p: Pick<Product, "creatorId" | "imageFileId" | "sku">) {
  return p.imageFileId ? fileUrl({ creatorId: p.creatorId, id: p.imageFileId }) : SKUS[p.sku].image;
}

export const latestProof = (p: Pick<Product, "proofs">) => p.proofs[p.proofs.length - 1] ?? null;

/** The image of a product's latest proof, when it's an image file in the workspace. */
export function proofImage(ws: Pick<Workspace, "files">, p: Pick<Product, "proofs">) {
  const proof = latestProof(p);
  const f = proof ? ws.files.find((x) => x.id === proof.fileId) : null;
  return f && /^image\//.test(f.mime) ? fileUrl(f) : null;
}

/** Waiting on you first, then everything in production (furthest along first), then live. */
export function pipelineOrder(a: WsProduct, b: WsProduct) {
  const rank = (p: WsProduct) =>
    p.stage === "live"
      ? 2
      : p.waitingOn === "creator" || latestProof(p)?.decision === "pending"
        ? 0
        : 1;
  return rank(a) - rank(b) || stageIndex(b.stage) - stageIndex(a.stage);
}

/* ---------------------------------------------------------------------------
   Needs you
   --------------------------------------------------------------------------- */

/** The tabs on a product's page, carried in ?tab=. */
export const PRODUCT_TABS = [
  "overview",
  "design",
  "experience",
  "kit",
  "sales",
  "messages",
] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

/** The sections of the account page, carried in ?section=. */
export const ACCOUNT_SECTIONS = [
  "profile",
  "channels",
  "contact",
  "shipping",
  "payout",
  "security",
] as const;
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];

/** Pipeline phases, for the product board and filters. */
export const PHASES = [
  { id: "design", label: "In design", stages: ["brief", "artwork", "approval"] },
  { id: "making", label: "Being made", stages: ["sampling", "production", "shipping"] },
  { id: "live", label: "On sale", stages: ["live"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; stages: readonly StageId[] }>;
export type PhaseId = (typeof PHASES)[number]["id"];
export const phaseOf = (stage: StageId): PhaseId =>
  PHASES.find((ph) => (ph.stages as readonly StageId[]).includes(stage))!.id;

export type ActionLink =
  | {
      to: "/creator-hub/products/$productId";
      productId: string;
      tab?: ProductTab;
      review?: boolean;
    }
  | { to: "/creator-hub/experiences"; preview?: string }
  | { to: "/creator-hub/artwork" }
  | { to: "/creator-hub/account"; section?: AccountSection };

export type ActionItem = {
  id: string;
  kind: "proof" | "experience" | "payout" | "shipping" | "verify" | "product";
  title: string;
  body: string;
  cta: string;
  /** Absent for actions that run in place (resend the verification email). */
  link?: ActionLink;
  image?: string;
  /** The product this item is about, if any. */
  productId?: string;
};

/** Everything waiting on the creator, most important first. */
export function needsYou(ws: Workspace, session: HubSession): ActionItem[] {
  const items: ActionItem[] = [];
  const approved = ws.creator.status === "approved";

  for (const p of ws.products) {
    const proof = latestProof(p);
    if (proof?.decision === "pending") {
      items.push({
        id: `proof-${p.id}`,
        kind: "proof",
        title: `Approve the design for ${p.name}`,
        body: `Version ${proof.version} is ready. Nothing is made until you approve it.`,
        cta: "Review design",
        link: {
          to: "/creator-hub/products/$productId",
          productId: p.id,
          tab: "design",
          review: true,
        },
        image: proofImage(ws, p) ?? productImage(p),
        productId: p.id,
      });
    } else if (p.waitingOn === "creator" && p.stage !== "live") {
      items.push({
        id: `product-${p.id}`,
        kind: "product",
        title: p.name,
        body: p.nextStep || "We need something from you to keep this moving.",
        cta: p.stage === "artwork" ? "Send artwork" : "Open product",
        link:
          p.stage === "artwork"
            ? { to: "/creator-hub/artwork" }
            : { to: "/creator-hub/products/$productId", productId: p.id },
        image: productImage(p),
        productId: p.id,
      });
    }
  }

  for (const e of ws.experiences) {
    if (e.status === "review") {
      items.push({
        id: `exp-${e.id}`,
        kind: "experience",
        title: `Try “${e.name}” before launch`,
        body: "Your experience is ready for review. Open it on your phone and tell us what you think.",
        cta: "Review experience",
        link: { to: "/creator-hub/experiences", preview: e.id },
      });
    }
  }

  if (!session.user.emailVerified) {
    items.push({
      id: "verify",
      kind: "verify",
      title: "Confirm your email",
      body: `We sent a link to ${session.user.email}. Confirming it keeps your account and payouts safe.`,
      cta: "Resend email",
    });
  }

  if (approved && !ws.creator.payout?.email) {
    items.push({
      id: "payout",
      kind: "payout",
      title: "Add your payout details",
      body: "Tell us where to send your earnings. It takes a minute: a PayPal or Wise email.",
      cta: "Add payout details",
      link: { to: "/creator-hub/account", section: "payout" },
    });
  }

  if (approved && !ws.creator.shipping?.line1) {
    items.push({
      id: "shipping",
      kind: "shipping",
      title: "Add a shipping address for samples",
      body: "We send you a physical sample of every product before it goes on sale.",
      cta: "Add address",
      link: { to: "/creator-hub/account", section: "shipping" },
    });
  }

  return items;
}
