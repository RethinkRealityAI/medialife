/** What the creator pages receive, read off the server functions (never import *.server.ts here). */
import type {
  getUgcBrief,
  getUgcHome,
  getUgcProfile,
  listUgcAssets,
  listUgcSubmissions,
} from "@/lib/ugc/creator.functions";

export type UgcHome = Awaited<ReturnType<typeof getUgcHome>>;
export type UgcBrief = NonNullable<Awaited<ReturnType<typeof getUgcBrief>>>;
export type UgcAssets = NonNullable<Awaited<ReturnType<typeof listUgcAssets>>>;
export type UgcMyContent = Awaited<ReturnType<typeof listUgcSubmissions>>;
export type UgcProfile = Awaited<ReturnType<typeof getUgcProfile>>;
export type UgcCampaignSummary = NonNullable<UgcHome["campaign"]>;
